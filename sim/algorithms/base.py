from __future__ import annotations

from abc import ABC, abstractmethod

from sim.models import Building, ElevatorAction


class Algorithm(ABC):
    """Base class for elevator scheduling algorithms."""

    name: str = "base"

    @abstractmethod
    def decide(self, building: Building, tick: int) -> list[ElevatorAction]:
        """Given current building state, return actions for each elevator.

        Called once per tick. The returned actions are applied by the
        simulation engine — the algorithm itself must not mutate the
        building state.
        """
        ...
