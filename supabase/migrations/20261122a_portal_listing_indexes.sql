-- Índices del listado público /portal.
-- Idempotente. No cambia datos ni el comportamiento visible: solo acelera
-- el filtro por publicados, provincia, municipio, tipología y precio.
-- Aplicar en staging y, tras validar, en producción. No depende de filas de staging.

create index if not exists idx_assets_pub_created
  on public.assets (pub, created_at desc);

create index if not exists idx_assets_pub_prov
  on public.assets (pub, prov);

create index if not exists idx_assets_pub_pob
  on public.assets (pub, pob);

create index if not exists idx_assets_pub_tip
  on public.assets (pub, tip);

create index if not exists idx_assets_pub_precio
  on public.assets (pub, precio);

create index if not exists idx_assets_pub_coords
  on public.assets (pub, lat, lng)
  where lat is not null and lng is not null;

create index if not exists idx_propiedades_inmueble_categoria
  on public.propiedades (inmueble_id, categoria);
