from __future__ import annotations

from sim.models import Building, Direction, Elevator, ElevatorAction, Passenger
from sim.algorithms.base import Algorithm


class ScanAlgorithm(Algorithm):
    """Directional sweep (SCAN / elevator algorithm): each elevator
    moves in one direction, serving all requests along the way,
    then reverses direction.

    Similar to disk-scheduling SCAN — the elevator sweeps up collecting
    and delivering passengers, then sweeps down, repeating until done.
    """

    name = "scan"

    def __init__(self) -> None:
        self._directions: dict[int, Direction] = {}

    def decide(self, building: Building, tick: int) -> list[ElevatorAction]:
        actions: list[ElevatorAction] = []
        for elev in building.elevators:
            if elev.id not in self._directions:
                self._directions[elev.id] = Direction.UP
            actions.append(self._decide_single(building, elev))
        return actions

    def _decide_single(self, building: Building, elev: Elevator) -> ElevatorAction:
        sweep_dir = self._directions[elev.id]

        if self._should_open(building, elev, sweep_dir):
            return ElevatorAction(elev.id, elev.floor, open_doors=True)

        target = self._next_target(building, elev, sweep_dir)
        if target is not None:
            return ElevatorAction(elev.id, target)

        # No targets in current direction — reverse
        new_dir = Direction.DOWN if sweep_dir == Direction.UP else Direction.UP
        self._directions[elev.id] = new_dir

        # After reversing, check if we should open doors at current floor
        if self._should_open(building, elev, new_dir):
            return ElevatorAction(elev.id, elev.floor, open_doors=True)

        target = self._next_target(building, elev, new_dir)
        if target is not None:
            return ElevatorAction(elev.id, target)

        return ElevatorAction(elev.id)

    def _should_open(self, building: Building, elev: Elevator, sweep_dir: Direction) -> bool:
        floor = building.get_floor(elev.floor)

        # Exit passengers at this floor
        if any(p.destination == elev.floor for p in elev.passengers):
            return True

        # Board waiting passengers going in sweep direction (or any if empty)
        if not elev.is_full:
            for p in floor.waiting:
                if elev.is_empty or p.direction == sweep_dir:
                    return True

        return False

    def _next_target(
        self, building: Building, elev: Elevator, sweep_dir: Direction
    ) -> int | None:
        """Find the nearest relevant floor in the sweep direction."""
        targets: list[int] = []

        # Destinations of passengers inside
        for p in elev.passengers:
            targets.append(p.destination)

        # Origins of waiting passengers — only those whose direction
        # matches the sweep (the bug was: any passenger at the right
        # position was included, causing the elevator to visit floors
        # with only opposite-direction passengers and get stuck).
        for floor in building.floors:
            for p in floor.waiting:
                compatible = (
                    (elev.is_empty or p.direction == sweep_dir)
                    and not elev.is_full
                )
                if sweep_dir == Direction.UP and p.origin >= elev.floor and compatible:
                    targets.append(p.origin)
                elif sweep_dir == Direction.DOWN and p.origin <= elev.floor and compatible:
                    targets.append(p.origin)

        if not targets:
            return None

        if sweep_dir == Direction.UP:
            above = [t for t in targets if t > elev.floor]
            return min(above) if above else None
        else:
            below = [t for t in targets if t < elev.floor]
            return max(below) if below else None
