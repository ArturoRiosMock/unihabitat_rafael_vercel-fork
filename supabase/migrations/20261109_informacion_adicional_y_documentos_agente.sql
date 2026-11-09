-- ============================================================
-- PropCRM — Información adicional del activo + lectura de documentos
-- Ejecutar en el SQL Editor de Supabase (staging y, cuando toque, prod).
--
-- Idempotente: se puede lanzar más de una vez.
-- No toca las políticas de notas (ni SELECT ni DELETE).
-- No crea políticas para anon. No abre documentos de activos no asignados.
--
-- Información adicional (cuadro entre Descripción y Notas del activo):
--   * Una fila por activo.
--   * Admin: SELECT/INSERT/UPDATE/DELETE (public.is_admin()).
--   * Agente (rol vendedor): solo SELECT, de cualquier activo.
--   * Comprador y anon: sin política. No leen el cuadro.
--   * La server action usa service role y repite la regla, porque el
--     admin/agente demo (cookie dev-auth) puede no tener auth.uid().
--
-- Documentos:
--   * Se AÑADE SELECT para el agente sobre las filas cuyo asset_id está
--     en vendedor_assets del usuario. No se borran documentos_admin ni
--     documentos_client_read.
--   * No hay INSERT/UPDATE/DELETE nuevo para el agente en la tabla.
--     La escritura de la app sigue pasando por la server action, que
--     solo deja escribir al admin y al agente asignado a ese activo.
-- ============================================================

alter table public.vendedores
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create table if not exists public.asset_informacion_adicional (
  asset_id text primary key references public.assets(id) on delete cascade,
  texto text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.asset_informacion_adicional enable row level security;

create or replace function public.is_vendedor()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select raw_user_meta_data->>'role' = 'vendedor'
     from auth.users
     where id = auth.uid()),
    false
  );
$$;

drop policy if exists "informacion_adicional_admin" on public.asset_informacion_adicional;
drop policy if exists "informacion_adicional_agente_select" on public.asset_informacion_adicional;
drop policy if exists "informacion_adicional_anon_select" on public.asset_informacion_adicional;
drop policy if exists "informacion_adicional_anon_insert" on public.asset_informacion_adicional;
drop policy if exists "informacion_adicional_anon_update" on public.asset_informacion_adicional;
drop policy if exists "informacion_adicional_anon_delete" on public.asset_informacion_adicional;
drop policy if exists "informacion_adicional_vendedor_write" on public.asset_informacion_adicional;
drop policy if exists "informacion_adicional_agente_insert" on public.asset_informacion_adicional;
drop policy if exists "informacion_adicional_agente_update" on public.asset_informacion_adicional;
drop policy if exists "informacion_adicional_agente_delete" on public.asset_informacion_adicional;

create policy "informacion_adicional_admin"
  on public.asset_informacion_adicional
  for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "informacion_adicional_agente_select"
  on public.asset_informacion_adicional
  for select
  using (public.is_vendedor());

comment on policy "informacion_adicional_admin" on public.asset_informacion_adicional is
  'Solo el admin escribe la información adicional del activo.';

comment on policy "informacion_adicional_agente_select" on public.asset_informacion_adicional is
  'Cualquier agente puede leer la información adicional. No puede escribirla.';

drop policy if exists "documentos_agente_select" on public.documentos;

create policy "documentos_agente_select"
  on public.documentos
  for select
  using (
    public.is_vendedor()
    and asset_id is not null
    and exists (
      select 1
      from public.vendedores v
      join public.vendedor_assets va on va.vendedor_id = v.id
      where v.user_id = auth.uid()
        and va.asset_id = documentos.asset_id
    )
  );

comment on policy "documentos_agente_select" on public.documentos is
  'El agente solo lee documentos de activos que tiene asignados. No lee los de otros activos ni los de compradores.';

notify pgrst, 'reload schema';
