export interface PassengerState {
  id: number;
  destination: number;
  wait_ticks?: number;
}

export interface ElevatorState {
  id: number;
  floor: number;
  direction: "up" | "down" | "idle";
  doors: boolean;
  passengers: PassengerState[];
}

export interface FloorState {
  floor: number;
  waiting: PassengerState[];
}

export interface MetricsState {
  avg_wait_time: number;
  avg_total_time: number;
  energy: number;
}

export interface StateFrame {
  tick: number;
  elevators: ElevatorState[];
  floors: FloorState[];
  metrics: MetricsState;
  active_algorithm: string;
  scenario: string;
  status: "running" | "finished";
}

export interface AlgorithmResult {
  algorithm: string;
  metrics: MetricsState;
}

export interface Summary {
  status: "finished";
  results: AlgorithmResult[];
  selected: string;
}

export interface RunRequest {
  passengers: { floor: number; destination: number }[];
  scenario?: string;
  metric: "wait_time" | "total_time" | "energy";
  algorithm?: string;
}

export interface RunResponse {
  run_id: string;
  algorithms_used: string[];
  total_ticks: number;
}
