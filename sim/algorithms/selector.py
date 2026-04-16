from __future__ import annotations

from sim.models import Building, Passenger
from sim.simulation import Simulation
from sim.metrics import Metrics
from sim.algorithms.base import Algorithm
from sim.algorithms.fcfs import FCFSAlgorithm
from sim.algorithms.batch import LargestGroupAlgorithm
from sim.algorithms.sweep import ScanAlgorithm
from sim.algorithms.sstf import SSTFAlgorithm


ALL_ALGORITHMS: dict[str, type[Algorithm]] = {
    "fcfs": FCFSAlgorithm,
    "largest_group": LargestGroupAlgorithm,
    "scan": ScanAlgorithm,
    "sstf": SSTFAlgorithm,
}

METRIC_KEY = {
    "wait_time": "avg_wait_time",
    "max_wait_time": "max_wait_time",
    "energy": "energy",
}


def select_best(
    passengers_spec: list[dict],
    metric: str = "wait_time",
    num_floors: int = 7,
    num_elevators: int = 2,
    scenario: str = "custom",
) -> tuple[str, dict[str, Metrics]]:
    key = METRIC_KEY.get(metric, "avg_wait_time")
    results: dict[str, Metrics] = {}
    best_algo: str = ""
    best_score: float = float("inf")

    for algo_name, algo_cls in ALL_ALGORITHMS.items():
        building = Building(num_floors=num_floors, num_elevators=num_elevators)
        passengers = [
            Passenger(id=i, origin=p["floor"], destination=p["destination"])
            for i, p in enumerate(passengers_spec)
        ]
        algo = algo_cls()
        sim = Simulation(building, passengers, algo, scenario=scenario)
        sim.run()

        m = sim.get_results()
        delivered = len([p for p in passengers if p.dropoff_tick is not None])
        results[algo_name] = m
        score = getattr(m, key)
        if delivered < len(passengers):
            score = float("inf")
        if score < best_score:
            best_score = score
            best_algo = algo_name

    return best_algo, results
