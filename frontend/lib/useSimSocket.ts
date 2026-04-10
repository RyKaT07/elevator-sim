"use client";

import { useState, useCallback, useRef } from "react";
import type { StateFrame, Summary, RunRequest, RunResponse } from "./types";

// In production behind a reverse proxy: use relative URLs (same origin).
// In dev: fall back to localhost:8000.
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";
const WS_BASE = API_BASE
  ? API_BASE.replace(/^http/, "ws")
  : `${typeof window !== "undefined" ? (window.location.protocol === "https:" ? "wss:" : "ws:") : "ws:"}//${typeof window !== "undefined" ? window.location.host : "localhost:8000"}`;

export function useSimSocket() {
  const [frames, setFrames] = useState<StateFrame[]>([]);
  const [currentFrame, setCurrentFrame] = useState<StateFrame | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const run = useCallback(async (req: RunRequest) => {
    setError(null);
    setSummary(null);
    setFrames([]);
    setCurrentFrame(null);
    setIsRunning(true);

    try {
      const res = await fetch(`${API_BASE}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });

      if (!res.ok) {
        throw new Error(`Server error: ${res.status}`);
      }

      const data: RunResponse = await res.json();

      // Connect WebSocket for playback
      const ws = new WebSocket(`${WS_BASE}/ws/${data.run_id}`);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);

        if (msg.status === "finished" && msg.results) {
          setSummary(msg as Summary);
          setIsRunning(false);
          return;
        }

        const frame = msg as StateFrame;
        setCurrentFrame(frame);
        setFrames((prev) => [...prev, frame]);
      };

      ws.onerror = () => {
        setError("WebSocket connection error");
        setIsRunning(false);
      };

      ws.onclose = () => {
        setIsRunning(false);
      };
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setIsRunning(false);
    }
  }, []);

  const stop = useCallback(() => {
    wsRef.current?.close();
    setIsRunning(false);
  }, []);

  return { frames, currentFrame, summary, isRunning, error, run, stop };
}
