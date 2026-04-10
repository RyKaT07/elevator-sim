"use client";

import { useState, useCallback, useRef } from "react";
import type { StateFrame, Summary, RunRequest, RunResponse } from "./types";

const DEV_API = "http://localhost:8000";
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === "production" ? "" : DEV_API);

export function useSimSocket() {
  const [frameIndex, setFrameIndex] = useState(-1);
  const [allFrames, setAllFrames] = useState<StateFrame[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speed, setSpeed] = useState(500);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const idxRef = useRef(0);
  const framesRef = useRef<StateFrame[]>([]);
  const summaryRef = useRef<Summary | null>(null);

  const stopPlayback = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsRunning(false);
    if (summaryRef.current) setSummary(summaryRef.current);
  }, []);

  const run = useCallback(async (req: RunRequest) => {
    // Reset
    stopPlayback();
    setError(null);
    setSummary(null);
    setAllFrames([]);
    setFrameIndex(-1);
    setIsRunning(true);
    idxRef.current = 0;
    summaryRef.current = null;

    try {
      const res = await fetch(`${API_BASE}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data: RunResponse = await res.json();

      const framesRes = await fetch(`${API_BASE}/frames/${data.run_id}`);
      if (!framesRes.ok) throw new Error(`Failed to fetch frames`);
      const result = await framesRes.json();

      const frames: StateFrame[] = result.frames;
      const sum: Summary = result.summary;

      framesRef.current = frames;
      summaryRef.current = sum;
      setAllFrames(frames);
      setFrameIndex(0);

      // Simple interval-based playback
      intervalRef.current = setInterval(() => {
        idxRef.current++;
        if (idxRef.current >= framesRef.current.length) {
          clearInterval(intervalRef.current!);
          intervalRef.current = null;
          setIsRunning(false);
          setSummary(summaryRef.current);
          return;
        }
        setFrameIndex(idxRef.current);
      }, speed);

    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setIsRunning(false);
    }
  }, [speed, stopPlayback]);

  const currentFrame = frameIndex >= 0 && frameIndex < allFrames.length ? allFrames[frameIndex] : null;
  const nextFrame = frameIndex >= 0 && frameIndex + 1 < allFrames.length ? allFrames[frameIndex + 1] : null;

  return {
    currentFrame,
    nextFrame,
    summary,
    isRunning,
    error,
    run,
    stop: stopPlayback,
    speed,
    setSpeed,
  };
}
