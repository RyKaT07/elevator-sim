from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass, field

from sim.models import (
    Building,
    Direction,
    DoorState,
    Elevator,
    ElevatorAction,
    Floor,
    Passenger,
)
from sim.algorithms.base import Algorithm
from sim.metrics import MetricsCollector, Metrics


@dataclass
class StateFrame:
    """Snapshot of the simulation state at a single tick."""
    tick: int
    elevators: list[dict]
    floors: list[dict]
    metrics: dict
    active_algorithm: str
    scenario: str
    status: str  # "running" | "finished"

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
    """Tick-based elevator simulation.

    Batch mode: all passengers are defined before the simulation starts.
    The simulation runs until all passengers are delivered.
    """

    def __init__(
        self,
        building: Building,
        passengers: list[Passenger],
        algorithm: Algorithm,
        scenario: str = "custom",
        max_ticks: int = 500,
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

        # Place passengers on their origin floors at tick 0
        for p in self.passengers:
            p.spawn_tick = 0
            floor = self.building.get_floor(p.origin)
            floor.waiting.append(p)

    def run(self) -> list[StateFrame]:
        """Run the full simulation, return history of state frames."""
        self.history.append(self._snapshot("running"))

        while not self._is_done() and self.tick < self.max_ticks:
            self.tick += 1
            self._step()
            status = "finished" if self._is_done() else "running"
            self.history.append(self._snapshot(status))

        return self.history

    def _step(self) -> None:
        # 1. Algorithm decides actions
        actions = self.algorithm.decide(self.building, self.tick)

        # 2. Apply actions: open doors (board/exit), then move
        for action in actions:
            elev = self.building.get_elevator(action.elevator_id)

            if action.open_doors and elev.floor == action.target_floor:
                self._open_doors(elev)
            elif action.target_floor is not None:
                self._move_toward(elev, action.target_floor)
            else:
                elev.direction = Direction.IDLE
                elev.doors = DoorState.CLOSED

    def _open_doors(self, elev: Elevator) -> None:
        elev.doors = DoorState.OPEN

        # Exit passengers whose destination is this floor
        exiting = [p for p in elev.passengers if p.destination == elev.floor]
        for p in exiting:
            p.dropoff_tick = self.tick
            elev.passengers.remove(p)
            self._delivered.append(p)

        # Board waiting passengers going in a compatible direction
        floor = self.building.get_floor(elev.floor)
        boarding = []
        for p in floor.waiting:
            if elev.is_full:
                break
            boarding.append(p)

        for p in boarding:
            p.pickup_tick = self.tick
            floor.waiting.remove(p)
            elev.passengers.append(p)

    def _move_toward(self, elev: Elevator, target: int) -> None:
        elev.doors = DoorState.CLOSED
        prev_floor = elev.floor

        if target > elev.floor:
            elev.floor += 1
            elev.direction = Direction.UP
        elif target < elev.floor:
            elev.floor -= 1
            elev.direction = Direction.DOWN
        else:
            elev.direction = Direction.IDLE

        elev.target_floor = target
        if elev.floor != prev_floor:
            self.metrics_collector.record_elevator_move(
                elev.id, prev_floor, elev.floor
            )

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
