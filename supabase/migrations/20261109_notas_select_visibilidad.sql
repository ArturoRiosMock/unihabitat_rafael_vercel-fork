-- ============================================================
-- PropCRM — Visibilidad de notas (SELECT)
-- Ejecutar en el SQL Editor de Supabase (staging y, cuando toque, prod).
--
-- Idempotente: se puede lanzar más de una vez.
--
-- Regla:
--   * Admin: ve todas las notas. Lo cubre la política ya existente
--     "notas_admin" (FOR ALL, public.is_admin()). No se toca.
--   * Agente (rol vendedor): SELECT solo de las notas de activo que él creó
--     (scope = 'activo', sin comprador, author_id = auth.uid()).
--     Las notas antiguas sin author_id siguen siendo suyas si el texto
--     author coincide con vendedores.nombre de su usuario.
--   * Comprador: SELECT solo de sus notas del portal (comprador_id propio,
--     scope = 'activo').
--   * Notas privadas (scope = 'privada'): solo admin. Ninguna política
--     SELECT de agente o comprador las incluye.
--   * DELETE no cambia. Se respeta "notas_admin_delete" (solo admin).
--     Este script no la borra ni la recrea, y no crea DELETE para
--     anon, vendedor, agente ni comprador.
--
-- También cierra "notas_anon_select" / "notas_anon_insert" si se aplicaron
-- las políticas de desarrollo: un SELECT using (true) anularía esta regla.
--
-- La server action fetchNotas aplica la misma regla con service role,
-- porque el admin/agente demo (cookie dev-auth) puede no tener auth.uid().
-- ============================================================

alter table public.notas
  add column if not exists author_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'notas_author_id_fkey'
  ) then
    alter table public.notas
      add constraint notas_author_id_fkey
      foreign key (author_id) references auth.users(id) on delete set null;
  end if;
end $$;

alter table public.notas
  add column if not exists scope text;

update public.notas
set scope = 'activo'
where scope is null or scope not in ('activo', 'privada');

alter table public.notas alter column scope set default 'activo';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'notas_scope_chk'
  ) then
    alter table public.notas
      add constraint notas_scope_chk check (scope in ('activo', 'privada'));
  end if;
end $$;

alter table public.notas alter column scope set not null;

create index if not exists idx_notas_author_id on public.notas (author_id);

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

-- Evita que el RLS de vendedores (solo admin) oculte el nombre del propio agente.
create or replace function public.nota_visible_para_agente(note_author_id uuid, note_author text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    (note_author_id is not null and note_author_id = auth.uid())
    or (
      note_author_id is null
      and note_author = (
        select v.nombre
        from public.vendedores v
        where v.user_id = auth.uid()
        order by v.id
        limit 1
      )
    );
$$;

drop policy if exists "notas_anon_select" on public.notas;
drop policy if exists "notas_anon_insert" on public.notas;
drop policy if exists "notas_vendedor_select" on public.notas;
drop policy if exists "notas_agente_select" on public.notas;
drop policy if exists "notas_own_select" on public.notas;
drop policy if exists "notas_client_select" on public.notas;
drop policy if exists "notas_comprador_select" on public.notas;
drop policy if exists "notas_agente_insert" on public.notas;
drop policy if exists "notas_comprador_insert" on public.notas;

create policy "notas_agente_select"
  on public.notas
  for select
  using (
    public.is_vendedor()
    and scope = 'activo'
    and comprador_id is null
    and public.nota_visible_para_agente(author_id, author)
  );

create policy "notas_comprador_select"
  on public.notas
  for select
  using (
    comprador_id is not null
    and scope = 'activo'
    and comprador_id in (
      select c.id from public.compradores c where c.user_id = auth.uid()
    )
  );

comment on policy "notas_agente_select" on public.notas is
  'El agente solo lee las notas de activo que creó. No lee privadas, ni las de otros agentes, ni las de compradores.';

comment on policy "notas_comprador_select" on public.notas is
  'El comprador solo lee sus notas del portal (Mis notas).';

notify pgrst, 'reload schema';
