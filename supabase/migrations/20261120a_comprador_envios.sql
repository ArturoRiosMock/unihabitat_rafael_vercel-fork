-- ============================================================
-- PropCRM — Historial de activos enviados a un comprador
-- Ejecutar en el SQL Editor de Supabase (staging). No aplicar en
-- producción en este paso.
--
-- Idempotente: se puede lanzar más de una vez.
--
-- Qué añade:
--   * comprador_envios — cada vez que un activo se envía a un
--     comprador (email, whatsapp, manual o cruce). Sirve para el
--     aviso de los últimos 14 días y para la ficha del comprador.
--
-- RLS:
--   * admin (is_admin): todo.
--   * agente: solo compradores de vendedor_compradores unidos a
--     vendedores.user_id = auth.uid() (select e insert).
--   * comprador: solo sus filas (select).
-- La app escribe con service role después de filtrar en servidor.
-- ============================================================

create table if not exists public.comprador_envios (
  id uuid primary key default gen_random_uuid(),
  comprador_id text not null references public.compradores(id) on delete cascade,
  asset_id text not null references public.assets(id) on delete cascade,
  canal text not null,
  enviado_por text,
  enviado_at timestamptz not null default now(),
  nota text
);

alter table public.comprador_envios
  add column if not exists comprador_id text;
alter table public.comprador_envios
  add column if not exists asset_id text;
alter table public.comprador_envios
  add column if not exists canal text;
alter table public.comprador_envios
  add column if not exists enviado_por text;
alter table public.comprador_envios
  add column if not exists enviado_at timestamptz not null default now();
alter table public.comprador_envios
  add column if not exists nota text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'comprador_envios_canal_check'
  ) then
    alter table public.comprador_envios
      add constraint comprador_envios_canal_check
      check (canal in ('email', 'whatsapp', 'manual', 'cruce'));
  end if;
end $$;

create index if not exists idx_comprador_envios_comprador
  on public.comprador_envios (comprador_id, enviado_at desc);

create index if not exists idx_comprador_envios_par
  on public.comprador_envios (comprador_id, asset_id, enviado_at desc);

alter table public.comprador_envios enable row level security;

drop policy if exists "comprador_envios_admin" on public.comprador_envios;
create policy "comprador_envios_admin" on public.comprador_envios
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "comprador_envios_propia_select" on public.comprador_envios;
create policy "comprador_envios_propia_select" on public.comprador_envios
  for select using (
    comprador_id in (select id from public.compradores where user_id = auth.uid())
  );

drop policy if exists "comprador_envios_agente_select" on public.comprador_envios;
create policy "comprador_envios_agente_select" on public.comprador_envios
  for select using (
    public.is_vendedor()
    and exists (
      select 1
      from public.vendedor_compradores vc
      join public.vendedores v on v.id = vc.vendedor_id
      where vc.comprador_id = comprador_envios.comprador_id
        and v.user_id = auth.uid()
    )
  );

drop policy if exists "comprador_envios_agente_insert" on public.comprador_envios;
create policy "comprador_envios_agente_insert" on public.comprador_envios
  for insert with check (
    public.is_vendedor()
    and exists (
      select 1
      from public.vendedor_compradores vc
      join public.vendedores v on v.id = vc.vendedor_id
      where vc.comprador_id = comprador_envios.comprador_id
        and v.user_id = auth.uid()
    )
  );

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on table public.comprador_envios from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant select, insert on table public.comprador_envios to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update, delete on table public.comprador_envios to service_role';
  end if;
end $$;

comment on table public.comprador_envios is
  'Activos enviados a un comprador: canal, autor y fecha. La ventana de 14 días evita repetir el aviso.';

notify pgrst, 'reload schema';
