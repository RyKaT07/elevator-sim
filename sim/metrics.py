from __future__ import annotations

from dataclasses import dataclass

from sim.models import Passenger
from sim import config as cfg


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


class MetricsCollector:
    """Accumulates energy metrics with phase-aware costs."""

    def __init__(self) -> None:
        self._total_energy: float = 0.0

    def record_elevator_move(
        self,
        elevator_id: int,
        from_floor: int,
        to_floor: int,
        is_accel: bool = False,
        is_decel: bool = False,
    ) -> None:
        diff = to_floor - from_floor
        if diff == 0:
            return

        base = cfg.ENERGY_UP_CRUISE if diff > 0 else cfg.ENERGY_DOWN_CRUISE

        if is_accel:
            self._total_energy += abs(diff) * base * cfg.ENERGY_ACCEL_MULT
        elif is_decel:
            self._total_energy += abs(diff) * base * cfg.ENERGY_DECEL_MULT
        else:
            self._total_energy += abs(diff) * base

    def record_elevator_stop(self, elevator_id: int) -> None:
        pass  # no-op, tracking happens via move phases

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
