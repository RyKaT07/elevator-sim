"use client";

import { useRef, useEffect } from "react";
import type { StateFrame } from "@/lib/types";

interface Props {
  frame: StateFrame | null;
  prevFrame: StateFrame | null;
  width?: number;
  height?: number;
  speed?: number;
}

const NUM_FLOORS = 7;
const FLOOR_HEIGHT = 70;
const SHAFT_WIDTH = 80;
const SHAFT_GAP = 30;
const CABIN_SIZE = 60;
const LEFT_MARGIN = 60;
const TOP_MARGIN = 30;
const PASSENGER_RADIUS = 6;
const CHASE_SPEED = 0.12; // lower = smoother but laggier (0.08-0.2 sweet spot)

const COLORS = {
  bg: "#0f172a",
  shaft: "#1e293b",
  shaftBorder: "#334155",
  cabin: "#3b82f6",
  cabinAccel: "#1d4ed8",
  cabinDecel: "#60a5fa",
  cabinDoors: "#93c5fd",
  floor: "#475569",
  floorText: "#94a3b8",
  passengerWaiting: "#f59e0b",
  passengerInside: "#22c55e",
  passengerExiting: "#ef4444",
  text: "#e2e8f0",
  phaseText: "#64748b",
};

/** Persistent visual state that survives re-renders. */
interface ElevVisual {
  y: number;            // current visual Y position (pixels)
  targetY: number;      // Y we're chasing toward
  prevPaxCount: number; // for exit flash
  exitFlashY: number;
  exitFlashCount: number;
  exitFlashAlpha: number;
}

export default function ElevatorCanvas({
  frame,
  prevFrame,
  width = 500,
  height = 560,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const elevsRef = useRef<Map<number, ElevVisual>>(new Map());

  // Update targets when frame changes
  useEffect(() => {
    if (!frame) return;
    for (const elev of frame.elevators) {
      const dir = elev.direction === "up" ? 1 : elev.direction === "down" ? -1 : 0;
      const visualFloor = elev.floor + elev.progress * dir;
      const targetY = floorYSmooth(visualFloor) - CABIN_SIZE;

      let vis = elevsRef.current.get(elev.id);
      if (!vis) {
        vis = {
          y: targetY,
          targetY,
          prevPaxCount: elev.passengers.length,
          exitFlashY: 0,
          exitFlashCount: 0,
          exitFlashAlpha: 0,
        };
        elevsRef.current.set(elev.id, vis);
      } else {
        vis.targetY = targetY;
        // Detect passenger exit
        if (elev.passengers.length < vis.prevPaxCount && elev.doors) {
          vis.exitFlashCount = vis.prevPaxCount - elev.passengers.length;
          vis.exitFlashY = floorYSmooth(elev.floor) - 10;
          vis.exitFlashAlpha = 1.0;
        }
        vis.prevPaxCount = elev.passengers.length;
      }
    }
  }, [frame]);

  // Continuous animation loop — runs independent of frame arrival
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const loop = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.scale(dpr, dpr);

      // Chase targets
      for (const vis of elevsRef.current.values()) {
        vis.y += (vis.targetY - vis.y) * CHASE_SPEED;
        // Decay exit flash
        if (vis.exitFlashAlpha > 0) {
          vis.exitFlashAlpha -= 0.02;
          vis.exitFlashY -= 0.3;
        }
      }

      drawScene(ctx, frame, elevsRef.current, width, height);
      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [frame, width, height]);

  return (
    <canvas
      ref={canvasRef}
      className="rounded-lg border border-slate-700"
    />
  );
}

function floorYSmooth(floor: number): number {
  return TOP_MARGIN + (NUM_FLOORS - 1 - floor) * FLOOR_HEIGHT + FLOOR_HEIGHT;
}

