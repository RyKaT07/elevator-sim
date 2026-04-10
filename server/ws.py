from __future__ import annotations

import asyncio
import uuid
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from sim.models import Building, Passenger
from sim.simulation import Simulation
from sim.algorithms.base import Algorithm
from sim.algorithms.fcfs import FCFSAlgorithm
from sim.scenarios import SCENARIOS

app = FastAPI(title="Elevator Simulator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Algorithm registry ──────────────────────────────────────────────

ALGORITHMS: dict[str, type[Algorithm]] = {
    "fcfs": FCFSAlgorithm,
}


def _register_optional_algorithms() -> None:
    """Import and register algorithms that may not exist yet."""
    try:
        from sim.algorithms.batch import BatchAlgorithm
        ALGORITHMS["batch"] = BatchAlgorithm
    except ImportError:
        pass
    try:
        from sim.algorithms.sweep import SweepAlgorithm
        ALGORITHMS["sweep"] = SweepAlgorithm
    except ImportError:
        pass


_register_optional_algorithms()

# ── In-memory store for completed runs ──────────────────────────────

_runs: dict[str, dict[str, Any]] = {}


# ── Request / response models ───────────────────────────────────────

class PassengerInput(BaseModel):
    floor: int
    destination: int


class RunRequest(BaseModel):
    passengers: list[PassengerInput] = []
    scenario: str = "custom"
    metric: str = "wait_time"
    algorithm: str | None = None
    passenger_count: int = 14


class RunResponse(BaseModel):
    run_id: str
    algorithms_used: list[str]
    total_ticks: int


# ── POST /run ────────────────────────────────────────────────────────

@app.post("/run", response_model=RunResponse)
async def run_simulation(req: RunRequest) -> RunResponse:
    run_id = uuid.uuid4().hex[:12]

    # Resolve passengers: from scenario or from explicit list
    if req.passengers:
        passenger_specs = [{"floor": p.floor, "destination": p.destination} for p in req.passengers]
    elif req.scenario in SCENARIOS:
        passenger_specs = SCENARIOS[req.scenario](count=req.passenger_count)
    else:
        passenger_specs = SCENARIOS["apartment_morning"](count=req.passenger_count)

    algos_to_run: list[str] = (
        [req.algorithm] if req.algorithm and req.algorithm in ALGORITHMS
        else list(ALGORITHMS.keys())
    )

    all_results: dict[str, dict] = {}
    all_histories: dict[str, list[dict]] = {}
    best_algo: str | None = None
    best_score: float = float("inf")

    for algo_name in algos_to_run:
        building = Building()
        passengers = [
            Passenger(id=i, origin=p["floor"], destination=p["destination"])
            for i, p in enumerate(passenger_specs)
        ]
        algo = ALGORITHMS[algo_name]()
        sim = Simulation(building, passengers, algo, scenario=req.scenario)
        history = sim.run()

        metrics = sim.get_results()
        metric_map = {
            "wait_time": metrics.avg_wait_time,
            "total_time": metrics.avg_total_time,
            "energy": metrics.energy,
        }
        score = metric_map.get(req.metric, metrics.avg_wait_time)

        all_results[algo_name] = metrics.to_dict()
        all_histories[algo_name] = [f.to_dict() for f in history]

        if score < best_score:
            best_score = score
            best_algo = algo_name

    _runs[run_id] = {
        "results": all_results,
        "histories": all_histories,
        "selected": best_algo,
        "metric": req.metric,
    }

    total_ticks = max(
        len(h) for h in all_histories.values()
    )

    return RunResponse(
        run_id=run_id,
        algorithms_used=algos_to_run,
        total_ticks=total_ticks,
    )


# ── WS /ws/{run_id} ─────────────────────────────────────────────────

@app.websocket("/ws/{run_id}")
async def ws_playback(ws: WebSocket, run_id: str) -> None:
    await ws.accept()

    run = _runs.get(run_id)
    if run is None:
        await ws.send_json({"error": "run not found"})
        await ws.close()
        return

    selected = run["selected"]
    history = run["histories"][selected]

    try:
        for frame in history:
            await ws.send_json(frame)
            await asyncio.sleep(0.15)

        # Send summary after last frame
        await ws.send_json({
            "status": "finished",
            "results": [
                {"algorithm": algo, "metrics": metrics}
                for algo, metrics in run["results"].items()
            ],
            "selected": selected,
        })
    except WebSocketDisconnect:
        pass


# ── GET /results/{run_id} (fallback if WS not desired) ──────────────

@app.get("/results/{run_id}")
async def get_results(run_id: str) -> dict:
    run = _runs.get(run_id)
    if run is None:
        return {"error": "run not found"}
    return {
        "results": [
            {"algorithm": algo, "metrics": metrics}
            for algo, metrics in run["results"].items()
        ],
        "selected": run["selected"],
        "metric": run["metric"],
    }


# ── Healthcheck ──────────────────────────────────────────────────────

@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "algorithms": list(ALGORITHMS.keys())}
