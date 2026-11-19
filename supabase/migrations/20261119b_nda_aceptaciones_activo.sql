-- ============================================================
-- PropCRM — Aceptación del NDA por activo (documentación)
-- Ejecutar en el SQL Editor de Supabase (staging). No aplicar en producción
-- en este paso.
--
-- Idempotente: se puede lanzar más de una vez.
--
-- Qué añade:
--   * public.asset_nda_aceptaciones — una fila por activo, usuario y versión
--     del texto. Guarda el nombre escrito, la fecha, la IP y el user-agent
--     si la app los tiene.
--   * RLS: el admin ve y escribe todo. El agente (y el comprador) solo ve
--     e inserta las filas cuyo user_id es auth.uid().
--   * No consulta public.vendedores. En staging la RLS de vendedores oculta
--     al agente su propia fila, así que un EXISTS sobre esa tabla dejaría
--     la política en falso. La app, además, usa service role después de
--     validar la sesión.
--
-- No toca documentos ni notas.
-- ============================================================

create table if not exists public.asset_nda_aceptaciones (
  id uuid primary key default gen_random_uuid(),
  asset_id text not null references public.assets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nombre_firma text not null,
  accepted_at timestamptz not null default now(),
  ip text,
  user_agent text,
  version text not null,
  constraint asset_nda_aceptaciones_nombre_chk check (length(btrim(nombre_firma)) > 0),
  constraint asset_nda_aceptaciones_version_chk check (length(btrim(version)) > 0)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'asset_nda_aceptaciones_asset_user_version_key'
  ) then
    alter table public.asset_nda_aceptaciones
      add constraint asset_nda_aceptaciones_asset_user_version_key
      unique (asset_id, user_id, version);
  end if;
end $$;

create index if not exists idx_asset_nda_aceptaciones_asset
  on public.asset_nda_aceptaciones (asset_id, accepted_at desc);

alter table public.asset_nda_aceptaciones enable row level security;

create or replace function public.is_cliente()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select raw_user_meta_data->>'role' = 'cliente'
     from auth.users
     where id = auth.uid()),
    false
  );
$$;

drop policy if exists "asset_nda_aceptaciones_admin" on public.asset_nda_aceptaciones;
drop policy if exists "asset_nda_aceptaciones_agente_select" on public.asset_nda_aceptaciones;
drop policy if exists "asset_nda_aceptaciones_agente_insert" on public.asset_nda_aceptaciones;
drop policy if exists "asset_nda_aceptaciones_cliente_select" on public.asset_nda_aceptaciones;
drop policy if exists "asset_nda_aceptaciones_cliente_insert" on public.asset_nda_aceptaciones;

create policy "asset_nda_aceptaciones_admin"
  on public.asset_nda_aceptaciones
  for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "asset_nda_aceptaciones_agente_select"
  on public.asset_nda_aceptaciones
  for select
  using (public.is_vendedor() and user_id = auth.uid());

create policy "asset_nda_aceptaciones_agente_insert"
  on public.asset_nda_aceptaciones
  for insert
  with check (public.is_vendedor() and user_id = auth.uid());

create policy "asset_nda_aceptaciones_cliente_select"
  on public.asset_nda_aceptaciones
  for select
  using (public.is_cliente() and user_id = auth.uid());

create policy "asset_nda_aceptaciones_cliente_insert"
  on public.asset_nda_aceptaciones
  for insert
  with check (public.is_cliente() and user_id = auth.uid());

comment on table public.asset_nda_aceptaciones is
  'Aceptación del NDA de un activo. Una fila por activo, usuario y versión del texto.';

comment on policy "asset_nda_aceptaciones_agente_select" on public.asset_nda_aceptaciones is
  'El agente solo lee sus aceptaciones (auth.uid()). No depende de la tabla vendedores.';
