"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { fetchUltimoCruceDemanda, lanzarCruceDemandaManual } from "@/app/actions/cruce-demanda";
import { raiseActionError } from "@/lib/action-result";
import { ETIQUETA_NIVEL, type EjecucionCruce, type NivelCruce } from "@/lib/cruce-demanda";
import { toast } from "@/lib/toast";

function fecha(iso: string | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

/**
 * Último lote del cruce de demanda y lanzamiento manual.
 * Solo el gestor: la action rechaza al agente.
 */
export function CruceDemandaPanel() {
  const [ejecucion, setEjecucion] = useState<EjecucionCruce | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchUltimoCruceDemanda();
      raiseActionError(result);
      setEjecucion(result.ejecucion);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el cruce");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function lanzar() {
    setRunning(true);
    try {
      const result = await lanzarCruceDemandaManual();
      raiseActionError(result);
      setEjecucion(result.ejecucion);
      toast.success("Cruce de demanda terminado", {
        description: `${result.ejecucion.compradores} compradores con oportunidades nuevas`,
      });
    } catch (err) {
      toast.error("No se pudo lanzar el cruce", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setRunning(false);
    }
  }

  const niveles = (Object.keys(ETIQUETA_NIVEL) as NivelCruce[]);

  return (
    <section className="mb-6 rounded-lg border border-border bg-white p-5 shadow-sm" data-testid="cruce-demanda-panel">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-navy">Cruce de demanda</h2>
          <p className="mt-1 text-xs text-muted">
            Lunes y jueves a las 07:00 UTC (08:00 en invierno y 09:00 en verano, hora de España). El email solo se envía si CRUCE_DEMANDA_EMAIL_ENABLED está activo.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void lanzar()}
          disabled={running}
          className="flex items-center gap-1.5 rounded-lg bg-navy px-3.5 py-2 text-xs font-medium text-white hover:bg-navy3 disabled:opacity-50"
        >
          <RefreshCw size={14} className={running ? "animate-spin" : ""} />
          {running ? "Cruzando…" : "Lanzar cruce ahora"}
        </button>
      </div>
      {loading ? (
        <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-gold" /></div>
      ) : error ? (
        <p className="text-sm text-red" role="alert">{error}</p>
      ) : !ejecucion ? (
        <p className="text-sm text-muted">Todavía no hay un cruce registrado.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Dato label="Fecha" value={fecha(ejecucion.createdAt)} />
          <Dato label="Origen" value={ejecucion.origen === "cron" ? "Cron" : "Manual"} />
          <Dato label="Compradores con demanda" value={String(ejecucion.conDemanda)} />
          <Dato label="Compradores con oportunidades" value={String(ejecucion.compradores)} />
          <Dato label="Oportunidades nuevas" value={String(ejecucion.oportunidades)} />
          <Dato label="Emails enviados" value={String(ejecucion.emailsEnviados)} />
          <Dato label="Emails omitidos" value={String(ejecucion.emailsOmitidos)} />
          <Dato
            label="Por nivel"
            value={niveles.map((nivel) => `${ETIQUETA_NIVEL[nivel]}: ${ejecucion.porNivel[nivel] ?? 0}`).join(" · ")}
          />
        </div>
      )}
    </section>
  );
}

function Dato({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-cream2 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</div>
      <div className="text-sm text-text">{value}</div>
    </div>
  );
}
