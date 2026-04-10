from __future__ import annotations

from dataclasses import dataclass, field

from sim.models import Passenger


@dataclass
class Metrics:
    avg_wait_time: float = 0.0
    avg_total_time: float = 0.0
    energy: float = 0.0

    def to_dict(self) -> dict:
        return {
            "avg_wait_time": round(self.avg_wait_time, 2),
            "avg_total_time": round(self.avg_total_time, 2),
            "energy": round(self.energy, 2),
        }


# Energy cost per floor traveled (arbitrary units).
# Going up costs more than going down.
ENERGY_UP_PER_FLOOR = 1.5
ENERGY_DOWN_PER_FLOOR = 0.8


class MetricsCollector:
    """Accumulates metrics across the simulation."""

    def __init__(self) -> None:
        self._total_energy: float = 0.0
        self._elevator_prev_floors: dict[int, int] = {}

    def record_elevator_move(self, elevator_id: int, from_floor: int, to_floor: int) -> None:
        diff = to_floor - from_floor
        if diff > 0:
            self._total_energy += abs(diff) * ENERGY_UP_PER_FLOOR
        elif diff < 0:
            self._total_energy += abs(diff) * ENERGY_DOWN_PER_FLOOR

    def compute(self, passengers: list[Passenger]) -> Metrics:
        delivered = [p for p in passengers if p.dropoff_tick is not None]
        picked_up = [p for p in passengers if p.pickup_tick is not None]

        avg_wait = 0.0
        if picked_up:
            avg_wait = sum(p.wait_time for p in picked_up) / len(picked_up)  # type: ignore[arg-type]

        avg_total = 0.0
        if delivered:
            avg_total = sum(p.total_time for p in delivered) / len(delivered)  # type: ignore[arg-type]

        return Metrics(
            avg_wait_time=avg_wait,
            avg_total_time=avg_total,
            energy=self._total_energy,
        )
