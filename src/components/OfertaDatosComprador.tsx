"use client";

import { useState } from "react";
import { datosFirmaCompletos, type DatosFirma } from "@/lib/comprador-oferta";
import { DatosFirmaFields, DatosOfertaEstado, ResumenDatosFirma } from "@/components/DatosFirmaFields";

/**
 * En la oferta, la ficha del comprador llega rellena.
 * Si está completa, solo se revisa y se envía. Si falta algo, se pide ahí
 * y el servidor lo guarda de vuelta en el comprador.
 */
export function OfertaDatosComprador({
  datos,
  onChange,
  emailReadOnly = false,
}: {
  datos: DatosFirma;
  onChange: (next: DatosFirma) => void;
  emailReadOnly?: boolean;
}) {
  const completo = datosFirmaCompletos(datos);
  const [corrigiendo, setCorrigiendo] = useState(false);
  const soloRevision = completo && !corrigiendo;

  return (
    <div className="mb-3 rounded-lg border border-border bg-cream2/40 p-3" data-testid="oferta-datos-comprador">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">Datos para firmar</div>
          <DatosOfertaEstado datos={datos} />
        </div>
        {completo ? (
          <button
            type="button"
            onClick={() => setCorrigiendo((value) => !value)}
            className="shrink-0 text-[11px] font-medium text-navy underline-offset-2 hover:underline"
          >
            {corrigiendo ? "Ver resumen" : "Corregir datos"}
          </button>
        ) : null}
      </div>
      {soloRevision ? (
        <>
          <p className="mb-2 text-xs text-muted">Revisa los datos. La oferta queda lista para firmar.</p>
          <ResumenDatosFirma datos={datos} />
        </>
      ) : (
        <>
          <p className="mb-2 text-xs text-muted">
            {completo
              ? "Corrige lo que haga falta antes de enviar."
              : "Faltan datos obligatorios. Al enviarlos se guardan en la ficha del comprador."}
          </p>
          <DatosFirmaFields
            datos={datos}
            onChange={onChange}
            emailReadOnly={emailReadOnly}
            idPrefix="oferta-firma"
          />
        </>
      )}
    </div>
  );
}
