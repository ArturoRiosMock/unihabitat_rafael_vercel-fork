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

## Deuda y Proceso

Fonte única: `propiedades.deuda` e `propiedades.proceso` da primeira carga (a dívida do listado e do export é a soma de todas as cargas).

| Onde | O que faz |
|------|-----------|
| Características | Só mostra. Admin e agente vêem o mesmo valor. Não há campos de edição. |
| Administrador | Único sítio onde se edita. Com `excel_raw`, guardar a folha copia as células **Deuda** / **Proceso** (alias **Precio de la deuda**) para essas colunas. Sem `excel_raw`, o formulário «Datos administrativos» grava a fila da propriedade (`updatePropiedadFields`), não a tabela `assets`. |
| Listado `/admin` | Colunas Deuda e Proceso (`getDeudaTotal`, `getProceso`). |
| Portal | NPL mostra a dívida (`getPortalPriceDisplay`). |
| Descargar Excel | Colunas Deuda e Proceso do mesmo accessor. |

Antes, a pestaña Administrador gravava o JSON `excel_raw` (ou, sem Excel, colunas inexistentes em `assets`). Características lia as colunas tipadas e não mudava.

## Situación (Características)

Na ficha `/admin/assets/[id]`, separador **Características**, coluna direita (por baixo de **Precio** e por cima de Deuda/Proceso):

- Etiqueta **Situación**, sempre visível.
- Valor = fase interna da primeira propriedade (`propiedades.fase_interna`). Não há coluna nova: o campo já vem da carga Excel **Fase Interna** (o export do ponto 4 chama a mesma coluna **Situación**; a carga também aceita esse alias).
- **Admin:** select com o enum de fase interna (Disponible, Seguimiento, Info. Solicitada, Ofertado, Negociación, Reservado, Cerrado, No Disponible) mais um valor legado se o Excel trouxe outro texto. Grava `fase_interna` e `fase_c` com `updatePropiedadFields`. É o mesmo campo do selector **Fase interna** no separador Administrador.
- **Agente:** só leitura, mesmo que possa editar outros campos da ficha.
- Vazio, espaços ou «—» → **—**. Sem propriedade associada, o admin também vê **—** (não há fila para gravar).

## Propiedades (cargas)

Tab admin mostra propiedades ligadas — dados de devedor, dívida, fase judicial, `excelRaw` editável.

## Documentos e notas

Upload de documentos (Supabase Storage) no separador **Documentación**. Já não há subseparador de notas: as notas do activo estão em **Características**.

Entre **Descripción del Activo** e **Notas del activo** fica o sítio livre para um futuro quadro **Información Adicional** (só admin escreve, todos lêem). Ainda não existe.

**Descargar** (ficha `/admin/assets/[id]` → **Documentación**, admin e agente) abre uma URL firmada (`createSignedUrl`, 1 h). O bucket `documentos` é privado: não usar `getPublicUrl`. O mesmo vale para **Documentos** em `/portal/privado/inmueble/[slug]`.

### Quem vê cada nota

| Secção | Quem escreve | Quem lê |
|--------|----------------|---------|
| Características → **Notas del activo** | Admin e agente (`scope = activo`) | O agente só as que ele criou. O admin vê todas, com autor e data. |
| Agentes → **Notas del agente** | Admin (a pestana é só admin) | O admin vê as notas de activo de todos os agentes. Um agente, se consultasse a action, só receberia as suas. |
| Administrador → **Notas privadas** | Só admin (`scope = privada`) | Só admin. Não aparecem em Características nem para agentes. |
| Portal → **Mis notas** | O comprador | Só esse comprador (e o admin, se pedir por `compradorId`). |

A regra está na server action `fetchNotas` / `createNota` e nas políticas SELECT. Não chega esconder a linha no ecrã.

### Apagar uma nota (só admin)

Na ficha `/admin/assets/[id]` — a lista chama-se **Propiedades** em `/admin` — o admin vê o botão **Borrar** em cada nota. Há confirmação (`¿Eliminar esta nota?`). A linha desaparece de `public.notas`.

| Separador (menu esquerdo da ficha) | Secção exacta |
|-------------------------------------|----------------|
| Características | **Notas del activo** |
| Agentes | **Notas del agente** |
| Administrador | **Notas privadas** |

Apagar numa secção tira a nota das outras que mostrassem a mesma linha.

O agente vê as suas notas em Características, **sem** botão. Não apaga notas próprias nem alheias. No portal, **Mis notas** (`/portal/privado/inmueble/[slug]`) não tem apagar.

Os comentários de uma oferta (`ofertas.comentarios`) não são notas e não se apagam aqui.

SQL idempotente:

- DELETE: [`supabase/migrations/20261109_notas_admin_delete.sql`](../../supabase/migrations/20261109_notas_admin_delete.sql). A action `deleteNota` exige rol admin e usa service role (o admin demo com cookie `dev-auth` pode não cumprir `is_admin()`). A política `notas_admin_delete` mantém-se.
- SELECT: [`supabase/migrations/20261109_notas_select_visibilidad.sql`](../../supabase/migrations/20261109_notas_select_visibilidad.sql). Colunas `author_id` e `scope` (`activo` \| `privada`). `notas_agente_select` e `notas_comprador_select`. Não cria DELETE para agente nem comprador.

## Ficheiros relacionados

- [`src/app/admin/assets/[id]/page.tsx`](../../src/app/admin/assets/[id]/page.tsx)
- [`src/app/actions/invitations.ts`](../../src/app/actions/invitations.ts)
