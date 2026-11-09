-- ============================================================
-- PropCRM — Borrado de notas de activo (solo admin)
-- Ejecutar en el SQL Editor de Supabase (staging y, cuando toque, prod).
--
-- Idempotente: se puede lanzar más de una vez.
--
-- Decisión de permisos:
--   * El admin puede borrar cualquier nota individual (tabla public.notas).
--   * Los agentes (rol vendedor) NO pueden borrar notas, ni propias ni ajenas.
--     Hoy no existía borrado en la app ni política DELETE para ellos; se mantiene.
--   * Los compradores tampoco pueden borrar las suyas desde el portal.
--   * No se crea política de DELETE para anon, vendedor ni cliente.
--   * La server action deleteNota exige rol admin y usa service role, porque
--     el admin de demo (cookie dev-auth) puede no cumplir public.is_admin()
--     (auth.uid() vacío). El acceso directo por PostgREST sigue exigiendo
--     public.is_admin() gracias a esta política.
--
-- La política "notas_admin" (FOR ALL) del schema base ya dejaba borrar al
-- admin. Esta política lo deja explícito y elimina deletes permisivos si
-- alguien los hubiera creado a mano.
-- ============================================================

drop policy if exists "notas_anon_delete" on public.notas;
drop policy if exists "notas_vendedor_delete" on public.notas;
drop policy if exists "notas_agente_delete" on public.notas;
drop policy if exists "notas_own_delete" on public.notas;
drop policy if exists "notas_client_delete" on public.notas;
drop policy if exists "notas_admin_delete" on public.notas;

create policy "notas_admin_delete"
  on public.notas
  for delete
  using (public.is_admin());

comment on policy "notas_admin_delete" on public.notas is
  'Solo admin borra notas. Agentes y compradores no tienen DELETE (ni propias ni ajenas).';

notify pgrst, 'reload schema';
