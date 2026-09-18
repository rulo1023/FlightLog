-- Permite guardar viajes introducidos completamente a mano cuando el
-- usuario no conoce el número de vuelo.
alter table public.flights
  alter column flight_number drop not null;

alter table public.flights
  drop constraint if exists flights_flight_number_check;

alter table public.flights
  add constraint flights_flight_number_check
  check (
    flight_number is null or
    flight_number ~ '^[A-Z0-9]{2,12}$'
  );
