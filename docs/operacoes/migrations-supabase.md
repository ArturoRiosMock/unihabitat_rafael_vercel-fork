# Migrations Supabase

> **Propósito:** Ordem e propósito dos ficheiros SQL do repositório.  
> **Público:** Desenvolvedores / DevOps.  
> **Última verificação:** 2026-11-09

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
| `supabase-migration-documentos-bucket.sql` | Bucket privado `documentos` + RLS de storage. As descargas usam `createSignedUrl` (não `getPublicUrl`) |

## Ordem sugerida (novo ambiente)

1. `supabase-schema.sql`
2. Migrações incrementais por data/necessidade (excel-raw, map-columns, comprador-assets, inmuebles-propiedades, agentes, categoria-libre, comprador-acceso, `supabase/migrations/20261109_assets_published_at.sql`, `supabase/migrations/20261109_notas_admin_delete.sql`, `supabase-migration-documentos-bucket.sql`)
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
