"use client";

import { useRef, useEffect } from "react";
import type { StateFrame } from "@/lib/types";

interface Props {
  frame: StateFrame | null;   // current tick (passengers from here)
  nextFrame: StateFrame | null; // next tick (position target)
  width?: number;
  height?: number;
  speed?: number; // ms per tick
}

const NUM_FLOORS = 7;
const FLOOR_HEIGHT = 70;
const SHAFT_WIDTH = 80;
const SHAFT_GAP = 30;
const CABIN_SIZE = 60;
const LEFT_MARGIN = 60;
const TOP_MARGIN = 30;
const PASSENGER_RADIUS = 6;

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

function floorYSmooth(floor: number): number {
  return TOP_MARGIN + (NUM_FLOORS - 1 - floor) * FLOOR_HEIGHT + FLOOR_HEIGHT;
}

function shaftX(i: number): number {
  return LEFT_MARGIN + i * (SHAFT_WIDTH + SHAFT_GAP);
}

function visualFloor(elev: { floor: number; direction: string; progress: number }): number {
  const dir = elev.direction === "up" ? 1 : elev.direction === "down" ? -1 : 0;
  return elev.floor + elev.progress * dir;
}

export default function ElevatorCanvas({
  frame,
  nextFrame,
  width = 500,
  height = 560,
  speed = 500,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const frameArrivalRef = useRef<number>(0);
  const sizedRef = useRef(false);
  const frameRef = useRef<StateFrame | null>(null);
  const nextFrameRef = useRef<StateFrame | null>(null);
  const speedRef = useRef(speed);

  // Track when this frame arrived (for interpolation timing)
  useEffect(() => {
    frameArrivalRef.current = performance.now();
  }, [frame]);

  // Keep refs in sync
  frameRef.current = frame;
  nextFrameRef.current = nextFrame;
  speedRef.current = speed;

  // Single stable animation loop with double buffering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Offscreen buffer — draw here, then copy in one operation
    const dpr = window.devicePixelRatio || 1;
    const buffer = document.createElement("canvas");
    buffer.width = width * dpr;
    buffer.height = height * dpr;
    const bctx = buffer.getContext("2d")!;
    bctx.scale(dpr, dpr);

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const loop = () => {
      const cur = frameRef.current;
      const nxt = nextFrameRef.current;
      const now = performance.now();
      const t = Math.min((now - frameArrivalRef.current) / speedRef.current, 1);

      // Draw to offscreen buffer
      drawScene(bctx, cur, nxt, t, width, height);

      // Copy to visible canvas in one operation (no flicker)
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(buffer, 0, 0);

      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [width, height]);

  return (
    <canvas
      ref={canvasRef}
      className="rounded-lg border border-slate-700"
    />
  );
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  frame: StateFrame | null,
  nextFrame: StateFrame | null,
  t: number, // 0-1: how far between frame and nextFrame
  w: number,
  h: number,
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

  // Elevators
  for (const elev of frame.elevators) {
    const nxtElev = nextFrame?.elevators.find(e => e.id === elev.id);

    // Interpolate visual position between current and next frame
    const curVF = visualFloor(elev);
    const nxtVF = nxtElev ? visualFloor(nxtElev) : curVF;
    const interpFloor = curVF + (nxtVF - curVF) * t;

    const x = shaftX(elev.id) + (SHAFT_WIDTH - CABIN_SIZE) / 2;
    const y = floorYSmooth(interpFloor) - CABIN_SIZE;

    // Phase color
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

    // Passengers inside — ALWAYS from current frame (not interpolated)
    for (let i = 0; i < elev.passengers.length; i++) {
      const px = x + 10 + (i % 4) * 14;
      const py = y + 15 + Math.floor(i / 4) * 14;
      ctx.fillStyle = COLORS.passengerInside;
      ctx.beginPath();
      ctx.arc(px, py, PASSENGER_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }

    // Exit flash: if next frame has fewer passengers, show exiting at t>0.8
    if (nxtElev && nxtElev.passengers.length < elev.passengers.length && t > 0.8) {
      const dropped = elev.passengers.length - nxtElev.passengers.length;
      const exitX = shaftX(elev.id) + SHAFT_WIDTH + 5;
      const exitY = floorYSmooth(elev.floor) - 10;
      const alpha = (t - 0.8) / 0.2; // fade in from 0.8 to 1.0
      ctx.globalAlpha = alpha;
      for (let i = 0; i < dropped; i++) {
        ctx.fillStyle = COLORS.passengerExiting;
        ctx.beginPath();
        ctx.arc(exitX + i * 14, exitY - (t - 0.8) * 40, PASSENGER_RADIUS, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // Label + arrow
    ctx.fillStyle = COLORS.text;
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    const cx = shaftX(elev.id) + SHAFT_WIDTH / 2;
    ctx.fillText(`E${elev.id}`, cx, y - 5);
    if (elev.direction === "up") ctx.fillText("\u25b2", cx, y - 15);
    else if (elev.direction === "down") ctx.fillText("\u25bc", cx, y - 15);

    if (elev.phase !== "idle") {
      ctx.fillStyle = COLORS.phaseText;
      ctx.font = "8px monospace";
      ctx.fillText(elev.phase, cx, y + CABIN_SIZE + 12);
    }
  }

  // Waiting passengers — from current frame (change at tick boundary)
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
