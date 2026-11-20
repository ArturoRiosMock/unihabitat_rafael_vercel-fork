# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Full documentation:** see [docs/README.md](docs/README.md).

## Project Overview

PropCRM — a real estate CRM for managing NPL and CDR/REO property portfolios in Spain. Spanish-language domain (UI labels, field names, entity names are in Spanish). Two interfaces: admin panel and public buyer portal.

**Data model:** `Asset` = physical property (PK = cadastral reference). `Propiedad` = financial lien/collateral (N per asset). See [docs/arquitetura/modelo-dados.md](docs/arquitetura/modelo-dados.md).

## Commands

```bash
npm run dev      # Start Next.js dev server
npm run build    # Production build
npm run lint     # ESLint
npm run start    # Serve production build

npm run test     # Vitest (all unit tests)
npm run test:e2e # Playwright E2E
npm run test:all # Unit + data + E2E
```

Tests live in `src/__tests__/`. Standalone helpers: `catastro.py`, `scripts/` (`e2e-test.mjs`, `test-supabase-connection.mjs`, `geoapify-smoke.mjs`).

## Architecture

**Stack:** Next.js 16 + React 19 + TypeScript, Tailwind CSS 4, Supabase (auth + PostgreSQL)

**Path alias:** `@/*` maps to `./src/*`

### Two interfaces

- `/admin/*` — Internal CRM (assets, compradores, vendedores, tareas, ofertas, oportunidades, notificaciones, config). Middleware ([`src/middleware.ts`](src/middleware.ts)) requires `admin` or `vendedor`; `cliente` redirected to `/portal/privado`. Vendors blocked from `/admin/config`.
- `/portal/*` — Public property browsing. `/portal/privado/*` requires authentication.
- `/login` — Email/password auth. Redirects by role: `admin`/`vendedor` → `/admin`, `cliente` → `/portal/privado`.

**Dev-auth cookie** (`dev-auth`, JSON `{email, role, nombre}`) bypasses Supabase for local demo users. See `src/app/login/actions.ts` (`DEV_USERS`).

### Data flow

1. **Server actions** (`src/app/actions/`) — DB mutations. The only route handler is the cron `GET /api/cron/reasignar-compradores` (`CRON_SECRET`), which unassigns buyers after 90 days without agent activity. Listing buyers runs the same check.
2. **React Context** (`src/lib/context.tsx`) — client state with `refresh*` methods
3. **Row mappers** (`src/lib/supabase/db.ts`) — snake_case DB ↔ camelCase models

### Supabase clients

- `src/lib/supabase/client.ts` — Browser (anon key)
- `src/lib/supabase/server.ts` — Server + `createServiceClient()` (service-role)

### Key modules

- **Matching** (`src/lib/matching.ts`, `src/app/actions/matching.ts`) — buyer-asset scoring; threshold 25
- **Cruce de demanda** (`src/lib/cruce-demanda.ts`, `src/app/actions/cruce-demanda.ts`, `GET /api/cron/cruce-demanda`) — categoría, provincia y población; lunes y jueves 07:00 UTC. Email solo con `CRUCE_DEMANDA_EMAIL_ENABLED`
- **Excel import** (`src/lib/normalize-excel.ts`) — `parseTemplateExcel()` for CDR/NPL master template only (legacy Proveedor 1/2/3 removed). 1 Excel row → 1 Propiedad; same Referencia → 1 Asset (merge fill-empty). Upload: parse → `upsertAssets` + `upsertPropiedades` in [`UploadActivosModal.tsx`](src/app/admin/UploadActivosModal.tsx)
- **Catastro** (`src/lib/catastro/`, `src/app/actions/catastro.ts`, `maps.ts`) — manual enrichment via Spanish cadastre DNP + Geoapify; not automatic on Excel upload
- **Email** (`src/lib/email/`) — Resend; `EMAIL_DRY_RUN` for dev
- **Types** (`src/lib/types.ts`) — `Asset`, `Propiedad`, `Comprador`, `Vendedor`, etc.
- **Agent buyers** (`src/lib/comprador-gestion.ts`) — an agent only reads and writes buyers assigned in `vendedor_compradores`. Creating one assigns it to them. `ultima_gestion_agente_at` resets on agent create, ficha edit, call/action comment, or an offer linked to that buyer. After 90 days the buyer returns to the admin (`reasignar_compradores_inactivos`). UI warns when fewer than 15 days remain.

### Database

Schema: `supabase-schema.sql`; migrations: `supabase-migration-*.sql`; dev RLS: `supabase-dev-policies.sql`. Tables include `assets`, `propiedades`, `compradores`, `vendedores`, `oportunidades`, `ofertas`, `notificaciones`.

### Environment variables

Required in `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

Optional:
- `GEOAPIFY_API_KEY` / `NEXT_PUBLIC_GEOAPIFY_KEY` — geocoding and static maps
- `ASSET_UPSERT_AFTER_CATASTRO_ENRICH` — persist after Catastro enrich
- `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_SUPPORT`, `EMAIL_DRY_RUN`
- `CRUCE_DEMANDA_EMAIL_ENABLED`, `CRUCE_DEMANDA_LIMITE`
- `WHATSAPP_ENABLED`, `WHATSAPP_DRY_RUN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_TEMPLATE_OPORTUNIDADES`, `WHATSAPP_VERIFY_TOKEN`
- `CRON_SECRET` — bearer token for the 90-day buyer reassignment cron
- `NEXT_PUBLIC_APP_URL`, `APP_ORIGIN` — public URLs for emails and auth redirects

Full list: [docs/operacoes/variaveis-ambiente.md](docs/operacoes/variaveis-ambiente.md).

## Conventions

- Entity names in Spanish; DB snake_case; app camelCase via `db.ts` mappers
- Server actions one-per-entity in `src/app/actions/`
- UI: Lucide React, `clsx` + `tailwind-merge`

## Documentation maintenance

When changing behavior, update the relevant doc in `docs/`. See [docs/contribuir/manter-documentacao.md](docs/contribuir/manter-documentacao.md).
