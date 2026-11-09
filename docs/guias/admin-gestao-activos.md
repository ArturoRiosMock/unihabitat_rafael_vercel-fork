# Gestão de activos (guia admin)

> **Propósito:** Operações na ficha e lista de imóveis no admin.  
> **Público:** Operação / admin.  
> **Última verificação:** 2026-11-09

## Lista `/admin`

- Filtrar e pesquisar activos
- Clicar numa linha abre a ficha `/admin/assets/[id]` **noutra aba** (`target="_blank"`, `rel="noopener noreferrer"`). Filtros, pesquisa, ordenação, página e favoritos ficam no separador do listado — vivem em estado React e perdem-se se a página desmontar.
- O mesmo critério aplica-se ao catálogo `/portal` (pesquisa, ordenação, página e vista lista/mapa não vão na URL) e ao título do activo em `/admin/ofertas` (filtro de estado). Categoria, província, população e tipologia do portal já persistem na query string.
- Upload Excel — ver [admin-importar-excel.md](admin-importar-excel.md)
- Eliminar os activos seleccionados (só admin). Não há «Borrar todos».
- **Descargar Excel**: se há linhas marcadas dentro do filtro, exporta só essas; se não há seleção, exporta todos os activos que passam o filtro (todas as páginas). O ficheiro chama-se `activos-AAAA-MM-DD.xlsx`.
- Ordenar por **F. publicación** (primeiro clique: mais recente; segundo: mais antiga). Activos sem data ficam no fim. A coluna usa `published_at` e, se ainda não existir, `created_at` dos que já estão publicados.
- Toggle favorito admin

## Publicar no portal

- Abrir ficha `/admin/assets/[id]`
- Activar **Publicar** (`pub=true`) — imóvel visível em `/portal` e grava `published_at` (agora)
- Despublicar remove do catálogo público (mantém no CRM) e **conserva** `published_at` (última data de publicação). Voltar a publicar actualiza o selo.

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

**Descargar** (ficha `/admin/assets/[id]` → **Documentación**, admin e agente) abre uma URL firmada (`createSignedUrl`, 1 h). O bucket `documentos` é privado: não usar `getPublicUrl`. O mesmo vale para **Documentos** em `/portal/privado/inmueble/[slug]`.

### Apagar uma nota (só admin)

Na ficha `/admin/assets/[id]` — a lista chama-se **Propiedades** em `/admin` — o admin vê o botão **Borrar** em cada nota. Há confirmação (`¿Eliminar esta nota?`). A linha desaparece de `public.notas`.

| Separador (menu esquerdo da ficha) | Secção exacta |
|-------------------------------------|----------------|
| Características | **Notas del activo** |
| Documentación → subseparador **Notas** | **Notas y aclaraciones** |
| Agentes | **Notas del agente** |
| Administrador | **Notas privadas** |

São a mesma tabela. Apagar numa secção tira a nota das outras.

O agente vê notas em Características e Documentación, **sem** botão. Não apaga notas próprias nem alheias: antes também não podia, e fica assim. No portal, **Mis notas** (`/portal/privado/inmueble/[slug]`) não tem apagar — o comprador não apaga; o admin pode apagar essa mesma linha na ficha.

Os comentários de uma oferta (`ofertas.comentarios`) não são notas e não se apagam aqui.

SQL idempotente: [`supabase/migrations/20261109_notas_admin_delete.sql`](../../supabase/migrations/20261109_notas_admin_delete.sql). A action `deleteNota` exige rol admin e usa service role (o admin demo com cookie `dev-auth` pode não cumprir `is_admin()`).

## Ficheiros relacionados

- [`src/app/admin/assets/[id]/page.tsx`](../../src/app/admin/assets/[id]/page.tsx)
- [`src/app/actions/invitations.ts`](../../src/app/actions/invitations.ts)
