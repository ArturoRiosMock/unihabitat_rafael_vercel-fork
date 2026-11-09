-- ============================================================
-- Políticas de desarrollo — permiten acceso completo con anon key
-- Ejecutar DESPUÉS del schema principal para poder desarrollar
-- sin autenticación. ELIMINAR antes de producción.
-- ============================================================

-- Assets: permitir lectura y escritura a todos
create policy "assets_anon_select" on public.assets for select using (true);
create policy "assets_anon_insert" on public.assets for insert with check (true);
create policy "assets_anon_update" on public.assets for update using (true);
create policy "assets_anon_delete" on public.assets for delete using (true);

-- Compradores
create policy "compradores_anon_select" on public.compradores for select using (true);
create policy "compradores_anon_insert" on public.compradores for insert with check (true);
create policy "compradores_anon_update" on public.compradores for update using (true);

-- Vendedores
create policy "vendedores_anon_select" on public.vendedores for select using (true);
create policy "vendedores_anon_insert" on public.vendedores for insert with check (true);
create policy "vendedores_anon_update" on public.vendedores for update using (true);

-- Tareas
create policy "tareas_anon_select" on public.tareas for select using (true);
create policy "tareas_anon_insert" on public.tareas for insert with check (true);
create policy "tareas_anon_update" on public.tareas for update using (true);

-- Mensajes
create policy "mensajes_anon_select" on public.mensajes for select using (true);
create policy "mensajes_anon_insert" on public.mensajes for insert with check (true);

-- Notas: no hay SELECT ni INSERT anónimo. La visibilidad la fijan
-- notas_agente_select / notas_comprador_select / notas_admin
-- (supabase/migrations/20261109_notas_select_visibilidad.sql).
-- No hay DELETE anónimo. Borrar una nota es solo admin
-- (política notas_admin_delete + server action deleteNota).

-- Documentos
create policy "documentos_anon_select" on public.documentos for select using (true);
create policy "documentos_anon_insert" on public.documentos for insert with check (true);
create policy "documentos_anon_delete" on public.documentos for delete using (true);

-- Oportunidades
create policy "oportunidades_anon_select" on public.oportunidades for select using (true);
create policy "oportunidades_anon_insert" on public.oportunidades for insert with check (true);
create policy "oportunidades_anon_update" on public.oportunidades for update using (true);

-- Notificaciones
create policy "notificaciones_anon_select" on public.notificaciones for select using (true);
create policy "notificaciones_anon_insert" on public.notificaciones for insert with check (true);
create policy "notificaciones_anon_update" on public.notificaciones for update using (true);

-- Ofertas
create policy "ofertas_anon_select" on public.ofertas for select using (true);
create policy "ofertas_anon_insert" on public.ofertas for insert with check (true);
create policy "ofertas_anon_update" on public.ofertas for update using (true);

-- Comprador Assets
create policy "comprador_assets_anon_select" on public.comprador_assets for select using (true);
create policy "comprador_assets_anon_insert" on public.comprador_assets for insert with check (true);
create policy "comprador_assets_anon_delete" on public.comprador_assets for delete using (true);

-- Comprador Favoritos
create policy "comprador_favoritos_anon_select" on public.comprador_favoritos for select using (true);
create policy "comprador_favoritos_anon_insert" on public.comprador_favoritos for insert with check (true);
create policy "comprador_favoritos_anon_delete" on public.comprador_favoritos for delete using (true);
