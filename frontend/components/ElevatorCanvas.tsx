"use client";

import { useRef, useEffect } from "react";
import type { StateFrame } from "@/lib/types";

interface Props {
  frame: StateFrame | null;
  prevFrame: StateFrame | null;
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

interface ElevAnim {
  startY: number;      // Y at animation start
  targetY: number;     // Y we're animating toward
  animStart: number;   // timestamp when animation began
  prevPaxCount: number;
  exitFlashStart: number;
  exitFlashY: number;
  exitFlashCount: number;
}

function floorYSmooth(floor: number): number {
  return TOP_MARGIN + (NUM_FLOORS - 1 - floor) * FLOOR_HEIGHT + FLOOR_HEIGHT;
}

function shaftX(i: number): number {
  return LEFT_MARGIN + i * (SHAFT_WIDTH + SHAFT_GAP);
}

function ease(t: number): number {
  // Linear — the backend's tick structure already encodes
  // acceleration/deceleration via progress values. Adding
  // ease on top creates a pulsing "double-easing" effect.
  return t;
}

function elevTargetY(elev: { floor: number; direction: string; progress: number }): number {
  const dir = elev.direction === "up" ? 1 : elev.direction === "down" ? -1 : 0;
  return floorYSmooth(elev.floor + elev.progress * dir) - CABIN_SIZE;
}

export default function ElevatorCanvas({
  frame,
  prevFrame,
  width = 500,
  height = 560,
  speed = 500,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const elevsRef = useRef<Map<number, ElevAnim>>(new Map());
  const frameRef = useRef<StateFrame | null>(null);
  const speedRef = useRef(speed);
  const sizedRef = useRef(false);

  frameRef.current = frame;
  speedRef.current = speed;

  // When frame changes: set new animation targets
  useEffect(() => {
    if (!frame) return;
    const now = performance.now();

    for (const elev of frame.elevators) {
      const newTarget = elevTargetY(elev);
      let anim = elevsRef.current.get(elev.id);

      if (!anim) {
        anim = {
          startY: newTarget,
          targetY: newTarget,
          animStart: now,
          prevPaxCount: elev.passengers.length,
          exitFlashStart: 0,
          exitFlashY: 0,
          exitFlashCount: 0,
        };
        elevsRef.current.set(elev.id, anim);
      } else {
        // Current interpolated position becomes new start
        const elapsed = now - anim.animStart;
        const duration = speedRef.current * 0.95;
        const t = Math.min(elapsed / duration, 1);
        const currentY = anim.startY + (anim.targetY - anim.startY) * ease(t);

        anim.startY = currentY;
        anim.targetY = newTarget;
        anim.animStart = now;

        // Detect passenger exit
        if (elev.passengers.length < anim.prevPaxCount && elev.doors) {
          anim.exitFlashCount = anim.prevPaxCount - elev.passengers.length;
          anim.exitFlashY = floorYSmooth(elev.floor) - 10;
          anim.exitFlashStart = now;
        }
        anim.prevPaxCount = elev.passengers.length;
      }
    }
  }, [frame]);

  // Single animation loop — stable, never restarts on frame changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const loop = () => {
      if (!sizedRef.current) {
        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        sizedRef.current = true;
      }

      ctx.clearRect(0, 0, width, height);

      const now = performance.now();
      const spd = speedRef.current;
      const curFrame = frameRef.current;

      // Compute current Y for each elevator
      const positions = new Map<number, number>();
      for (const [id, anim] of elevsRef.current) {
        const elapsed = now - anim.animStart;
        const duration = spd * 0.95;
        const t = Math.min(elapsed / duration, 1);
        positions.set(id, anim.startY + (anim.targetY - anim.startY) * ease(t));
      }

      drawScene(ctx, curFrame, positions, elevsRef.current, now, width, height);
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
  positions: Map<number, number>,
  anims: Map<number, ElevAnim>,
  now: number,
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

  // Cabins
  for (const elev of frame.elevators) {
    const x = shaftX(elev.id) + (SHAFT_WIDTH - CABIN_SIZE) / 2;
    const y = positions.get(elev.id) ?? (floorYSmooth(elev.floor) - CABIN_SIZE);

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
    const anim = anims.get(elev.id);
    if (anim && anim.exitFlashCount > 0 && anim.exitFlashStart > 0) {
      const age = (now - anim.exitFlashStart) / 1000;
      const alpha = Math.max(0, 1 - age * 1.5);
      if (alpha > 0) {
        const exitX = shaftX(elev.id) + SHAFT_WIDTH + 5;
        const flashY = anim.exitFlashY - age * 30;
        ctx.globalAlpha = alpha;
        for (let i = 0; i < anim.exitFlashCount; i++) {
          ctx.fillStyle = COLORS.passengerExiting;
          ctx.beginPath();
          ctx.arc(exitX + i * 14, flashY, PASSENGER_RADIUS, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    }

    // Label + arrow
    ctx.fillStyle = COLORS.text;
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    const cx = shaftX(elev.id) + SHAFT_WIDTH / 2;
    ctx.fillText(`E${elev.id}`, cx, y - 5);
    if (elev.direction === "up") ctx.fillText("\u25b2", cx, y - 15);
    else if (elev.direction === "down") ctx.fillText("\u25bc", cx, y - 15);

    // Phase label
    if (elev.phase !== "idle") {
      ctx.fillStyle = COLORS.phaseText;
      ctx.font = "8px monospace";
      ctx.fillText(elev.phase, cx, y + CABIN_SIZE + 12);
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
