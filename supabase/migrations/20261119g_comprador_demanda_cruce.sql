-- ============================================================
-- PropCRM — Demanda del comprador y cruce de oportunidades
-- Ejecutar en el SQL Editor de Supabase (staging). No aplicar en
-- producción en este paso.
--
-- Idempotente: se puede lanzar más de una vez.
--
-- Qué añade:
--   * comprador_demanda — categorías (tipología / categoría de la
--     carga), provincias, poblaciones y rango de precio. Una fila
--     por comprador. No reutiliza compradores.provincia/poblacion
--     (son la dirección de firma) ni el texto libre intereses.
--   * comprador_oportunidades — cada activo ya ofrecido. Único por
--     comprador + activo para no repetir el envío. Distinta de la
--     tabla oportunidades (scoring antiguo).
--   * cruce_demanda_ejecuciones — último resultado del lote
--     (cron o lanzamiento manual del gestor).
--
-- RLS:
--   * admin (is_admin): todo.
--   * agente: solo los compradores de vendedor_compradores
--     unidos a vendedores.user_id = auth.uid().
--   * comprador: solo su fila (compradores.user_id = auth.uid()).
--   * el historial del lote solo lo lee el admin.
-- La app escribe con service role después de filtrar en servidor.
-- ============================================================

create table if not exists public.comprador_demanda (
  comprador_id text primary key references public.compradores(id) on delete cascade,
  categorias text[] not null default '{}',
  provincias text[] not null default '{}',
  poblaciones text[] not null default '{}',
  precio_min numeric,
  precio_max numeric,
  updated_at timestamptz not null default now()
);

alter table public.comprador_demanda
  add column if not exists categorias text[] not null default '{}';
alter table public.comprador_demanda
  add column if not exists provincias text[] not null default '{}';
alter table public.comprador_demanda
  add column if not exists poblaciones text[] not null default '{}';
alter table public.comprador_demanda
  add column if not exists precio_min numeric;
alter table public.comprador_demanda
  add column if not exists precio_max numeric;
alter table public.comprador_demanda
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'comprador_demanda_precio_check'
  ) then
    alter table public.comprador_demanda
      add constraint comprador_demanda_precio_check
      check (
        (precio_min is null or precio_min >= 0)
        and (precio_max is null or precio_max >= 0)
        and (precio_min is null or precio_max is null or precio_min <= precio_max)
      );
  end if;
end $$;

