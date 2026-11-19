-- ============================================================
-- PropCRM — Autor visible de comentarios y actividad del comprador
-- Ejecutar en el SQL Editor de Supabase (staging). No aplicar en producción
-- en este paso.
--
-- Idempotente: se puede lanzar más de una vez.
--
-- Qué añade:
--   * notas.author_role — rol de quien escribió (admin | vendedor | cliente).
--     Las filas viejas se rellenan si author_id (o el nombre) coincide con
--     un usuario de auth. Si no hay dato, la columna queda null y la app
--     muestra la fecha y «Gestor».
--   * asset_informacion_adicional.updated_by_name / updated_by_role.
--   * ofertas.comentarios_author / comentarios_author_role.
--     No se inventa el autor de ofertas antiguas.
--   * public.comprador_comentarios — historial de llamadas y acciones.
--     Admin: todo. Agente: solo el comprador que tiene en vendedor_compradores.
--     El comprador no tiene política.
--
-- No toca DELETE de notas ni el alcance activo/privada.
-- ============================================================

alter table public.notas
  add column if not exists author_role text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'notas_author_role_chk'
  ) then
    alter table public.notas
      add constraint notas_author_role_chk
      check (author_role is null or author_role in ('admin', 'vendedor', 'cliente'));
  end if;
end $$;

update public.notas n
set author_role = u.raw_user_meta_data->>'role'
from auth.users u
where n.author_role is null
  and n.author_id = u.id
  and u.raw_user_meta_data->>'role' in ('admin', 'vendedor', 'cliente');

update public.notas n
set author_role = 'admin'
where n.author_role is null
  and exists (
    select 1
    from auth.users u
    where u.raw_user_meta_data->>'role' = 'admin'
      and nullif(btrim(u.raw_user_meta_data->>'nombre'), '') = n.author
  );

alter table public.asset_informacion_adicional
  add column if not exists updated_by_name text;

alter table public.asset_informacion_adicional
  add column if not exists updated_by_role text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'informacion_adicional_role_chk'
  ) then
    alter table public.asset_informacion_adicional
      add constraint informacion_adicional_role_chk
      check (updated_by_role is null or updated_by_role in ('admin', 'vendedor', 'cliente'));
  end if;
end $$;

update public.asset_informacion_adicional a
set
  updated_by_role = u.raw_user_meta_data->>'role',
  updated_by_name = coalesce(
    a.updated_by_name,
    nullif(btrim(u.raw_user_meta_data->>'nombre'), '')
  )
from auth.users u
where a.updated_by = u.id
  and a.updated_by_role is null
  and u.raw_user_meta_data->>'role' in ('admin', 'vendedor', 'cliente');

alter table public.ofertas
  add column if not exists comentarios_author text;

alter table public.ofertas
  add column if not exists comentarios_author_role text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ofertas_comentarios_role_chk'
  ) then
    alter table public.ofertas
      add constraint ofertas_comentarios_role_chk
      check (
        comentarios_author_role is null
        or comentarios_author_role in ('admin', 'vendedor', 'cliente')
      );
  end if;
end $$;

create table if not exists public.comprador_comentarios (
  id uuid primary key default gen_random_uuid(),
  comprador_id text not null references public.compradores(id) on delete cascade,
  author text,
  author_id uuid references auth.users(id) on delete set null,
  author_role text,
  text text not null,
  created_at timestamptz not null default now(),
  constraint comprador_comentarios_role_chk check (
    author_role is null or author_role in ('admin', 'vendedor', 'cliente')
  )
);

create index if not exists idx_comprador_comentarios_comprador
  on public.comprador_comentarios (comprador_id, created_at desc);

alter table public.comprador_comentarios enable row level security;

drop policy if exists "comprador_comentarios_admin" on public.comprador_comentarios;
drop policy if exists "comprador_comentarios_agente_select" on public.comprador_comentarios;
drop policy if exists "comprador_comentarios_agente_insert" on public.comprador_comentarios;

create policy "comprador_comentarios_admin"
  on public.comprador_comentarios
  for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "comprador_comentarios_agente_select"
  on public.comprador_comentarios
  for select
  using (
    public.is_vendedor()
    and exists (
      select 1
      from public.vendedor_compradores vc
      join public.vendedores v on v.id = vc.vendedor_id
      where vc.comprador_id = comprador_comentarios.comprador_id
        and v.user_id = auth.uid()
    )
  );

create policy "comprador_comentarios_agente_insert"
  on public.comprador_comentarios
  for insert
  with check (
    public.is_vendedor()
    and author_id = auth.uid()
    and exists (
      select 1
      from public.vendedor_compradores vc
      join public.vendedores v on v.id = vc.vendedor_id
      where vc.comprador_id = comprador_comentarios.comprador_id
        and v.user_id = auth.uid()
    )
  );

comment on table public.comprador_comentarios is
  'Llamadas y acciones sobre un comprador. Admin ve y escribe todo. El agente solo el comprador que gestiona. El nombre de un admin se muestra como Gestor en la app.';

comment on policy "comprador_comentarios_agente_select" on public.comprador_comentarios is
  'El agente solo lee comentarios del comprador asignado en vendedor_compradores.';

comment on policy "comprador_comentarios_agente_insert" on public.comprador_comentarios is
  'El agente solo inserta en el comprador que gestiona, y el author_id es el suyo.';

notify pgrst, 'reload schema';
