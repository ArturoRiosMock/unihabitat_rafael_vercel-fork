import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Asset, Propiedad } from "@/lib/types";

const fetchAssetByPublicSlug = vi.hoisted(() => vi.fn());

vi.mock("@/app/actions/assets", () => ({
  fetchAssetByPublicSlug: (slug: string) => fetchAssetByPublicSlug(slug),
}));

vi.mock("@/app/actions/notas", () => ({
  createNota: vi.fn(),
  fetchNotas: vi.fn(async () => []),
}));

vi.mock("@/app/actions/documentos", () => ({
  fetchDocumentos: vi.fn(async () => []),
  getDocumentUrl: vi.fn(),
}));

vi.mock("@/app/actions/compradores", () => ({
  ensureCompradorForEmail: vi.fn(),
}));

vi.mock("@/hooks/useFavoritos", () => ({
  useFavoritos: () => ({ isFavorito: () => false, toggleFavorito: vi.fn() }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
  }),
}));

vi.mock("@/components/InteractiveMap", () => ({
  InteractiveMap: () => <div data-testid="mapa" />,
}));

vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import PortalPrivadoInmuebleSlugPage from "@/app/portal/privado/inmueble/[slug]/page";

function propiedad(faseInterna: string): Propiedad {
  return {
    id: "PROP-1",
    inmuebleId: "ACT-1",
    activoId: "ACT",
    categoria: "CDR",
    propietario: "—",
    contacto: "—",
    telefono: "—",
    mail: "—",
    faseInterna,
    faseC: "fp-ofe",
    proceso: "—",
    deuda: null,
    precioPublicacion: null,
    lien: "—",
    collateralId: "",
    idPrinex: "",
    idPrinexCorto: "",
    idProperty: "",
    dataRef: "",
    portfolio: "—",
    folder: "—",
    mainLocalCcc14: "—",
    stageStatus: "—",
    stageSubstatus: "—",
    tipologia: "—",
    juzgadoLarga: "—",
    codigoProcedimiento: "—",
    ultimaFaseCalculada: "—",
    hitoJudicial: "—",
    fechaLanzamiento: "—",
    lanzamiento: "—",
    infoOcupantes: "—",
    inscrito: "—",
    cargas: "—",
    registralmenteOk: "—",
  };
}

function makeAsset(faseInterna: string): Asset {
  return {
    id: "ACT-1",
    referencia: "RC1",
    publicSlug: "abc",
    prov: "Madrid",
    pob: "Valdemoro",
    cp: "28340",
    addr: "Calle Mayor 1",
    tip: "PISO",
    tipC: "tp-viv",
    precio: 100000,
    fav: false,
    chk: false,
    sqm: 80,
    tvia: "CALLE",
    nvia: "MAYOR",
    num: "1",
    esc: "—",
    pla: "—",
    pta: "—",
    map: "",
    clase: "URBANO",
    uso: "Residencial",
    bien: "VIVIENDA",
    supC: "80",
    supG: "—",
    coef: "—",
    ccaa: "Madrid",
    fullAddr: "Calle Mayor 1",
    desc: "Descripción",
    pub: true,
    propiedades: [propiedad(faseInterna)],
  };
}

/** Promesa ya cumplida para que `use(params)` no deje el árbol en suspenso. */
function resolvedParams<T extends object>(value: T): Promise<T> {
  const promise = Promise.resolve(value) as Promise<T> & { status: "fulfilled"; value: T };
  promise.status = "fulfilled";
  promise.value = value;
  return promise;
}

async function renderPrivado(faseInterna: string) {
  fetchAssetByPublicSlug.mockResolvedValue(makeAsset(faseInterna));
  render(<PortalPrivadoInmuebleSlugPage params={resolvedParams({ slug: "abc" })} />);
  return screen.findByText("Información completa");
}

function situacionPill() {
  const label = screen.getByText("Situación");
  return label.parentElement as HTMLElement;
}

describe("portal privado — Situación en Información completa", () => {
  beforeEach(() => {
    fetchAssetByPublicSlug.mockReset();
  });

  it("muestra la fase interna en solo lectura", async () => {
    await renderPrivado("Ofertado");

    expect(situacionPill()).toHaveTextContent("Ofertado");
    expect(screen.queryByRole("combobox", { name: "Situación" })).not.toBeInTheDocument();
  });

  it("muestra un guion si la fase interna está vacía", async () => {
    await renderPrivado("");

    expect(situacionPill()).toHaveTextContent("—");
  });
});
