"use client";

import { useRef, useEffect, type MutableRefObject } from "react";
import type { StateFrame, Summary } from "@/lib/types";

interface Props {
  allFramesRef: MutableRefObject<StateFrame[]>;
  playbackToken: number;
  isRunning: boolean;
  speed: number;
  width?: number;
  height?: number;
  onComplete?: (summary: Summary | null) => void;
}

const NUM_FLOORS = 7;
const FLOOR_HEIGHT = 70;
const SHAFT_WIDTH = 80;
const SHAFT_GAP = 30;
const CABIN_SIZE = 60;
const LEFT_MARGIN = 60;
const TOP_MARGIN = 30;
const PASSENGER_RADIUS = 6;
const METRICS_HEIGHT = 40;

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
  metricLabel: "#94a3b8",
  metricValue: "#e2e8f0",
};

function floorY(floor: number): number {
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
  allFramesRef,
  playbackToken,
  isRunning,
  speed,
  width = 500,
  height = 560 + METRICS_HEIGHT,
  onComplete,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  // All playback state in refs — zero React re-renders
  const idxRef = useRef(0);
  const lastTickRef = useRef(0);
  const speedRef = useRef(speed);
  const runningRef = useRef(false);
  const onCompleteRef = useRef(onComplete);

  speedRef.current = speed;
  onCompleteRef.current = onComplete;

  // Start playback when token changes (frames loaded)
  useEffect(() => {
    if (playbackToken > 0 && allFramesRef.current.length > 0) {
      idxRef.current = 0;
      lastTickRef.current = 0;
      runningRef.current = true;
    }
  }, [playbackToken, allFramesRef]);

  // Stop playback
  useEffect(() => {
    if (!isRunning) {
      runningRef.current = false;
    }
  }, [isRunning]);

  // Single animation loop — never restarts
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    // Double buffer
    const buffer = document.createElement("canvas");
    buffer.width = width * dpr;
    buffer.height = height * dpr;
    const bctx = buffer.getContext("2d")!;
    bctx.scale(dpr, dpr);

    const ctx = canvas.getContext("2d")!;

    const loop = (now: number) => {
      const frames = allFramesRef.current;

      // Advance ticks (only via refs, no React state)
      if (runningRef.current && frames.length > 0) {
        if (!lastTickRef.current) lastTickRef.current = now;
        const elapsed = now - lastTickRef.current;
        if (elapsed >= speedRef.current) {
          const advance = Math.floor(elapsed / speedRef.current);
          lastTickRef.current += advance * speedRef.current;
          idxRef.current = Math.min(idxRef.current + advance, frames.length - 1);

          if (idxRef.current >= frames.length - 1) {
            runningRef.current = false;
            onCompleteRef.current?.(null);
          }
        }
      }

      // Get current and next frame
      const idx = idxRef.current;
      const cur = allFramesRef.current[idx] ?? null;
      const nxt = allFramesRef.current[idx + 1] ?? null;

      // Interpolation t between current and next
      let t = 0;
      if (runningRef.current && lastTickRef.current > 0) {
        t = Math.min((now - lastTickRef.current) / speedRef.current, 1);
      }

      // Draw to buffer
      draw(bctx, cur, nxt, t, width, height);

      // Copy to screen in one operation
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(buffer, 0, 0);

      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [width, height, allFramesRef]);

  return (
    <canvas
      ref={canvasRef}
      className="rounded-lg border border-slate-700"
    />
  );
}

