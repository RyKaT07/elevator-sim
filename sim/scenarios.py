"""Predefined passenger distributions for common elevator scenarios.

Each scenario returns a list of {"floor": int, "destination": int} dicts
that can be fed directly to POST /run or the selector.
"""

from __future__ import annotations

import random
from typing import TypedDict


class PassengerSpec(TypedDict):
    floor: int
    destination: int


def apartment_morning(count: int = 14, floors: int = 7, seed: int = 42) -> list[PassengerSpec]:
    """Morning rush in an apartment building: everyone goes from upper
    floors down to ground floor (0)."""
    rng = random.Random(seed)
    return [
        {"floor": rng.randint(1, floors - 1), "destination": 0}
        for _ in range(count)
    ]


def apartment_evening(count: int = 14, floors: int = 7, seed: int = 42) -> list[PassengerSpec]:
    """Evening return: everyone comes from ground floor to upper floors."""
    rng = random.Random(seed)
    return [
        {"floor": 0, "destination": rng.randint(1, floors - 1)}
        for _ in range(count)
    ]


def office_morning(count: int = 14, floors: int = 7, seed: int = 42) -> list[PassengerSpec]:
    """Office morning: people enter at ground floor and go to various
    office floors (2-6). Some arrive to floor 1 (lobby/cafeteria)."""
    rng = random.Random(seed)
    passengers: list[PassengerSpec] = []
    for _ in range(count):
        dest = rng.choices(
            population=list(range(1, floors)),
            weights=[1] + [3] * (floors - 2),
            k=1,
        )[0]
        passengers.append({"floor": 0, "destination": dest})
    return passengers


def office_evening(count: int = 14, floors: int = 7, seed: int = 42) -> list[PassengerSpec]:
    """Office evening: people leave from office floors to ground floor.
    Some inter-floor trips (meetings ending)."""
    rng = random.Random(seed)
    passengers: list[PassengerSpec] = []
    for _ in range(count):
        origin = rng.randint(1, floors - 1)
        if rng.random() < 0.8:
            dest = 0
        else:
            dest = rng.choice([f for f in range(floors) if f != origin])
        passengers.append({"floor": origin, "destination": dest})
    return passengers


SCENARIOS: dict[str, callable] = {
    "apartment_morning": apartment_morning,
    "apartment_evening": apartment_evening,
    "office_morning": office_morning,
    "office_evening": office_evening,
}


# Initial elevator positions per scenario.
# Elevators should start where demand is expected.
SCENARIO_ELEVATOR_POSITIONS: dict[str, list[int]] = {
    "apartment_morning": [0, 3],   # spread out — passengers come from all upper floors
    "apartment_evening": [0, 0],   # both at ground — passengers arrive at ground
    "office_morning":    [0, 0],   # both at ground — passengers arrive at ground
    "office_evening":    [6, 3],   # both at top — passengers leave from upper floors
}


def get_scenario(name: str, **kwargs) -> list[PassengerSpec]:
    if name not in SCENARIOS:
        raise ValueError(f"Unknown scenario: {name}. Available: {list(SCENARIOS.keys())}")
    return SCENARIOS[name](**kwargs)