create table if not exists public.comprador_oportunidades (
  id uuid primary key default gen_random_uuid(),
  comprador_id text not null references public.compradores(id) on delete cascade,
  asset_id text not null references public.assets(id) on delete cascade,
  nivel text not null,
  canal text not null default 'cron',
  estado text not null default 'ofrecida',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.comprador_oportunidades
  add column if not exists nivel text;
alter table public.comprador_oportunidades
  add column if not exists canal text not null default 'cron';
alter table public.comprador_oportunidades
  add column if not exists estado text not null default 'ofrecida';
alter table public.comprador_oportunidades
  add column if not exists created_at timestamptz not null default now();
alter table public.comprador_oportunidades
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists comprador_oportunidades_comprador_asset_uidx
  on public.comprador_oportunidades (comprador_id, asset_id);

create index if not exists idx_comprador_oportunidades_comprador
  on public.comprador_oportunidades (comprador_id, created_at desc);

create index if not exists idx_comprador_oportunidades_asset
  on public.comprador_oportunidades (asset_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'comprador_oportunidades_nivel_check'
  ) then
    alter table public.comprador_oportunidades
      add constraint comprador_oportunidades_nivel_check
      check (nivel in ('poblacion', 'provincia', 'sin_categoria', 'solo_categoria'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'comprador_oportunidades_canal_check'
  ) then
    alter table public.comprador_oportunidades
      add constraint comprador_oportunidades_canal_check
      check (canal in ('cron', 'manual'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'comprador_oportunidades_estado_check'
  ) then
    alter table public.comprador_oportunidades
      add constraint comprador_oportunidades_estado_check
      check (estado in ('ofrecida', 'vista', 'interesado', 'descartada'));
  end if;
end $$;

create table if not exists public.cruce_demanda_ejecuciones (
  id uuid primary key default gen_random_uuid(),
  origen text not null,
  compradores integer not null default 0,
  con_demanda integer not null default 0,
  oportunidades integer not null default 0,
  por_nivel jsonb not null default '{}'::jsonb,
  emails_enviados integer not null default 0,
  emails_omitidos integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.cruce_demanda_ejecuciones
  add column if not exists origen text;
alter table public.cruce_demanda_ejecuciones
  add column if not exists compradores integer not null default 0;
alter table public.cruce_demanda_ejecuciones
  add column if not exists con_demanda integer not null default 0;
alter table public.cruce_demanda_ejecuciones
  add column if not exists oportunidades integer not null default 0;
alter table public.cruce_demanda_ejecuciones
  add column if not exists por_nivel jsonb not null default '{}'::jsonb;
alter table public.cruce_demanda_ejecuciones
  add column if not exists emails_enviados integer not null default 0;
alter table public.cruce_demanda_ejecuciones
  add column if not exists emails_omitidos integer not null default 0;
alter table public.cruce_demanda_ejecuciones
  add column if not exists created_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cruce_demanda_ejecuciones_origen_check'
  ) then
    alter table public.cruce_demanda_ejecuciones
      add constraint cruce_demanda_ejecuciones_origen_check
      check (origen in ('cron', 'manual'));
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'handle_updated_at'
  ) then
    execute 'drop trigger if exists comprador_demanda_updated_at on public.comprador_demanda';
    execute 'create trigger comprador_demanda_updated_at before update on public.comprador_demanda for each row execute function public.handle_updated_at()';
    execute 'drop trigger if exists comprador_oportunidades_updated_at on public.comprador_oportunidades';
    execute 'create trigger comprador_oportunidades_updated_at before update on public.comprador_oportunidades for each row execute function public.handle_updated_at()';
  end if;
end $$;

alter table public.comprador_demanda enable row level security;
alter table public.comprador_oportunidades enable row level security;
alter table public.cruce_demanda_ejecuciones enable row level security;

drop policy if exists "comprador_demanda_admin" on public.comprador_demanda;
create policy "comprador_demanda_admin" on public.comprador_demanda
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "comprador_demanda_propia_select" on public.comprador_demanda;
create policy "comprador_demanda_propia_select" on public.comprador_demanda
  for select using (
    comprador_id in (select id from public.compradores where user_id = auth.uid())
  );

drop policy if exists "comprador_demanda_propia_insert" on public.comprador_demanda;
create policy "comprador_demanda_propia_insert" on public.comprador_demanda
  for insert with check (
    comprador_id in (select id from public.compradores where user_id = auth.uid())
  );

drop policy if exists "comprador_demanda_propia_update" on public.comprador_demanda;
create policy "comprador_demanda_propia_update" on public.comprador_demanda
  for update using (
    comprador_id in (select id from public.compradores where user_id = auth.uid())
  ) with check (
    comprador_id in (select id from public.compradores where user_id = auth.uid())
  );

drop policy if exists "comprador_demanda_agente_select" on public.comprador_demanda;
create policy "comprador_demanda_agente_select" on public.comprador_demanda
  for select using (
    public.is_vendedor()
    and exists (
      select 1
      from public.vendedor_compradores vc
      join public.vendedores v on v.id = vc.vendedor_id
      where vc.comprador_id = comprador_demanda.comprador_id
        and v.user_id = auth.uid()
    )
  );

drop policy if exists "comprador_demanda_agente_insert" on public.comprador_demanda;
create policy "comprador_demanda_agente_insert" on public.comprador_demanda
  for insert with check (
    public.is_vendedor()
    and exists (
      select 1
      from public.vendedor_compradores vc
      join public.vendedores v on v.id = vc.vendedor_id
      where vc.comprador_id = comprador_demanda.comprador_id
        and v.user_id = auth.uid()
    )
  );

drop policy if exists "comprador_demanda_agente_update" on public.comprador_demanda;
create policy "comprador_demanda_agente_update" on public.comprador_demanda
  for update using (
    public.is_vendedor()
    and exists (
      select 1
      from public.vendedor_compradores vc
      join public.vendedores v on v.id = vc.vendedor_id
      where vc.comprador_id = comprador_demanda.comprador_id
        and v.user_id = auth.uid()
    )
  ) with check (
    public.is_vendedor()
    and exists (
      select 1
      from public.vendedor_compradores vc
      join public.vendedores v on v.id = vc.vendedor_id
      where vc.comprador_id = comprador_demanda.comprador_id
        and v.user_id = auth.uid()
    )
  );

drop policy if exists "comprador_oportunidades_admin" on public.comprador_oportunidades;
create policy "comprador_oportunidades_admin" on public.comprador_oportunidades
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "comprador_oportunidades_propia_select" on public.comprador_oportunidades;
create policy "comprador_oportunidades_propia_select" on public.comprador_oportunidades
  for select using (
    comprador_id in (select id from public.compradores where user_id = auth.uid())
  );

drop policy if exists "comprador_oportunidades_propia_update" on public.comprador_oportunidades;
create policy "comprador_oportunidades_propia_update" on public.comprador_oportunidades
  for update using (
    comprador_id in (select id from public.compradores where user_id = auth.uid())
  ) with check (
    comprador_id in (select id from public.compradores where user_id = auth.uid())
    and estado in ('interesado', 'descartada')
  );

drop policy if exists "comprador_oportunidades_agente_select" on public.comprador_oportunidades;
create policy "comprador_oportunidades_agente_select" on public.comprador_oportunidades
  for select using (
    public.is_vendedor()
    and exists (
      select 1
      from public.vendedor_compradores vc
      join public.vendedores v on v.id = vc.vendedor_id
      where vc.comprador_id = comprador_oportunidades.comprador_id
        and v.user_id = auth.uid()
    )
  );

drop policy if exists "comprador_oportunidades_agente_insert" on public.comprador_oportunidades;
create policy "comprador_oportunidades_agente_insert" on public.comprador_oportunidades
  for insert with check (
    public.is_vendedor()
    and exists (
      select 1
      from public.vendedor_compradores vc
      join public.vendedores v on v.id = vc.vendedor_id
      where vc.comprador_id = comprador_oportunidades.comprador_id
        and v.user_id = auth.uid()
    )
  );

drop policy if exists "comprador_oportunidades_agente_update" on public.comprador_oportunidades;
create policy "comprador_oportunidades_agente_update" on public.comprador_oportunidades
  for update using (
    public.is_vendedor()
    and exists (
      select 1
      from public.vendedor_compradores vc
      join public.vendedores v on v.id = vc.vendedor_id
      where vc.comprador_id = comprador_oportunidades.comprador_id
        and v.user_id = auth.uid()
    )
  ) with check (
    public.is_vendedor()
    and exists (
      select 1
      from public.vendedor_compradores vc
      join public.vendedores v on v.id = vc.vendedor_id
      where vc.comprador_id = comprador_oportunidades.comprador_id
        and v.user_id = auth.uid()
    )
  );

drop policy if exists "cruce_demanda_ejecuciones_admin" on public.cruce_demanda_ejecuciones;
create policy "cruce_demanda_ejecuciones_admin" on public.cruce_demanda_ejecuciones
  for all using (public.is_admin()) with check (public.is_admin());

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on table public.comprador_demanda from anon';
    execute 'revoke all on table public.comprador_oportunidades from anon';
    execute 'revoke all on table public.cruce_demanda_ejecuciones from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant select, insert, update, delete on table public.comprador_demanda to authenticated';
    execute 'revoke update on table public.comprador_oportunidades from authenticated';
    execute 'grant select, insert on table public.comprador_oportunidades to authenticated';
    execute 'grant update (estado) on table public.comprador_oportunidades to authenticated';
    execute 'grant select on table public.cruce_demanda_ejecuciones to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update, delete on table public.comprador_demanda to service_role';
    execute 'grant select, insert, update, delete on table public.comprador_oportunidades to service_role';
    execute 'grant select, insert, update, delete on table public.cruce_demanda_ejecuciones to service_role';
  end if;
end $$;

comment on table public.comprador_demanda is
  'Demanda estructurada del comprador: categorías, provincias, poblaciones y rango de precio.';
comment on table public.comprador_oportunidades is
  'Activos ya ofrecidos a un comprador. Único por comprador y activo.';
comment on table public.cruce_demanda_ejecuciones is
  'Resumen del último cruce de demanda (cron o manual). Solo admin.';

notify pgrst, 'reload schema';
