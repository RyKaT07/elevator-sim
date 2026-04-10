from __future__ import annotations

import math
from dataclasses import dataclass

from sim.models import (
    Building,
    Direction,
    DoorState,
    Elevator,
    ElevatorAction,
    MovePhase,
    Passenger,
)
from sim.algorithms.base import Algorithm
from sim.metrics import MetricsCollector, Metrics
from sim import config as cfg


@dataclass
class StateFrame:
    """Snapshot of the simulation state at a single tick."""
    tick: int
    elevators: list[dict]
    floors: list[dict]
    metrics: dict
    active_algorithm: str
    scenario: str
    status: str

    def to_dict(self) -> dict:
        return {
            "tick": self.tick,
            "elevators": self.elevators,
            "floors": self.floors,
            "metrics": self.metrics,
            "active_algorithm": self.active_algorithm,
            "scenario": self.scenario,
            "status": self.status,
        }


class Simulation:
    """Tick-based elevator simulation with realistic physics.

    Movement phases: ACCELERATING → CRUISING → DECELERATING → BOARDING
    Each phase takes a configurable number of ticks per floor.
    """

    def __init__(
        self,
        building: Building,
        passengers: list[Passenger],
        algorithm: Algorithm,
        scenario: str = "custom",
        max_ticks: int = 1000,
    ) -> None:
        self.building = building
        self.passengers = passengers
        self.algorithm = algorithm
        self.scenario = scenario
        self.max_ticks = max_ticks

        self.tick = 0
        self.history: list[StateFrame] = []
        self.metrics_collector = MetricsCollector()
        self._delivered: list[Passenger] = []

        for p in self.passengers:
            p.spawn_tick = 0
            self.building.get_floor(p.origin).waiting.append(p)

    def run(self) -> list[StateFrame]:
        self.history.append(self._snapshot("running"))

        while not self._is_done() and self.tick < self.max_ticks:
            self.tick += 1
            self._step()
            status = "finished" if self._is_done() else "running"
            self.history.append(self._snapshot(status))

        return self.history

    def _step(self) -> None:
        # 1. Tick down any active phases
        busy_ids: set[int] = set()
        for elev in self.building.elevators:
            if elev.phase != MovePhase.IDLE:
                busy_ids.add(elev.id)
                elev.phase_ticks_left -= 1
                if elev.phase_ticks_left <= 0:
                    self._complete_phase(elev)

        # 2. Algorithm decides only for idle elevators
        #    (but we still call decide() every tick so the algorithm
        #    can observe the full state)
        actions = self.algorithm.decide(self.building, self.tick)

        for action in actions:
            elev = self.building.get_elevator(action.elevator_id)
            if elev.phase != MovePhase.IDLE:
                continue

            if action.open_doors and elev.floor == action.target_floor:
                self._start_boarding(elev)
            elif action.target_floor is not None and action.target_floor != elev.floor:
                self._start_move(elev, action.target_floor)

    # ── Movement state machine ──────────────────────────────────────

    def _start_move(self, elev: Elevator, target: int) -> None:
        elev.doors = DoorState.CLOSED
        elev.target_floor = target
        elev.floors_to_target = abs(target - elev.floor)
        elev.direction = Direction.UP if target > elev.floor else Direction.DOWN

        if elev.floors_to_target == 1:
            ticks = cfg.ACCEL_TICKS + cfg.DECEL_TICKS
            elev.phase = MovePhase.ACCELERATING
            elev.phase_ticks_left = ticks
            elev.phase_ticks_total = ticks
        else:
            elev.phase = MovePhase.ACCELERATING
            elev.phase_ticks_left = cfg.ACCEL_TICKS
            elev.phase_ticks_total = cfg.ACCEL_TICKS

    def _complete_phase(self, elev: Elevator) -> None:
        if elev.phase == MovePhase.ACCELERATING:
            self._do_floor_move(elev, is_accel=True)
            remaining = abs(elev.target_floor - elev.floor) if elev.target_floor is not None else 0

            if remaining == 0:
                self._arrive(elev)
            elif remaining == 1:
                elev.phase = MovePhase.DECELERATING
                elev.phase_ticks_left = cfg.DECEL_TICKS
                elev.phase_ticks_total = cfg.DECEL_TICKS
            else:
                elev.phase = MovePhase.CRUISING
                elev.phase_ticks_left = cfg.CRUISE_TICKS
                elev.phase_ticks_total = cfg.CRUISE_TICKS

        elif elev.phase == MovePhase.CRUISING:
            self._do_floor_move(elev, is_accel=False)
            remaining = abs(elev.target_floor - elev.floor) if elev.target_floor is not None else 0

            if remaining == 0:
                self._arrive(elev)
            elif remaining == 1:
                elev.phase = MovePhase.DECELERATING
                elev.phase_ticks_left = cfg.DECEL_TICKS
                elev.phase_ticks_total = cfg.DECEL_TICKS
            else:
                elev.phase_ticks_left = cfg.CRUISE_TICKS
                elev.phase_ticks_total = cfg.CRUISE_TICKS

        elif elev.phase == MovePhase.DECELERATING:
            self._do_floor_move(elev, is_decel=True)
            self._arrive(elev)

        elif elev.phase == MovePhase.DOORS_OPENING:
            # Doors fully open — now transfer passengers
            elev.doors = DoorState.OPEN
            pax_count = self._transfer_passengers(elev)
            board_ticks = max(1, cfg.BOARD_BASE_TICKS + math.ceil(pax_count * cfg.BOARD_PER_PAX_TICKS))
            elev.phase = MovePhase.BOARDING
            elev.phase_ticks_left = board_ticks
            elev.phase_ticks_total = board_ticks

        elif elev.phase == MovePhase.BOARDING:
            # Boarding done — close doors
            elev.phase = MovePhase.DOORS_CLOSING
            elev.phase_ticks_left = cfg.DOORS_CLOSE_TICKS
            elev.phase_ticks_total = cfg.DOORS_CLOSE_TICKS

        elif elev.phase == MovePhase.DOORS_CLOSING:
            elev.doors = DoorState.CLOSED
            elev.phase = MovePhase.IDLE

    def _do_floor_move(
        self, elev: Elevator, is_accel: bool = False, is_decel: bool = False
    ) -> None:
        prev = elev.floor
        if elev.direction == Direction.UP:
            elev.floor += 1
        elif elev.direction == Direction.DOWN:
            elev.floor -= 1

        if elev.floor != prev:
            self.metrics_collector.record_elevator_move(
                elev.id, prev, elev.floor, is_accel=is_accel, is_decel=is_decel
            )

    def _arrive(self, elev: Elevator) -> None:
        """Elevator arrived at target floor."""
        elev.phase = MovePhase.IDLE
        elev.target_floor = None
        elev.direction = Direction.IDLE
        self.metrics_collector.record_elevator_stop(elev.id)

    # ── Boarding (door sequence) ───────────────────────────────────

    def _start_boarding(self, elev: Elevator) -> None:
        """Begin door opening sequence: DOORS_OPENING → BOARDING → DOORS_CLOSING."""
        self.metrics_collector.record_elevator_stop(elev.id)
        elev.phase = MovePhase.DOORS_OPENING
        elev.phase_ticks_left = cfg.DOORS_OPEN_TICKS
        elev.phase_ticks_total = cfg.DOORS_OPEN_TICKS

    def _transfer_passengers(self, elev: Elevator) -> int:
        """Move passengers in/out. Returns total count for boarding time calc."""
        # Exit
        exiting = [p for p in elev.passengers if p.destination == elev.floor]
        for p in exiting:
            p.dropoff_tick = self.tick
            elev.passengers.remove(p)
            self._delivered.append(p)

        # Board — destination dispatch: group by similar destinations.
        # Passengers going to nearby floors board together so the
        # elevator makes fewer stops. If elevator already has passengers,
        # prefer those going in the same direction.
        floor = self.building.get_floor(elev.floor)
        candidates = list(floor.waiting)

        if elev.passengers:
            # Sort by proximity to existing passengers' destinations
            avg_dest = sum(p.destination for p in elev.passengers) / len(elev.passengers)
            candidates.sort(key=lambda p: abs(p.destination - avg_dest))
        else:
            # Sort by destination so nearby destinations cluster together
            candidates.sort(key=lambda p: p.destination)

        boarding = []
        for p in candidates:
            if len(elev.passengers) + len(boarding) >= elev.capacity:
                break
            boarding.append(p)
        for p in boarding:
            p.pickup_tick = self.tick
            floor.waiting.remove(p)
            elev.passengers.append(p)

        return len(exiting) + len(boarding)

    # ── Queries ─────────────────────────────────────────────────────

    @staticmethod
    def _elevator_progress(e: Elevator) -> float:
        """How far between current floor and next floor (0.0 to 1.0).

        Used by frontend for smooth interpolation. During movement phases,
        progress ramps from 0→1 as phase_ticks count down. During idle/boarding,
        progress is 0 (elevator is stationary at floor).
        """
        if e.phase in (MovePhase.IDLE, MovePhase.BOARDING, MovePhase.DOORS_OPENING, MovePhase.DOORS_CLOSING):
            return 0.0
        if e.phase_ticks_total == 0:
            return 0.0
        # progress = how much of the phase is done (0 = just started, 1 = done)
        return 1.0 - (e.phase_ticks_left / e.phase_ticks_total)

    @staticmethod
    def _door_progress(e: Elevator) -> float:
        """0.0 = closed, 1.0 = fully open."""
        if e.phase == MovePhase.DOORS_OPENING and e.phase_ticks_total > 0:
            return 1.0 - (e.phase_ticks_left / e.phase_ticks_total)
        if e.phase == MovePhase.BOARDING:
            return 1.0
        if e.phase == MovePhase.DOORS_CLOSING and e.phase_ticks_total > 0:
            return e.phase_ticks_left / e.phase_ticks_total
        return 0.0

    def _is_done(self) -> bool:
        return len(self._delivered) == len(self.passengers)

    def get_results(self) -> Metrics:
        return self.metrics_collector.compute(self.passengers)

    def _snapshot(self, status: str) -> StateFrame:
        metrics = self.metrics_collector.compute(self.passengers)
        return StateFrame(
            tick=self.tick,
            elevators=[
                {
                    "id": e.id,
                    "floor": e.floor,
                    "direction": e.direction.value,
                    "doors": e.doors == DoorState.OPEN,
                    "phase": e.phase.value,
                    # progress: 0.0 = just started moving from floor,
                    #           1.0 = about to arrive at next floor
                    "progress": self._elevator_progress(e),
                    "door_progress": self._door_progress(e),
                    "passengers": [
                        {"id": p.id, "destination": p.destination}
                        for p in e.passengers
                    ],
                }
                for e in self.building.elevators
            ],
            floors=[
                {
                    "floor": f.number,
                    "waiting": [
                        {
                            "id": p.id,
                            "destination": p.destination,
                            "wait_ticks": self.tick - p.spawn_tick,
                        }
                        for p in f.waiting
                    ],
                }
                for f in self.building.floors
            ],
            metrics=metrics.to_dict(),
            active_algorithm=self.algorithm.name,
            scenario=self.scenario,
            status=status,
        )
