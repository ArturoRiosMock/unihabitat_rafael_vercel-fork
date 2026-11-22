# Migrations Supabase

> **Propósito:** Ordem e propósito dos ficheiros SQL do repositório.  
> **Público:** Desenvolvedores / DevOps.  
> **Última verificação:** 2026-11-19

## Ficheiros na raiz

| Ficheiro | Propósito |
|----------|-----------|
| `supabase-schema.sql` | Schema base: assets, compradores, vendedores, tareas, mensajes, notas, documentos, oportunidades, notificaciones, ofertas, RLS |
| `supabase-migration-excel-raw.sql` | Coluna `excel_raw` |
| `supabase-migration-map-columns.sql` | Colunas de mapa/coordenadas |
| `supabase-migration-comprador-assets.sql` | Tabela convites comprador ↔ imóvel |
| `supabase-migration-inmuebles-propiedades.sql` | **Separação Asset/Propiedad** — refactor principal |
| `supabase-migration-agentes.sql` | Permissões e atribuições vendedor |
| `supabase-dev-policies.sql` | Políticas RLS permissivas para desenvolvimento |
| `supabase-migration-categoria-libre.sql` | Remove CHECK de categoría; valores libres (Excel) |
| `supabase-migration-comprador-acceso.sql` | Coluna `compradores.acceso` (`sin_acceso` \| `activo`) |
| `supabase/migrations/20261109_assets_published_at.sql` | Coluna `assets.published_at` (última publicação; backfill com `created_at`) |
| `supabase/migrations/20261109_notas_admin_delete.sql` | DELETE de `notas` só com `is_admin()`. Sem política de borrado para agente ou comprador |
| `supabase/migrations/20261109_notas_select_visibilidad.sql` | `notas.author_id` + `notas.scope`. SELECT: agente só as suas notas de activo; comprador só as suas; notas privadas ficam no `notas_admin`. Não altera `notas_admin_delete` |
| `supabase/migrations/20261109_informacion_adicional_y_documentos_agente.sql` | Tabela `asset_informacion_adicional` (admin escreve, agente só SELECT) e `documentos_agente_select` para activos em `vendedor_assets`. Não mexe nas políticas de notas |
| `supabase/migrations/20261119_comentarios_autor_y_actividad.sql` | `author_role` nas notas, autor da informação adicional e do comentário da oferta, e `comprador_comentarios` (admin tudo; agente só o comprador atribuído). Idempotente. Staging; não produção neste passo |
| `supabase/migrations/20261119b_nda_aceptaciones_activo.sql` | `asset_nda_aceptaciones`. Unique (activo, utilizador, versão). RLS: admin tudo; agente e comprador só `user_id = auth.uid()` (não usa `vendedores`). Idempotente. Staging; não produção neste passo |
| `supabase/migrations/20261119c_compradores_gestion_agente.sql` | `compradores.ultima_gestion_agente_at` (filas existentes = `now()`) e `reasignado_inactividad_at`. Função `reasignar_compradores_inactivos` (90 dias, só `service_role`): desatribui, `agente = 'Admin'` e comentário de auditoria. Idempotente. Staging; não produção neste passo |
| `supabase/migrations/20261119d_compradores_datos_firma.sql` | `apellidos` (parte o `nombre` antigo pelo primeiro espaço, só se `apellidos` está vazio), `nombre_completo` gerado, tipo de pessoa, razão social, documento, morada, CP, população, província e país. Não altera RLS. Idempotente. Staging; não produção neste passo |
| `supabase/migrations/20261119e_propietario_contacto.sql` | Garante `propiedades.propietario` e `contacto` (mais telefone/email). O nome antigo fica em Propietario; Contacto vazio fica «—». Copia `assets.owner_*` só se a coluna da propriedade está vazia. Revoga o SELECT dessas colunas e de `excel_raw` a `anon`/`authenticated`. Idempotente. Staging; não produção neste passo |
| `supabase/migrations/20261119f_ofertas_workflow_clientes.sql` | Estados `realizada` → `firmada`, `fecha_firma`, `estado_legacy`, `oferta_historial` e índice do agente só quando a oferta não tem comprador. Idempotente. Staging; não produção neste passo |
| `supabase/migrations/20261119g_comprador_demanda_cruce.sql` | Demanda estruturada, oportunidades oferecidas (não repetir comprador+ativo) e resumo do lote. RLS admin / agente atribuído / comprador. Idempotente. Staging; não produção neste passo |
| `supabase/migrations/20261122a_portal_listing_indexes.sql` | Índices de listagem pública (`pub` + data, província, município, tipologia, preço, coordenadas) e `(inmueble_id, categoria)`. Não altera dados. Idempotente |

Situación não precisa de SQL: usa `propiedades.fase_interna`, criada em `supabase-migration-inmuebles-propiedades.sql`.
| `supabase-migration-documentos-bucket.sql` | Bucket privado `documentos` + RLS de storage. As descargas usam `createSignedUrl` (não `getPublicUrl`) |

## Ordem sugerida (novo ambiente)

1. `supabase-schema.sql`
2. Migrações incrementais por data/necessidade (excel-raw, map-columns, comprador-assets, inmuebles-propiedades, agentes, categoria-libre, comprador-acceso, `supabase/migrations/20261109_assets_published_at.sql`, `supabase/migrations/20261109_notas_admin_delete.sql`, `supabase/migrations/20261109_notas_select_visibilidad.sql`, `supabase/migrations/20261109_informacion_adicional_y_documentos_agente.sql`, `supabase/migrations/20261119_comentarios_autor_y_actividad.sql`, `supabase/migrations/20261119b_nda_aceptaciones_activo.sql`, `supabase/migrations/20261119c_compradores_gestion_agente.sql`, `supabase/migrations/20261119d_compradores_datos_firma.sql`, `supabase/migrations/20261119e_propietario_contacto.sql`, `supabase/migrations/20261119f_ofertas_workflow_clientes.sql`, `supabase/migrations/20261119g_comprador_demanda_cruce.sql`, `supabase-migration-documentos-bucket.sql`)
3. `supabase-dev-policies.sql` — **apenas dev**

**Atenção:** `supabase-migration-inmuebles-propiedades.sql` pode truncar dados legacy de assets — rever antes de aplicar em produção.

## Modelo actual

- **`assets`** — só imóvel físico (PK = referência catastral)
- **`propiedades`** — cargas NPL/CDR (FK `inmueble_id`)

Ver [modelo-dados.md](../arquitetura/modelo-dados.md).

## Scripts

| Script | Uso |
|--------|-----|
| `scripts/run-migration-agentes.mjs` | Aplica migration agentes |
| `scripts/fix-postgrest-schema.mjs` | GRANT + reload schema PostgREST |
| `scripts/test-supabase-connection.mjs` | Teste de ligação |

## Ficheiros relacionados

- [variaveis-ambiente.md](variaveis-ambiente.md)
- [`src/lib/supabase/db.ts`](../../src/lib/supabase/db.ts)
