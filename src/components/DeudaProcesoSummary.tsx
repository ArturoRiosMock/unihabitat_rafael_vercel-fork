import type { Asset } from "@/lib/types";
import { getDeudaTotal, getProceso } from "@/lib/utils";

function formatDeuda(value: number | null): string {
  if (value == null) return "—";
  return `${value.toLocaleString("es-ES")} €`;
}

/**
 * Deuda y proceso de la ficha. Solo lectura: se editan en Administrador
 * y se leen de `propiedades.deuda` / `propiedades.proceso`.
 */
export function DeudaProcesoSummary({
  asset,
  showEditHint,
}: {
  asset: Asset;
  showEditHint: boolean;
}) {
  const deuda = getDeudaTotal(asset);
  const proceso = getProceso(asset);

  return (
    <div
      role="group"
      aria-label="Deuda y proceso"
      className="rounded-lg border border-border bg-cream2 px-3 py-2 text-xs text-text"
    >
      <p>
        <span className="font-semibold text-muted">Deuda: </span>
        {formatDeuda(deuda)}
      </p>
      <p className="mt-0.5">
        <span className="font-semibold text-muted">Proceso: </span>
        {proceso}
      </p>
      {showEditHint && (
        <p className="mt-1 text-[10px] leading-snug text-muted">
          Solo lectura. Se modifica en la pestaña Administrador.
        </p>
      )}
    </div>
  );
}