function draw(
  ctx: CanvasRenderingContext2D,
  frame: StateFrame | null,
  nextFrame: StateFrame | null,
  t: number,
  w: number,
  h: number,
) {
  const canvasH = h - METRICS_HEIGHT;

  // Background
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, w, h);

  if (!frame) {
    ctx.fillStyle = COLORS.text;
    ctx.font = "16px monospace";
    ctx.textAlign = "center";
    ctx.fillText("Press Run to start simulation", w / 2, canvasH / 2);
    return;
  }

  const numElev = frame.elevators.length;

  // Floor lines
  for (let f = 0; f < NUM_FLOORS; f++) {
    const y = floorY(f);
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
    const curVF = visualFloor(elev);
    const nxtVF = nxtElev ? visualFloor(nxtElev) : curVF;
    const interpFloor = curVF + (nxtVF - curVF) * t;

    const x = shaftX(elev.id) + (SHAFT_WIDTH - CABIN_SIZE) / 2;
    const y = floorY(interpFloor) - CABIN_SIZE;

    // Phase color
    let col = COLORS.cabin;
    if (elev.phase === "accelerating") col = COLORS.cabinAccel;
    else if (elev.phase === "decelerating") col = COLORS.cabinDecel;
    ctx.fillStyle = col;
    ctx.fillRect(x, y, CABIN_SIZE, CABIN_SIZE);

    // Doors — smooth open/close via door_progress
    const curDoor = elev.door_progress ?? 0;
    const nxtDoor = nxtElev?.door_progress ?? curDoor;
    const doorP = curDoor + (nxtDoor - curDoor) * t;
    if (doorP > 0.01) {
      ctx.fillStyle = COLORS.cabinDoors;
      const maxGap = CABIN_SIZE / 2 - 4;
      const gap = doorP * maxGap;
      // Left door slides left, right door slides right
      ctx.fillRect(x, y, CABIN_SIZE / 2 - gap, CABIN_SIZE);
      ctx.fillRect(x + CABIN_SIZE / 2 + gap, y, CABIN_SIZE / 2 - gap, CABIN_SIZE);
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
    if (nxtElev && nxtElev.passengers.length < elev.passengers.length && t > 0.8) {
      const dropped = elev.passengers.length - nxtElev.passengers.length;
      const exitX = shaftX(elev.id) + SHAFT_WIDTH + 5;
      const exitY = floorY(elev.floor) - 10;
      ctx.globalAlpha = (t - 0.8) / 0.2;
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

  // Waiting passengers
  const waitX = LEFT_MARGIN + numElev * (SHAFT_WIDTH + SHAFT_GAP) + 20;
  for (const floor of frame.floors) {
    const fy = floorY(floor.floor);
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

  // HUD bar — tick + algorithm
  ctx.fillStyle = COLORS.text;
  ctx.font = "14px monospace";
  ctx.textAlign = "left";
  ctx.fillText(`Tick: ${frame.tick}`, 10, canvasH + 5);
  ctx.textAlign = "right";
  ctx.fillText(frame.active_algorithm.toUpperCase(), w - 10, canvasH + 5);

  // Metrics bar (drawn on canvas, not React)
  const m = frame.metrics;
  const totalWaiting = frame.floors.reduce((s, f) => s + f.waiting.length, 0);
  const totalInTransit = frame.elevators.reduce((s, e) => s + e.passengers.length, 0);

  const metricsY = canvasH + 20;
  ctx.font = "11px monospace";
  const metrics = [
    { label: "Wait", value: `${m.avg_wait_time.toFixed(1)}t`, color: COLORS.metricValue },
    { label: "Total", value: `${m.avg_total_time.toFixed(1)}t`, color: COLORS.metricValue },
    { label: "Energy", value: `${m.energy.toFixed(1)}u`, color: COLORS.metricValue },
    { label: "Waiting", value: `${totalWaiting}`, color: "#f59e0b" },
    { label: "Transit", value: `${totalInTransit}`, color: "#22c55e" },
  ];
  const gap = w / metrics.length;
  metrics.forEach((met, i) => {
    const mx = gap * i + gap / 2;
    ctx.textAlign = "center";
    ctx.fillStyle = COLORS.metricLabel;
    ctx.fillText(met.label, mx, metricsY);
    ctx.fillStyle = met.color;
    ctx.font = "bold 12px monospace";
    ctx.fillText(met.value, mx, metricsY + 15);
    ctx.font = "11px monospace";
  });
}
