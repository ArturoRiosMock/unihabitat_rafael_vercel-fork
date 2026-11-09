# Portal do comprador

> **Propósito:** Guia da experiência do comprador no portal público e privado.  
> **Público:** Operação e suporte.  
> **Última verificação:** 2026-11-09

## Portal público (`/portal`)

Qualquer visitante pode:

- Ver catálogo de imóveis **publicados** (`pub=true`)
- Filtrar por província, tipo, categoria CDR/NPL, preço
- Ver mapa interactivo
- Abrir ficha `/portal/[id]`

**Dados sensíveis** (localização exacta, contactos devedor, etc.) ficam ocultos para visitantes não autenticados.

A ficha pública (`/portal/[id]` e `/portal/inmueble/[slug]`) mostra **Situación** só em leitura na secção **Características**. É a fase interna (`propiedades.fase_interna`), o mesmo valor da ficha admin. Vazio → «—». O comprador não edita. Os filtros do catálogo continuam sem Situación (pedido anterior: ocultar esse filtro e deixar só categoria, província, população e tipologia).

Staff (admin/vendedor autenticado) vê o catálogo completo, incluindo não publicados.

## Portal privado (`/portal/privado`)

Requer login (role `cliente` ou staff).

O comprador vê:

1. **Imóveis públicos** — mesmos que `/portal`
2. **Imóveis convidados** — activos partilhados pelo admin via `comprador_assets`
3. **Favoritos** — imóveis guardados pelo comprador

### Ficha do imóvel (autenticado)

- **Información completa** (`/portal/privado/inmueble/[slug]`, separador Información) inclui **Situación** só em leitura. Mesma origem que a ficha pública. Vazio → «—».
- Dados sensíveis visíveis conforme permissões
- **Solicitar información** — formulario → email interno ([`email-info-request.ts`](../../src/app/actions/email-info-request.ts))
- **Submeter oferta** — valor em € + comentários → fluxo em `/portal/privado/ofertas`

## Ofertas (`/portal/privado/ofertas`)

- Lista propostas do comprador
- Estados: pendente, validada, rejeitada
- Fluxo **NDA**: admin pode enviar NDA; comprador firma via `firmarNDA`

Emails automáticos para vendedor atribuído ou suporte (`EMAIL_SUPPORT`) quando nova oferta.

## Registo de comprador

- Sign-up em `/login` cria utilizador Supabase + registo `comprador` via `upsertComprador`
- Conta demo: `cliente@propcrm.com` / `Cliente1234!`

## Convites do admin

Admin convida comprador a ver imóvel específico:

- Action `inviteCompradorToAsset` em [`invitations.ts`](../../src/app/actions/invitations.ts)
- Notificação in-app + email
- Revogar: `revokeCompradorFromAsset`

## Contacto geral

`/portal/contacto` — formulário → [`contacto.ts`](../../src/app/actions/contacto.ts) → email suporte.

## Ficheiros relacionados

- [`src/app/portal/`](../../src/app/portal/)
- [`src/hooks/usePortalAuth.ts`](../../src/hooks/usePortalAuth.ts)
- [`src/hooks/useFavoritos.ts`](../../src/hooks/useFavoritos.ts)
- [`src/app/actions/ofertas.ts`](../../src/app/actions/ofertas.ts)
