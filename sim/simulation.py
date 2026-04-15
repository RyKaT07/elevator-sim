from __future__ import annotations

import math
from copy import copy
from dataclasses import dataclass

from sim.models import (
    Building,
    Direction,
    DoorState,
    Elevator,
    ElevatorAction,
    Floor,
    MovePhase,
    Passenger,
)
from sim.algorithms.base import Algorithm
from sim.cooperation import CooperationStrategy
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
    cooperation: str

    def to_dict(self) -> dict:
        return {
            "tick": self.tick,
            "elevators": self.elevators,
            "floors": self.floors,
            "metrics": self.metrics,
            "active_algorithm": self.active_algorithm,
            "scenario": self.scenario,
            "status": self.status,
            "cooperation": self.cooperation,
        }


class Simulation:
    """Tick-based elevator simulation with realistic physics.

    Movement phases: ACCELERATING -> CRUISING -> DECELERATING -> BOARDING
    Each phase takes a configurable number of ticks per floor.

    After all passengers are delivered the elevators return to their
    starting positions before the simulation reports "finished".
    """

    def __init__(
        self,
        building: Building,
        passengers: list[Passenger],
        algorithm: Algorithm,
        scenario: str = "custom",
        max_ticks: int = 1000,
        cooperation: CooperationStrategy | None = None,
    ) -> None:
        self.building = building
        self.passengers = passengers
        self.algorithm = algorithm
        self.scenario = scenario
        self.max_ticks = max_ticks
        self.cooperation = cooperation

        self.tick = 0
        self.history: list[StateFrame] = []
        self.metrics_collector = MetricsCollector()
        self._delivered: list[Passenger] = []
        self._passengers_done = False

        for p in self.passengers:
            p.spawn_tick = 0
            self.building.get_floor(p.origin).waiting.append(p)

        # Cooperation setup
        self._passenger_zones: dict[int, set[int]] | None = None
        self._zone_algorithms: dict[int, Algorithm] | None = None
        if cooperation is not None:
            raw = cooperation.assign(self.building, self.passengers)
            self._passenger_zones = {
                eid: {p.id for p in plist} for eid, plist in raw.items()
            }
            self._zone_algorithms = {
                eid: type(algorithm)() for eid in range(building.num_elevators)
            }

    def run(self) -> list[StateFrame]:
        self.history.append(self._snapshot("running"))

        while self.tick < self.max_ticks:
            self.tick += 1
            self._step_physics()

            if not self._passengers_done:
                self._step_algorithm()
                if self._is_done():
                    self._passengers_done = True

            # Finished when all passengers delivered AND every
            # elevator has come to a stop (not mid-floor).
            if self._passengers_done and self._all_idle():
                self.history.append(self._snapshot("finished"))
                break

            self.history.append(self._snapshot("running"))

        return self.history

    # -- Step helpers --

    def _all_idle(self) -> bool:
        return all(
            e.phase == MovePhase.IDLE for e in self.building.elevators
        )

    def _step_physics(self) -> None:
        for elev in self.building.elevators:
            if elev.phase != MovePhase.IDLE:
                elev.phase_ticks_left -= 1
                if elev.phase_ticks_left <= 0:
                    self._complete_phase(elev)

    def _step_algorithm(self) -> None:
        if self._zone_algorithms is not None and self._passenger_zones is not None:
            actions = self._get_zone_actions()
        else:
            actions = self.algorithm.decide(self.building, self.tick)

        for action in actions:
            elev = self.building.get_elevator(action.elevator_id)
            if elev.phase != MovePhase.IDLE:
                continue
            if action.open_doors and elev.floor == action.target_floor:
                self._start_boarding(elev)
            elif action.target_floor is not None and action.target_floor != elev.floor:
                self._start_move(elev, action.target_floor)

    def _get_zone_actions(self) -> list[ElevatorAction]:
        """Run per-elevator algorithm instances with filtered building views.

        Each instance sees only its zone's passengers AND the other
        elevators appear occupied so the algorithm focuses all its
        scheduling effort on the controlled elevator.
        """
        all_actions: list[ElevatorAction] = []
        _sentinel = Passenger(id=-1, origin=0, destination=0)

        for elev in self.building.elevators:
            algo = self._zone_algorithms[elev.id]
            allowed = self._passenger_zones.get(elev.id, set())

            # Filtered floors: only zone-relevant passengers visible
            view = copy(self.building)
            view.floors = [
                Floor(
                    number=f.number,
                    waiting=[p for p in f.waiting if p.id in allowed],
                )
                for f in self.building.floors
            ]

            # Other elevators appear busy+occupied so algorithms
            # won't assign passengers to them.
            view_elevators: list[Elevator] = []
            for e in self.building.elevators:
                if e.id == elev.id:
                    view_elevators.append(e)
                else:
                    decoy = Elevator(
                        id=e.id,
                        floor=e.floor,
                        direction=e.direction,
                        passengers=[_sentinel],
                        capacity=e.capacity,
                        phase=MovePhase.CRUISING,
                        phase_ticks_left=999,
                        phase_ticks_total=999,
                    )
                    view_elevators.append(decoy)
            view.elevators = view_elevators

            actions = algo.decide(view, self.tick)
            for a in actions:
                if a.elevator_id == elev.id:
                    all_actions.append(a)
                    break

        return all_actions

    # -- Movement state machine --

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
            elev.doors = DoorState.OPEN
            pax_count = self._transfer_passengers(elev)
            board_ticks = max(1, cfg.BOARD_BASE_TICKS + math.ceil(pax_count * cfg.BOARD_PER_PAX_TICKS))
            elev.phase = MovePhase.BOARDING
            elev.phase_ticks_left = board_ticks
            elev.phase_ticks_total = board_ticks
        elif elev.phase == MovePhase.BOARDING:
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
        elev.phase = MovePhase.IDLE
        elev.target_floor = None
        elev.direction = Direction.IDLE
        self.metrics_collector.record_elevator_stop(elev.id)

    # -- Boarding --

    def _start_boarding(self, elev: Elevator) -> None:
        self.metrics_collector.record_elevator_stop(elev.id)
        elev.phase = MovePhase.DOORS_OPENING
        elev.phase_ticks_left = cfg.DOORS_OPEN_TICKS
        elev.phase_ticks_total = cfg.DOORS_OPEN_TICKS

    def _transfer_passengers(self, elev: Elevator) -> int:
        exiting = [p for p in elev.passengers if p.destination == elev.floor]
        for p in exiting:
            p.dropoff_tick = self.tick
            elev.passengers.remove(p)
            self._delivered.append(p)

        floor = self.building.get_floor(elev.floor)
        candidates = list(floor.waiting)

        if self._passenger_zones is not None:
            allowed = self._passenger_zones.get(elev.id, set())
            candidates = [p for p in candidates if p.id in allowed]

        if elev.passengers:
            avg_dest = sum(p.destination for p in elev.passengers) / len(elev.passengers)
            candidates.sort(key=lambda p: abs(p.destination - avg_dest))
        else:
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

    # -- Queries --

    @staticmethod
    def _elevator_progress(e: Elevator) -> float:
        if e.phase in (MovePhase.IDLE, MovePhase.BOARDING, MovePhase.DOORS_OPENING, MovePhase.DOORS_CLOSING):
            return 0.0
        if e.phase_ticks_total == 0:
            return 0.0
        return 1.0 - (e.phase_ticks_left / e.phase_ticks_total)

    @staticmethod
    def _door_progress(e: Elevator) -> float:
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
        coop_name = self.cooperation.name if self.cooperation else "none"
        return StateFrame(
            tick=self.tick,
            elevators=[
                {
                    "id": e.id,
                    "floor": e.floor,
                    "direction": e.direction.value,
                    "doors": e.doors == DoorState.OPEN,
                    "phase": e.phase.value,
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
            cooperation=coop_name,
        )
