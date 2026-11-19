-- ============================================================
-- PropCRM — Gestión del agente sobre compradores (90 días)
-- Ejecutar en el SQL Editor de Supabase (staging). No aplicar en
-- producción en este paso.
--
-- Idempotente: se puede lanzar más de una vez.
--
-- Qué añade:
--   * compradores.ultima_gestion_agente_at — última gestión del agente
--     asignado (alta, edición de la ficha, llamada/acción u oferta).
--     Las filas que ya existen se inicializan a now() para no
--     reasignarlas de golpe. Una segunda ejecución no pisa fechas
--     ya guardadas.
--   * compradores.reasignado_inactividad_at — auditoría de cuándo
--     pasó al gestor por inactividad.
--   * public.reasignar_compradores_inactivos(p_now) — quita la
--     asignación, deja el comprador en el gestor y escribe el
--     comentario «Reasignado a Gestor por 90 días sin gestión».
--     Solo service_role. La app la llama desde el cron y al listar.
--
-- No borra compradores ni toca filas sin agente asignado.
-- ============================================================

alter table public.compradores
  add column if not exists ultima_gestion_agente_at timestamptz;

alter table public.compradores
  add column if not exists reasignado_inactividad_at timestamptz;

update public.compradores
set ultima_gestion_agente_at = now()
where ultima_gestion_agente_at is null;

alter table public.compradores
  alter column ultima_gestion_agente_at set default now();

alter table public.compradores
  alter column ultima_gestion_agente_at set not null;

create index if not exists idx_compradores_ultima_gestion_agente
  on public.compradores (ultima_gestion_agente_at);

comment on column public.compradores.ultima_gestion_agente_at is
  'Última gestión del agente asignado. En la migración las filas existentes quedan en now() para no reasignarlas de golpe.';

comment on column public.compradores.reasignado_inactividad_at is
  'Momento en que el comprador pasó al gestor por 90 días sin gestión del agente.';

create or replace function public.reasignar_compradores_inactivos(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  n integer := 0;
begin
  for rec in
    select c.id
    from public.compradores c
    where c.ultima_gestion_agente_at <= p_now - interval '90 days'
      and exists (
        select 1
        from public.vendedor_compradores vc
        where vc.comprador_id = c.id
      )
    for update of c
  loop
    insert into public.comprador_comentarios (comprador_id, author, author_role, text)
    values (
      rec.id,
      'Gestor',
      'admin',
      'Reasignado a Gestor por 90 días sin gestión'
    );

    update public.compradores
    set
      agente = 'Admin',
      reasignado_inactividad_at = p_now,
      updated_at = p_now
    where id = rec.id;

    delete from public.vendedor_compradores
    where comprador_id = rec.id;

    n := n + 1;
  end loop;

  return n;
end;
$$;

do $$
begin
  execute 'revoke all on function public.reasignar_compradores_inactivos(timestamptz) from public';
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.reasignar_compradores_inactivos(timestamptz) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.reasignar_compradores_inactivos(timestamptz) from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.reasignar_compradores_inactivos(timestamptz) to service_role';
  end if;
end $$;

comment on function public.reasignar_compradores_inactivos(timestamptz) is
  'Pasa al gestor los compradores cuyo agente no gestiona desde hace 90 días. Solo service_role.';

notify pgrst, 'reload schema';
