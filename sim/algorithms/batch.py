from __future__ import annotations

from collections import defaultdict

from sim.models import Building, Direction, Elevator, ElevatorAction, Passenger
from sim.algorithms.base import Algorithm


class BatchAlgorithm(Algorithm):
    """Batch optimization: group passengers by destination proximity,
    assign the largest compatible batch to each elevator per cycle.

    Strategy:
    - Cluster waiting passengers into batches (same direction, close destinations)
    - Assign the largest batch to the nearest available elevator
    - Elevator serves all passengers in the batch before taking a new one
    """

    name = "batch"

    def __init__(self, cluster_radius: int = 2) -> None:
        self._cluster_radius = cluster_radius
        self._assignments: dict[int, list[int]] = {}  # elevator_id -> [passenger_ids]

    def decide(self, building: Building, tick: int) -> list[ElevatorAction]:
        # Clean up delivered assignments
        self._cleanup(building)

        # Try to assign new batches to idle elevators
        self._assign_batches(building)

        actions: list[ElevatorAction] = []
        for elev in building.elevators:
            actions.append(self._decide_single(building, elev))
        return actions

    def _cleanup(self, building: Building) -> None:
        for eid in list(self._assignments.keys()):
            elev = building.get_elevator(eid)
            assigned = self._assignments[eid]
            # Remove passengers already delivered or picked up
            still_waiting = [
                pid for pid in assigned
                if self._passenger_waiting(building, pid)
            ]
            inside = [pid for pid in assigned if pid in elev.passenger_ids()]
            if not still_waiting and not inside:
                del self._assignments[eid]
            else:
                self._assignments[eid] = still_waiting + inside

    def _assign_batches(self, building: Building) -> None:
        idle = [
            e for e in building.elevators
            if e.id not in self._assignments and e.is_empty
        ]
        if not idle:
            return

        # Gather all unassigned waiting passengers
        assigned_pids = set()
        for pids in self._assignments.values():
            assigned_pids.update(pids)

        waiting: list[Passenger] = []
        for floor in building.floors:
            for p in floor.waiting:
                if p.id not in assigned_pids:
                    waiting.append(p)

        if not waiting:
            return

        # Cluster passengers by direction and destination proximity
        batches = self._cluster(waiting)
        # Sort batches by size (largest first)
        batches.sort(key=len, reverse=True)

        for batch in batches:
            if not idle:
                break
            # Find nearest elevator to the batch origin
            avg_origin = sum(p.origin for p in batch) / len(batch)
            nearest = min(idle, key=lambda e: abs(e.floor - avg_origin))
            self._assignments[nearest.id] = [p.id for p in batch]
            idle.remove(nearest)

    def _cluster(self, passengers: list[Passenger]) -> list[list[Passenger]]:
        """Group passengers going in the same direction with close destinations."""
        up = [p for p in passengers if p.direction == Direction.UP]
        down = [p for p in passengers if p.direction == Direction.DOWN]

        clusters: list[list[Passenger]] = []
        for group in (up, down):
            group.sort(key=lambda p: p.destination)
            current_cluster: list[Passenger] = []
            for p in group:
                if not current_cluster:
                    current_cluster.append(p)
                elif abs(p.destination - current_cluster[-1].destination) <= self._cluster_radius:
                    current_cluster.append(p)
                else:
                    clusters.append(current_cluster)
                    current_cluster = [p]
            if current_cluster:
                clusters.append(current_cluster)

        return clusters

    def _decide_single(self, building: Building, elev: Elevator) -> ElevatorAction:
        # Priority 1: deliver passengers inside
        if not elev.is_empty:
            # Deliver nearest destination first
            target = min(elev.passengers, key=lambda p: abs(p.destination - elev.floor))
            if elev.floor == target.destination:
                return ElevatorAction(elev.id, target.destination, open_doors=True)
            return ElevatorAction(elev.id, target.destination)

        # Priority 2: pick up assigned batch
        if elev.id in self._assignments:
            pids = self._assignments[elev.id]
            # Find first still-waiting passenger
            for pid in pids:
                p = self._find_passenger(building, pid)
                if p is not None:
                    if elev.floor == p.origin:
                        return ElevatorAction(elev.id, p.origin, open_doors=True)
                    return ElevatorAction(elev.id, p.origin)

        return ElevatorAction(elev.id)

    @staticmethod
    def _find_passenger(building: Building, pid: int) -> Passenger | None:
        for floor in building.floors:
            for p in floor.waiting:
                if p.id == pid:
                    return p
        return None

    @staticmethod
    def _passenger_waiting(building: Building, pid: int) -> bool:
        for floor in building.floors:
            for p in floor.waiting:
                if p.id == pid:
                    return True
        return False
