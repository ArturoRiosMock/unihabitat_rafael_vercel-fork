import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import PortalDetailClient from "@/app/portal/[id]/PortalDetailClient";
import type { Asset } from "@/lib/types";
import { displaySituacion } from "@/lib/utils";

// Tests del *cliente*: el guardado server-side ya está cubierto por
// `actions-assets.test.ts`; aquí confirmamos que cuando el server delega un
// asset publicado al cliente, el render NO bloquea con el candado.
vi.mock("@/hooks/usePortalAuth", () => ({
  usePortalAuth: () => ({
    sensitiveVisible: false,
    isStaff: false,
    role: null,
    currentUser: null,
    userResolved: true,
  }),
}));
vi.mock("leaflet/dist/leaflet.css", () => ({}));
vi.mock("leaflet", () => ({ default: {
  map: vi.fn(() => ({ remove: vi.fn(), invalidateSize: vi.fn() })),
  tileLayer: vi.fn(() => ({ addTo: vi.fn(() => ({})) })),
  divIcon: vi.fn(() => ({})),
  marker: vi.fn(() => ({ addTo: vi.fn(() => ({ bindPopup: vi.fn() })) })),
} }));

function makeAsset(overrides: Partial<Asset> & { activoId?: string } = {}): Asset {
  const { activoId, ...rest } = overrides;
  const id = (rest.id as string | undefined) ?? "TEST-1";
  return {
    id,
    referencia: id,
    prov: "Málaga",
    pob: "Arriate",
    cp: "29350",
    addr: "C/ Test 1",
    tip: "Vivienda",
    tipC: "tp-viv",
    precio: 100000,
    fav: false,
    chk: false,
    sqm: 100,
    tvia: "CALLE", nvia: "TEST", num: "1", esc: "—", pla: "—", pta: "—",
    map: "", lat: null, lng: null,
    clase: "URBANO", uso: "Residencial", bien: "VIVIENDA",
    supC: "100 m²", supG: "—", coef: "—", ccaa: "Andalucía",
    fullAddr: "C/ Test 1, Arriate",
    desc: "Activo de prueba",
    pub: true,
    propiedades: [{
      id: `${id}-P1`,
      inmuebleId: id,
      activoId: activoId ?? `ACT-${id}`,
      categoria: "NPL",
      propietario: "—", contacto: "—", telefono: "—", mail: "—",
      faseInterna: "Publicado", faseC: "fp-pub",
      proceso: "—", deuda: null, precioPublicacion: null, lien: "—",
      collateralId: "", idPrinex: "", idPrinexCorto: "", idProperty: "", dataRef: "",
      portfolio: "—", folder: "—", mainLocalCcc14: "—",
      stageStatus: "—", stageSubstatus: "—", tipologia: "—",
      juzgadoLarga: "—", codigoProcedimiento: "—", ultimaFaseCalculada: "—",
      hitoJudicial: "—", fechaLanzamiento: "—", lanzamiento: "—", infoOcupantes: "—",
      inscrito: "—", cargas: "—", registralmenteOk: "—",
    }],
    ...rest,
  };
}

describe("PortalDetailClient", () => {
  it("renderiza el activo publicado sin el candado de privacidad", () => {
    render(<PortalDetailClient asset={makeAsset()} siblings={[]} />);
    expect(screen.queryByText(/no está disponible públicamente/i)).not.toBeInTheDocument();
    // El título de la sección Descripción debe estar presente.
    expect(screen.getAllByText(/Descripción/i).length).toBeGreaterThan(0);
    // Botón "Solicitar información" — anclado al panel lateral.
    expect(screen.getAllByText(/Solicitar información/i).length).toBeGreaterThan(0);
  });

  it("muestra Situación en Características y un guion si está vacía", () => {
    const { rerender } = render(<PortalDetailClient asset={makeAsset()} siblings={[]} />);
    const section = document.getElementById("caracteristicas");
    expect(section).not.toBeNull();
    const filled = within(section as HTMLElement).getByText("Situación").parentElement;
    expect(filled).toHaveTextContent("Publicado");

    const empty = makeAsset();
    empty.propiedades = [{ ...empty.propiedades[0], faseInterna: "   " }];
    rerender(<PortalDetailClient asset={empty} siblings={[]} />);
    const blank = within(document.getElementById("caracteristicas") as HTMLElement).getByText("Situación").parentElement;
    expect(blank).toHaveTextContent("—");
    expect(displaySituacion(empty)).toBe("—");
  });

  it("muestra la sección de colaterales cuando hay siblings", () => {
    const sib = makeAsset({ id: "SIB-1", pob: "Otra Población", activoId: "ACT-COMMON" });
    const main = makeAsset({ activoId: "ACT-COMMON" });
    render(<PortalDetailClient asset={main} siblings={[sib]} />);
    expect(screen.getByText(/Colaterales \(2\)/)).toBeInTheDocument();
  });
});
