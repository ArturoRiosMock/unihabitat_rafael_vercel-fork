-- ============================================================
-- PropCRM — Avisos WhatsApp, consentimiento y mensajes entrantes
-- Ejecutar en el SQL Editor de Supabase (staging). No aplicar en
-- producción en este paso.
--
-- Idempotente: se puede lanzar más de una vez.
--
-- Qué añade:
--   * compradores.acepta_whatsapp — consentimiento. Por defecto false.
--   * comprador_avisos — un aviso por lote (email y WhatsApp cuentan
--     como uno). El trigger impide el tercero en la misma semana UTC.
--   * whatsapp_mensajes — entrantes del webhook, enlazados al
--     comprador por teléfono cuando se reconoce.
--
-- RLS:
--   * admin: todo.
--   * agente: solo compradores asignados (select; en avisos también).
--   * comprador: solo lo suyo (select).
-- El webhook y el cruce escriben con service role.
-- ============================================================

alter table public.compradores
  add column if not exists acepta_whatsapp boolean;

update public.compradores
set acepta_whatsapp = false
where acepta_whatsapp is null;

alter table public.compradores
  alter column acepta_whatsapp set default false;

alter table public.compradores
  alter column acepta_whatsapp set not null;

comment on column public.compradores.acepta_whatsapp is
  'El comprador acepta avisos de oportunidades por WhatsApp. Sin esto no se envía.';

create table if not exists public.comprador_avisos (
  id uuid primary key default gen_random_uuid(),
  comprador_id text not null references public.compradores(id) on delete cascade,
  semana date not null,
  canales text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.comprador_avisos
  add column if not exists comprador_id text;
alter table public.comprador_avisos
  add column if not exists semana date;
alter table public.comprador_avisos
  add column if not exists canales text[] not null default '{}';
alter table public.comprador_avisos
  add column if not exists created_at timestamptz not null default now();

create index if not exists idx_comprador_avisos_semana
  on public.comprador_avisos (comprador_id, semana);

create or replace function public.comprador_avisos_limite()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  total integer;
begin
  select count(*) into total
  from public.comprador_avisos
  where comprador_id = new.comprador_id
    and semana = new.semana;
  if total >= 2 then
    raise exception 'limite de avisos semanales';
  end if;
  return new;
end;
$$;

drop trigger if exists comprador_avisos_limite on public.comprador_avisos;
create trigger comprador_avisos_limite
  before insert on public.comprador_avisos
  for each row execute function public.comprador_avisos_limite();

create table if not exists public.whatsapp_mensajes (
  id uuid primary key default gen_random_uuid(),
  comprador_id text references public.compradores(id) on delete set null,
  telefono text not null,
  wamid text,
  direccion text not null default 'entrante',
  tipo text not null default 'text',
  cuerpo text not null default '',
  raw jsonb,
  created_at timestamptz not null default now()
);

alter table public.whatsapp_mensajes
  add column if not exists comprador_id text;
alter table public.whatsapp_mensajes
  add column if not exists telefono text;
alter table public.whatsapp_mensajes
  add column if not exists wamid text;
alter table public.whatsapp_mensajes
  add column if not exists direccion text not null default 'entrante';
alter table public.whatsapp_mensajes
  add column if not exists tipo text not null default 'text';
alter table public.whatsapp_mensajes
  add column if not exists cuerpo text not null default '';
alter table public.whatsapp_mensajes
  add column if not exists raw jsonb;
alter table public.whatsapp_mensajes
  add column if not exists created_at timestamptz not null default now();

create unique index if not exists whatsapp_mensajes_wamid_uidx
  on public.whatsapp_mensajes (wamid)
  where wamid is not null;

create index if not exists idx_whatsapp_mensajes_comprador
  on public.whatsapp_mensajes (comprador_id, created_at desc);

create index if not exists idx_whatsapp_mensajes_telefono
  on public.whatsapp_mensajes (telefono);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'whatsapp_mensajes_direccion_check'
  ) then
    alter table public.whatsapp_mensajes
      add constraint whatsapp_mensajes_direccion_check
      check (direccion in ('entrante', 'saliente'));
  end if;
end $$;

alter table public.comprador_avisos enable row level security;
alter table public.whatsapp_mensajes enable row level security;

drop policy if exists "comprador_avisos_admin" on public.comprador_avisos;
create policy "comprador_avisos_admin" on public.comprador_avisos
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "comprador_avisos_propia_select" on public.comprador_avisos;
create policy "comprador_avisos_propia_select" on public.comprador_avisos
  for select using (
    comprador_id in (select id from public.compradores where user_id = auth.uid())
  );

drop policy if exists "comprador_avisos_agente_select" on public.comprador_avisos;
create policy "comprador_avisos_agente_select" on public.comprador_avisos
  for select using (
    public.is_vendedor()
    and exists (
      select 1
      from public.vendedor_compradores vc
      join public.vendedores v on v.id = vc.vendedor_id
      where vc.comprador_id = comprador_avisos.comprador_id
        and v.user_id = auth.uid()
    )
  );

drop policy if exists "whatsapp_mensajes_admin" on public.whatsapp_mensajes;
create policy "whatsapp_mensajes_admin" on public.whatsapp_mensajes
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "whatsapp_mensajes_propia_select" on public.whatsapp_mensajes;
create policy "whatsapp_mensajes_propia_select" on public.whatsapp_mensajes
  for select using (
    comprador_id in (select id from public.compradores where user_id = auth.uid())
  );

drop policy if exists "whatsapp_mensajes_agente_select" on public.whatsapp_mensajes;
create policy "whatsapp_mensajes_agente_select" on public.whatsapp_mensajes
  for select using (
    public.is_vendedor()
    and comprador_id is not null
    and exists (
      select 1
      from public.vendedor_compradores vc
      join public.vendedores v on v.id = vc.vendedor_id
      where vc.comprador_id = whatsapp_mensajes.comprador_id
        and v.user_id = auth.uid()
    )
  );

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on table public.comprador_avisos from anon';
    execute 'revoke all on table public.whatsapp_mensajes from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant select on table public.comprador_avisos to authenticated';
    execute 'grant select on table public.whatsapp_mensajes to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update, delete on table public.comprador_avisos to service_role';
    execute 'grant select, insert, update, delete on table public.whatsapp_mensajes to service_role';
  end if;
end $$;

comment on table public.comprador_avisos is
  'Avisos enviados al comprador. Máximo 2 por semana UTC (lunes). Email y WhatsApp del mismo lote cuentan como uno.';

comment on table public.whatsapp_mensajes is
  'Mensajes de WhatsApp. Los entrantes los guarda el webhook y se enlazan al comprador por teléfono.';

notify pgrst, 'reload schema';
