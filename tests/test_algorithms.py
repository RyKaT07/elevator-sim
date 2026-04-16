from sim.models import Building, Passenger
from sim.simulation import Simulation
from sim.algorithms.fcfs import FCFSAlgorithm
from sim.algorithms.batch import LargestGroupAlgorithm
from sim.algorithms.sweep import ScanAlgorithm
from sim.algorithms.sstf import SSTFAlgorithm
from sim.algorithms.selector import select_best
from sim.scenarios import apartment_morning, office_morning


def _run(algo_cls, passengers_spec, max_ticks=200):
    building = Building()
    passengers = [
        Passenger(id=i, origin=p["floor"], destination=p["destination"])
        for i, p in enumerate(passengers_spec)
    ]
    algo = algo_cls()
    sim = Simulation(building, passengers, algo, max_ticks=max_ticks)
    sim.run()
    return sim, passengers


# -- FCFS --

def test_fcfs_single():
    sim, pax = _run(FCFSAlgorithm, [{"floor": 0, "destination": 3}])
    assert pax[0].dropoff_tick is not None


def test_fcfs_apartment():
    spec = apartment_morning(count=8, seed=123)
    sim, pax = _run(FCFSAlgorithm, spec)
    assert all(p.dropoff_tick is not None for p in pax)


# -- Largest Group --

def test_largest_group_single():
    sim, pax = _run(LargestGroupAlgorithm, [{"floor": 0, "destination": 5}])
    assert pax[0].dropoff_tick is not None


def test_largest_group_cluster():
    spec = [{"floor": 0, "destination": 5} for _ in range(6)]
    sim, pax = _run(LargestGroupAlgorithm, spec)
    assert all(p.dropoff_tick is not None for p in pax)


def test_largest_group_apartment():
    spec = apartment_morning(count=10, seed=42)
    sim, pax = _run(LargestGroupAlgorithm, spec, max_ticks=400)
    assert all(p.dropoff_tick is not None for p in pax)


# -- Scan (gora-dol) --

def test_scan_single():
    sim, pax = _run(ScanAlgorithm, [{"floor": 0, "destination": 3}])
    assert pax[0].dropoff_tick is not None


def test_scan_bidirectional():
    spec = [
        {"floor": 0, "destination": 6},
        {"floor": 6, "destination": 0},
    ]
    sim, pax = _run(ScanAlgorithm, spec)
    assert all(p.dropoff_tick is not None for p in pax)


def test_scan_office():
    spec = office_morning(count=8, seed=456)
    sim, pax = _run(ScanAlgorithm, spec)
    assert all(p.dropoff_tick is not None for p in pax)


# -- SSTF (najblizsze wezwanie) --

def test_sstf_single():
    sim, pax = _run(SSTFAlgorithm, [{"floor": 0, "destination": 4}])
    assert pax[0].dropoff_tick is not None


def test_sstf_scattered():
    spec = [
        {"floor": 1, "destination": 5},
        {"floor": 6, "destination": 2},
        {"floor": 3, "destination": 0},
    ]
    sim, pax = _run(SSTFAlgorithm, spec)
    assert all(p.dropoff_tick is not None for p in pax)


def test_sstf_apartment():
    spec = apartment_morning(count=10, seed=99)
    sim, pax = _run(SSTFAlgorithm, spec, max_ticks=400)
    assert all(p.dropoff_tick is not None for p in pax)


# -- Selector --

def test_selector_picks_best():
    spec = [{"floor": 0, "destination": f} for f in range(1, 7)]
    best, results = select_best(spec, metric="wait_time")
    assert best in ("fcfs", "largest_group", "scan", "sstf")
    assert len(results) == 4
    for m in results.values():
        assert m.avg_wait_time >= 0


def test_selector_all_metrics():
    spec = apartment_morning(count=6, seed=789)
    for metric in ("wait_time", "max_wait_time", "energy"):
        best, results = select_best(
            [{"floor": p["floor"], "destination": p["destination"]} for p in spec],
            metric=metric,
        )
        assert best in ("fcfs", "largest_group", "scan", "sstf")
