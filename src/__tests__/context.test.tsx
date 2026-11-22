import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { AppProvider, useApp } from "@/lib/context";
import { step } from "./log-reporter";

// Mock todas las dependencias server-action que el contexto importa.
const fetchAssetsMock = vi.fn();
const backfillMissingMapsMock = vi.fn();

vi.mock("@/app/actions/assets", () => ({
  fetchAssets: (...args: unknown[]) => fetchAssetsMock(...args),
  fetchPropiedades: vi.fn(async () => []),
}));
vi.mock("@/app/actions/maps", () => ({
  backfillMissingMaps: (...args: unknown[]) => backfillMissingMapsMock(...args),
}));
vi.mock("@/app/actions/compradores", () => ({
  fetchCompradores: vi.fn(async () => []),
}));
vi.mock("@/app/actions/vendedores", () => ({
  fetchVendedores: vi.fn(async () => []),
}));
vi.mock("@/app/actions/permissions", () => ({
  fetchVendorPermissions: vi.fn(async () => []),
  fetchVendorAssignedAssetIds: vi.fn(async () => []),
  fetchVendorAssignedCompradorIds: vi.fn(async () => []),
}));
vi.mock("@/app/actions/session", () => ({
  fetchCurrentSession: vi.fn(async () => null),
}));
vi.mock("@/lib/auth-helpers", () => ({
  getDevAuthFromDocument: () => null,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

// Stub para no ejecutar el sondeo de mapas en cada test.
delete process.env.NEXT_PUBLIC_GEOAPIFY_KEY;

function Probe() {
  const { assets, assetsLoading, assetsError } = useApp();
  return (
    <div>
      <span data-testid="loading">{String(assetsLoading)}</span>
      <span data-testid="error">{assetsError ?? "null"}</span>
      <span data-testid="count">{assets.length}</span>
      <ul>
        {assets.map(a => <li key={a.id} data-testid="asset-id">{a.id}</li>)}
      </ul>
    </div>
  );
}

describe("AppProvider — estado inicial y carga de activos", () => {
  beforeEach(() => {
    fetchAssetsMock.mockReset();
    backfillMissingMapsMock.mockReset();
  });

  it("no descarga activos hasta que una pantalla de admin lo pide", async () => {
    await act(async () => {
      render(<AppProvider><Probe /></AppProvider>);
    });
    expect(screen.getByTestId("count").textContent).toBe("0");
    expect(screen.getByTestId("loading").textContent).toBe("false");
    expect(fetchAssetsMock).not.toHaveBeenCalled();
  });

  it("NO siembra los 6 mocks: la lista arranca vacía y `assetsLoading=true`", async () => {
    await step("simular fetch lento", async () => {
      fetchAssetsMock.mockImplementation(() => new Promise(() => {/* nunca resuelve */}));
    });

    await step("renderizar el provider", async () => {
      render(<AppProvider autoload><Probe /></AppProvider>);
    });

    expect(screen.getByTestId("count").textContent).toBe("0");
    expect(screen.getByTestId("loading").textContent).toBe("true");
    expect(screen.queryAllByTestId("asset-id")).toHaveLength(0);
  });

  it("reemplaza la lista vacía con los activos devueltos por Supabase", async () => {
    fetchAssetsMock.mockResolvedValueOnce([
      { id: "TEST-1", pub: false, adm: { con: "—" }, addr: "", pob: "", prov: "", cp: "" },
      { id: "TEST-2", pub: true,  adm: { con: "—" }, addr: "", pob: "", prov: "", cp: "" },
    ]);

    await act(async () => {
      render(<AppProvider autoload><Probe /></AppProvider>);
    });

    await waitFor(() => {
      expect(screen.getByTestId("count").textContent).toBe("2");
    });
    expect(screen.getByTestId("loading").textContent).toBe("false");
    expect(screen.getByTestId("error").textContent).toBe("null");
    const ids = screen.getAllByTestId("asset-id").map(el => el.textContent);
    expect(ids).toEqual(["TEST-1", "TEST-2"]);
    expect(ids).not.toContain("UF34938");
    expect(ids).not.toContain("UF40346");
  });

  it("expone el error en `assetsError` y deja `assets=[]` cuando fetchAssets rechaza", async () => {
    fetchAssetsMock.mockRejectedValueOnce(new Error("RLS denied"));

    await act(async () => {
      render(<AppProvider autoload><Probe /></AppProvider>);
    });

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });
    expect(screen.getByTestId("error").textContent).toBe("RLS denied");
    expect(screen.getByTestId("count").textContent).toBe("0");
  });
});
