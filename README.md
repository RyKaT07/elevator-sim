# Symulacja Wind — Algorytmy Szeregowania

Symulator wind z realistyczną fizyką ruchu, czterema algorytmami szeregowania i strategiami kooperacji dla wielu wind.

## Struktura projektu

```
sim/
├── models.py              # Modele danych (Building, Elevator, Passenger, Floor)
├── simulation.py          # Silnik symulacji — fizyka ruchu, maszyna stanów
├── config.py              # Stałe fizyczne i czasowe (ticki, energia)
├── metrics.py             # Zbieranie metryk (czas oczekiwania, energia)
├── cooperation.py         # Strategie kooperacji wind (ZoneSplit, TaskSplit)
├── scenarios.py           # Predefiniowane scenariusze pasażerów
└── algorithms/
    ├── base.py            # Klasa bazowa Algorithm (interfejs decide())
    ├── fcfs.py            # First-Come First-Served
    ├── batch.py           # Largest Group First
    ├── sweep.py           # SCAN (algorytm zamiatania)
    ├── sstf.py            # Shortest Seek Time First
    └── selector.py        # Automatyczny wybór najlepszego algorytmu
```

## Interfejs algorytmu

Każdy algorytm dziedziczy po `Algorithm` ([`sim/algorithms/base.py`](sim/algorithms/base.py)) i implementuje jedną metodę:

```python
def decide(self, building: Building, tick: int) -> list[ElevatorAction]
```

Metoda wywoływana jest raz na tick symulacji. Zwraca listę akcji — po jednej na windę. Akcja to albo ruch do piętra (`target_floor=X`), albo otwarcie drzwi (`open_doors=True`). Algorytm podejmuje decyzje **tylko gdy winda jest IDLE** — reszta jest ignorowana przez silnik.

## Algorytmy

### 1. FCFS — First-Come First-Served

**Plik:** [`sim/algorithms/fcfs.py`](sim/algorithms/fcfs.py)

Pasażerowie obsługiwani w kolejności zgłoszenia. Globalna kolejka FIFO współdzielona przez wszystkie windy.

**Logika decyzyjna** (per winda):

1. Ktoś w windzie jedzie na bieżące piętro → **otwórz drzwi** (wysiadka)
2. Winda nie pełna i ludzie czekają na tym piętrze → **otwórz drzwi** (wsiadka)
3. Winda nie pełna i są pasażerowie w kolejce → jedź po **najwcześniej zgłoszonego** pasażera
4. Winda nie pusta → jedź dostarczyć **pierwszego wsiadłego** pasażera (kolejność FIFO)
5. Nic do roboty → idle

**Stan globalny:** kolejka `_queue` + zbiór `_seen` (deduplikacja). Kolejka jest czyszczona z pasażerów już zabranych lub obsłużonych.

**Zaleta:** sprawiedliwość — nikt nie jest głodzony.
**Wada:** nieefektywny — winda może jechać na piętro 10 po jedną osobę, ignorując tłum na 5.

### 2. Largest Group First

**Plik:** [`sim/algorithms/batch.py`](sim/algorithms/batch.py)

Zawsze jedź na piętro z **największą liczbą czekających** pasażerów. Maksymalizacja zapełnienia windy.

**Logika decyzyjna** (per winda):

1. Ktoś wysiada na tym piętrze → **otwórz drzwi**
2. Ludzie czekają na tym piętrze i jest miejsce → **otwórz drzwi**
3. Winda nie pełna → jedź na **najludniejsze piętro** (helper `_busiest_floor()`, pomija piętra claimed przez inne windy)
4. Winda pełna → jedź do **najpopularniejszego celu** wśród pasażerów w windzie (`Counter.most_common`)
5. Idle

**Stan:** bezstanowy — decyzja oparta wyłącznie na bieżącym stanie budynku.

**Zaleta:** wysoka efektywność batchowania — dużo osób na raz.
**Wada:** może głodzić mniejsze grupy i samotnych pasażerów na mało popularnych piętrach.

### 3. SCAN (Sweep)

**Plik:** [`sim/algorithms/sweep.py`](sim/algorithms/sweep.py)

Algorytm zamiatania — winda jedzie w jednym kierunku (UP), obsługując po drodze wszystko co pasuje, potem się odwraca (DOWN). Wzorowany na algorytmie schedulera dysku (SCAN).

**Logika decyzyjna**:

1. Ustal bieżący kierunek zamiatania (inicjalnie UP)
2. Sprawdź czy otworzyć drzwi: ktoś wysiada LUB (jest miejsce i czekają pasażerowie jadący **w kierunku zamiatania**)
3. Znajdź następny cel w kierunku zamiatania (`_next_target()`):
   - Zbierz cele pasażerów wewnątrz + piętra startowe pasażerów **których kierunek zgadza się z kierunkiem zamiatania**
   - Dla UP: najbliższe piętro powyżej; dla DOWN: najbliższe piętro poniżej
4. Brak celów w bieżącym kierunku → **odwróć kierunek** i powtórz
5. Idle

**Stan:** słownik `_directions` — per-windowy kierunek zamiatania.

**Kluczowy detail:** algorytm sprawdza `p.direction == sweep_dir` — nie zatrzymuje się na piętrze gdzie ludzie czekają w przeciwnym kierunku. Bez tego winda wpadałaby w pętlę.

**Zaleta:** przewidywalny, równomierny, brak głodzenia.
**Wada:** nie optymalizuje ani dystansu, ani batchowania.

### 4. SSTF — Shortest Seek Time First

