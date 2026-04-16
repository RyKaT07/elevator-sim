from sim.models import Building, Passenger
from sim.simulation import Simulation
from sim.algorithms.fcfs import FCFSAlgorithm


def test_single_passenger_delivery():
    """One passenger from floor 0 to floor 3 should be delivered."""
    building = Building(num_floors=7, num_elevators=1)
    passengers = [Passenger(id=0, origin=0, destination=3)]
    algo = FCFSAlgorithm()
    sim = Simulation(building, passengers, algo, max_ticks=50)
    history = sim.run()

    last = history[-1]
    assert last.status == "finished"
    assert passengers[0].dropoff_tick is not None
    assert passengers[0].destination == 3


def test_two_passengers_same_direction():
    """Two passengers going up from floor 0."""
    building = Building(num_floors=7, num_elevators=1)
    passengers = [
        Passenger(id=0, origin=0, destination=3),
        Passenger(id=1, origin=0, destination=5),
    ]
    algo = FCFSAlgorithm()
    sim = Simulation(building, passengers, algo, max_ticks=50)
    history = sim.run()

    assert history[-1].status == "finished"
    for p in passengers:
        assert p.dropoff_tick is not None


def test_two_elevators():
    """Two elevators should serve two passengers in parallel."""
    building = Building(num_floors=7, num_elevators=2)
    passengers = [
        Passenger(id=0, origin=0, destination=6),
        Passenger(id=1, origin=0, destination=4),
    ]
    algo = FCFSAlgorithm()
    sim = Simulation(building, passengers, algo, max_ticks=50)
    history = sim.run()

    assert history[-1].status == "finished"
    for p in passengers:
        assert p.dropoff_tick is not None


def test_metrics_computed():
    """Metrics should be non-zero after a completed run."""
    building = Building(num_floors=7, num_elevators=1)
    passengers = [Passenger(id=0, origin=0, destination=3)]
    algo = FCFSAlgorithm()
    sim = Simulation(building, passengers, algo, max_ticks=50)
    sim.run()

    results = sim.get_results()
    assert results.max_wait_time >= 0
    assert results.energy > 0


def test_opposite_direction_passengers():
    """Passengers going in opposite directions."""
    building = Building(num_floors=7, num_elevators=2)
    passengers = [
        Passenger(id=0, origin=0, destination=6),
        Passenger(id=1, origin=6, destination=0),
    ]
    algo = FCFSAlgorithm()
    sim = Simulation(building, passengers, algo, max_ticks=100)
    history = sim.run()

    assert history[-1].status == "finished"
    for p in passengers:
        assert p.dropoff_tick is not None


def test_max_ticks_safety():
    """Simulation should stop at max_ticks even if not all delivered."""
    building = Building(num_floors=7, num_elevators=1)
    passengers = [Passenger(id=i, origin=0, destination=6) for i in range(20)]
    algo = FCFSAlgorithm()
    sim = Simulation(building, passengers, algo, max_ticks=10)
    history = sim.run()

    assert len(history) <= 12  # tick 0 + up to 10 steps + possible finish
