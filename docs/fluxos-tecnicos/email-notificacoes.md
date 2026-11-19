# Email e notificações

> **Propósito:** Fluxo de envio de email e espelho de notificações.  
> **Público:** Desenvolvedores.  
> **Última verificação:** 2026-06-12

## Stack

- **Resend** — API de envio
- **Templates** — HTML/texto em [`templates.ts`](../../src/lib/email/templates.ts)
- **Wrapper** — [`send.ts`](../../src/lib/email/send.ts)

## Modos

| Modo | Condição | Comportamento |
|------|----------|---------------|
| Dry-run | `EMAIL_DRY_RUN=true` | Log na consola; `ok: true` simulado |
| Produção | `RESEND_API_KEY` definida | Envio real via Resend |
| Desactivado | Sem API key | `ok: false` + mensagem |

## Casos de uso

| Trigger | Action | Destinatário |
|---------|--------|--------------|
| Formulário contacto | `contacto.ts` | `EMAIL_SUPPORT` |
| Solicitar información | `email-info-request.ts` | Suporte + dados do imóvel |
| Nova oferta | `ofertas.ts` | Vendedor atribuído ou suporte. Respeita `EMAIL_DRY_RUN` |
| Mudança de estado da oferta | — | Não envia email ao comprador (`OFERTA_ESTADO_EMAIL_COMPRADOR` está desligado) |
| Notificação in-app | `notificaciones.ts` | Espelho email ao utilizador |
| Convite agente | `agente-invite.ts` | Email Supabase magic link |

Ofertas **sem vendedor atribuído** → assunto marcado + envio para suporte.

## Notificações in-app

Tabela `notificaciones`. CRUD em [`notificaciones.ts`](../../src/app/actions/notificaciones.ts).

Tipos: convites, matches, alterações de oferta, etc.

## Configuração

Ver [variaveis-ambiente.md](../operacoes/variaveis-ambiente.md):

- `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_SUPPORT`, `EMAIL_DRY_RUN`
- Domínio remetente verificado no painel Resend

## Ficheiros relacionados

- [`src/lib/email/send.ts`](../../src/lib/email/send.ts)
- [`src/lib/email/resend.ts`](../../src/lib/email/resend.ts)
- [integracoes.md](../arquitetura/integracoes.md)
