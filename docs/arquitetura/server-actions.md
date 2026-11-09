# Server actions — catálogo

> **Propósito:** Referência das server actions por entidade.  
> **Público:** Desenvolvedores.  
> **Última verificação:** 2026-11-06

Todas em `src/app/actions/`. Padrão: `"use server"`, auth via `auth-server.ts`, writes com `createServiceClient()`.

## Assets e propiedades

**[`assets.ts`](../../src/app/actions/assets.ts)**

| Função | Descrição |
|--------|-----------|
| `fetchAssets` | Lista completa (admin) |
| `fetchPublicAssets` | Imóveis publicados (portal) |
| `fetchAssetsByIds` | Batch por IDs |
| `fetchAssetById` / `fetchAssetByIdForAdmin` | Detalhe |
| `fetchPropiedades` / `fetchPropiedadesPublic` | Cargas |
| `fetchPropiedadesByInmuebleIds` | Cargas por imóveis |
| `upsertAssets` | Import Excel — inmuebles |
| `upsertPropiedades` | Import Excel — propiedades |
| `toggleAssetPub` | Publicar/despublicar |
| `updateAssetFields` | Edição parcial |
| `updatePropiedadExcelRaw` | Actualizar excel raw |
| `deleteAssetsByIds` | Eliminação dos imóveis seleccionados (por IDs). Não existe eliminação de todos os activos. |
| `toggleAssetFav` | Favorito admin |

## Compradores

**[`compradores.ts`](../../src/app/actions/compradores.ts)**

| Função | Descrição |
|--------|-----------|
| `fetchCompradores` / `fetchCompradorById` | Leitura |
| `fetchCompradorByEmail` | Lookup por email |
| `ensureCompradorForEmail` | Liga auth user ao CRM |
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

## Ofertas

**[`ofertas.ts`](../../src/app/actions/ofertas.ts)**

| Função | Descrição |
|--------|-----------|
| `createOferta` | Comprador submete proposta |
| `fetchOfertasByAsset` / `fetchOfertasByComprador` | Listagens |
| `fetchOfertasPendientes` | Admin — pendentes |
| `updateOfertaEstado` | Validar/rejeitar |
| `firmarNDA` | Comprador assina NDA |

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
| [`notas.ts`](../../src/app/actions/notas.ts) | `fetchNotas`, `createNota`, `deleteNota` (só admin; agentes não apagam notas próprias nem alheias) |
| [`mensajes.ts`](../../src/app/actions/mensajes.ts) | `fetchMensajes`, `sendMensaje` |
| [`documentos.ts`](../../src/app/actions/documentos.ts) | Upload/download. `getDocumentUrl` devolve `createSignedUrl` (bucket privado, TTL 1 h) |

## Favoritos e sessão

**[`favoritos.ts`](../../src/app/actions/favoritos.ts)** — `fetchFavoritosByComprador`, `addFavorito`, `removeFavorito`

**[`session.ts`](../../src/app/actions/session.ts)** — `fetchCurrentSession`

## Diagnósticos

**[`diagnostics.ts`](../../src/app/actions/diagnostics.ts)** — `pingGeoapify`, `fetchRecentGeoEvents`

## Ficheiros relacionados

- [`src/lib/auth-server.ts`](../../src/lib/auth-server.ts) — `requireAdmin`, `requireEditPermission`
- [visao-geral.md](visao-geral.md)
