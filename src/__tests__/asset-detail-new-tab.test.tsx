import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { MouseEventHandler, ReactNode } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Asset } from "@/lib/types";

/**
 * Next.js Link con target=_blank no intercepta el clic: el ancla real abre
 * la ficha. El mock conserva href, target y rel para afirmar ese contrato.
 */
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
  function row(partial: Pick<Asset, "id" | "prov" | "pob" | "nvia" | "addr" | "pub"> & Partial<Asset>): Asset {
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
      propiedades: [],
      ...partial,
    };
  }

  const assets: Asset[] = [
    row({
      id: "MAD-1",
      prov: "Madrid",
      pob: "Valdemoro",
      nvia: "MAYOR",
      addr: "Calle Mayor 1",
      pub: true,
    }),
    row({
      id: "ALI-1",
      prov: "Alicante",
      pob: "Alicante",
      nvia: "COLON",
      addr: "Calle Colon 2",
      cp: "03001",
      pub: false,
    }),
  ];

  return {
    assets,
    toggleChk: vi.fn(),
    toggleFav: vi.fn(),
    toggleChkAll: vi.fn(),
    removeAssetsByIds: vi.fn(),
    toggleAssetPub: vi.fn(async (_id: string) => undefined),
    session: { role: "admin", nombre: "Admin", email: "admin@test" },
  };
});

vi.mock("@/lib/context", () => ({
  useApp: () => ({
    assets: mocks.assets,
    toggleFav: mocks.toggleFav,
    toggleChk: mocks.toggleChk,
    toggleChkAll: mocks.toggleChkAll,
    session: mocks.session,
    removeAssetsByIds: mocks.removeAssetsByIds,
    refreshAssets: vi.fn(),
  }),
}));

vi.mock("@/app/actions/assets", () => ({
  deleteAssetsByIds: vi.fn(),
  toggleAssetPub: (id: string) => mocks.toggleAssetPub(id),
}));

vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import ActivosPage from "@/app/admin/page";

function readSrc(relFromSrc: string): string {
  return readFileSync(resolve(__dirname, "..", relFromSrc), "utf8");
}

function sliceAround(src: string, needle: string, radius = 350): string {
  const at = src.indexOf(needle);
  expect(at, needle).toBeGreaterThan(-1);
  return src.slice(at, at + radius);
}

describe("listado admin de activos abre la ficha en otra pestaña", () => {
  beforeEach(() => {
    mocks.toggleChk.mockClear();
    mocks.toggleFav.mockClear();
    mocks.toggleAssetPub.mockClear();
    mocks.session.role = "admin";
    mocks.assets.forEach((asset) => {
      asset.chk = false;
      asset.fav = false;
    });
  });

  it("conserva la búsqueda al activar la fila y marca el enlace como pestaña nueva", async () => {
    const user = userEvent.setup();
    render(<ActivosPage />);

    const search = screen.getByPlaceholderText(/Buscar por dirección/i);
    await user.type(search, "mayor");

    const link = screen.getByRole("link", { name: /MAYOR/i });
    expect(screen.queryByRole("link", { name: /COLON/i })).not.toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/admin/assets/MAD-1");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAccessibleName(/se abre en una pestaña nueva/i);
    expect(link.tabIndex).toBe(0);

    const leftClick = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    link.dispatchEvent(leftClick);
    expect(leftClick.defaultPrevented).toBe(false);

    const middleClick = new MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 1 });
    link.dispatchEvent(middleClick);
    expect(middleClick.defaultPrevented).toBe(false);

    const modifiedClick = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
      ctrlKey: true,
    });
    link.dispatchEvent(modifiedClick);
    expect(modifiedClick.defaultPrevented).toBe(false);

    expect(search).toHaveValue("mayor");
    expect(screen.getByRole("link", { name: /MAYOR/i })).toBe(link);
    expect(screen.queryByRole("link", { name: /COLON/i })).not.toBeInTheDocument();
  });

  it("el check, el favorito y publicar no abren la ficha ni limpian el filtro", async () => {
    const user = userEvent.setup();
    render(<ActivosPage />);

    const search = screen.getByPlaceholderText(/Buscar por dirección/i);
    await user.type(search, "mayor");
    const link = screen.getByRole("link", { name: /MAYOR/i });
    const [checkbox, star] = link.querySelectorAll(":scope > div");
    const publish = within(link).getByRole("button", { name: /Publicado/i });

    const prevented: boolean[] = [];
    for (const el of [checkbox, star, publish]) {
      const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
      el.dispatchEvent(event);
      prevented.push(event.defaultPrevented);
    }

    expect(mocks.toggleChk).toHaveBeenCalledWith("MAD-1");
    expect(mocks.toggleFav).toHaveBeenCalledWith("MAD-1");
    expect(mocks.toggleAssetPub).toHaveBeenCalledWith("MAD-1");
    expect(prevented).toEqual([true, true, true]);
    expect(search).toHaveValue("mayor");
    expect(screen.getByRole("link", { name: /MAYOR/i })).toHaveAttribute("target", "_blank");
  });

  it("mantiene borrar seleccionados, sin Borrar todos, y la ficha nueva para el agente", () => {
    const { rerender } = render(<ActivosPage />);

    expect(screen.getByRole("button", { name: /Borrar seleccionados/i })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Borrar todos/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /MAYOR/i })).toHaveAttribute("target", "_blank");

    mocks.session.role = "vendedor";
    rerender(<ActivosPage />);

    expect(screen.queryByRole("button", { name: /Borrar seleccionados/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Borrar todos/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /MAYOR/i })).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("link", { name: /COLON/i })).toHaveAttribute("rel", "noopener noreferrer");
  });
});

describe("otros listados que pierden filtros al navegar", () => {
  it("el título del activo en ofertas abre otra pestaña y Volver al activo sigue en la misma", () => {
    const src = readSrc("app/admin/ofertas/page.tsx");
    const assetLink = sliceAround(src, "href={`/admin/assets/${asset.id}`}", 600);
    expect(assetLink).toContain('target="_blank"');
    expect(assetLink).toContain('rel="noopener noreferrer"');
    expect(assetLink).toContain("se abre en una pestaña nueva");

    const back = src.slice(Math.max(0, src.indexOf("Volver al activo") - 400), src.indexOf("Volver al activo"));
    expect(back).not.toContain('target="_blank"');
  });

  it("las tarjetas del portal y el popup del mapa abren la ficha en otra pestaña", () => {
    const portal = sliceAround(readSrc("app/portal/page.tsx"), "href={assetPortalHref(a)}", 4500);
    expect(portal).toContain('target="_blank"');
    expect(portal).toContain('rel="noopener noreferrer"');
    expect(portal).toContain("se abre en una pestaña nueva");

    const map = readSrc("components/PortalAssetsMap.tsx");
    expect(map).toContain(
      'target="_blank" rel="noopener noreferrer"',
    );
    expect(map).toContain("Ver ficha →");
  });

  it("conserva el borrado selectivo y no recupera Borrar todos", () => {
    const src = readSrc("app/admin/page.tsx");
    expect(src).toContain("handleDeleteSelected");
    expect(src).toContain("deleteAssetsByIds");
    expect(src).toContain("Borrar seleccionados");
    expect(src).toContain('target="_blank"');
    expect(src).not.toContain("handleDeleteAll");
    expect(src).not.toContain("deleteAllAssets");
    expect(src).not.toContain("Borrar todos");
  });
});
