# Matching e oportunidades

> **Propósito:** Explicar como o sistema cruza compradores com imóveis.  
> **Público:** Operação e desenvolvedores (visão funcional).  
> **Última verificação:** 2026-06-12

## O que é uma oportunidade

Quando um imóvel e um comprador são **compatíveis** segundo critérios automáticos, grava-se um registo em `oportunidades` com **score** 0–100.

**Threshold mínimo:** 25 pontos (matches abaixo são ignorados).

## Critérios de scoring

Implementados em [`src/lib/matching.ts`](../../src/lib/matching.ts):

| Critério | Pontos | Condição |
|----------|--------|----------|
| Província | +30 | `comprador.intereses` contém província do imóvel |
| CCAA | +20 | Interesses contêm comunidade autónoma |
| Tipo imóvel | +25 | Keywords (residencial, parking, local…) vs `asset.tip` |
| NPL / inversão | +15 | Interesses mencionam inversión/cartera/NPL e imóvel tem propiedad NPL |
| Orçamento | +5 a +20 | Preço ≤ presupuesto (mais pontos se ratio ≥ 50%) |
| Orçamento flex | +5 | Preço até 120% do presupuesto |
| Costa | +10 | Interesses mencionam "costa" e província costeira (Málaga, Barcelona, etc.) |

Score máximo cap: 100.

## Onde ver no admin

**`/admin/oportunidades`** — lista matches do scoring e, para o gestor, o cruce de demanda (categoria, província e população). Ver [cruce-demanda.md](../fluxos-tecnicos/cruce-demanda.md).

## Quando se calcula

Server actions em [`src/app/actions/matching.ts`](../../src/app/actions/matching.ts):

- `computeMatchesForAsset(assetId)` — após novo imóvel ou alteração relevante
- `computeMatchesForComprador(compradorId)` — após update de interesses/orçamento

Top compradores (até 5) podem receber **notificação** + email espelhado.

## Boas práticas operacionais

1. Manter **intereses** e **presupuesto** dos compradores actualizados
2. Publicar imóveis (`pub=true`) relevantes para o portal
3. Revisar oportunidades com score alto antes de contacto comercial
4. Usar convites manuais (`inviteCompradorToAsset`) para casos específicos fora do matching

## Detalhe técnico

Ver [matching-engine.md](../fluxos-tecnicos/matching-engine.md).

## Ficheiros relacionados

- [`src/lib/matching.ts`](../../src/lib/matching.ts)
- [`src/app/actions/matching.ts`](../../src/app/actions/matching.ts)
