"""Elevator physics and timing configuration.

All timing values are in simulation ticks. Adjust these to tune realism.
Can be overridden via environment variables (prefix: ELEVSIM_).
"""

import os


def _env(key: str, default: int | float) -> int | float:
    val = os.environ.get(f"ELEVSIM_{key}")
    if val is None:
        return default
    return type(default)(val)


# ── Movement timing (ticks per floor) ───────────────────────────────

# Acceleration: first floor after starting from stop
ACCEL_TICKS: int = int(_env("ACCEL_TICKS", 3))

# Cruising: each floor at full speed
CRUISE_TICKS: int = int(_env("CRUISE_TICKS", 2))

# Deceleration: last floor before stopping
DECEL_TICKS: int = int(_env("DECEL_TICKS", 2))

# ── Door timing ─────────────────────────────────────────────────────

DOORS_OPEN_TICKS: int = int(_env("DOORS_OPEN_TICKS", 2))
DOORS_CLOSE_TICKS: int = int(_env("DOORS_CLOSE_TICKS", 2))

# ── Boarding timing ─────────────────────────────────────────────────

BOARD_BASE_TICKS: int = int(_env("BOARD_BASE_TICKS", 1))
BOARD_PER_PAX_TICKS: float = float(_env("BOARD_PER_PAX_TICKS", 0.5))

# ── Elevator capacity ──────────────────────────────────────────────

ELEVATOR_CAPACITY: int = int(_env("ELEVATOR_CAPACITY", 8))

# ── Energy costs (arbitrary units per floor) ────────────────────────

# Cruising energy per floor
# Up > Down because motor works against gravity.
# Down is low thanks to counterweight + gravity assist.
# Real elevators with counterweight: down ≈ 30% of up energy.
ENERGY_UP_CRUISE: float = float(_env("ENERGY_UP_CRUISE", 1.5))
ENERGY_DOWN_CRUISE: float = float(_env("ENERGY_DOWN_CRUISE", 0.5))

# Multipliers for accel/decel phases (extra energy for speed changes)
# Acceleration requires building kinetic energy → highest cost.
# Deceleration with regen braking recovers some energy → moderate cost.
ENERGY_ACCEL_MULT: float = float(_env("ENERGY_ACCEL_MULT", 2.5))
ENERGY_DECEL_MULT: float = float(_env("ENERGY_DECEL_MULT", 1.5))
