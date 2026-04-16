from __future__ import annotations

from sim.models import Building, Elevator, ElevatorAction, Passenger
from sim.algorithms.base import Algorithm


class FCFSAlgorithm(Algorithm):
    """First-Come First-Served: pick up passengers in the order they
    appeared.  Keeps collecting until full, then delivers.
    Picks up and drops off at intermediate floors on the way.
    """

    name = "fcfs"

    def __init__(self) -> None:
        self._queue: list[int] = []
        self._seen: set[int] = set()

    def decide(self, building: Building, tick: int) -> list[ElevatorAction]:
        # Track new waiting passengers in arrival order
        for floor in building.floors:
            for p in floor.waiting:
                if p.id not in self._seen:
                    self._queue.append(p.id)
                    self._seen.add(p.id)

        # Remove passengers already picked up or gone
        in_elevators: set[int] = set()
        for elev in building.elevators:
            in_elevators.update(p.id for p in elev.passengers)
        self._queue = [
            pid for pid in self._queue
            if pid not in in_elevators
            and _find_passenger(building, pid) is not None
        ]

        actions: list[ElevatorAction] = []
        claimed: set[int] = set()
        for elev in building.elevators:
            action = self._decide_single(building, elev, claimed)
            if action.target_floor is not None and not action.open_doors:
                claimed.add(action.target_floor)
            actions.append(action)
        return actions

    def _decide_single(
        self, building: Building, elev: Elevator, claimed: set[int]
    ) -> ElevatorAction:
        # 1. Exit at destination
        if any(p.destination == elev.floor for p in elev.passengers):
            return ElevatorAction(elev.id, elev.floor, open_doors=True)

        # 2. Board at current floor
        if not elev.is_full and building.get_floor(elev.floor).waiting:
            return ElevatorAction(elev.id, elev.floor, open_doors=True)

        # 3. Not full AND queued passengers waiting -> keep collecting
        if not elev.is_full:
            for pid in self._queue:
                p = _find_passenger(building, pid)
                if p is not None and p.origin not in claimed:
                    claimed.add(p.origin)
                    stop = _stop_on_way(building, elev, p.origin)
                    return ElevatorAction(elev.id, stop)

        # 4. Full or nobody in queue -> deliver (FCFS: first passenger first)
        if not elev.is_empty:
            target = elev.passengers[0].destination
            stop = _stop_on_way(building, elev, target)
            return ElevatorAction(elev.id, stop)

        return ElevatorAction(elev.id)


def _find_passenger(building: Building, pid: int) -> Passenger | None:
    for floor in building.floors:
        for p in floor.waiting:
            if p.id == pid:
                return p
    return None


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
