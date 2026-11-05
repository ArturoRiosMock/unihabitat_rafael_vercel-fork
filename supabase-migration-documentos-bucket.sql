-- ============================================================
-- PropCRM — Migración: bucket de documentos para Supabase Storage
-- ============================================================
-- Ejecutar UNA VEZ en Supabase SQL Editor (staging o prod). Es idempotente.
--
-- Objetivo:
-- Crear el bucket privado 'documentos' si no existe, y configurar las políticas
-- de Storage RLS para permitir:
-- - Admin: acceso completo (lectura, escritura, borrado)
-- - Agentes (vendedores): acceso a documentos de sus activos asignados
-- - Clientes (compradores): solo lectura de documentos donde están invitados
--
-- Nota: el bucket se crea como PRIVADO (public=false) porque las URLs se generan
-- con createSignedUrl() en el server action, no con getPublicUrl().

-- 1. CREAR BUCKET (idempotente)
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documentos',
  'documentos',
  false,
  52428800,  -- 50MB limit
  array['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/csv', 'application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 2. ELIMINAR POLÍTICAS ANTERIORES (para idempotencia)
-- ============================================================
drop policy if exists "docs_admin_all" on storage.objects;
drop policy if exists "docs_client_read" on storage.objects;
drop policy if exists "docs_agente_read" on storage.objects;
drop policy if exists "docs_admin_insert" on storage.objects;
drop policy if exists "docs_admin_update" on storage.objects;
drop policy if exists "docs_admin_delete" on storage.objects;
drop policy if exists "docs_admin_select" on storage.objects;

-- 3. POLÍTICAS DE STORAGE
-- ============================================================

-- 3.1 Admin: acceso completo a todos los objetos del bucket
create policy "docs_admin_select" on storage.objects
  for select using (bucket_id = 'documentos' and public.is_admin());

create policy "docs_admin_insert" on storage.objects
  for insert with check (bucket_id = 'documentos' and public.is_admin());

create policy "docs_admin_update" on storage.objects
  for update using (bucket_id = 'documentos' and public.is_admin());

create policy "docs_admin_delete" on storage.objects
  for delete using (bucket_id = 'documentos' and public.is_admin());

-- 3.2 Agentes (vendedores): pueden leer documentos de activos que tienen asignados
create policy "docs_agente_read" on storage.objects
  for select using (
    bucket_id = 'documentos'
    and exists (
      select 1 from public.vendedores v
      join public.vendedor_assets va on va.vendedor_id = v.id
      where v.user_id = auth.uid()
        and (storage.foldername(name))[2] = va.asset_id
        and (storage.foldername(name))[1] = 'assets'
    )
  );

-- 3.3 Clientes (compradores): pueden leer documentos de activos a los que están invitados
create policy "docs_client_read" on storage.objects
  for select using (
    bucket_id = 'documentos'
    and (
      -- Documentos en carpeta de comprador propio
      exists (
        select 1 from public.compradores c
        where c.user_id = auth.uid()
          and (storage.foldername(name))[1] = 'compradores'
          and (storage.foldername(name))[2] = c.id
      )
      -- O documentos de activos a los que el comprador tiene acceso
      or exists (
        select 1 from public.compradores c
        join public.comprador_acceso ca on ca.comprador_id = c.id
        where c.user_id = auth.uid()
          and (storage.foldername(name))[1] = 'assets'
          and (storage.foldername(name))[2] = ca.asset_id
      )
    )
  );

-- 4. VERIFICACIÓN (opcional: descomentar para probar)
-- ============================================================
-- select * from storage.buckets where id = 'documentos';
-- select policyname, cmd from pg_policies where tablename = 'objects' and policyname like 'docs_%';
