# Server actions — catálogo

> **Propósito:** Referência das server actions por entidade.  
> **Público:** Desenvolvedores.  
> **Última verificação:** 2026-11-19

Todas em `src/app/actions/`. Padrão: `"use server"`, auth via `auth-server.ts`, writes com `createServiceClient()`.

## Assets e propiedades

**[`assets.ts`](../../src/app/actions/assets.ts)**

| Função | Descrição |
|--------|-----------|
| `fetchAssets` | Lista admin (colunas do listado, sem `excel_raw`). Só a carrega o ecrã que a usa |
| `fetchPublicAssets` | Imóveis publicados (portal) — já não alimenta cada página |
| `fetchPortalListing` / `fetchPortalMapPoints` / `fetchPortalFilterOptions` | Listagem `/portal`: uma página, filtros na query string, marcadores leves. Tipos em `src/lib/portal-listing.ts` |
| `fetchAssetsByIds` | Batch por IDs |
| `fetchAssetById` / `fetchAssetByIdForAdmin` | Detalhe |
| `fetchPropiedades` / `fetchPropiedadesPublic` | Cargas |
| `fetchPropiedadesByInmuebleIds` | Cargas por imóveis |
| `upsertAssets` | Import Excel — inmuebles |
| `upsertPropiedades` | Import Excel — propiedades |
| `toggleAssetPub` | Publicar/despublicar |
| `updateAssetFields` | Edição parcial do inmueble |
| `updatePropiedadFields` | Edição parcial da carga (deuda, proceso, fase interna) |
| `updatePropiedadExcelRaw` | Actualizar excel raw e projectar Deuda/Proceso para as colunas |
| `deleteAssetsByIds` | Eliminação dos imóveis seleccionados (por IDs). Não existe eliminação de todos os activos. |
| `toggleAssetFav` | Favorito admin |

## Compradores

**[`compradores.ts`](../../src/app/actions/compradores.ts)**

| Função | Descrição |
|--------|-----------|
| `fetchCompradores` / `fetchCompradorById` | Leitura com service role. Admin: todos. Agente: só os seus. Ao listar, aplica a reatribuição dos 90 dias. Cliente: lista vazia |
| `fetchCompradorByEmail` | Lookup por email |
| `ensureCompradorForEmail` | Liga auth user ao CRM. Se o nome chega inteiro, parte-o em nome e apelidos |
| `createComprador` / `updateCompradorFields` | Alta e ficha. Admin e o agente atribuído. A ficha inclui os dados de firma. A edição devolve `{ ok: false, error }` (p.ex. «No tienes acceso a este comprador») em vez de `throw`, para a UI mostrar o texto |
| `updateMisDatosComprador` | O próprio comprador grava a ficha de firma. O email fica o da conta |
| `upsertComprador` | Criar/actualizar |

## Vendedores (agentes)

**[`vendedores.ts`](../../src/app/actions/vendedores.ts)**

| Função | Descrição |
|--------|-----------|
| `fetchVendedores` / `fetchVendedorById` | Leitura |
| `createVendedor` | Criar + convite Supabase Auth |
| `reinviteVendedor` | Reenviar convite |
| `updateVendedor` / `deleteVendedor` | CRUD |
| `setCompradorAgente` / `setAssetAgente` | Atribuir agente |
| `getCompradorAgente` / `getAssetAgente` | Consultar agente |

## Permissões vendedor

**[`permissions.ts`](../../src/app/actions/permissions.ts)**

| Função | Descrição |
|--------|-----------|
| `fetchVendorPermissions` / `upsertVendorPermissions` | ACL por secção |
| `fetchVendorAssignedAssetIds` / `fetchVendorAssignedCompradorIds` | Atribuições |
| `assignAssetToVendor` / `unassignAssetFromVendor` | M:N assets |
| `assignCompradorToVendor` / `unassignCompradorFromVendor` | M:N compradores |

## Matching

**[`matching.ts`](../../src/app/actions/matching.ts)**

| Função | Descrição |
|--------|-----------|
| `computeMatchesForAsset` | Recalcular matches de um imóvel |
| `computeMatchesForComprador` | Recalcular matches de um comprador |
| `fetchOportunidadesByAsset` / `fetchOportunidadesByComprador` | Listar oportunidades |

## Cruce de demanda

**[`cruce-demanda.ts`](../../src/app/actions/cruce-demanda.ts)** — devolve `{ ok, error }`. Tipos em `src/lib/cruce-demanda.ts`.

| Função | Descrição |
|--------|-----------|
| `fetchDemandaComprador` / `guardarDemandaComprador` | Admin, agente atribuído ou o próprio comprador |
| `fetchOportunidadesComprador` | Oportunidades já oferecidas |
| `buscarOportunidadesComprador` | Pré-visualiza sem gravar. Admin ou agente atribuído |
| `registrarOportunidadesComprador` | Grava as novas. Email só com `CRUCE_DEMANDA_EMAIL_ENABLED` |
| `marcarOportunidadEstado` | Comprador: `interesado` ou `descartada`. Staff com acesso: qualquer estado |
| `fetchCompradoresEncajeActivo` | Só o gestor, na ficha do ativo |
| `fetchUltimoCruceDemanda` / `lanzarCruceDemandaManual` | Só o gestor |

