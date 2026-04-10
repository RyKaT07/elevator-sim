from sim.models import Building, Direction, Elevator, Floor, Passenger, ElevatorAction


def test_passenger_direction_up():
    p = Passenger(id=0, origin=1, destination=5)
    assert p.direction == Direction.UP


def test_passenger_direction_down():
    p = Passenger(id=0, origin=5, destination=1)
    assert p.direction == Direction.DOWN


def test_passenger_times():
    p = Passenger(id=0, origin=0, destination=3, spawn_tick=0, pickup_tick=2, dropoff_tick=5)
    assert p.wait_time == 2
    assert p.ride_time == 3
    assert p.total_time == 5


def test_passenger_times_none_before_pickup():
    p = Passenger(id=0, origin=0, destination=3, spawn_tick=0)
    assert p.wait_time is None
    assert p.total_time is None


def test_elevator_defaults():
    e = Elevator(id=0)
    assert e.floor == 0
    assert e.is_idle
    assert e.is_empty
    assert not e.is_full


def test_elevator_capacity():
    e = Elevator(id=0, capacity=2)
    e.passengers = [Passenger(id=i, origin=0, destination=3) for i in range(2)]
    assert e.is_full
    assert not e.is_empty


def test_building_defaults():
    b = Building()
    assert len(b.floors) == 7
    assert len(b.elevators) == 2
    assert b.get_floor(0).number == 0
    assert b.get_elevator(1).id == 1


def test_building_custom():
    b = Building(num_floors=5, num_elevators=3)
    assert len(b.floors) == 5
    assert len(b.elevators) == 3
