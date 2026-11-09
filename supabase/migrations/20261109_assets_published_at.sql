-- ============================================================
-- PropCRM — Fecha de publicación de activos
-- Ejecutar en el SQL Editor de Supabase (staging y, cuando toque, prod).
--
-- Idempotente: se puede lanzar más de una vez.
--
-- Comportamiento de la aplicación:
--   * Al marcar publicado se guarda published_at = ahora.
--   * Al despublicar NO se borra: queda la última fecha de publicación.
--   * Volver a publicar actualiza el sello a la nueva fecha.
--   * Los ya publicados sin sello reciben created_at como aproximación.
--
-- El listado admin sigue funcionando si esta migración aún no se ha
-- aplicado: lee published_at solo si viene en la fila y, si falta,
-- muestra created_at en los que ya están publicados.
-- ============================================================

alter table public.assets
  add column if not exists published_at timestamptz;

comment on column public.assets.published_at is
  'Última vez que el inmueble pasó a publicado. Se conserva al despublicar. Backfill: created_at de los que ya estaban publicados.';

update public.assets
set published_at = created_at
where pub is true
  and published_at is null
  and created_at is not null;

create index if not exists idx_assets_published_at
  on public.assets (published_at desc nulls last);

notify pgrst, 'reload schema';
