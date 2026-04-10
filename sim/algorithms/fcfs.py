from __future__ import annotations

from sim.models import Building, Direction, ElevatorAction, Elevator, Passenger
from sim.algorithms.base import Algorithm


class FCFSAlgorithm(Algorithm):
    """First-Come First-Served: assign requests to nearest idle elevator
    in the order passengers appeared."""

    name = "fcfs"

    def __init__(self) -> None:
        # Queue of unassigned passenger IDs (by spawn order)
        self._queue: list[int] = []
        # elevator_id -> passenger_id currently being served (pickup phase)
        self._pickup_assignments: dict[int, int] = {}
        # Set of passenger IDs already assigned
        self._assigned: set[int] = set()

    def decide(self, building: Building, tick: int) -> list[ElevatorAction]:
        # Add new waiting passengers to queue (maintain spawn order)
        for floor in building.floors:
            for p in floor.waiting:
                if p.id not in self._assigned and p.id not in self._queue:
                    self._queue.append(p.id)

        # Clean up completed pickups (passenger is now inside elevator)
        for eid, pid in list(self._pickup_assignments.items()):
            elev = building.get_elevator(eid)
            if pid in elev.passenger_ids():
                del self._pickup_assignments[eid]
            # Also clean up if passenger disappeared from waiting (edge case)
            elif not self._passenger_still_waiting(building, pid):
                del self._pickup_assignments[eid]
                self._assigned.discard(pid)

        # Try to assign queued passengers to idle elevators
        self._assign_from_queue(building)

        # Generate actions
        actions: list[ElevatorAction] = []
        for elev in building.elevators:
            action = self._decide_single(building, elev, tick)
            actions.append(action)
        return actions

    def _assign_from_queue(self, building: Building) -> None:
        idle_elevators = [
            e for e in building.elevators
            if e.id not in self._pickup_assignments and e.is_empty
        ]

        # Track floors being served and how many passengers wait there
        floors_served_by: dict[int, int] = {}  # floor -> count of elevators heading there
        for eid, pid in self._pickup_assignments.items():
            p = self._find_passenger(building, pid)
            if p is not None:
                floors_served_by[p.origin] = floors_served_by.get(p.origin, 0) + 1

        while self._queue and idle_elevators:
            pid = self._queue[0]
            if not self._passenger_still_waiting(building, pid):
                self._queue.pop(0)
                self._assigned.discard(pid)
                continue

            passenger = self._find_passenger(building, pid)
            if passenger is None:
                self._queue.pop(0)
                continue

            # Skip floor if enough elevators already heading there
            # (1 elevator per 8 waiting passengers)
            floor_obj = building.get_floor(passenger.origin)
            waiting_count = len(floor_obj.waiting)
            elevators_needed = max(1, (waiting_count + 7) // 8)  # ceil division
            elevators_assigned = floors_served_by.get(passenger.origin, 0)
            if elevators_assigned >= elevators_needed:
                self._queue.pop(0)
                continue

            nearest = min(
                idle_elevators,
                key=lambda e: abs(e.floor - passenger.origin),
            )
            self._pickup_assignments[nearest.id] = pid
            self._assigned.add(pid)
            floors_served_by[passenger.origin] = elevators_assigned + 1
            idle_elevators.remove(nearest)
            self._queue.pop(0)

    def _decide_single(
        self, building: Building, elev: Elevator, tick: int
    ) -> ElevatorAction:
        # Priority 1: deliver passengers already inside
        if not elev.is_empty:
            # Go to the first passenger's destination (FCFS order)
            target = elev.passengers[0].destination
            if elev.floor == target:
                return ElevatorAction(
                    elevator_id=elev.id, target_floor=target, open_doors=True
                )
            return ElevatorAction(elevator_id=elev.id, target_floor=target)

        # Priority 2: go pick up assigned passenger
        if elev.id in self._pickup_assignments:
            pid = self._pickup_assignments[elev.id]
            passenger = self._find_passenger(building, pid)
            if passenger is not None:
                if elev.floor == passenger.origin:
                    return ElevatorAction(
                        elevator_id=elev.id,
                        target_floor=passenger.origin,
                        open_doors=True,
                    )
                return ElevatorAction(
                    elevator_id=elev.id, target_floor=passenger.origin
                )

        # Idle
        return ElevatorAction(elevator_id=elev.id)

    @staticmethod
    def _find_passenger(building: Building, pid: int) -> Passenger | None:
        for floor in building.floors:
            for p in floor.waiting:
                if p.id == pid:
                    return p
        return None

    @staticmethod
    def _passenger_still_waiting(building: Building, pid: int) -> bool:
        for floor in building.floors:
            for p in floor.waiting:
                if p.id == pid:
                    return True
        return False
