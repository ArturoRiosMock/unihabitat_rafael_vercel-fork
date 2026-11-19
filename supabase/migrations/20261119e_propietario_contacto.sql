-- ============================================================
-- PropCRM — Propietario y Contacto de la carga
-- Ejecutar en el SQL Editor de Supabase (staging). No aplicar en
-- producción en este paso.
--
-- Idempotente: se puede lanzar más de una vez.
--
-- Qué hace en public.propiedades:
--   * Asegura las columnas propietario, contacto, telefono y mail.
--   * El nombre que ya estaba (propietario, o assets.owner_name si la
--     columna de la propiedad está vacía) se queda en propietario.
--     No se copia ese nombre a contacto. Contacto vacío queda en «—».
--   * Teléfono y email no se mueven de fila. Solo se rellenan desde
--     assets.owner_tel / owner_mail cuando el de la propiedad está vacío.
--   * anon y authenticated dejan de poder leer esas columnas y excel_raw
--     (ahí también viajan Propietario y Contacto). service_role no cambia:
--     el admin entra por las server actions. La política de filas
--     propiedades_public_read sigue limitando qué filas ve el portal.
--     No se toca el GRANT de assets: las lecturas públicas hacen select *.
--
-- La misma regla de relleno está en src/lib/propietario-contacto.ts
-- (migratePropietarioContacto).
-- ============================================================

alter table public.propiedades
  add column if not exists propietario text default '—';

alter table public.propiedades
  add column if not exists contacto text default '—';

alter table public.propiedades
  add column if not exists telefono text default '—';

alter table public.propiedades
  add column if not exists mail text default '—';

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'assets'
      and column_name = 'owner_name'
  ) then
    update public.propiedades p
    set propietario = btrim(a.owner_name)
    from public.assets a
    where p.inmueble_id = a.id
      and (p.propietario is null or btrim(p.propietario) in ('', '—', '-', '–'))
      and a.owner_name is not null
      and btrim(a.owner_name) not in ('', '—', '-', '–');
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'assets'
      and column_name = 'owner_tel'
  ) then
    update public.propiedades p
    set telefono = btrim(a.owner_tel)
    from public.assets a
    where p.inmueble_id = a.id
      and (p.telefono is null or btrim(p.telefono) in ('', '—', '-', '–'))
      and a.owner_tel is not null
      and btrim(a.owner_tel) not in ('', '—', '-', '–');
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'assets'
      and column_name = 'owner_mail'
  ) then
    update public.propiedades p
    set mail = btrim(a.owner_mail)
    from public.assets a
    where p.inmueble_id = a.id
      and (p.mail is null or btrim(p.mail) in ('', '—', '-', '–'))
      and a.owner_mail is not null
      and btrim(a.owner_mail) not in ('', '—', '-', '–');
  end if;
end $$;

update public.propiedades
set propietario = '—'
where propietario is null or btrim(propietario) = '';

update public.propiedades
set contacto = '—'
where contacto is null or btrim(contacto) = '';

update public.propiedades
set telefono = '—'
where telefono is null or btrim(telefono) = '';

update public.propiedades
set mail = '—'
where mail is null or btrim(mail) = '';

comment on column public.propiedades.propietario is
  'Propietario de la carga. El nombre único anterior permanece aquí. Solo lo lee el admin.';

comment on column public.propiedades.contacto is
  'Persona de contacto de la carga, distinta del propietario. Solo la lee el admin.';

comment on column public.propiedades.telefono is
  'Teléfono del propietario/contacto. Sigue en la misma fila. Solo lo lee el admin.';

comment on column public.propiedades.mail is
  'Email del propietario/contacto. Sigue en la misma fila. Solo lo lee el admin.';

-- Quita el SELECT de tabla y lo vuelve a dar sin las columnas de contacto.
-- Así un select=* del anon/authenticated no devuelve PII ni excel_raw.
do $$
declare
  cols text;
begin
  if to_regclass('public.propiedades') is null then
    return;
  end if;

  select string_agg(format('%I', column_name), ', ' order by ordinal_position)
    into cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'propiedades'
    and column_name not in ('propietario', 'contacto', 'telefono', 'mail', 'excel_raw');

  if cols is null then
    return;
  end if;

  execute 'revoke select on table public.propiedades from public, anon, authenticated';
  execute format(
    'grant select (%s) on table public.propiedades to anon, authenticated',
    cols
  );
end $$;

-- assets.owner_name / owner_tel / owner_mail, si siguen en la tabla, no se
-- exponen en el mapper de la app. No se revoca el SELECT de assets aquí:
-- el portal lee la fila con select=* y un revoke parcial rompería esa lectura.
-- El backfill de arriba copia esos valores a la propiedad cuando está vacía.

notify pgrst, 'reload schema';
