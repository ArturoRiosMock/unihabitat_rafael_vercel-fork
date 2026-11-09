import type { MouseEventHandler, ReactNode } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Asset } from "@/lib/types";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    target,
    rel,
    className,
    onClick,
  }: {
    children: ReactNode;
    href: string;
    target?: string;
    rel?: string;
    className?: string;
    onClick?: MouseEventHandler<HTMLAnchorElement>;
  }) => (
    <a href={href} target={target} rel={rel} className={className} onClick={onClick}>
      {children}
    </a>
  ),
}));

const mocks = vi.hoisted(() => {
  function row(partial: Pick<Asset, "id" | "prov" | "pob" | "nvia" | "addr"> & Partial<Asset>): Asset {
    return {
      referencia: partial.id,
      cp: "28001",
      tip: "PISO",
      tipC: "tp-viv",
      precio: 100000,
      fav: false,
      chk: false,
      sqm: 80,
      tvia: "CALLE",
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
      ccaa: partial.prov,
      fullAddr: partial.addr,
      desc: "—",
      pub: false,
      propiedades: [],
      ...partial,
    };
  }

  const assets: Asset[] = [
    row({
      id: "NONE",
      prov: "Alicante",
      pob: "Alicante",
      nvia: "SIN",
      addr: "Calle Sin Fecha",
      pub: false,
      createdAt: "2026-01-01T12:00:00.000Z",
    }),
    row({
      id: "FALL",
      prov: "Barcelona",
      pob: "Barcelona",
      nvia: "ALTA",
      addr: "Calle Alta",
      pub: true,
      publishedAt: null,
      createdAt: "2025-04-02T12:00:00.000Z",
    }),
    row({
      id: "NEW",
      prov: "Madrid",
      pob: "Madrid",
      nvia: "NUEVA",
      addr: "Calle Nueva",
      pub: true,
      publishedAt: "2026-06-01T12:00:00.000Z",
    }),
    row({
      id: "OLD",
      prov: "Zaragoza",
      pob: "Zaragoza",
      nvia: "VIEJA",
      addr: "Calle Vieja",
      pub: true,
      publishedAt: "2024-01-15T12:00:00.000Z",
    }),
  ];

  return {
    assets,
    downloadAssetsWorkbook: vi.fn(),
    session: { role: "admin" as "admin" | "vendedor", nombre: "Admin", email: "admin@test" },
  };
});

vi.mock("@/lib/context", () => ({
  useApp: () => ({
    assets: mocks.assets,
    toggleFav: vi.fn(),
    toggleChk: vi.fn(),
    toggleChkAll: vi.fn(),
    session: mocks.session,
    removeAssetsByIds: vi.fn(),
    refreshAssets: vi.fn(),
  }),
}));

vi.mock("@/app/actions/assets", () => ({
  deleteAssetsByIds: vi.fn(),
  toggleAssetPub: vi.fn(),
}));

vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/asset-excel", async () => {
  const actual = await vi.importActual<typeof import("@/lib/asset-excel")>("@/lib/asset-excel");
  return {
    ...actual,
    downloadAssetsWorkbook: (...args: unknown[]) => mocks.downloadAssetsWorkbook(...args),
  };
});

import ActivosPage from "@/app/admin/page";

function linkIds(): string[] {
  return screen.getAllByRole("link").map((link) => link.getAttribute("href")?.split("/").pop() ?? "");
}

describe("listado admin: Excel y fecha de publicación", () => {
  beforeEach(() => {
    mocks.downloadAssetsWorkbook.mockClear();
    mocks.session.role = "admin";
    mocks.assets.forEach((asset) => {
      asset.chk = false;
    });
  });

  it("muestra la fecha y ordena de más reciente a más antigua, con vacíos al final", async () => {
    const user = userEvent.setup();
    render(<ActivosPage />);

    expect(linkIds()).toEqual(["NONE", "FALL", "NEW", "OLD"]);
    expect(within(screen.getByRole("link", { name: /CALLE NUEVA/i })).getByTitle(/Última fecha de publicación/)).toHaveTextContent("01/06/2026");
    expect(within(screen.getByRole("link", { name: /CALLE VIEJA/i })).getByTitle(/Última fecha de publicación/)).toHaveTextContent("15/01/2024");
    expect(within(screen.getByRole("link", { name: /CALLE ALTA/i })).getByTitle(/Fecha aproximada/)).toHaveTextContent("02/04/2025");
    expect(within(screen.getByRole("link", { name: /CALLE SIN/i })).getByTitle("Sin fecha de publicación")).toHaveTextContent("—");

    await user.click(screen.getByRole("button", { name: /F\. publicación/i }));
    expect(linkIds()).toEqual(["NEW", "FALL", "OLD", "NONE"]);

    await user.click(screen.getByRole("button", { name: /F\. publicación/i }));
    expect(linkIds()).toEqual(["OLD", "FALL", "NEW", "NONE"]);
  });

  it("sin selección descarga todos los activos filtrados", async () => {
    const user = userEvent.setup();
    render(<ActivosPage />);

    const downloadAll = screen.getByRole("button", { name: "Descargar Excel (4)" });
    expect(downloadAll).toBeEnabled();
    await user.click(downloadAll);
    const allRows = mocks.downloadAssetsWorkbook.mock.calls[0]?.[0] as Asset[];
    expect(allRows.map((asset) => asset.id)).toEqual(["NONE", "FALL", "NEW", "OLD"]);
  });

  it("con filas marcadas descarga solo esa selección", async () => {
    const user = userEvent.setup();
    mocks.assets.find((asset) => asset.id === "NEW")!.chk = true;
    render(<ActivosPage />);

    await user.click(screen.getByRole("button", { name: "Descargar Excel (1)" }));
    const selectedRows = mocks.downloadAssetsWorkbook.mock.calls[0]?.[0] as Asset[];
    expect(selectedRows.map((asset) => asset.id)).toEqual(["NEW"]);
  });

  it("al filtrar exporta solo lo visible y se deshabilita si el filtro queda vacío", async () => {
    const user = userEvent.setup();
    render(<ActivosPage />);
    const search = screen.getByPlaceholderText(/Buscar por dirección/i);

    await user.type(search, "vieja");
    const filtered = screen.getByRole("button", { name: "Descargar Excel (1)" });
    await user.click(filtered);
    const rows = mocks.downloadAssetsWorkbook.mock.calls.at(-1)?.[0] as Asset[];
    expect(rows.map((asset) => asset.id)).toEqual(["OLD"]);

    await user.clear(search);
    await user.type(search, "zzzz-no-existe");
    expect(screen.getByRole("button", { name: "Descargar Excel" })).toBeDisabled();
  });

  it("el agente también puede descargar y sigue sin poder borrar en bloque", () => {
    mocks.session.role = "vendedor";
    render(<ActivosPage />);
    expect(screen.getByRole("button", { name: /Descargar Excel/i })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /Borrar seleccionados/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Borrar todos/i })).not.toBeInTheDocument();
  });
});
