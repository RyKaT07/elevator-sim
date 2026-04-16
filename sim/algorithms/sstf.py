from __future__ import annotations

from sim.models import Building, Elevator, ElevatorAction
from sim.algorithms.base import Algorithm


class SSTFAlgorithm(Algorithm):
    """Shortest Seek Time First (Nearest Call): always go to the
    nearest floor that has a waiting passenger or the nearest
    destination of a passenger inside.

    Minimises empty travel but can starve distant floors when
    requests keep arriving nearby — a well-known trade-off from
    disk-scheduling theory.
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
        # 1. Let passengers out at their destination
        if any(p.destination == elev.floor for p in elev.passengers):
            return ElevatorAction(elev.id, elev.floor, open_doors=True)

        # 2. Board at current floor
        if not elev.is_full and building.get_floor(elev.floor).waiting:
            return ElevatorAction(elev.id, elev.floor, open_doors=True)

        # 3. Carrying passengers -> nearest destination
        if not elev.is_empty:
            nearest = min(
                elev.passengers, key=lambda p: abs(p.destination - elev.floor)
            )
            return ElevatorAction(elev.id, nearest.destination)

        # 4. Empty -> nearest floor with waiting passengers
        best = _nearest_waiting(building, elev.floor, exclude=claimed)
        if best is None:
            best = _nearest_waiting(building, elev.floor, exclude=set())

        if best is not None:
            return ElevatorAction(elev.id, best)

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
