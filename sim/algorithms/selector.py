from __future__ import annotations

from sim.models import Building, Passenger
from sim.simulation import Simulation
from sim.metrics import Metrics
from sim.algorithms.base import Algorithm
from sim.algorithms.fcfs import FCFSAlgorithm
from sim.algorithms.batch import BatchAlgorithm
from sim.algorithms.sweep import SweepAlgorithm


ALL_ALGORITHMS: dict[str, type[Algorithm]] = {
    "fcfs": FCFSAlgorithm,
    "batch": BatchAlgorithm,
    "sweep": SweepAlgorithm,
}

METRIC_KEY = {
    "wait_time": "avg_wait_time",
    "total_time": "avg_total_time",
    "energy": "energy",
}


def select_best(
    passengers_spec: list[dict],
    metric: str = "wait_time",
    num_floors: int = 7,
    num_elevators: int = 2,
    scenario: str = "custom",
) -> tuple[str, dict[str, Metrics]]:
    """Run all algorithms on the same passenger set, return the best one.

    Args:
        passengers_spec: list of {"floor": int, "destination": int}
        metric: one of "wait_time", "total_time", "energy"
        num_floors: number of floors in the building
        num_elevators: number of elevators
        scenario: scenario name for labeling

    Returns:
        (best_algorithm_name, {algo_name: Metrics})
    """
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
        results[algo_name] = m
        score = getattr(m, key)
        if score < best_score:
            best_score = score
            best_algo = algo_name

    return best_algo, results
