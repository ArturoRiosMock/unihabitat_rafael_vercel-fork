# Portal do comprador

> **Propósito:** Guia da experiência do comprador no portal público e privado.  
> **Público:** Operação e suporte.  
> **Última verificação:** 2026-11-19

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
- **Submeter oferta** — valor em € + comentários → fluxo em `/portal/privado/ofertas`. O comentário mostra autor e data/hora (admin lê-se «Gestor»). A oferta traz a ficha do comprador já preenchida (nome, apelidos, documento, morada, telefone, email). Se faltar algum dado obrigatório, o formulário pede-o e grava-o na ficha antes de enviar. Com a ficha completa, só se revê e envia
- **Mis datos** (`/portal/privado/datos`) — o comprador edita essa ficha e vê «Datos completos» ou «Faltan: …»
- **Mi demanda** (`/portal/privado/demanda`) — categorias, províncias, populações e intervalo de preço. Vê as oportunidades já oferecidas e marca interessado ou descartada. O email semanal só sai se `CRUCE_DEMANDA_EMAIL_ENABLED` estiver ativo; o link é a ficha pública
- **Documentos** — só se o comprador está convidado a esse activo (`comprador_assets`). Sem convite, a ficha pública continua visível e a documentação mostra «Acceso denegado»: não há formulário de NDA nem ficheiros. Com convite, aceita o NDA **desse** activo (texto provisional, versão em `src/lib/nda.ts`) antes de listar ou descarregar. Sem aceitação o servidor não devolve a lista nem a URL firmada. Documentos sem `asset_id` que já sejam só dele continuam visíveis. O agente não muda: continua a depender de `vendedor_assets` e do NDA do activo.

## Ofertas (`/portal/privado/ofertas`)

A sessão é a unificada (`fetchCurrentSession` / `getServerSession`): cookie dev-auth ou sessão Supabase. O comprador resolve-se pelo email dessa sessão. As outras páginas de `/portal/privado` já liam a sessão Supabase no cliente ou no layout; esta lista era a que só via a cookie de demo.

- Lista propostas do comprador
- Estados: oferta realizada, contraofertada, rejeitada, aceite, documentação PBC, data de firma
- O NDA **não** se assina nesta lista. Assina-se na documentação de cada activo

Emails automáticos para vendedor atribuído ou suporte (`EMAIL_SUPPORT`) quando há uma oferta nova. Mudar o estado não escreve ao comprador. O envio passa por `EMAIL_DRY_RUN`.

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
