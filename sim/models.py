from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class Direction(Enum):
    UP = "up"
    DOWN = "down"
    IDLE = "idle"


class DoorState(Enum):
    OPEN = "open"
    CLOSED = "closed"


class MovePhase(Enum):
    IDLE = "idle"
    ACCELERATING = "accelerating"
    CRUISING = "cruising"
    DECELERATING = "decelerating"
    DOORS_OPENING = "doors_opening"
    BOARDING = "boarding"
    DOORS_CLOSING = "doors_closing"


@dataclass
class Passenger:
    id: int
    origin: int
    destination: int
    spawn_tick: int = 0
    pickup_tick: Optional[int] = None
    dropoff_tick: Optional[int] = None

    @property
    def direction(self) -> Direction:
        if self.destination > self.origin:
            return Direction.UP
        return Direction.DOWN

    @property
    def wait_time(self) -> Optional[int]:
        if self.pickup_tick is None:
            return None
        return self.pickup_tick - self.spawn_tick

    @property
    def total_time(self) -> Optional[int]:
        if self.dropoff_tick is None:
            return None
        return self.dropoff_tick - self.spawn_tick

    @property
    def ride_time(self) -> Optional[int]:
        if self.pickup_tick is None or self.dropoff_tick is None:
            return None
        return self.dropoff_tick - self.pickup_tick


@dataclass
class Elevator:
    id: int
    floor: int = 0
    direction: Direction = Direction.IDLE
    doors: DoorState = DoorState.CLOSED
    passengers: list[Passenger] = field(default_factory=list)
    capacity: int = 8
    target_floor: Optional[int] = None
    phase: MovePhase = MovePhase.IDLE
    phase_ticks_left: int = 0
    phase_ticks_total: int = 0  # total ticks for current phase (for progress calc)
    floors_to_target: int = 0

    @property
    def is_full(self) -> bool:
        return len(self.passengers) >= self.capacity

    @property
    def is_empty(self) -> bool:
        return len(self.passengers) == 0

    @property
    def is_idle(self) -> bool:
        return self.direction == Direction.IDLE and self.target_floor is None

    def passenger_ids(self) -> list[int]:
        return [p.id for p in self.passengers]


@dataclass
class Floor:
    number: int
    waiting: list[Passenger] = field(default_factory=list)


@dataclass
class Building:
    num_floors: int = 7
    num_elevators: int = 2
    floors: list[Floor] = field(default_factory=list)
    elevators: list[Elevator] = field(default_factory=list)

    def __post_init__(self) -> None:
        from sim.config import ELEVATOR_CAPACITY
        if not self.floors:
            self.floors = [Floor(number=i) for i in range(self.num_floors)]
        if not self.elevators:
            self.elevators = [Elevator(id=i, capacity=ELEVATOR_CAPACITY) for i in range(self.num_elevators)]

    def get_floor(self, number: int) -> Floor:
        return self.floors[number]

    def get_elevator(self, eid: int) -> Elevator:
        return self.elevators[eid]


@dataclass
class ElevatorAction:
    """Single action command for one elevator in one tick."""
    elevator_id: int
    target_floor: Optional[int] = None
    open_doors: bool = False
    # If set, only these passenger IDs may board (for coordination).
    # If None, anyone waiting on the floor can board.
    board_ids: Optional[set[int]] = None