**Plik:** [`sim/algorithms/sstf.py`](sim/algorithms/sstf.py)

Zawsze jedź na **najbliższe piętro** z czekającymi pasażerami. Zachłanna minimalizacja dystansu.

**Logika decyzyjna** (per winda):

1. Ktoś wysiada → **otwórz drzwi**
2. Ludzie czekają na tym piętrze → **otwórz drzwi**
3. Winda nie pełna → jedź na **najbliższe piętro z czekającymi** (helper `_nearest_waiting()`, pomija claimed)
4. Winda pełna → jedź do **najbliższego celu** wśród pasażerów w windzie
5. Idle

**Stan:** bezstanowy.

**Zaleta:** minimalizacja lokalnych przejazdów.
**Wada:** głodzenie (starvation) — jeśli ciągle pojawiają się ludzie blisko, winda nigdy nie dojedzie do odległego pasażera.

## Wspólne mechanizmy

### `_stop_on_way()` — zatrzymanie po drodze

Obecny w FCFS, Largest Group i SSTF. Gdy winda jedzie z A do B, sprawdza każde piętro po drodze:
- Ktoś wewnątrz chce tam wysiąść → zatrzymaj się wcześniej
- Ludzie czekają i jest miejsce → zatrzymaj się wcześniej

Dzięki temu winda nie przejeżdża obok pięter na których mogłaby coś pożytecznego zrobić.

### Claimed floors — rezerwacja pięter

FCFS, SSTF i Largest Group śledzą zbiór `claimed` — piętra na które już jedzie inna winda. Zapobiega to sytuacji, gdy dwie windy jadą w to samo miejsce. SCAN tego nie potrzebuje — mechanizm zamiatania kierunkowego rozwiązuje to naturalnie.

### Kolejność wsiadania

Logika wsiadania jest w silniku symulacji ([`sim/simulation.py:287-317`](sim/simulation.py)):
- Winda pusta → pasażerowie wsiadają posortowani po celu (najbliższy cel pierwszy)
- Winda zajęta → pasażerowie wsiadają posortowani po bliskości celu do średniego celu obecnych pasażerów

## Strategie kooperacji

**Plik:** [`sim/cooperation.py`](sim/cooperation.py)

Opcjonalne strategie podziału pracy przy >1 windzie. Gdy aktywne, każda winda dostaje **własną kopię algorytmu** i widzi **przefiltrowany budynek** — nie wie o pasażerach z cudzej strefy. Pozostałe windy wyglądają na zajęte (decoy z dummy passengers).

### ZoneSplit

Podział pionowy — winda 0 obsługuje dolne piętra (poniżej `split_floor`), winda 1 górne. Kryterium przydziału: `max(origin, destination)`. Domyślna granica: połowa budynku.

### TaskSplit

Podział po grupach piętro-startowe:
1. Grupuje pasażerów po piętrze startowym
2. Sortuje grupy malejąco po rozmiarze
3. Małe grupy (≤ fair share) → przydziela do mniej obciążonej windy
4. Duże grupy (> fair share) → dzieli równo między windy

Zapewnia balansowanie obciążenia bez rozbijania naturalnych batchy.

## Fizyka ruchu

**Plik:** [`sim/config.py`](sim/config.py)

Winda przechodzi przez fazowy automat stanów ([`sim/simulation.py:201-258`](sim/simulation.py)):

```
IDLE → ACCELERATING → CRUISING → DECELERATING → DOORS_OPENING → BOARDING → DOORS_CLOSING → IDLE
```

Przy ruchu o 1 piętro faza CRUISING jest pomijana (ACCELERATING → DECELERATING).

| Parametr | Domyślna wartość | Opis |
|---|---|---|
| `ACCEL_TICKS` | 3 | Tiki na przyspieszanie (per piętro) |
| `CRUISE_TICKS` | 2 | Tiki na jazdę ze stałą prędkością (per piętro) |
| `DECEL_TICKS` | 2 | Tiki na hamowanie (per piętro) |
| `DOORS_OPEN_TICKS` | 2 | Tiki na otwarcie drzwi |
| `DOORS_CLOSE_TICKS` | 2 | Tiki na zamknięcie drzwi |
| `BOARD_BASE_TICKS` | 1 | Stały narzut boardingu |
| `BOARD_PER_PAX_TICKS` | 0.5 | Dodatkowy czas per pasażer |
| `ELEVATOR_CAPACITY` | 8 | Pojemność windy |

Wszystkie wartości konfigurowalne przez zmienne środowiskowe z prefiksem `ELEVSIM_`.

### Energia

| Parametr | Wartość | Opis |
|---|---|---|
| `ENERGY_UP_CRUISE` | 1.5 | Energia jazdy w górę (per piętro) |
| `ENERGY_DOWN_CRUISE` | 0.5 | Energia jazdy w dół (przeciwwaga + grawitacja) |
| `ENERGY_ACCEL_MULT` | 2.5× | Mnożnik dla fazy przyspieszania |
| `ENERGY_DECEL_MULT` | 1.5× | Mnożnik dla fazy hamowania |

## Porównanie algorytmów

| Algorytm | Optymalizuje | Słabość | Stan |
|---|---|---|---|
| FCFS | Sprawiedliwość (kolejność) | Duże przebiegi | Kolejka FIFO |
| Largest Group | Zapełnienie windy | Głodzenie małych grup | Bezstanowy |
| SCAN | Równomierny sweep | Nie optymalizuje dystansu | Kierunki wind |
| SSTF | Minimalny dystans | Głodzenie dalszych pięter | Bezstanowy |
