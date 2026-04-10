"use client";

import { useRef, useEffect, useCallback } from "react";
import type { StateFrame, ElevatorState } from "@/lib/types";

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

export default function ElevatorCanvas({
  frame,
  prevFrame,
  width = 500,
  height = 560,
  speed = 500,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);

  const draw = useCallback(
    (timestamp: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.scale(dpr, dpr);

      if (!startTimeRef.current) startTimeRef.current = timestamp;
      const elapsed = timestamp - startTimeRef.current;
      const animDuration = Math.max(speed * 0.9, 30);
      const t = Math.min(elapsed / animDuration, 1);

      drawScene(ctx, frame, prevFrame, t, width, height);

      if (t < 1) {
        animRef.current = requestAnimationFrame(draw);
      }
    },
    [frame, prevFrame, width, height, speed]
  );

  useEffect(() => {
    cancelAnimationFrame(animRef.current);
    startTimeRef.current = 0;
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      className="rounded-lg border border-slate-700"
    />
  );
}

function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/** Convert a fractional floor position to canvas Y. */
function floorYSmooth(floor: number): number {
  return TOP_MARGIN + (NUM_FLOORS - 1 - floor) * FLOOR_HEIGHT + FLOOR_HEIGHT;
}

function shaftX(i: number): number {
  return LEFT_MARGIN + i * (SHAFT_WIDTH + SHAFT_GAP);
}

/** Compute smooth visual floor from backend state.
 *
 * The backend sends: floor (int), direction, progress (0-1).
 * During movement phases, progress goes 0→1 as the elevator
 * transitions from `floor` toward the next floor in `direction`.
 */
function visualFloor(elev: ElevatorState, prevElev: ElevatorState | undefined, t: number): number {
  // Use backend progress directly — it already encodes accel/decel timing
  const dir = elev.direction === "up" ? 1 : elev.direction === "down" ? -1 : 0;
  const targetProgress = elev.progress * dir;

  if (!prevElev) return elev.floor + targetProgress;

  const prevDir = prevElev.direction === "up" ? 1 : prevElev.direction === "down" ? -1 : 0;
  const prevVisual = prevElev.floor + prevElev.progress * prevDir;
  const currVisual = elev.floor + targetProgress;

  // Smooth interpolation between previous and current visual position
  return prevVisual + (currVisual - prevVisual) * ease(t);
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  frame: StateFrame | null,
  prevFrame: StateFrame | null,
  t: number,
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
    const x = shaftX(e);
    ctx.fillStyle = COLORS.shaft;
    ctx.strokeStyle = COLORS.shaftBorder;
    ctx.lineWidth = 1;
    ctx.fillRect(x, TOP_MARGIN, SHAFT_WIDTH, NUM_FLOORS * FLOOR_HEIGHT);
    ctx.strokeRect(x, TOP_MARGIN, SHAFT_WIDTH, NUM_FLOORS * FLOOR_HEIGHT);
  }

  // Cabins
  for (const elev of frame.elevators) {
    const prevElev = prevFrame?.elevators.find((e) => e.id === elev.id);
    const vFloor = visualFloor(elev, prevElev, t);

    const x = shaftX(elev.id) + (SHAFT_WIDTH - CABIN_SIZE) / 2;
    const y = floorYSmooth(vFloor) - CABIN_SIZE;

    // Cabin color based on phase
    let cabinColor = COLORS.cabin;
    if (elev.phase === "accelerating") cabinColor = COLORS.cabinAccel;
    else if (elev.phase === "decelerating") cabinColor = COLORS.cabinDecel;
    ctx.fillStyle = cabinColor;
    ctx.fillRect(x, y, CABIN_SIZE, CABIN_SIZE);

    // Doors
    if (elev.doors) {
      ctx.fillStyle = COLORS.cabinDoors;
      const openAmount = elev.phase === "boarding" ? 8 : ease(t) * 8;
      ctx.fillRect(x + openAmount, y, CABIN_SIZE / 2 - openAmount, CABIN_SIZE);
      ctx.fillRect(x + CABIN_SIZE / 2, y, CABIN_SIZE / 2 - openAmount, CABIN_SIZE);
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

    // Exiting passengers flash
    if (prevElev && prevElev.passengers.length > elev.passengers.length && t < 0.8) {
      const dropped = prevElev.passengers.length - elev.passengers.length;
      const exitX = shaftX(elev.id) + SHAFT_WIDTH + 5;
      const exitY = floorYSmooth(elev.floor);
      ctx.globalAlpha = 1 - t / 0.8;
      for (let i = 0; i < dropped; i++) {
        ctx.fillStyle = COLORS.passengerExiting;
        ctx.beginPath();
        ctx.arc(exitX + i * 14, exitY - 10 - t * 20, PASSENGER_RADIUS, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // Label + direction
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
    const y = floorYSmooth(floor.floor);
    for (let i = 0; i < floor.waiting.length; i++) {
      const px = waitX + i * 16;
      const py = y - 10;
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
