# Gestão de activos (guia admin)

> **Propósito:** Operações na ficha e lista de imóveis no admin.  
> **Público:** Operação / admin.  
> **Última verificação:** 2026-11-06

## Lista `/admin`

- Filtrar e pesquisar activos
- Clicar numa linha abre a ficha `/admin/assets/[id]` **noutra aba** (`target="_blank"`, `rel="noopener noreferrer"`). Filtros, pesquisa, ordenação, página e favoritos ficam no separador do listado — vivem em estado React e perdem-se se a página desmontar.
- O mesmo critério aplica-se ao catálogo `/portal` (pesquisa, ordenação, página e vista lista/mapa não vão na URL) e ao título do activo em `/admin/ofertas` (filtro de estado). Categoria, província, população e tipologia do portal já persistem na query string.
- Upload Excel — ver [admin-importar-excel.md](admin-importar-excel.md)
- Eliminar em massa (seleccionados) e «Borrar todos» (só admin) — inalterados
- Toggle favorito admin

## Publicar no portal

- Abrir ficha `/admin/assets/[id]`
- Activar **Publicar** (`pub=true`) — imóvel visível em `/portal`
- Despublicar remove do catálogo público (mantém no CRM)

## Refresh Catastro

Quando mapa ou dados cadastrais estão incompletos:

1. Abrir ficha do imóvel
2. Usar acção **Refresh Catastro** (requer admin)
3. Sistema consulta cadastro espanhol + Geoapify
4. Preenche campos vazios (ou overwrite se forçado)

Ver [enriquecimento-catastro.md](../fluxos-tecnicos/enriquecimento-catastro.md).

## Convites a compradores

Na ficha do imóvel — secção clientes convidados:

- **Convidar** comprador → vê imóvel em `/portal/privado` mesmo se não publicado
- **Revogar** remove acesso

## Agentes

Atribuir vendedor ao imóvel ou comprador na ficha ou secção Agentes.

## Propiedades (cargas)

Tab admin mostra propiedades ligadas — dados de devedor, dívida, fase judicial, `excelRaw` editável.

## Documentos e notas

Upload documentos (Supabase Storage), notas internas, mensagens na ficha.

## Ficheiros relacionados

- [`src/app/admin/assets/[id]/page.tsx`](../../src/app/admin/assets/[id]/page.tsx)
- [`src/app/actions/invitations.ts`](../../src/app/actions/invitations.ts)
