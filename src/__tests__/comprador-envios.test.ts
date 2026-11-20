import { describe, expect, it } from "vitest";
import {
  enviosRecientesDe,
  etiquetaFechaEnvio,
  mensajeYaEnviado,
  textoConfirmacionReenvio,
} from "@/lib/comprador-envios";

const ahora = new Date("2026-11-20T12:00:00.000Z");

describe("ventana de 14 días de un envío", () => {
  it("avisa con la fecha del último envío y pide confirmación", () => {
    const recientes = enviosRecientesDe(
      [
        { assetId: "TEST-DOC-001", enviadoAt: "2026-11-10T08:00:00.000Z" },
        { assetId: "TEST-DOC-001", enviadoAt: "2026-11-18T08:00:00.000Z" },
        { assetId: "VIEJO", enviadoAt: "2026-10-01T08:00:00.000Z" },
      ],
      ["TEST-DOC-001", "VIEJO"],
      ahora,
    );
    expect(recientes).toEqual([
      { assetId: "TEST-DOC-001", enviadoAt: "2026-11-18T08:00:00.000Z" },
    ]);
    expect(etiquetaFechaEnvio("2026-11-18T08:00:00.000Z")).toBe("18/11");
    expect(mensajeYaEnviado("2026-11-18T08:00:00.000Z")).toBe("Ya enviado el 18/11");
    expect(textoConfirmacionReenvio(recientes)).toContain("Ya enviado el 18/11");
    expect(textoConfirmacionReenvio(recientes)).toContain("¿Quieres enviarlo de nuevo?");
  });
});
