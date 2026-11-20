# Variáveis de ambiente

> **Propósito:** Referência consolidada de env vars.  
> **Público:** Desenvolvedores e DevOps.  
> **Fonte canónica:** [`.env.example`](../../.env.example)  
> **Última verificação:** 2026-06-12

## Obrigatórias

| Variável | Descrição |
|----------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave pública anon |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave service-role (**segredo**; só servidor) |

Sem estas três, a app não liga à base de dados.

## Catastro e mapas (opcional)

| Variável | Default | Descrição |
|----------|---------|-----------|
| `GEOAPIFY_API_KEY` | — | Geocodificação e mapas no servidor |
| `NEXT_PUBLIC_GEOAPIFY_KEY` | — | Mapas no cliente (fallback se falta server key) |
| `ASSET_UPSERT_AFTER_CATASTRO_ENRICH` | `false` | Se `true`, persiste asset após enrich Catastro |

## Email — Resend (opcional)

| Variável | Default | Descrição |
|----------|---------|-----------|
| `RESEND_API_KEY` | — | API key Resend (domínio verificado) |
| `EMAIL_FROM` | `Unihabitat <info@unihabitat.net>` | Remetente |
| `EMAIL_SUPPORT` | `info@unihabitat.net` | Destino formularios e ofertas sem vendedor |
| `EMAIL_DRY_RUN` | `false` | `true` = log only, sem envio |

Sem `RESEND_API_KEY`, `sendEmail()` devolve `ok: false` com mensagem clara.

## Cron — compradores sin gestión (opcional en local, obligatorio en Vercel)

| Variável | Default | Descrição |
|----------|---------|-----------|
| `CRON_SECRET` | — | Segredo das rotas `GET /api/cron/reasignar-compradores` e `GET /api/cron/cruce-demanda`. A Vercel envia `Authorization: Bearer <CRON_SECRET>`. Sem o valor, a rota responde 401. O cron de inatividade está em `vercel.json` (todos os dias às 04:15 UTC). O cruce de demanda corre segunda e quinta às 07:00 UTC (08:00 CET / 09:00 CEST). |
| `CRUCE_DEMANDA_EMAIL_ENABLED` | `false` | `true` envia o resumo de oportunidades ao comprador (cópia ao agente). Qualquer outro valor, ou a variável ausente, só grava no CRM. |
| `CRUCE_DEMANDA_LIMITE` | `5` | Máximo de oportunidades novas por comprador em cada envio (teto 50). |
| `WHATSAPP_ENABLED` | `false` | `true` activa WhatsApp Cloud API y el webhook `/api/whatsapp/webhook`. Cualquier otro valor lo deja apagado. |
| `WHATSAPP_DRY_RUN` | `true` | Vacío o `true`: solo log. `false` llama a la API de Meta. |
| `WHATSAPP_PHONE_NUMBER_ID` | — | Id del número de WhatsApp Business. |
| `WHATSAPP_ACCESS_TOKEN` | — | Token de la Cloud API. Secreto. |
| `WHATSAPP_TEMPLATE_OPORTUNIDADES` | — | Plantilla con cuerpo `{{1}}` nombre y `{{2}}` resumen. |
| `WHATSAPP_VERIFY_TOKEN` | — | Token que Meta envía en el GET de verificación del webhook. |

## URLs públicas

| Variável | Descrição |
|----------|-----------|
| `NEXT_PUBLIC_APP_URL` | URL base para emails e redirects (build-time) |
| `APP_ORIGIN` | Origem canónica **servidor** (ex. `https://www.unihabitat.net`); prioridade sobre `NEXT_PUBLIC_APP_URL` em links Auth |

Importante em Vercel: evitar magic links para `localhost` — usar `APP_ORIGIN` em produção.

## Não utilizadas activamente

| Variável | Nota |
|----------|------|
| `ANTHROPIC_API_KEY` | SDK presente; sem pipeline IA no código actual |

## Vercel

Configurar as mesmas variáveis no dashboard Vercel (Production + Preview). `SUPABASE_SERVICE_ROLE_KEY` e `RESEND_API_KEY` como **secret**.

Ver [deploy-vercel.md](deploy-vercel.md).

## Ficheiros relacionados

- [`.env.example`](../../.env.example)
- [`src/lib/email/send.ts`](../../src/lib/email/send.ts)
- [`src/lib/catastro/geoapify.ts`](../../src/lib/catastro/geoapify.ts)
