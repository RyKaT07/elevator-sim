"use client";

import { useState, useCallback, useRef } from "react";
import type { StateFrame, Summary, RunRequest, RunResponse } from "./types";

const DEV_API = "http://localhost:8000";
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === "production" ? "" : DEV_API);

export function useSimSocket() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speed, setSpeed] = useState(500);

  // Frames stored ONLY in ref — no React state, no re-renders during playback
  const allFramesRef = useRef<StateFrame[]>([]);

  const run = useCallback(async (req: RunRequest) => {
    setError(null);
    setSummary(null);
    setIsRunning(true);
    allFramesRef.current = [];

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

      allFramesRef.current = result.frames;
      // Canvas component will handle playback — no React state during animation
      // Summary shown after canvas signals completion
      setSummary(null); // clear, canvas will call onComplete
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setIsRunning(false);
    }
  }, []);

  const stop = useCallback(() => {
    allFramesRef.current = [];
    setIsRunning(false);
  }, []);

  const onPlaybackComplete = useCallback((sum: Summary | null) => {
    setIsRunning(false);
    if (sum) setSummary(sum);
  }, []);

  return {
    allFramesRef,
    summary,
    isRunning,
    error,
    run,
    stop,
    speed,
    setSpeed,
    onPlaybackComplete,
  };
}
