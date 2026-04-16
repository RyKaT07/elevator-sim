from __future__ import annotations

from collections import Counter

from sim.models import Building, Elevator, ElevatorAction
from sim.algorithms.base import Algorithm


class LargestGroupAlgorithm(Algorithm):
    """Largest Group First: go to the floor with the most waiting
    passengers.  Keeps collecting until full, then delivers to the
    most popular destination.  Picks up and drops off on the way.
    """

    name = "largest_group"

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

        # 3. Not full AND someone waiting -> keep collecting (busiest floor)
        if not elev.is_full:
            target = _busiest_floor(building, exclude=claimed)
            if target is None:
                target = _busiest_floor(building, exclude=set())
            if target is not None:
                stop = _stop_on_way(building, elev, target)
                return ElevatorAction(elev.id, stop)

        # 4. Full or nobody waiting -> deliver (most popular destination)
        if not elev.is_empty:
            dests = Counter(p.destination for p in elev.passengers)
            target = dests.most_common(1)[0][0]
            stop = _stop_on_way(building, elev, target)
            return ElevatorAction(elev.id, stop)

        return ElevatorAction(elev.id)


def _busiest_floor(building: Building, exclude: set[int]) -> int | None:
    best_floor: int | None = None
    best_count = 0
    for floor in building.floors:
        if floor.number in exclude:
            continue
        n = len(floor.waiting)
        if n > best_count:
            best_count = n
            best_floor = floor.number
    return best_floor


def _stop_on_way(building: Building, elev: Elevator, target: int) -> int:
    """Check if there is a useful intermediate floor between current
    position and *target* where we should stop first (someone wants
    to exit there, or someone is waiting and we have room)."""
    if target == elev.floor:
        return target
    step = 1 if target > elev.floor else -1
    for f_num in range(elev.floor + step, target, step):
        if any(p.destination == f_num for p in elev.passengers):
            return f_num
        if not elev.is_full and building.get_floor(f_num).waiting:
            return f_num
    return target
