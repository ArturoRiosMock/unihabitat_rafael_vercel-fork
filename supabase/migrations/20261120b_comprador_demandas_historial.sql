-- ============================================================
-- PropCRM — Varias demandas por comprador
-- Ejecutar en el SQL Editor de Supabase (staging). No aplicar en
-- producción en este paso.
--
-- Idempotente: se puede lanzar más de una vez.
--
-- Qué hace:
--   * La fila que ya existía en comprador_demanda (una por comprador)
--     se conserva como demanda activa. No se borra ningún filtro.
--   * Pasa a haber varias filas por comprador, con fecha, autor y
--     estado activa/archivada. El cruce usa solo las activas.
--
-- RLS (se recrean las políticas; el agente sigue viendo solo sus
-- compradores asignados y el comprador solo lo suyo, ahora también
-- puede archivar y borrar):
--   * admin: todo.
--   * agente: select, insert, update y delete de sus asignados.
--   * comprador: select, insert, update y delete de su fila.
-- ============================================================

alter table public.comprador_demanda add column if not exists id uuid;
update public.comprador_demanda set id = gen_random_uuid() where id is null;
alter table public.comprador_demanda alter column id set default gen_random_uuid();
alter table public.comprador_demanda alter column id set not null;

alter table public.comprador_demanda add column if not exists estado text;
update public.comprador_demanda
set estado = 'activa'
where estado is null or btrim(estado) = '';
alter table public.comprador_demanda alter column estado set default 'activa';
alter table public.comprador_demanda alter column estado set not null;

alter table public.comprador_demanda add column if not exists created_at timestamptz;
update public.comprador_demanda
set created_at = coalesce(updated_at, now())
where created_at is null;
alter table public.comprador_demanda alter column created_at set default now();
alter table public.comprador_demanda alter column created_at set not null;

alter table public.comprador_demanda add column if not exists autor text;
alter table public.comprador_demanda add column if not exists autor_rol text;

update public.comprador_demanda
set autor = 'Gestor', autor_rol = 'admin'
where autor is null;

do $$
declare
  pk name;
  pk_es_comprador boolean;
begin
  select con.conname into pk
  from pg_constraint con
  where con.conrelid = 'public.comprador_demanda'::regclass
    and con.contype = 'p';

  pk_es_comprador := pk is not null and exists (
    select 1
    from pg_constraint con
    join pg_attribute att
      on att.attrelid = con.conrelid
     and att.attnum = any (con.conkey)
    where con.conname = pk
      and att.attname = 'comprador_id'
      and not exists (
        select 1
        from pg_attribute att2
        where att2.attrelid = con.conrelid
          and att2.attnum = any (con.conkey)
          and att2.attname = 'id'
      )
  );

  if pk_es_comprador then
    execute format('alter table public.comprador_demanda drop constraint %I', pk);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.comprador_demanda'::regclass
      and contype = 'p'
  ) then
    alter table public.comprador_demanda
      add constraint comprador_demanda_pkey primary key (id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'comprador_demanda_estado_check'
  ) then
    alter table public.comprador_demanda
      add constraint comprador_demanda_estado_check
      check (estado in ('activa', 'archivada'));
  end if;
end $$;

create index if not exists idx_comprador_demanda_comprador
  on public.comprador_demanda (comprador_id, created_at desc);

create index if not exists idx_comprador_demanda_activas
  on public.comprador_demanda (comprador_id)
  where estado = 'activa';

alter table public.comprador_demanda enable row level security;

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

drop policy if exists "comprador_demanda_propia_delete" on public.comprador_demanda;
create policy "comprador_demanda_propia_delete" on public.comprador_demanda
  for delete using (
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

drop policy if exists "comprador_demanda_agente_delete" on public.comprador_demanda;
create policy "comprador_demanda_agente_delete" on public.comprador_demanda
  for delete using (
    public.is_vendedor()
    and exists (
      select 1
      from public.vendedor_compradores vc
      join public.vendedores v on v.id = vc.vendedor_id
      where vc.comprador_id = comprador_demanda.comprador_id
        and v.user_id = auth.uid()
    )
  );

comment on table public.comprador_demanda is
  'Demandas del comprador. Puede haber varias. El cruce solo usa estado = activa. La fila previa a esta migración queda activa.';

notify pgrst, 'reload schema';
