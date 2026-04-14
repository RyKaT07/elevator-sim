from sim.models import Building, Passenger
from sim.simulation import Simulation
from sim.algorithms.fcfs import FCFSAlgorithm
from sim.algorithms.batch import BatchAlgorithm
from sim.algorithms.sweep import SweepAlgorithm
from sim.algorithms.selector import select_best
from sim.scenarios import apartment_morning, office_morning


def _run(algo_cls, passengers_spec, max_ticks=100):
    building = Building()
    passengers = [
        Passenger(id=i, origin=p["floor"], destination=p["destination"])
        for i, p in enumerate(passengers_spec)
    ]
    algo = algo_cls()
    sim = Simulation(building, passengers, algo, max_ticks=max_ticks)
    sim.run()
    return sim, passengers


# ── Batch algorithm ──────────────────────────────────────────────────


def test_batch_single_passenger():
    sim, passengers = _run(BatchAlgorithm, [{"floor": 0, "destination": 3}])
    assert passengers[0].dropoff_tick is not None


def test_batch_cluster():
    spec = [
        {"floor": 0, "destination": 5},
        {"floor": 0, "destination": 6},
        {"floor": 0, "destination": 4},
    ]
    sim, passengers = _run(BatchAlgorithm, spec)
    for p in passengers:
        assert p.dropoff_tick is not None


def test_batch_apartment_morning():
    spec = apartment_morning(count=8, seed=123)
    sim, passengers = _run(BatchAlgorithm, spec, max_ticks=200)
    delivered = [p for p in passengers if p.dropoff_tick is not None]
    assert len(delivered) == len(passengers)


# ── Sweep algorithm ──────────────────────────────────────────────────


def test_sweep_single_passenger():
    sim, passengers = _run(SweepAlgorithm, [{"floor": 0, "destination": 3}])
    assert passengers[0].dropoff_tick is not None


def test_sweep_bidirectional():
    spec = [
        {"floor": 0, "destination": 6},
        {"floor": 6, "destination": 0},
    ]
    sim, passengers = _run(SweepAlgorithm, spec, max_ticks=200)
    for p in passengers:
        assert p.dropoff_tick is not None


def test_sweep_office_morning():
    spec = office_morning(count=8, seed=456)
    sim, passengers = _run(SweepAlgorithm, spec, max_ticks=200)
    delivered = [p for p in passengers if p.dropoff_tick is not None]
    assert len(delivered) == len(passengers)


# ── Meta-selector ────────────────────────────────────────────────────


def test_selector_picks_best():
    spec = [{"floor": 0, "destination": f} for f in range(1, 7)]
    best, results = select_best(spec, metric="wait_time")
    assert best in ("fcfs", "batch", "sweep", "sequential")
    assert len(results) == 4
    for m in results.values():
        assert m.avg_wait_time >= 0


def test_selector_all_metrics():
    spec = apartment_morning(count=6, seed=789)
    for metric in ("wait_time", "total_time", "energy"):
        best, results = select_best(
            [{"floor": p["floor"], "destination": p["destination"]} for p in spec],
            metric=metric,
        )
        assert best in ("fcfs", "batch", "sweep", "sequential")


# ── Sequential algorithm ─────────────────────────────────────────────

from sim.algorithms.sequential import SequentialAlgorithm


def test_sequential_single_passenger():
    sim, passengers = _run(SequentialAlgorithm, [{"floor": 0, "destination": 3}])
    assert passengers[0].dropoff_tick is not None


def test_sequential_bidirectional():
    spec = [
        {"floor": 0, "destination": 6},
        {"floor": 6, "destination": 0},
    ]
    sim, passengers = _run(SequentialAlgorithm, spec, max_ticks=300)
    for p in passengers:
        assert p.dropoff_tick is not None


def test_sequential_full_capacity():
    """More passengers than elevator capacity — all should still be delivered."""
    spec = [{"floor": 0, "destination": 6} for _ in range(12)]
    sim, passengers = _run(SequentialAlgorithm, spec, max_ticks=500)
    delivered = [p for p in passengers if p.dropoff_tick is not None]
    assert len(delivered) == len(passengers)


def test_sequential_apartment_morning():
    spec = apartment_morning(count=8, seed=42)
    sim, passengers = _run(SequentialAlgorithm, spec, max_ticks=400)
    delivered = [p for p in passengers if p.dropoff_tick is not None]
    assert len(delivered) == len(passengers)
