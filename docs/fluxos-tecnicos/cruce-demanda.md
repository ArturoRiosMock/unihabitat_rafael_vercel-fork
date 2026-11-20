# Cruce de demanda

> **Propósito:** Algoritmo que oferece ativos publicados segundo a demanda estruturada do comprador.  
> **Público:** Desenvolvedores e operação.  
> **Última verificação:** 2026-11-20

## O que não se reutilizou

`compradores.intereses` e `compradores.presupuesto` continuam a ser texto livre do scoring antigo (`oportunidades`). `compradores.provincia` e `compradores.poblacion` são a morada de firma, não a zona de procura. A demanda nova vive em `comprador_demanda`. As ofertas deste cruce gravam-se em `comprador_oportunidades`, não na tabela de score.

## Demanda

Uma fila por comprador:

- `categorias` — tipologia do imóvel (`assets.tip` e afins) e/ou categoria da carga (`propiedades.categoria`). «Vivienda» equivale a piso, casa, chalet. «NPL», «CDR» e valores livres do Excel comparam-se normalizados.
- `provincias` e `poblaciones` — listas. A comparação ignora maiúsculas, tildes e espaços repetidos.
- `precio_min` / `precio_max` — opcionais. Se houver intervalo e o ativo não tem preço, fica de fora.

## Cascata

Só ativos com `pub = true` que esse comprador ainda não tenha em `comprador_oportunidades` (único por comprador + ativo).

1. Categoria e população.
2. Se não houver nenhum: categoria e província.
3. Se não houver nenhum: população ou província, sem filtrar categoria.
4. Se a demanda não tem localização: só categoria.

Limite por envio: `CRUCE_DEMANDA_LIMITE` (defeito 5, máximo 50). O nível é o mesmo para todas as oportunidades desse comprador nessa execução.

A ficha do ativo (separador Clientes, só gestor) lista quem encaixa com **esse** ativo no melhor nível possível. Não é o mesmo conjunto que o envio semanal, que escolhe um único nível para o comprador.

## Quando corre

- Cron `GET /api/cron/cruce-demanda`, `Authorization: Bearer CRON_SECRET`. Agenda em `vercel.json`: `0 7 * * 1,4` (segunda e quinta, 07:00 UTC = 08:00 CET / 09:00 CEST).
- Gestor: `/admin/oportunidades`, «Lanzar cruce ahora».
- Agente ou gestor, na ficha do comprador: «Buscar oportunidades ahora» pré-visualiza; «Registrar estas oportunidades» grava.

O comprador edita a demanda e marca `interesado` ou `descartada` em `/portal/privado/demanda`. Não lança o cruce.

## Email

`CRUCE_DEMANDA_EMAIL_ENABLED` vem desligado. Com o flag ativo, o resumo vai ao comprador (cópia ao email do agente atribuído) via Resend. `EMAIL_DRY_RUN=true` regista o envio na consola e não chama a API. O corpo só leva tipologia, lugar, preço e o link da ficha pública. Não inclui referência catastral, dívida nem documentação.

## Permissões

A action devolve `{ ok, error }` e filtra no servidor com service role.

- Admin: tudo, incluindo o lote.
- Agente: demanda e oportunidades dos compradores em `vendedor_compradores`.
- Comprador: a sua demanda e as suas oportunidades.

RLS na migração `supabase/migrations/20261119g_comprador_demanda_cruce.sql` repete essa regra para a API. O histórico `cruce_demanda_ejecuciones` é só admin.

## Ficheiros

- [`src/lib/cruce-demanda.ts`](../../src/lib/cruce-demanda.ts) — lógica pura
- [`src/lib/cruce-demanda-run.ts`](../../src/lib/cruce-demanda-run.ts) — Supabase e email
- [`src/app/actions/cruce-demanda.ts`](../../src/app/actions/cruce-demanda.ts)
- [`src/app/api/cron/cruce-demanda/route.ts`](../../src/app/api/cron/cruce-demanda/route.ts)
- Testes: [`src/__tests__/cruce-demanda.test.ts`](../../src/__tests__/cruce-demanda.test.ts)

## Ficheiros relacionados

- [Matching por score](matching-engine.md)
- [Variáveis de ambiente](../operacoes/variaveis-ambiente.md)
- [Migrations](../operacoes/migrations-supabase.md)
