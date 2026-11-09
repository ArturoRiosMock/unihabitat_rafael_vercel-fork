import type { MouseEventHandler, ReactNode } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Asset, Propiedad } from "@/lib/types";
import { displaySituacion } from "@/lib/utils";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    className,
    onClick,
  }: {
    children: ReactNode;
    href: string;
    className?: string;
    onClick?: MouseEventHandler<HTMLAnchorElement>;
  }) => (
    <a href={href} className={className} onClick={onClick}>
      {children}
    </a>
  ),
}));

const mocks = vi.hoisted(() => ({
  session: { role: "admin" as "admin" | "vendedor" | "cliente", nombre: "Ana Admin", email: "admin@test" },
  updatePropiedadFields: vi.fn(async () => undefined),
  updateAssetFields: vi.fn(async () => undefined),
  toast: { success: vi.fn(), error: vi.fn() },
  fetchInformacionAdicional: vi.fn(async () => "Visible para el agente"),
  saveInformacionAdicional: vi.fn(async () => undefined),
  fetchDocumentos: vi.fn(async () => [] as Array<{
    id: string;
    asset_id: string | null;
    comprador_id: string | null;
    name: string;
    storage_path: string;
    icon_type: string;
    size_bytes: number;
    uploaded_by: string;
    created_at: string;
  }>),
}));

vi.mock("@/lib/context", () => ({
  useApp: () => ({
    getAsset: (id: string) => (id === "ACT-1" ? currentAsset : undefined),
    togglePub: vi.fn(),
    session: mocks.session,
    compradores: [],
  }),
}));

vi.mock("@/app/actions/assets", () => ({
  fetchAssetByIdForAdmin: vi.fn(async () => currentAsset),
  fetchAssetsByActivoIdForAdmin: vi.fn(async () => []),
  toggleAssetPub: vi.fn(),
  updateAssetFields: (...args: unknown[]) => mocks.updateAssetFields(...args),
  updatePropiedadFields: (...args: unknown[]) => mocks.updatePropiedadFields(...args),
  updatePropiedadExcelRaw: vi.fn(async () => undefined),
}));

vi.mock("@/app/actions/notas", () => ({
  fetchNotas: vi.fn(async () => []),
  createNota: vi.fn(),
  deleteNota: vi.fn(),
}));

vi.mock("@/app/actions/documentos", () => ({
  uploadDocumento: vi.fn(),
  fetchDocumentos: (...args: unknown[]) => mocks.fetchDocumentos(...args),
  deleteDocumento: vi.fn(),
  getDocumentUrl: vi.fn(),
}));

vi.mock("@/app/actions/informacion-adicional", () => ({
  fetchInformacionAdicional: (...args: unknown[]) => mocks.fetchInformacionAdicional(...args),
  saveInformacionAdicional: (...args: unknown[]) => mocks.saveInformacionAdicional(...args),
}));

vi.mock("@/app/actions/compradores", () => ({
  fetchCompradores: vi.fn(async () => []),
}));

vi.mock("@/app/actions/invitations", () => ({
  inviteCompradorToAsset: vi.fn(),
  revokeCompradorFromAsset: vi.fn(),
  fetchInvitedCompradores: vi.fn(async () => []),
}));

vi.mock("@/app/actions/email-info-request", () => ({
  enviarSolicitudInformacion: vi.fn(),
}));

vi.mock("@/app/actions/ofertas", () => ({
  createOfertaAdmin: vi.fn(),
}));

vi.mock("@/app/actions/catastro", () => ({
  refreshAssetCatastro: vi.fn(),
}));

vi.mock("@/app/actions/vendedores", () => ({
  getAssetAgente: vi.fn(),
  setAssetAgente: vi.fn(),
}));

vi.mock("@/components/InteractiveMap", () => ({
  InteractiveMap: () => <div data-testid="mapa" />,
}));

vi.mock("@/lib/toast", () => ({
  toast: mocks.toast,
}));

import { SituacionField } from "@/components/SituacionField";
import AssetDetailPage from "@/app/admin/assets/[id]/page";

let currentAsset: Asset;

