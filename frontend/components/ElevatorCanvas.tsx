"use client";

import { useRef, useEffect } from "react";
import type { StateFrame } from "@/lib/types";

interface Props {
  frame: StateFrame | null;
  width?: number;
  height?: number;
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
  cabinDoors: "#60a5fa",
  floor: "#475569",
  floorText: "#94a3b8",
  passengerWaiting: "#f59e0b",
  passengerInside: "#22c55e",
  text: "#e2e8f0",
};

export default function ElevatorCanvas({ frame, width = 500, height = 560 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Scale for HiDPI
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    drawFrame(ctx, frame, width, height);
  }, [frame, width, height]);

  return (
    <canvas
      ref={canvasRef}
      className="rounded-lg border border-slate-700"
    />
  );
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  frame: StateFrame | null,
  w: number,
  h: number
) {
  // Background
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, w, h);

  if (!frame) {
    ctx.fillStyle = COLORS.text;
    ctx.font = "16px monospace";
    ctx.textAlign = "center";
    ctx.fillText("Press Run to start simulation", w / 2, h / 2);
    return;
  }

  const numElevators = frame.elevators.length;

  // Draw floor lines and labels
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

  // Draw elevator shafts
  for (let e = 0; e < numElevators; e++) {
    const x = shaftX(e);
    ctx.fillStyle = COLORS.shaft;
    ctx.strokeStyle = COLORS.shaftBorder;
    ctx.lineWidth = 1;
    ctx.fillRect(x, TOP_MARGIN, SHAFT_WIDTH, NUM_FLOORS * FLOOR_HEIGHT);
    ctx.strokeRect(x, TOP_MARGIN, SHAFT_WIDTH, NUM_FLOORS * FLOOR_HEIGHT);
  }

  // Draw elevator cabins
  for (const elev of frame.elevators) {
    const x = shaftX(elev.id) + (SHAFT_WIDTH - CABIN_SIZE) / 2;
    const y = floorY(elev.floor) - CABIN_SIZE;

    // Cabin body
    ctx.fillStyle = COLORS.cabin;
    ctx.fillRect(x, y, CABIN_SIZE, CABIN_SIZE);

    // Door indicator
    if (elev.doors) {
      ctx.fillStyle = COLORS.cabinDoors;
      const gap = 8;
      ctx.fillRect(x + gap, y, CABIN_SIZE / 2 - gap, CABIN_SIZE);
      ctx.fillRect(x + CABIN_SIZE / 2, y, CABIN_SIZE / 2 - gap, CABIN_SIZE);
    }

    // Passengers inside cabin
    const inside = elev.passengers;
    for (let i = 0; i < inside.length; i++) {
      const px = x + 10 + (i % 4) * 14;
      const py = y + 15 + Math.floor(i / 4) * 14;
      ctx.fillStyle = COLORS.passengerInside;
      ctx.beginPath();
      ctx.arc(px, py, PASSENGER_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }

    // Elevator label
    ctx.fillStyle = COLORS.text;
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    ctx.fillText(`E${elev.id}`, shaftX(elev.id) + SHAFT_WIDTH / 2, y - 5);

    // Direction arrow
    if (elev.direction === "up") {
      ctx.fillText("▲", shaftX(elev.id) + SHAFT_WIDTH / 2, y - 15);
    } else if (elev.direction === "down") {
      ctx.fillText("▼", shaftX(elev.id) + SHAFT_WIDTH / 2, y - 15);
    }
  }

  // Draw waiting passengers on each floor
  const waitingX = LEFT_MARGIN + numElevators * (SHAFT_WIDTH + SHAFT_GAP) + 20;
  for (const floor of frame.floors) {
    const y = floorY(floor.floor);
    for (let i = 0; i < floor.waiting.length; i++) {
      const px = waitingX + i * 16;
      const py = y - 10;
      ctx.fillStyle = COLORS.passengerWaiting;
      ctx.beginPath();
      ctx.arc(px, py, PASSENGER_RADIUS, 0, Math.PI * 2);
      ctx.fill();

      // Destination label
      ctx.fillStyle = COLORS.text;
      ctx.font = "8px monospace";
      ctx.textAlign = "center";
      ctx.fillText(`${floor.waiting[i].destination}`, px, py - 9);
    }
  }

  // Tick counter
  ctx.fillStyle = COLORS.text;
  ctx.font = "14px monospace";
  ctx.textAlign = "left";
  ctx.fillText(`Tick: ${frame.tick}`, 10, h - 15);

  // Algorithm label
  ctx.textAlign = "right";
  ctx.fillText(frame.active_algorithm.toUpperCase(), w - 10, h - 15);
}

function floorY(floor: number): number {
  return TOP_MARGIN + (NUM_FLOORS - 1 - floor) * FLOOR_HEIGHT + FLOOR_HEIGHT;
}

function shaftX(elevatorIndex: number): number {
  return LEFT_MARGIN + elevatorIndex * (SHAFT_WIDTH + SHAFT_GAP);
}
