-- ============================================================
-- PropCRM — Seguimiento de la oferta, aparte del estado de workflow
-- Ejecutar en el SQL Editor de Supabase (staging). No aplicar en
-- producción en este paso.
--
-- Idempotente: se puede lanzar más de una vez.
--
-- Qué añade:
--   * ofertas.seguimiento: pendiente, en_seguimiento, enviado,
--     sin_respuesta. No cambia el estado de workflow.
--   * oferta_historial guarda el cambio de seguimiento (desde/hasta),
--     con el mismo autor y fecha que el resto del historial.
--     estado_hasta sigue relleno con el estado de workflow vigente
--     para no romper el check de la tabla.
-- ============================================================

alter table public.ofertas
  add column if not exists seguimiento text;

update public.ofertas
set seguimiento = 'pendiente'
where seguimiento is null or btrim(seguimiento) = '';

alter table public.ofertas
  alter column seguimiento set default 'pendiente';

alter table public.ofertas
  alter column seguimiento set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ofertas_seguimiento_check'
  ) then
    alter table public.ofertas
      add constraint ofertas_seguimiento_check
      check (seguimiento in ('pendiente', 'en_seguimiento', 'enviado', 'sin_respuesta'));
  end if;
end $$;

alter table public.oferta_historial
  add column if not exists seguimiento_desde text;

alter table public.oferta_historial
  add column if not exists seguimiento_hasta text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'oferta_historial_seguimiento_desde_check'
  ) then
    alter table public.oferta_historial
      add constraint oferta_historial_seguimiento_desde_check
      check (
        seguimiento_desde is null
        or seguimiento_desde in ('pendiente', 'en_seguimiento', 'enviado', 'sin_respuesta')
      );
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'oferta_historial_seguimiento_hasta_check'
  ) then
    alter table public.oferta_historial
      add constraint oferta_historial_seguimiento_hasta_check
      check (
        seguimiento_hasta is null
        or seguimiento_hasta in ('pendiente', 'en_seguimiento', 'enviado', 'sin_respuesta')
      );
  end if;
end $$;

comment on column public.ofertas.seguimiento is
  'Seguimiento comercial, independiente del estado de workflow. pendiente, en_seguimiento, enviado o sin_respuesta.';

comment on column public.oferta_historial.seguimiento_hasta is
  'Si viene relleno, la fila registra un cambio de seguimiento y no un cambio de estado de workflow.';

notify pgrst, 'reload schema';