function propiedad(faseInterna: string): Propiedad {
  return {
    id: "PROP-1",
    inmuebleId: "ACT-1",
    activoId: "ACT",
    categoria: "NPL",
    propietario: "—",
    contacto: "—",
    telefono: "—",
    mail: "—",
    faseInterna,
    faseC: "fp-nd",
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

function makeAsset(faseInterna: string, withPropiedad = true): Asset {
  return {
    id: "ACT-1",
    referencia: "RC1",
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
    desc: "Descripción de prueba",
    pub: true,
    propiedades: withPropiedad ? [propiedad(faseInterna)] : [],
  };
}

/** Promesa ya cumplida para que `use(params)` no deje el árbol en suspenso. */
function resolvedParams<T extends object>(value: T): Promise<T> {
  const promise = Promise.resolve(value) as Promise<T> & { status: "fulfilled"; value: T };
  promise.status = "fulfilled";
  promise.value = value;
  return promise;
}

function renderFicha() {
  return render(<AssetDetailPage params={resolvedParams({ id: "ACT-1" })} />);
}

describe("displaySituacion", () => {
  it("devuelve la fase interna y un guion si está vacía", () => {
    expect(displaySituacion(makeAsset("Reservado"))).toBe("Reservado");
    expect(displaySituacion(makeAsset("  Negociación  "))).toBe("Negociación");
    expect(displaySituacion(makeAsset(""))).toBe("—");
    expect(displaySituacion(makeAsset("—"))).toBe("—");
    expect(displaySituacion(makeAsset("   "))).toBe("—");
    expect(displaySituacion(makeAsset("", false))).toBe("—");
  });
});

describe("Situación en la pestaña Características", () => {
  beforeEach(() => {
    mocks.session.role = "admin";
    mocks.updatePropiedadFields.mockClear();
    mocks.toast.success.mockClear();
    mocks.toast.error.mockClear();
    mocks.fetchInformacionAdicional.mockClear();
    mocks.saveInformacionAdicional.mockClear();
    mocks.fetchInformacionAdicional.mockResolvedValue("Visible para el agente");
    mocks.fetchDocumentos.mockReset();
    mocks.fetchDocumentos.mockResolvedValue([]);
    currentAsset = makeAsset("Reservado");
  });

  it("el admin la ve y la guarda en fase_interna de la primera propiedad", async () => {
    const user = userEvent.setup();
    renderFicha();

    const tab = await screen.findByRole("button", { name: "Características" });
    await user.click(tab);

    const situacion = screen.getByRole("combobox", { name: "Situación" });
    expect(situacion).toBeVisible();
    expect(situacion).toHaveValue("Reservado");
    expect(within(situacion).queryByRole("option", { name: "Publicado" })).not.toBeInTheDocument();

    await user.selectOptions(situacion, "Negociación");

    expect(mocks.updatePropiedadFields).toHaveBeenCalledTimes(1);
    expect(mocks.updatePropiedadFields).toHaveBeenCalledWith("PROP-1", {
      fase_interna: "Negociación",
      fase_c: "fp-neg",
    });
    expect(mocks.toast.success).toHaveBeenCalledWith("Situación actualizada");
  });

  it("conserva un valor legado del Excel que no está en el enum", async () => {
    currentAsset = makeAsset("Publicado");
    renderFicha();

    const situacion = await screen.findByRole("combobox", { name: "Situación" });
    expect(situacion).toHaveValue("Publicado");
    expect(within(situacion).getByRole("option", { name: "Publicado" })).toBeInTheDocument();
  });

  it("el agente ve el valor y no puede editarlo", async () => {
    mocks.session.role = "vendedor";
    renderFicha();

    const group = await screen.findByRole("group", { name: "Situación" });
    expect(group).toBeVisible();
    expect(group).toHaveTextContent("Reservado");
    expect(within(group).queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Situación" })).not.toBeInTheDocument();
  });

  it("muestra un guion si la fase interna está vacía", async () => {
    currentAsset = makeAsset("");
    const { rerender } = renderFicha();

    const adminSelect = await screen.findByRole("combobox", { name: "Situación" });
    expect(adminSelect).toHaveValue("");
    expect(adminSelect).toHaveDisplayValue("—");

    mocks.session.role = "vendedor";
    currentAsset = makeAsset("");
    rerender(<AssetDetailPage params={resolvedParams({ id: "ACT-1" })} />);

    const group = screen.getByRole("group", { name: "Situación" });
    expect(within(group).queryByRole("combobox")).not.toBeInTheDocument();
    expect(group).toHaveTextContent("—");
  });

  it("el admin sin propiedad asociada ve el guion y no el selector", () => {
    currentAsset = makeAsset("", false);
    render(<SituacionField asset={currentAsset} canEdit />);

    const group = screen.getByRole("group", { name: "Situación" });
    expect(group).toHaveTextContent("—");
    expect(within(group).queryByRole("combobox")).not.toBeInTheDocument();
  });
});

describe("Deuda y proceso: una sola fuente", () => {
  beforeEach(() => {
    mocks.session.role = "admin";
    mocks.updatePropiedadFields.mockClear();
    mocks.updateAssetFields.mockClear();
    currentAsset = makeAsset("Reservado");
    currentAsset.propiedades[0].deuda = 12500;
    currentAsset.propiedades[0].proceso = "Ejecución";
  });

  it("Características muestra la deuda y el proceso de la propiedad y no los edita", async () => {
    renderFicha();

    const group = await screen.findByRole("group", { name: "Deuda y proceso" });
    expect(group).toHaveTextContent(`${(12500).toLocaleString("es-ES")} €`);
    expect(group).toHaveTextContent("Ejecución");
    expect(group).toHaveTextContent("Solo lectura");
    expect(within(group).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(group).queryByRole("spinbutton")).not.toBeInTheDocument();
  });

  it("el agente ve los mismos valores sin la pista de edición", async () => {
    mocks.session.role = "vendedor";
    renderFicha();

    const group = await screen.findByRole("group", { name: "Deuda y proceso" });
    expect(group).toHaveTextContent(`${(12500).toLocaleString("es-ES")} €`);
    expect(group).toHaveTextContent("Ejecución");
    expect(group).not.toHaveTextContent("pestaña Administrador");
    expect(screen.queryByRole("button", { name: "Administrador" })).not.toBeInTheDocument();
  });

  it("guardar Deuda y Proceso en Administrador escribe la propiedad, no el inmueble", async () => {
    const user = userEvent.setup();
    renderFicha();

    await user.click(await screen.findByRole("button", { name: "Administrador" }));
    const proceso = await screen.findByRole("textbox", { name: "Proceso" });
    await user.clear(proceso);
    await user.type(proceso, "Subasta");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(mocks.updatePropiedadFields).toHaveBeenCalledWith("PROP-1", { proceso: "Subasta" });
    expect(mocks.updateAssetFields).not.toHaveBeenCalled();
  });
});

describe("Información Adicional entre descripción y notas", () => {
  beforeEach(() => {
    mocks.session.role = "admin";
    mocks.fetchInformacionAdicional.mockResolvedValue("Visible para el agente");
    mocks.saveInformacionAdicional.mockClear();
    currentAsset = makeAsset("Reservado");
  });

  it("el admin la ve entre Descripción y Notas y puede guardarla", async () => {
    const user = userEvent.setup();
    renderFicha();

    const info = await screen.findByRole("region", { name: "Información Adicional" });
    const descripcion = screen.getByText("Descripción del Activo");
    const notas = screen.getByText("Notas del activo");
    expect(descripcion.compareDocumentPosition(info) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(info.compareDocumentPosition(notas) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const campo = await screen.findByRole("textbox", { name: "Texto de información adicional" });
    expect(campo).toHaveValue("Visible para el agente");
    await user.clear(campo);
    await user.type(campo, "Texto del admin");
    await user.click(screen.getByRole("button", { name: "Guardar información adicional" }));

    expect(mocks.saveInformacionAdicional).toHaveBeenCalledWith("ACT-1", "Texto del admin");
  });

  it("el agente lee el texto y no tiene control de escritura", async () => {
    mocks.session.role = "vendedor";
    renderFicha();

    expect(await screen.findByText("Visible para el agente")).toBeVisible();
    const info = screen.getByRole("region", { name: "Información Adicional" });
    expect(info).toHaveTextContent("Visible para el agente");
    expect(screen.queryByRole("textbox", { name: "Texto de información adicional" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar información adicional" })).not.toBeInTheDocument();
    expect(screen.getByText("Notas del activo")).toBeVisible();
  });
});

describe("pestaña Documentación del agente", () => {
  beforeEach(() => {
    mocks.session.role = "vendedor";
    currentAsset = makeAsset("Reservado");
    mocks.fetchDocumentos.mockReset();
  });

  it("sigue en la ficha y muestra los PDF autorizados", async () => {
    const user = userEvent.setup();
    mocks.fetchDocumentos.mockResolvedValue([
      {
        id: "d1",
        asset_id: "ACT-1",
        comprador_id: null,
        name: "nota-simple.pdf",
        storage_path: "assets/ACT-1/nota-simple.pdf",
        icon_type: "pdf",
        size_bytes: 1200,
        uploaded_by: "Admin",
        created_at: "2026-03-01T00:00:00.000Z",
      },
      {
        id: "d2",
        asset_id: "ACT-1",
        comprador_id: null,
        name: "memoria-test.pdf",
        storage_path: "assets/ACT-1/memoria-test.pdf",
        icon_type: "pdf",
        size_bytes: 2400,
        uploaded_by: "Admin",
        created_at: "2026-03-02T00:00:00.000Z",
      },
    ]);
    renderFicha();

    await user.click(await screen.findByRole("button", { name: "Documentación" }));

    expect(await screen.findByText("nota-simple.pdf")).toBeVisible();
    expect(screen.getByText("memoria-test.pdf")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Valdemoro, Madrid" })).toBeVisible();
    expect(mocks.fetchDocumentos).toHaveBeenCalledWith({ assetId: "ACT-1" });
  });

  it("un acceso denegado se queda en la pestaña y no vacía la ficha", async () => {
    const user = userEvent.setup();
    mocks.fetchDocumentos.mockRejectedValue(new Error("Acceso denegado"));
    renderFicha();

    await user.click(await screen.findByRole("button", { name: "Documentación" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Acceso denegado");
    expect(screen.getByRole("button", { name: "Documentación" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Valdemoro, Madrid" })).toBeVisible();
    expect(screen.queryByText("No hay documentos subidos aún")).not.toBeInTheDocument();
  });
});
