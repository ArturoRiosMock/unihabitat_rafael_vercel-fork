import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * El listado de activos no debe exponer borrado masivo de toda la tabla.
 * El borrado por IDs seleccionados sí debe seguir disponible.
 */
describe("borrado de activos en admin", () => {
  const adminPage = readFileSync(resolve(__dirname, "../app/admin/page.tsx"), "utf8");
  const assetsAction = readFileSync(resolve(__dirname, "../app/actions/assets.ts"), "utf8");
  const appContext = readFileSync(resolve(__dirname, "../lib/context.tsx"), "utf8");

  it("no muestra el botón «Borrar todos» ni importa deleteAllAssets", () => {
    expect(adminPage).not.toContain("Borrar todos");
    expect(adminPage).not.toContain("deleteAllAssets");
    expect(adminPage).not.toContain("handleDeleteAll");
  });

  it("mantiene «Borrar seleccionados» y deleteAssetsByIds", () => {
    expect(adminPage).toContain("Borrar seleccionados");
    expect(adminPage).toContain("deleteAssetsByIds");
    expect(adminPage).toContain("handleDeleteSelected");
  });

  it("no exporta la action de borrado de todos los activos", () => {
    expect(assetsAction).not.toMatch(/export\s+(async\s+)?function\s+deleteAllAssets\b/);
    expect(assetsAction).toMatch(/export\s+async\s+function\s+deleteAssetsByIds\b/);
  });

  it("no conserva clearAssets, que solo vaciaba la lista tras borrar todos", () => {
    expect(appContext).not.toMatch(/\bclearAssets\b/);
    expect(appContext).toMatch(/removeAssetsByIds/);
  });
});
