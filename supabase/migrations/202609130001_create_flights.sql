-- FlightLog owns a separate Supabase project. Run this only there.
create extension if not exists pgcrypto;

create table if not exists public.flights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  flight_number text check (flight_number is null or flight_number ~ '^[A-Z0-9]{2,12}$'),
  flight_date date not null,
  status text not null default 'planned' check (status in ('planned', 'flown')),
  airline_name text,
  departure_airport_code text check (departure_airport_code is null or departure_airport_code ~ '^[A-Z]{3,4}$'),
  departure_airport_name text,
  arrival_airport_code text check (arrival_airport_code is null or arrival_airport_code ~ '^[A-Z]{3,4}$'),
  arrival_airport_name text,
  departure_time_local time without time zone,
  arrival_date date check (arrival_date is null or arrival_date >= flight_date),
  arrival_time_local time without time zone,
  duration_minutes integer check (duration_minutes between 0 and 10080),
  aircraft_model text,
  aircraft_registration text,
  seat text,
  cabin_class text,
  notes text,
  -- These optional fields let later importers preserve precise times and provenance.
  departure_time_zone text,
  arrival_time_zone text,
  scheduled_departure_at timestamptz,
  actual_departure_at timestamptz,
  scheduled_arrival_at timestamptz,
  actual_arrival_at timestamptz,
  distance_km numeric(9, 2) check (distance_km >= 0),
  field_sources jsonb not null default '{}'::jsonb check (jsonb_typeof(field_sources) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists flights_user_date_idx on public.flights (user_id, flight_date desc);
create index if not exists flights_user_airline_idx on public.flights (user_id, airline_name) where airline_name is not null;
create index if not exists flights_user_route_idx on public.flights (user_id, departure_airport_code, arrival_airport_code);

create or replace function public.set_flight_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists flights_updated_at on public.flights;
create trigger flights_updated_at before update on public.flights
for each row execute function public.set_flight_updated_at();

alter table public.flights enable row level security;
revoke all on public.flights from anon;
grant select, insert, update, delete on public.flights to authenticated;

drop policy if exists "Flight owners can read" on public.flights;
create policy "Flight owners can read" on public.flights
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Flight owners can add" on public.flights;
create policy "Flight owners can add" on public.flights
for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Flight owners can edit" on public.flights;
create policy "Flight owners can edit" on public.flights
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Flight owners can remove" on public.flights;
create policy "Flight owners can remove" on public.flights
for delete to authenticated using ((select auth.uid()) = user_id);