## Ofertas

**[`ofertas.ts`](../../src/app/actions/ofertas.ts)**

| Função | Descrição |
|--------|-----------|
| `createOferta` | Comprador submete proposta em estado `realizada`. Exige a ficha de firma. Devolve `{ ok: true, oferta }` ou `{ ok: false, error }`. Duplicado: «Este comprador ya tiene una oferta en este activo» |
| `createOfertaAdmin` | Admin ou agente. Com comprador, a mesma validação. Sem comprador, a oferta fica em nome do agente. Mesmo resultado `{ ok }` |
| `fetchOfertas` / `fetchOfertasByAsset` | Admin vê todas. Agente só as suas e as dos compradores que gere. Exige sessão admin ou agente |
| `fetchOfertasByComprador` | Admin, o agente atribuído, ou o próprio comprador |
| `fetchOfertasPendientes` | `realizada` e `contraofertada`, com o mesmo filtro de agente |
| `updateOfertaEstado` | Transições válidas no servidor. Devolve `{ ok: false, error }` (p.ex. «No se puede pasar de … a …»). Contraoferta grava importe e nota na mesma oferta e no histórico. `firmada` exige data. Não envia email ao comprador |
| `firmarNDA` | Já não muda o estado. O NDA assina-se na documentação do activo |
| `fetchClientesInteresados` | [`asset-clientes.ts`](../../src/app/actions/asset-clientes.ts). Compradores atribuídos, com favorito ou com NDA do activo. Sem duplicar. O agente só vê os seus |

## Convites comprador ↔ imóvel

**[`invitations.ts`](../../src/app/actions/invitations.ts)**

| Função | Descrição |
|--------|-----------|
| `inviteCompradorToAsset` | Partilhar imóvel |
| `revokeCompradorFromAsset` | Revogar acesso |
| `fetchInvitedCompradores` / `fetchInvitedAssetIds` | Consultas |

## Catastro e mapas

**[`catastro.ts`](../../src/app/actions/catastro.ts)** — `refreshAssetCatastro(assetId)`

**[`maps.ts`](../../src/app/actions/maps.ts)** — `backfillMissingMaps`, `backfillUploadedMaps`

## Email e contacto

**[`contacto.ts`](../../src/app/actions/contacto.ts)** — `enviarContacto`

**[`email-info-request.ts`](../../src/app/actions/email-info-request.ts)** — `enviarSolicitudInformacion`

## Notificações

**[`notificaciones.ts`](../../src/app/actions/notificaciones.ts)** — CRUD notificações + espelho email

## Tarefas, notas, mensagens, documentos

| Ficheiro | Funções principais |
|----------|-------------------|
| [`tareas.ts`](../../src/app/actions/tareas.ts) | `fetchTareas`, `upsertTarea`, `toggleTareaDone` |
| [`notas.ts`](../../src/app/actions/notas.ts) | `fetchNotas` (agente: só as suas; admin: todas do `scope`; autor admin sai como «Gestor»), `createNota` (grava `author_role` da sessão), `deleteNota` (só admin; agentes não apagam notas próprias nem alheias) |
| [`comprador-comentarios.ts`](../../src/app/actions/comprador-comentarios.ts) | `fetchCompradorComentarios`, `createCompradorComentario`. Admin: todos. Agente: só o comprador que gere. Sem acesso: `{ ok: false, error: "No tienes acceso a este comprador" }` |
| [`mensajes.ts`](../../src/app/actions/mensajes.ts) | `fetchMensajes`, `sendMensaje` |
| [`informacion-adicional.ts`](../../src/app/actions/informacion-adicional.ts) | `fetchInformacionAdicional` (admin e agente), `saveInformacionAdicional` (só admin) |
| [`documentos.ts`](../../src/app/actions/documentos.ts) | Lista e URL firmada (`createSignedUrl`, bucket privado, 1 h). Agente: `vendedor_assets` e NDA do activo. Comprador: o seu `comprador_id` e, se o ficheiro é do activo, o NDA. Admin sem NDA. `getAssetDocumentosGate`, `acceptAssetNda`, `fetchAssetNdaSigners` |

## Favoritos e sessão

**[`favoritos.ts`](../../src/app/actions/favoritos.ts)** — `fetchFavoritosByComprador`, `addFavorito`, `removeFavorito`

**[`session.ts`](../../src/app/actions/session.ts)** — `fetchCurrentSession`

## Diagnósticos

**[`diagnostics.ts`](../../src/app/actions/diagnostics.ts)** — `pingGeoapify`, `fetchRecentGeoEvents`

## Ficheiros relacionados

- [`src/lib/auth-server.ts`](../../src/lib/auth-server.ts) — `requireAdmin`, `requireEditPermission`
- [visao-geral.md](visao-geral.md)