function shaftX(i: number): number {
  return LEFT_MARGIN + i * (SHAFT_WIDTH + SHAFT_GAP);
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  frame: StateFrame | null,
  elevVisuals: Map<number, ElevVisual>,
  w: number,
  h: number
) {
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, w, h);

  if (!frame) {
    ctx.fillStyle = COLORS.text;
    ctx.font = "16px monospace";
    ctx.textAlign = "center";
    ctx.fillText("Press Run to start simulation", w / 2, h / 2);
    return;
  }

  const numElev = frame.elevators.length;

  // Floor lines
  for (let f = 0; f < NUM_FLOORS; f++) {
    const y = floorYSmooth(f);
    ctx.strokeStyle = COLORS.floor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(LEFT_MARGIN - 10, y);
    ctx.lineTo(w - 20, y);
    ctx.stroke();
    ctx.fillStyle = COLORS.floorText;
    ctx.font = "12px monospace";
    ctx.textAlign = "right";
    ctx.fillText(`F${f}`, LEFT_MARGIN - 15, y + 4);
  }

  // Shafts
  for (let e = 0; e < numElev; e++) {
    const sx = shaftX(e);
    ctx.fillStyle = COLORS.shaft;
    ctx.strokeStyle = COLORS.shaftBorder;
    ctx.lineWidth = 1;
    ctx.fillRect(sx, TOP_MARGIN, SHAFT_WIDTH, NUM_FLOORS * FLOOR_HEIGHT);
    ctx.strokeRect(sx, TOP_MARGIN, SHAFT_WIDTH, NUM_FLOORS * FLOOR_HEIGHT);
  }

  // Cabins
  for (const elev of frame.elevators) {
    const vis = elevVisuals.get(elev.id);
    const x = shaftX(elev.id) + (SHAFT_WIDTH - CABIN_SIZE) / 2;
    const y = vis ? vis.y : floorYSmooth(elev.floor) - CABIN_SIZE;

    // Color by phase
    let col = COLORS.cabin;
    if (elev.phase === "accelerating") col = COLORS.cabinAccel;
    else if (elev.phase === "decelerating") col = COLORS.cabinDecel;
    ctx.fillStyle = col;
    ctx.fillRect(x, y, CABIN_SIZE, CABIN_SIZE);

    // Doors
    if (elev.doors) {
      ctx.fillStyle = COLORS.cabinDoors;
      ctx.fillRect(x + 8, y, CABIN_SIZE / 2 - 8, CABIN_SIZE);
      ctx.fillRect(x + CABIN_SIZE / 2, y, CABIN_SIZE / 2 - 8, CABIN_SIZE);
    }

    // Passengers inside
    for (let i = 0; i < elev.passengers.length; i++) {
      const px = x + 10 + (i % 4) * 14;
      const py = y + 15 + Math.floor(i / 4) * 14;
      ctx.fillStyle = COLORS.passengerInside;
      ctx.beginPath();
      ctx.arc(px, py, PASSENGER_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }

    // Exit flash
    if (vis && vis.exitFlashAlpha > 0 && vis.exitFlashCount > 0) {
      const exitX = shaftX(elev.id) + SHAFT_WIDTH + 5;
      ctx.globalAlpha = Math.max(0, vis.exitFlashAlpha);
      for (let i = 0; i < vis.exitFlashCount; i++) {
        ctx.fillStyle = COLORS.passengerExiting;
        ctx.beginPath();
        ctx.arc(exitX + i * 14, vis.exitFlashY, PASSENGER_RADIUS, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // Label
    ctx.fillStyle = COLORS.text;
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    ctx.fillText(`E${elev.id}`, shaftX(elev.id) + SHAFT_WIDTH / 2, y - 5);
    if (elev.direction === "up") ctx.fillText("\u25b2", shaftX(elev.id) + SHAFT_WIDTH / 2, y - 15);
    else if (elev.direction === "down") ctx.fillText("\u25bc", shaftX(elev.id) + SHAFT_WIDTH / 2, y - 15);

    // Phase label
    if (elev.phase !== "idle") {
      ctx.fillStyle = COLORS.phaseText;
      ctx.font = "8px monospace";
      ctx.fillText(elev.phase, shaftX(elev.id) + SHAFT_WIDTH / 2, y + CABIN_SIZE + 12);
    }
  }

  // Waiting passengers
  const waitX = LEFT_MARGIN + numElev * (SHAFT_WIDTH + SHAFT_GAP) + 20;
  for (const floor of frame.floors) {
    const fy = floorYSmooth(floor.floor);
    for (let i = 0; i < floor.waiting.length; i++) {
      const px = waitX + i * 16;
      const py = fy - 10;
      ctx.fillStyle = COLORS.passengerWaiting;
      ctx.beginPath();
      ctx.arc(px, py, PASSENGER_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.text;
      ctx.font = "8px monospace";
      ctx.textAlign = "center";
      ctx.fillText(`${floor.waiting[i].destination}`, px, py - 9);
    }
  }

  // HUD
  ctx.fillStyle = COLORS.text;
  ctx.font = "14px monospace";
  ctx.textAlign = "left";
  ctx.fillText(`Tick: ${frame.tick}`, 10, h - 15);
  ctx.textAlign = "right";
  ctx.fillText(frame.active_algorithm.toUpperCase(), w - 10, h - 15);
}
