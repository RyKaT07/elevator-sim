"""Two-elevator cooperation strategies."""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections import defaultdict

from sim.models import Building, Passenger


class CooperationStrategy(ABC):
    """Decides which elevator should handle which passenger."""

    name: str = "base"

    @abstractmethod
    def assign(
        self, building: Building, passengers: list[Passenger]
    ) -> dict[int, list[Passenger]]:
        ...


class ZoneSplit(CooperationStrategy):
    """Split building into zones: elevator 0 handles lower floors,
    elevator 1 handles upper floors."""

    name = "zone_split"

    def __init__(self, split_floor: int | None = None) -> None:
        self._split_floor = split_floor

    def assign(
        self, building: Building, passengers: list[Passenger]
    ) -> dict[int, list[Passenger]]:
        split = self._split_floor or building.num_floors // 2
        result: dict[int, list[Passenger]] = {
            e.id: [] for e in building.elevators
        }
        for p in passengers:
            key_floor = max(p.origin, p.destination)
            if key_floor < split:
                result[0].append(p)
            else:
                result[1].append(p)
        return result


class TaskSplit(CooperationStrategy):
    """Balance-by-floor-group: keep passengers from the same floor
    together (efficient batching) but distribute floor groups across
    elevators so neither sits idle.

    Small groups (up to half of total passengers) are kept intact
    and assigned to the least-loaded elevator.  Large groups that
    would overload one elevator are split evenly.
    """

    name = "task_split"

    def assign(
        self, building: Building, passengers: list[Passenger]
    ) -> dict[int, list[Passenger]]:
        n_elev = len(building.elevators)
        by_floor: dict[int, list[Passenger]] = defaultdict(list)
        for p in passengers:
            by_floor[p.origin].append(p)

        # Largest groups first for good greedy balance
        sorted_floors = sorted(
            by_floor.keys(), key=lambda f: len(by_floor[f]), reverse=True
        )

        result: dict[int, list[Passenger]] = {e.id: [] for e in building.elevators}
        counts: dict[int, int] = {e.id: 0 for e in building.elevators}
        fair_share = max(1, len(passengers) // n_elev)

        for floor in sorted_floors:
            group = by_floor[floor]

            if len(group) <= fair_share:
                # Small group: keep together, assign to least-loaded
                target = min(counts, key=counts.get)
                result[target].extend(group)
                counts[target] += len(group)
            else:
                # Large group: split across elevators
                eids = sorted(counts, key=counts.get)
                per_elev = len(group) // n_elev
                start = 0
                for i, eid in enumerate(eids):
                    end = start + per_elev if i < n_elev - 1 else len(group)
                    result[eid].extend(group[start:end])
                    counts[eid] += end - start
                    start = end

        return result


COOPERATION_STRATEGIES: dict[str, type[CooperationStrategy]] = {
    "zone_split": ZoneSplit,
    "task_split": TaskSplit,
}
