# Importar Excel (guia admin)

> **Propósito:** Passo a passo operacional para upload de carteira CDR/NPL.  
> **Público:** Operação / admin.  
> **Pré-requisitos:** Acesso `/admin` com role admin ou vendedor.  
> **Última verificação:** 2026-06-12

## Onde importar

1. Entrar em **`/admin`** (lista de Activos)
2. Clicar no botão de **upload / importar Excel** (abre `UploadActivosModal`)
3. Selecionar ficheiro `.xlsx` ou `.xls`

## Formato esperado

Usar a **plantilla maestra CDR/NPL** (ex.: `Plantilla subidas Master Ejemplo NPL.xlsx` na raiz do projeto como referência).

Colunas obrigatórias mínimas:

- **`Referencia`** — referência catastral (identificador do imóvel)
- **`ID1`** — agrupador de propiedades do mesmo activo/préstamo
- **`Categoria`** — `CDR` ou `NPL`

Outras colunas comuns: Propietario, Contacto, Provincia, Municipio, Precio, Deuda, Publicar, Bien, Dirección Completa, Latitud, Longitud. Uma folha antiga só com `Propietario / Vendedor` continua a carregar: o nome vai para Propietario e Contacto fica vazio.

**Não são aceites** formatos antigos de múltiplos proveedores (Proveedor 1/2/3).

## Passos do modal

| Passo | O que acontece |
|-------|----------------|
| 1. Leer Excel | Parser valida cabeçalhos e extrai inmuebles + propiedades |
| 2. Guardar en base de datos | Gravação em Supabase; lista actualiza automaticamente |

## O que verificar depois

1. **Mensagem de sucesso** — contagem de inmuebles e propiedades
2. **Filas descartadas** — expandir log se `skipped > 0` (geralmente falta `Referencia`)
3. **Lista `/admin`** — novos activos aparecem
4. **Ficha do imóvel** — abrir detalhe: endereço, propiedades (cargas), dados judiciais
5. **Publicação** — coluna `Publicar=SI` define `pub`; imóvel visível em `/portal` se publicado
6. **Mapa** — se Excel não traz coordenadas, usar **Refresh Catastro** na ficha (ver [admin-gestao-activos](admin-gestao-activos.md) ou doc Catastro)

## Erros comuns

| Sintoma | Causa provável | Acção |
|---------|----------------|-------|
| "No se extrajeron inmuebles" | Cabeçalhos incorrectos ou sem `Referencia` | Verificar plantilla |
| "Solo se permiten archivos Excel" | Extensão não `.xlsx`/`.xls` | Converter ficheiro |
| Propiedades sem imóvel | Referencia inválida ou vazia | Corrigir Excel |
| Dados comerciais em falta | Merge entre linhas — campo vazio na única linha | Preencher coluna ou segunda linha com mesma Referencia |

## Relação inmueble ↔ propiedad

- **Um imóvel** = uma referência catastral única
- **Várias linhas** com a mesma Referencia = várias **cargas** no mesmo imóvel (merge de campos vazios)

Ver [glossario.md](../getting-started/glossario.md) e [importacao-excel.md](../fluxos-tecnicos/importacao-excel.md).

## Ficheiros relacionados

- [`src/app/admin/UploadActivosModal.tsx`](../../src/app/admin/UploadActivosModal.tsx)
- [`src/lib/normalize-excel.ts`](../../src/lib/normalize-excel.ts)
