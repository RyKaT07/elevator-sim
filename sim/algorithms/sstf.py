from __future__ import annotations

from sim.models import Building, Elevator, ElevatorAction
from sim.algorithms.base import Algorithm


class SSTFAlgorithm(Algorithm):
    """Shortest Seek Time First (Nearest Call): always go to the
    nearest floor with waiting passengers.  Keeps collecting until
    full, then delivers to nearest destination.  Picks up and drops
    off at intermediate floors on the way.
    """

    name = "sstf"

    def decide(self, building: Building, tick: int) -> list[ElevatorAction]:
        actions: list[ElevatorAction] = []
        claimed: set[int] = set()
        for elev in building.elevators:
            action = self._decide_single(building, elev, claimed)
            if action.target_floor is not None and not action.open_doors:
                claimed.add(action.target_floor)
            actions.append(action)
        return actions

    @staticmethod
    def _decide_single(
        building: Building, elev: Elevator, claimed: set[int]
    ) -> ElevatorAction:
        # 1. Exit at destination
        if any(p.destination == elev.floor for p in elev.passengers):
            return ElevatorAction(elev.id, elev.floor, open_doors=True)

        # 2. Board at current floor
        if not elev.is_full and building.get_floor(elev.floor).waiting:
            return ElevatorAction(elev.id, elev.floor, open_doors=True)

        # 3. Not full AND someone waiting -> keep collecting (nearest floor)
        if not elev.is_full:
            target = _nearest_waiting(building, elev.floor, exclude=claimed)
            if target is None:
                target = _nearest_waiting(building, elev.floor, exclude=set())
            if target is not None:
                stop = _stop_on_way(building, elev, target)
                return ElevatorAction(elev.id, stop)

        # 4. Full or nobody waiting -> deliver (nearest destination)
        if not elev.is_empty:
            nearest = min(
                elev.passengers, key=lambda p: abs(p.destination - elev.floor)
            )
            target = nearest.destination
            stop = _stop_on_way(building, elev, target)
            return ElevatorAction(elev.id, stop)

        return ElevatorAction(elev.id)


def _nearest_waiting(
    building: Building, current: int, exclude: set[int]
) -> int | None:
    best_floor: int | None = None
    best_dist = float("inf")
    for floor in building.floors:
        if not floor.waiting or floor.number in exclude:
            continue
        dist = abs(floor.number - current)
        if dist < best_dist:
            best_dist = dist
            best_floor = floor.number
    return best_floor


def _stop_on_way(building: Building, elev: Elevator, target: int) -> int:
    """Check for useful intermediate stops between here and target."""
    if target == elev.floor:
        return target
    step = 1 if target > elev.floor else -1
    for f_num in range(elev.floor + step, target, step):
        if any(p.destination == f_num for p in elev.passengers):
            return f_num
        if not elev.is_full and building.get_floor(f_num).waiting:
            return f_num
    return target
