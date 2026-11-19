-- ============================================================
-- PropCRM — Workflow de ofertas y clientes interesados
-- Ejecutar en el SQL Editor de Supabase (staging). No aplicar en
-- producción en este paso.
--
-- Idempotente: se puede lanzar más de una vez.
--
-- Qué hace:
--   * Migra estados sin borrar el valor anterior:
--       pendiente      → realizada     (estado_legacy = pendiente)
--       validada       → aceptada
--       nda_enviado    → aceptada      (nda_enviado_at se conserva)
--       nda_firmado    → firmada       (fecha_firma = nda_firmado_at)
--       rechazada      → rechazada
--   * Nuevos estados: realizada, contraofertada, rechazada, aceptada,
--     pbc_solicitada, firmada. Firmada exige fecha_firma.
--   * oferta_historial: quién, cuándo, de qué estado a qué, importe y nota.
--     El admin se guarda como «Gestor» desde la app (author_role = admin).
--   * Sigue habiendo una oferta por comprador y activo.
--     La oferta del agente sin comprador sigue siendo única por agente
--     y activo. Si la oferta tiene comprador, ese índice ya no bloquea
--     otra oferta del mismo agente para otro comprador.
--   * RLS del historial: solo is_admin(). La app usa service role después
--     de filtrar en servidor. No se abre el historial al agente por la
--     API (en staging un EXISTS sobre vendedores queda en falso).
--
-- No envía emails. No toca comprador_assets, favoritos ni el NDA del activo.
-- La solicitud de información del portal sigue siendo solo un email:
-- no hay tabla que listar.
-- ============================================================

alter table public.ofertas
  add column if not exists fecha_firma timestamptz;

alter table public.ofertas
  add column if not exists contraoferta_nota text;

alter table public.ofertas
  add column if not exists estado_legacy text;

-- Quitar el check viejo (contiene 'pendiente') antes de reescribir filas.
do $$
declare
  rec record;
begin
  for rec in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'ofertas'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%pendiente%'
  loop
    execute format('alter table public.ofertas drop constraint %I', rec.conname);
  end loop;
end $$;

update public.ofertas
set estado_legacy = estado
where estado_legacy is null
  and estado in ('pendiente', 'validada', 'nda_enviado', 'nda_firmado');

update public.ofertas
set
  fecha_firma = coalesce(fecha_firma, nda_firmado_at, updated_at, now()),
  estado = 'firmada'
where estado = 'nda_firmado';

update public.ofertas
set estado = 'aceptada'
where estado in ('validada', 'nda_enviado');

update public.ofertas
set estado = 'realizada'
where estado = 'pendiente';

alter table public.ofertas
  alter column estado set default 'realizada';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ofertas_estado_check'
  ) then
    alter table public.ofertas
      add constraint ofertas_estado_check
      check (
        estado in (
          'realizada',
          'contraofertada',
          'rechazada',
          'aceptada',
          'pbc_solicitada',
          'firmada'
        )
      );
  end if;
end $$;

update public.ofertas
set fecha_firma = coalesce(fecha_firma, nda_firmado_at, updated_at, now())
where estado = 'firmada'
  and fecha_firma is null;

alter table public.ofertas drop constraint if exists ofertas_fecha_firma_chk;

alter table public.ofertas
  add constraint ofertas_fecha_firma_chk
  check (estado is distinct from 'firmada' or fecha_firma is not null);

comment on column public.ofertas.estado_legacy is
  'Estado anterior a la migración del workflow (pendiente, validada, nda_enviado, nda_firmado). No se pisa si ya tiene valor.';

comment on column public.ofertas.fecha_firma is
  'Fecha de firma de la operación. Obligatoria cuando estado = firmada.';

comment on column public.ofertas.contraoferta_nota is
  'Nota de la última contraoferta. El historial guarda cada una.';

-- Una oferta por comprador y activo. No se toca el índice.
create unique index if not exists ofertas_comprador_asset_uidx
  on public.ofertas (comprador_id, asset_id)
  where comprador_id is not null;

-- El índice anterior impedía dos ofertas del mismo agente en un activo
-- aunque fueran de compradores distintos. Ahora solo cubre la oferta
-- del agente sin comprador.
drop index if exists public.ofertas_vendedor_asset_uidx;

create unique index if not exists ofertas_vendedor_asset_uidx
  on public.ofertas (vendedor_id, asset_id)
  where vendedor_id is not null and comprador_id is null;

create table if not exists public.oferta_historial (
  id uuid primary key default gen_random_uuid(),
  oferta_id uuid not null references public.ofertas(id) on delete cascade,
  estado_desde text,
  estado_hasta text not null,
  importe_anterior numeric,
  importe_nuevo numeric,
  nota text,
  author text,
  author_role text check (
    author_role is null
    or author_role in ('admin', 'vendedor', 'cliente')
  ),
  created_at timestamptz not null default now()
);

create index if not exists idx_oferta_historial_oferta
  on public.oferta_historial (oferta_id, created_at desc);

comment on table public.oferta_historial is
  'Cambios de una oferta: autor, momento, estado anterior y nuevo, importe y nota. La contraoferta no crea otra oferta.';

alter table public.oferta_historial enable row level security;

drop policy if exists "oferta_historial_admin" on public.oferta_historial;

create policy "oferta_historial_admin"
  on public.oferta_historial
  for all
  using (public.is_admin())
  with check (public.is_admin());

comment on policy "oferta_historial_admin" on public.oferta_historial is
  'Solo el admin por la API. El agente no lee esta tabla directo: la app filtra con service role.';

-- Primera fila de historial para lo que ya existía. No duplica si se relanza.
insert into public.oferta_historial (
  oferta_id,
  estado_desde,
  estado_hasta,
  importe_anterior,
  importe_nuevo,
  nota,
  author,
  author_role,
  created_at
)
select
  o.id,
  o.estado_legacy,
  o.estado,
  null,
  o.propuesta_euros,
  null,
  'Gestor',
  'admin',
  coalesce(o.created_at, now())
from public.ofertas o
where not exists (
  select 1
  from public.oferta_historial h
  where h.oferta_id = o.id
);
