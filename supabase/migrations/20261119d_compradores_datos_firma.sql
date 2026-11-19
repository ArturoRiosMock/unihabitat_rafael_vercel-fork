-- ============================================================
-- PropCRM — Datos del comprador para dejar la oferta lista para firmar
-- Ejecutar en el SQL Editor de Supabase (staging). No aplicar en
-- producción en este paso.
--
-- Idempotente: se puede lanzar más de una vez.
-- No cambia políticas RLS: las columnas nuevas heredan las de `compradores`.
--
-- Qué añade en public.compradores:
--   * apellidos — el nombre actual se parte por el primer espacio.
--     Si no hay espacio, se queda entero en nombre y apellidos queda vacío.
--     Solo se parte cuando apellidos sigue vacío, para no repetir el corte.
--   * nombre_completo — generado, nombre + apellidos. Lo usan las lecturas
--     que antes tomaban `nombre` como nombre completo.
--   * tipo_persona (fisica | juridica), razon_social, documento (DNI/NIE/CIF),
--     direccion, cp, poblacion, provincia, pais (España por defecto).
--
-- No borra filas ni toca acceso, NDA ni la asignación del agente.
-- ============================================================

alter table public.compradores
  add column if not exists apellidos text not null default '';

alter table public.compradores
  add column if not exists tipo_persona text not null default 'fisica';

alter table public.compradores
  add column if not exists razon_social text not null default '';

alter table public.compradores
  add column if not exists documento text not null default '';

alter table public.compradores
  add column if not exists direccion text not null default '';

alter table public.compradores
  add column if not exists cp text not null default '';

alter table public.compradores
  add column if not exists poblacion text not null default '';

alter table public.compradores
  add column if not exists provincia text not null default '';

alter table public.compradores
  add column if not exists pais text not null default 'España';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'compradores_tipo_persona_chk'
      and conrelid = 'public.compradores'::regclass
  ) then
    alter table public.compradores
      add constraint compradores_tipo_persona_chk
      check (tipo_persona in ('fisica', 'juridica'));
  end if;
end $$;

-- Parte el nombre histórico solo una vez: apellidos vacío y hay un espacio.
update public.compradores
set
  apellidos = btrim(substr(btrim(nombre), position(' ' in btrim(nombre)) + 1)),
  nombre = btrim(substr(btrim(nombre), 1, position(' ' in btrim(nombre)) - 1)),
  ini = upper(
    substr(btrim(nombre), 1, 1)
    || substr(btrim(substr(btrim(nombre), position(' ' in btrim(nombre)) + 1)), 1, 1)
  )
where coalesce(apellidos, '') = ''
  and position(' ' in btrim(nombre)) > 0;

alter table public.compradores
  add column if not exists nombre_completo text
  generated always as (btrim(nombre || ' ' || apellidos)) stored;

comment on column public.compradores.nombre is
  'Nombre de pila del firmante. Tras la migración 20261119d ya no guarda los apellidos.';

comment on column public.compradores.apellidos is
  'Apellidos del firmante. La migración parte el nombre antiguo por el primer espacio.';

comment on column public.compradores.nombre_completo is
  'Nombre y apellidos unidos. Compatibilidad con lecturas que usaban el nombre completo.';

comment on column public.compradores.tipo_persona is
  'fisica o juridica. La razón social solo es obligatoria en la oferta si es jurídica.';

comment on column public.compradores.documento is
  'DNI, NIE o CIF del firmante o de la sociedad.';

comment on column public.compradores.direccion is
  'Domicilio que se precarga en la oferta.';

comment on column public.compradores.pais is
  'País del domicilio. España por defecto.';
