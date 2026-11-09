-- ============================================================
-- PropCRM — Esquema completo de base de datos
-- Ejecutar en Supabase SQL Editor (Dashboard)
-- ============================================================

-- 1. TABLAS PRINCIPALES
-- ============================================================

create table if not exists public.assets (
  id text primary key,
  -- Referencia catastral limpia (UI / import). El PK compuesto vive en id.
  referencia text default '',
  -- Slug público opaco para /portal/inmueble/[slug] (sin catastral en URL).
  public_slug text,
  cat text default '—',
  prov text default '—',
  pob text default '—',
  cp text default '—',
  addr text default '—',
  tip text default 'Vivienda',
  tip_c text default 'tp-viv',
  fase text default 'Suspendido',
  fase_c text default 'fp-sus',
  precio numeric,
  fav boolean default false,
  sqm numeric,
  tvia text default '—',
  nvia text default '—',
  num text default '—',
  esc text default '—',
  pla text default '—',
  pta text default '—',
  map text default '',
  cat_ref text default '—',
  clase text default '—',
  uso text default '—',
  bien text default '—',
  sup_c text default '—',
  sup_g text default '—',
  coef text default '—',
  ccaa text default '—',
  full_addr text default '—',
  descr text default '—',
  owner_name text default '—',
  owner_tel text default '—',
  owner_mail text default '—',
  pub boolean default false,
  -- Última publicación en el portal. Se conserva al despublicar.
  published_at timestamptz,
  age text,
  lat numeric,
  lng numeric,
  -- AssetAdmin fields (flattened)
  adm_pip text default '—',
  adm_lin text default '—',
  adm_cat text default '—',
  adm_car text default '—',
  adm_cli text default '—',
  adm_id1 text default '—',
  adm_con text default '—',
  adm_aid text default '—',
  adm_loans text default '—',
  adm_tcol text default '—',
  adm_scol text default '—',
  adm_ccaa text default '—',
  adm_prov text default '—',
  adm_city text default '—',
  adm_zip text default '—',
  adm_addr text default '—',
  adm_finca text default '—',
  adm_reg text default '—',
  adm_cref text default '—',
  adm_ejud text default '—',
  adm_ejmap text default '—',
  adm_eneg text default '—',
  adm_ob text default '—',
  adm_sub text default '—',
  adm_deu text default '—',
  adm_cprev text default '—',
  adm_cpost text default '—',
  adm_dtot text default '—',
  adm_pest text default '—',
  adm_str text default '—',
  adm_liq text default '—',
  adm_avj text default '—',
  adm_mmap text default '—',
  adm_buck text default '—',
  adm_lbuck text default '—',
  adm_smf text default '—',
  adm_rsub text default '—',
  adm_conn text default '—',
  adm_conn2 text default '—',
  -- Fila Excel en bruto por hoja: { "Proveedor 2": { "ASSET ID": "...", ... }, ... }
  excel_raw jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.compradores (
  id text primary key,
  user_id uuid references auth.users(id),
  nombre text not null,
  ini text default '',
  col text default '#2563a8,#0d2a4a',
  tipo text default 'Free' check (tipo in ('Privado', 'Free')),
  agente text default 'Admin',
  email text not null,
  tel text default '',
  intereses text default '',
  presupuesto text default '',
  activos text default '0',
  actividad text default '',
  estado text default 'Nuevo',
  estado_c text default 'fp-nd',
  nda text default 'Pendiente' check (nda in ('Firmada', 'Pendiente')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.vendedores (
  id text primary key,
  nombre text not null,
  ini text default '',
  col text default '#2563a8,#0d2a4a',
  cartera text default '',
  activo text default '',
  agente text default 'Admin',
  tel text default '',
  email text default '',
  ultimo text default '',
  estado text default '',
  estado_c text default 'fp-nd',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.tareas (
  id text primary key default gen_random_uuid()::text,
  titulo text not null,
  agente text default 'Admin',
  detalle text default '',
  prioridad text default 'normal' check (prioridad in ('urgente', 'normal', 'baja', 'completada')),
  fecha text default '',
  done boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.mensajes (
  id uuid primary key default gen_random_uuid(),
  asset_id text references public.assets(id) on delete cascade,
  comprador_id text references public.compradores(id) on delete cascade,
  from_role text not null check (from_role in ('cli', 'adm')),
  from_name text default '',
  text text not null,
  created_at timestamptz default now()
);

create table if not exists public.notas (
  id uuid primary key default gen_random_uuid(),
  asset_id text references public.assets(id) on delete cascade,
  comprador_id text references public.compradores(id) on delete cascade,
  author text not null,
  text text not null,
  created_at timestamptz default now()
);

create table if not exists public.documentos (
  id uuid primary key default gen_random_uuid(),
  asset_id text references public.assets(id) on delete cascade,
  comprador_id text references public.compradores(id) on delete cascade,
  name text not null,
  storage_path text not null,
  icon_type text default 'pdf' check (icon_type in ('pdf', 'xls', 'img', 'zip', 'other')),
  size_bytes bigint default 0,
  uploaded_by text default 'Admin',
  created_at timestamptz default now()
);

create table if not exists public.oportunidades (
  id uuid primary key default gen_random_uuid(),
  comprador_id text references public.compradores(id) on delete cascade,
  asset_id text references public.assets(id) on delete cascade,
  score integer default 0,
  estado text default 'nueva' check (estado in ('nueva', 'vista', 'contactada', 'descartada')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (comprador_id, asset_id)
);

create table if not exists public.notificaciones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  tipo text not null,
  mensaje text not null,
  referencia_id text,
  leida boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.ofertas (
  id uuid primary key default gen_random_uuid(),
  comprador_id text references public.compradores(id) on delete cascade,
  vendedor_id text references public.vendedores(id) on delete set null,
  asset_id text references public.assets(id) on delete cascade,
  propuesta_euros numeric not null,
  comentarios text,
  estado text default 'pendiente' check (estado in ('pendiente', 'validada', 'rechazada', 'nda_enviado', 'nda_firmado')),
  nda_enviado_at timestamptz,
  nda_firmado_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint ofertas_actor_chk check (comprador_id is not null or vendedor_id is not null)
);

create unique index if not exists ofertas_comprador_asset_uidx
  on public.ofertas (comprador_id, asset_id)
  where comprador_id is not null;

create unique index if not exists ofertas_vendedor_asset_uidx
  on public.ofertas (vendedor_id, asset_id)
  where vendedor_id is not null;

create index if not exists idx_ofertas_vendedor on public.ofertas (vendedor_id);

-- COMPRADOR ↔ ASSETS invitation (admin shares assets with specific buyers)
create table if not exists public.comprador_assets (
  comprador_id text references public.compradores(id) on delete cascade,
  asset_id text references public.assets(id) on delete cascade,
  invited_at timestamptz default now(),
  invited_by text default 'Admin',
  primary key (comprador_id, asset_id)
);

-- COMPRADOR ↔ ASSETS favorites (cada cliente marca sus propios favoritos)
create table if not exists public.comprador_favoritos (
  comprador_id text references public.compradores(id) on delete cascade,
  asset_id text references public.assets(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (comprador_id, asset_id)
);

-- VENDEDOR PERMISSIONS: per-vendor section access control
create table if not exists public.vendedor_permissions (
  vendedor_id text references public.vendedores(id) on delete cascade,
  section text not null,
  can_view boolean default false,
  can_edit boolean default false,
  primary key (vendedor_id, section)
);

-- VENDEDOR ↔ ASSETS assignment (many-to-many)
create table if not exists public.vendedor_assets (
  vendedor_id text references public.vendedores(id) on delete cascade,
  asset_id text references public.assets(id) on delete cascade,
  assigned_at timestamptz default now(),
  primary key (vendedor_id, asset_id)
);

-- VENDEDOR ↔ COMPRADORES assignment (many-to-many)
create table if not exists public.vendedor_compradores (
  vendedor_id text references public.vendedores(id) on delete cascade,
  comprador_id text references public.compradores(id) on delete cascade,
  assigned_at timestamptz default now(),
  primary key (vendedor_id, comprador_id)
);

-- 2. INDICES
-- ============================================================
create index if not exists idx_assets_prov on public.assets(prov);
create index if not exists idx_assets_pub on public.assets(pub);
create index if not exists idx_assets_cat_ref on public.assets(cat_ref);
create index if not exists idx_mensajes_asset on public.mensajes(asset_id, created_at);
create index if not exists idx_mensajes_comprador on public.mensajes(comprador_id, created_at);
create index if not exists idx_notas_asset on public.notas(asset_id, created_at);
create index if not exists idx_documentos_asset on public.documentos(asset_id);
create index if not exists idx_documentos_comprador on public.documentos(comprador_id);
create index if not exists idx_oportunidades_comprador on public.oportunidades(comprador_id);
create index if not exists idx_oportunidades_asset on public.oportunidades(asset_id);
create index if not exists idx_notificaciones_user on public.notificaciones(user_id, leida);
create index if not exists idx_ofertas_comprador on public.ofertas(comprador_id);
create index if not exists idx_ofertas_asset on public.ofertas(asset_id);
create index if not exists idx_ofertas_estado on public.ofertas(estado);

create index if not exists idx_comprador_assets_comprador on public.comprador_assets(comprador_id);
create index if not exists idx_comprador_assets_asset on public.comprador_assets(asset_id);

create index if not exists idx_comprador_favoritos_comprador on public.comprador_favoritos(comprador_id);
create index if not exists idx_comprador_favoritos_asset on public.comprador_favoritos(asset_id);

create index if not exists idx_vendedor_perms_vendor on public.vendedor_permissions(vendedor_id);
create index if not exists idx_vendedor_assets_vendor on public.vendedor_assets(vendedor_id);
create index if not exists idx_vendedor_assets_asset on public.vendedor_assets(asset_id);
create index if not exists idx_vendedor_compradores_vendor on public.vendedor_compradores(vendedor_id);
create index if not exists idx_vendedor_compradores_comprador on public.vendedor_compradores(comprador_id);

-- 3. ROW LEVEL SECURITY
-- ============================================================

alter table public.assets enable row level security;
alter table public.compradores enable row level security;
alter table public.vendedores enable row level security;
alter table public.tareas enable row level security;
alter table public.mensajes enable row level security;
alter table public.notas enable row level security;
alter table public.documentos enable row level security;
alter table public.oportunidades enable row level security;
alter table public.notificaciones enable row level security;
alter table public.ofertas enable row level security;

-- Helper: check if current user is admin
create or replace function public.is_admin()
returns boolean as $$
  select coalesce(
    (select raw_user_meta_data->>'role' = 'admin'
     from auth.users
     where id = auth.uid()),
    false
  );
$$ language sql security definer stable;

-- ASSETS: public columns readable by anyone, full access for admin
create policy "assets_public_read" on public.assets
  for select using (pub = true or public.is_admin());
create policy "assets_admin_insert" on public.assets
  for insert with check (public.is_admin());
create policy "assets_admin_update" on public.assets
  for update using (public.is_admin());
create policy "assets_admin_delete" on public.assets
  for delete using (public.is_admin());

-- COMPRADORES: admin full access, clients see own record
create policy "compradores_admin" on public.compradores
  for all using (public.is_admin());
create policy "compradores_own" on public.compradores
  for select using (user_id = auth.uid());

-- VENDEDORES: admin only
create policy "vendedores_admin" on public.vendedores
  for all using (public.is_admin());

-- TAREAS: admin only
create policy "tareas_admin" on public.tareas
  for all using (public.is_admin());

-- MENSAJES: admin full access, clients see own messages
create policy "mensajes_admin" on public.mensajes
  for all using (public.is_admin());
create policy "mensajes_client_read" on public.mensajes
  for select using (
    comprador_id in (select id from public.compradores where user_id = auth.uid())
  );
create policy "mensajes_client_insert" on public.mensajes
  for insert with check (
    comprador_id in (select id from public.compradores where user_id = auth.uid())
    and from_role = 'cli'
  );

-- NOTAS: admin only (lectura y escritura).
-- DELETE explícito: solo admin. Agentes y compradores no borran notas,
-- ni propias ni ajenas. Ver supabase/migrations/20261109_notas_admin_delete.sql.
create policy "notas_admin" on public.notas
  for all using (public.is_admin());
create policy "notas_admin_delete" on public.notas
  for delete using (public.is_admin());

-- DOCUMENTOS: admin full access, clients see shared docs
create policy "documentos_admin" on public.documentos
  for all using (public.is_admin());
create policy "documentos_client_read" on public.documentos
  for select using (
    comprador_id in (select id from public.compradores where user_id = auth.uid())
  );

-- OPORTUNIDADES: admin full access, clients see own
create policy "oportunidades_admin" on public.oportunidades
  for all using (public.is_admin());
create policy "oportunidades_client_read" on public.oportunidades
  for select using (
    comprador_id in (select id from public.compradores where user_id = auth.uid())
  );

-- NOTIFICACIONES: admin full access, users see own
create policy "notificaciones_admin" on public.notificaciones
  for all using (public.is_admin());
create policy "notificaciones_own" on public.notificaciones
  for select using (user_id = auth.uid());
create policy "notificaciones_own_update" on public.notificaciones
  for update using (user_id = auth.uid());

-- COMPRADOR_ASSETS: admin full, clients see own
alter table public.comprador_assets enable row level security;
create policy "comprador_assets_admin" on public.comprador_assets
  for all using (public.is_admin());
create policy "comprador_assets_client_read" on public.comprador_assets
  for select using (
    comprador_id in (select id from public.compradores where user_id = auth.uid())
  );

-- COMPRADOR_FAVORITOS: admin full, clients manage own
alter table public.comprador_favoritos enable row level security;
create policy "comprador_favoritos_admin" on public.comprador_favoritos
  for all using (public.is_admin());
create policy "comprador_favoritos_client_read" on public.comprador_favoritos
  for select using (
    comprador_id in (select id from public.compradores where user_id = auth.uid())
  );
create policy "comprador_favoritos_client_insert" on public.comprador_favoritos
  for insert with check (
    comprador_id in (select id from public.compradores where user_id = auth.uid())
  );
create policy "comprador_favoritos_client_delete" on public.comprador_favoritos
  for delete using (
    comprador_id in (select id from public.compradores where user_id = auth.uid())
  );

-- VENDEDOR_PERMISSIONS: admin only
alter table public.vendedor_permissions enable row level security;
create policy "vendedor_permissions_admin" on public.vendedor_permissions
  for all using (public.is_admin());

-- VENDEDOR_ASSETS: admin only
alter table public.vendedor_assets enable row level security;
create policy "vendedor_assets_admin" on public.vendedor_assets
  for all using (public.is_admin());

-- VENDEDOR_COMPRADORES: admin only
alter table public.vendedor_compradores enable row level security;
create policy "vendedor_compradores_admin" on public.vendedor_compradores
  for all using (public.is_admin());

-- 4. STORAGE BUCKET
-- ============================================================
insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', false)
on conflict (id) do nothing;

create policy "docs_admin_all" on storage.objects
  for all using (bucket_id = 'documentos' and public.is_admin());
create policy "docs_client_read" on storage.objects
  for select using (
    bucket_id = 'documentos'
    and (storage.foldername(name))[1] in (
      select id from public.compradores where user_id = auth.uid()
    )
  );

-- 5. REALTIME
-- ============================================================
alter publication supabase_realtime add table public.mensajes;
alter publication supabase_realtime add table public.notificaciones;
alter publication supabase_realtime add table public.oportunidades;

-- 6. UPDATED_AT TRIGGER
-- ============================================================
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger assets_updated_at before update on public.assets
  for each row execute function public.handle_updated_at();
create trigger compradores_updated_at before update on public.compradores
  for each row execute function public.handle_updated_at();
create trigger vendedores_updated_at before update on public.vendedores
  for each row execute function public.handle_updated_at();
create trigger oportunidades_updated_at before update on public.oportunidades
  for each row execute function public.handle_updated_at();
