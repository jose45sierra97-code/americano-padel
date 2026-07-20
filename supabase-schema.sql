-- =========================================================
-- AMERICANO DE PÁDEL · Schema para Supabase
-- Ejecutar completo en: Supabase Dashboard -> SQL Editor -> New query -> Run
-- =========================================================

create table if not exists torneos (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists jugadores (
  id uuid primary key default gen_random_uuid(),
  torneo_id uuid not null references torneos(id) on delete cascade,
  name text not null,
  orden int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists fechas (
  id uuid primary key default gen_random_uuid(),
  torneo_id uuid not null references torneos(id) on delete cascade,
  name text not null,
  player_ids jsonb not null default '[]',   -- array de 8 ids de jugadores
  results jsonb not null default '{}',      -- { "ronda-cancha": {a, b} }
  rotacion jsonb,                           -- null = rotación estándar
  closed boolean not null default false,
  bonuses jsonb not null default '{}',      -- { jugadorId: 5|3|2 }
  created_at timestamptz not null default now()
);

create index if not exists idx_jugadores_torneo on jugadores(torneo_id);
create index if not exists idx_fechas_torneo on fechas(torneo_id);

-- RLS: acceso público con la anon key (torneo entre amigos, sin login)
alter table torneos enable row level security;
alter table jugadores enable row level security;
alter table fechas enable row level security;

drop policy if exists "acceso publico torneos" on torneos;
create policy "acceso publico torneos" on torneos for all using (true) with check (true);

drop policy if exists "acceso publico jugadores" on jugadores;
create policy "acceso publico jugadores" on jugadores for all using (true) with check (true);

drop policy if exists "acceso publico fechas" on fechas;
create policy "acceso publico fechas" on fechas for all using (true) with check (true);

-- Realtime: para que los cambios de una persona aparezcan solos en la pantalla de la otra
alter publication supabase_realtime add table torneos;
alter publication supabase_realtime add table jugadores;
alter publication supabase_realtime add table fechas;
