"""Two-elevator cooperation strategies.

These modify how passengers are assigned to elevators, layered on top
of any scheduling algorithm. The cooperation strategy pre-filters which
passengers each elevator is allowed to serve.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from sim.models import Building, Passenger


class CooperationStrategy(ABC):
    """Decides which elevator should handle which passenger."""

    name: str = "base"

    @abstractmethod
    def assign(
        self, building: Building, passengers: list[Passenger]
    ) -> dict[int, list[Passenger]]:
        """Return elevator_id -> list of passengers it should serve."""
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
            # Assign based on the higher of origin/destination
            key_floor = max(p.origin, p.destination)
            if key_floor < split:
                result[0].append(p)
            else:
                result[1].append(p)

        return result


class TaskSplit(CooperationStrategy):
    """Elevator 0 handles large batches (3+ passengers going to similar
    floors), elevator 1 handles remaining quick singles."""

    name = "task_split"

    def __init__(self, batch_threshold: int = 3) -> None:
        self._threshold = batch_threshold

    def assign(
        self, building: Building, passengers: list[Passenger]
    ) -> dict[int, list[Passenger]]:
        from collections import Counter

        result: dict[int, list[Passenger]] = {
            e.id: [] for e in building.elevators
        }

        # Count passengers per origin floor
        origin_counts = Counter(p.origin for p in passengers)

        for p in passengers:
            if origin_counts[p.origin] >= self._threshold:
                result[0].append(p)  # bulk elevator
            else:
                result[1].append(p)  # quick elevator

        return result


COOPERATION_STRATEGIES: dict[str, type[CooperationStrategy]] = {
    "zone_split": ZoneSplit,
    "task_split": TaskSplit,
}
