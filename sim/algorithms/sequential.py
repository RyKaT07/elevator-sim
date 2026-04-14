from __future__ import annotations

from sim.models import Building, Direction, Elevator, ElevatorAction
from sim.algorithms.base import Algorithm


class SequentialAlgorithm(Algorithm):
    """No-algorithm baseline: each elevator sweeps all floors
    sequentially (up then down), opening doors at every floor
    where passengers can board or exit.

    No intelligent scheduling — purely sequential traversal.
    Used as a comparison baseline for smarter algorithms.
    """

    name = "sequential"

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
        direction = self._directions[elev.id]
        floor = building.get_floor(elev.floor)

        # Open doors at current floor if anyone needs to exit or board
        has_exiting = any(p.destination == elev.floor for p in elev.passengers)
        has_boarding = not elev.is_full and len(floor.waiting) > 0

        if has_exiting or has_boarding:
            return ElevatorAction(elev.id, elev.floor, open_doors=True)

        # Move to the next floor in current sweep direction
        next_floor = self._next_floor(building, elev, direction)
        if next_floor is not None:
            return ElevatorAction(elev.id, next_floor)

        # Hit boundary — reverse direction
        new_dir = Direction.DOWN if direction == Direction.UP else Direction.UP
        self._directions[elev.id] = new_dir

        next_floor = self._next_floor(building, elev, new_dir)
        if next_floor is not None:
            return ElevatorAction(elev.id, next_floor)

        # Nowhere to go (single-floor building edge case)
        return ElevatorAction(elev.id)

    @staticmethod
    def _next_floor(
        building: Building, elev: Elevator, direction: Direction
    ) -> int | None:
        """Return the adjacent floor in the given direction, or None at boundary."""
        if direction == Direction.UP:
            nf = elev.floor + 1
            return nf if nf < building.num_floors else None
        else:
            nf = elev.floor - 1
            return nf if nf >= 0 else None
