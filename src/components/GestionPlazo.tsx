import { etiquetaDiasGestion, formatGestionFecha, plazoGestion } from "@/lib/comprador-gestion";

interface GestionPlazoProps {
  ultimaGestionAgenteAt: string | null | undefined;
  assigned: boolean;
  /** En la ficha se explica el plazo. En la lista solo cabe la cifra. */
  verbose?: boolean;
}

/** Días que faltan para que el comprador pase al gestor. */
export function GestionPlazo({ ultimaGestionAgenteAt, assigned, verbose = false }: GestionPlazoProps) {
  if (!assigned) {
    if (!verbose) return <span className="text-xs text-muted">Gestor</span>;
    return (
      <div className="mb-4 rounded-md border border-border bg-white px-3 py-2 text-xs text-muted">
        Este comprador es propiedad del gestor.
      </div>
    );
  }

  const plazo = plazoGestion(ultimaGestionAgenteAt ?? null, true);
  const label = etiquetaDiasGestion(plazo.days);
  const fecha = formatGestionFecha(ultimaGestionAgenteAt);
  const alert = plazo.warning || plazo.due;

  if (label == null) {
    return <span className="text-xs text-muted">Sin fecha de gestión</span>;
  }

  if (!verbose) {
    return (
      <div data-testid="dias-gestion">
        <div className={`text-xs font-semibold ${alert ? "text-orange" : "text-navy"}`}>{label}</div>
        {fecha ? <div className="text-[10px] text-muted">{fecha}</div> : null}
      </div>
    );
  }

  return (
    <div
      data-testid="dias-gestion"
      className={`mb-4 rounded-md border px-3 py-2 text-xs ${
        alert ? "border-orange/40 bg-orange/10 text-orange" : "border-border bg-white text-navy"
      }`}
    >
      <strong className="font-semibold">{label}</strong>
      {plazo.due
        ? " · Este comprador pasa a ser propiedad del gestor."
        : plazo.warning
          ? " · Si el agente no lo gestiona, pasará a ser propiedad del gestor."
          : " antes de pasar a propiedad del gestor si no hay gestión del agente."}
      {fecha ? ` Última gestión: ${fecha}.` : ""}
    </div>
  );
}
