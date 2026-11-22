# Rendimento do portal público

> **Propósito:** Explicar o que deixou de viajar em cada página e como medir.  
> **Público:** Dev / operação.  
> **Última verificação:** 2026-11-22

## O que mudou

- A home, o portal e o login **não** descarregam os ~4.600 activos. O `AppProvider` da raiz só resolve a sessão uma vez (não em cada navegação).
- `/admin` pede activos, compradores ou agentes conforme a rota (`src/lib/catalog-scope.ts`), com colunas de listagem (sem `excel_raw`).
- `/portal` pagina no servidor (24 ou 48 cartões), filtros `cat`, `prov`, `pob`, `tipo`, `q`, `sort`, `page`, `size`. O HTML já traz a primeira página.
- O mapa do listado só monta Leaflet ao premir «Mapa» e quando o contentor entra no viewport. Os marcadores vêm de `fetchPortalMapPoints` (`id`, `lat`, `lng`, preço) e agrupam-se por zoom.
- `xlsx` entra num chunk à parte, ao importar ou exportar.
- A ficha `/portal/inmueble/[slug]` declara `revalidate = 300` e cacheia a consulta com a tag `public-assets` (300 s). O HTML continua dinâmico porque os slugs não existem no build; a primeira visita não devolve 404. Gravar um activo no admin chama `revalidatePublicPortal`.
- `vercel.json` usa `regions: ["fra1"]`. Confirmar com a região Supabase de **produção** antes de promover. Não usar dados de staging no código.

## Migração

`supabase/migrations/20261122a_portal_listing_indexes.sql` — só índices, idempotente.

## Volume de prova

Não corre no build:

```bash
node scripts/seed-perf-assets.mjs --count 4600
node scripts/seed-perf-assets.mjs --delete
```

Exige `SUPABASE_URL` (ou `NEXT_PUBLIC_SUPABASE_URL`) e `SUPABASE_SERVICE_ROLE_KEY`. Os ids são `PERF-00001`… e `pub=true`. `--delete` só apaga esse prefixo.

## Ficheiros relacionados

- [server-actions.md](../arquitetura/server-actions.md)
- [deploy-vercel.md](deploy-vercel.md)
- `src/__tests__/portal-perf.test.ts`
