import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import type { Asset } from "@/lib/types";
import {
  buildAssetListFilterOptions,
  buildCatFilterOptions,
  buildPobFilterOptions,
  assetMatchesListFilters,
  portalCatalogAssets,
  countAssetsMatchingListFilters,
  matchesFilterValue,
  uniqueFilterOptions,
  type AssetListFilters,
} from "@/lib/asset-filters";

const SHARED_FILTER_SYMBOLS = [
  "buildAssetListFilterOptions",
  "assetMatchesListFilters",
] as const;

interface FixtureOverrides extends Partial<Asset> {
  cat?: string;
  fase?: string;
  proceso?: string;
  deuda?: number | null;
}

function makeAsset(overrides: FixtureOverrides = {}): Asset {
  const { cat, fase, proceso, deuda, ...rest } = overrides;
  const base: Asset = {
    id: "ASSET-1",
    referencia: "ASSET-1",
    prov: "Alicante",
    pob: "Alicante",
    cp: "03001",
    addr: "C/ Test",
    tip: "PISO",
    tipC: "tp-piso",
    precio: 100000,
    fav: false,
    chk: false,
    sqm: 80,
    tvia: "CALLE",
    nvia: "TEST",
    num: "1",
    esc: "—",
    pla: "—",
    pta: "—",
    map: "",
    lat: null,
    lng: null,
    clase: "URBANO",
    uso: "Residencial",
    bien: "VIVIENDA",
    supC: "80 m²",
    supG: "—",
    coef: "—",
    ccaa: "Comunidad Valenciana",
    fullAddr: "C/ Test, Alicante",
    desc: "—",
    pub: true,
    propiedades: [],
    ...rest,
  };
  // El test usa `cat`/`fase`/`proceso`/`deuda` como atajos para inyectar una propiedad.
  if (cat !== undefined || fase !== undefined || proceso !== undefined || deuda !== undefined) {
    const categoria =
      cat === undefined || cat === "—" ? "CDR" : cat;
    base.propiedades = [{
      id: `${base.id}-P1`,
      inmuebleId: base.id,
      activoId: `ACT-${base.id}`,
      categoria,
      propietario: "—",
      contacto: "—",
      telefono: "—",
      mail: "—",
      faseInterna: fase ?? "Publicado",
      faseC: "fp-pub",
      proceso: proceso ?? "—",
      deuda: deuda ?? null,
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
    }];
  }
  return base;
}

/** Réplica de cómo /admin y /portal construyen sus listas filtradas. */
function filterAdminAssets(assets: Asset[], filters: AssetListFilters): Asset[] {
  return assets.filter((a) => assetMatchesListFilters(a, filters));
}

function filterPortalAssets(assets: Asset[], filters: AssetListFilters): Asset[] {
  const publicAssets = assets.filter((a) => a.pub);
  return publicAssets.filter((a) => assetMatchesListFilters(a, filters));
}

function buildAdminFilterOptions(assets: Asset[], active: AssetListFilters = {}) {
  return buildAssetListFilterOptions(assets, active);
}

function buildPortalFilterOptions(assets: Asset[], active: AssetListFilters = {}) {
  const catalog = portalCatalogAssets(assets, false);
  const scoped = buildAssetListFilterOptions(catalog, active);
  return {
    cat: buildCatFilterOptions(assets),
    prov: scoped.prov,
    pob: scoped.pob,
    tip: scoped.tip,
    estado: scoped.estado,
    fase: scoped.fase,
  };
}

const FIXTURE_ASSETS: Asset[] = [
  makeAsset({ id: "A1", cat: "NPL", prov: "Alicante", pob: "Alicante", tip: "piso", fase: "Publicado", pub: true }),
  makeAsset({ id: "A2", cat: "CDR", prov: "ALICANTE", pob: "ALICANTE/ALACANT", tip: "PISO", fase: "PUBLICADO", pub: true }),
  makeAsset({ id: "A3", cat: "CDR", prov: "A Coruña", pob: "Ferrol", tip: "LOCAL", fase: "En venta", pub: true }),
  makeAsset({ id: "A4", cat: "NPL", prov: "A CORUÑA", pob: "FERROL", tip: "local", fase: "En venta", pub: false }),
  makeAsset({ id: "A5", cat: "NPL", prov: "Albacete", pob: "Bonete", tip: "VIVIENDA", fase: "—", pub: true }),
  makeAsset({ id: "A6", cat: "—", prov: "—", pob: "—", tip: "—", fase: "—", pub: true }),
];

describe("uniqueFilterOptions", () => {
  it("deduplica variantes de provincia y prefiere etiqueta con minúsculas", () => {
    expect(uniqueFilterOptions(["ALICANTE", "Alicante", "A CORUÑA", "A Coruña"])).toEqual([
      "A Coruña",
      "Alicante",
    ]);
  });

  it("ignora valores vacíos y em dash", () => {
    expect(uniqueFilterOptions(["—", "", "  ", "NPL"])).toEqual(["NPL"]);
  });
});

describe("assetMatchesListFilters", () => {
  it("empareja provincia y población sin distinguir mayúsculas ni tildes", () => {
    const asset = makeAsset({ prov: "ALICANTE", pob: "ALICANTE/ALACANT" });
    expect(
      assetMatchesListFilters(asset, { prov: "Alicante", pob: "Alicante/Alacant" }),
    ).toBe(true);
  });

  it("filtra tipología en mayúsculas como en admin", () => {
    const asset = makeAsset({ tip: "piso" });
    expect(assetMatchesListFilters(asset, { tipo: "PISO" })).toBe(true);
    expect(assetMatchesListFilters(asset, { tipo: "LOCAL" })).toBe(false);
  });

  it("filtra por estado de publicación (Publicado / Suspendido)", () => {
    const publicado = makeAsset({ id: "PUB", pub: true });
    const suspendido = makeAsset({ id: "SUS", pub: false });
    expect(assetMatchesListFilters(publicado, { estado: "Publicado" })).toBe(true);
    expect(assetMatchesListFilters(publicado, { estado: "Suspendido" })).toBe(false);
    expect(assetMatchesListFilters(suspendido, { estado: "Suspendido" })).toBe(true);
  });

  it("filtra por situación (fase interna) independiente del estado de publicación", () => {
    const asset = makeAsset({ id: "F1", fase: "Disponible", pub: false });
    expect(assetMatchesListFilters(asset, { fase: "Disponible" })).toBe(true);
    expect(assetMatchesListFilters(asset, { fase: "Seguimiento" })).toBe(false);
    expect(assetMatchesListFilters(asset, { estado: "Suspendido", fase: "Disponible" })).toBe(true);
  });
});

describe("paridad admin vs portal", () => {
  it("portal devuelve el mismo subconjunto que admin restringido a activos publicados", () => {
    const filters: AssetListFilters = {
      cat: "NPL",
      prov: "Alicante",
      pob: "Alicante",
      tipo: "PISO",
      estado: "Publicado",
      fase: "Publicado",
    };

    const adminIds = filterAdminAssets(FIXTURE_ASSETS, filters).map((a) => a.id).sort();
    const portalIds = filterPortalAssets(FIXTURE_ASSETS, filters).map((a) => a.id).sort();
    const expectedIds = adminIds.filter((id) => FIXTURE_ASSETS.find((a) => a.id === id)?.pub);

    expect(portalIds).toEqual(expectedIds);
  });

  it("portal expone las mismas categorías que admin aunque el listado sea solo publicado", () => {
    const admin = buildAdminFilterOptions(FIXTURE_ASSETS, { prov: "Alicante" });
    const portal = buildPortalFilterOptions(FIXTURE_ASSETS, { prov: "Alicante" });
    expect(portal.cat).toEqual(admin.cat);
  });

  it("restringe provincias y poblaciones cuando hay categoría activa", () => {
    const all = buildAdminFilterOptions(FIXTURE_ASSETS);
    const npl = buildAdminFilterOptions(FIXTURE_ASSETS, { cat: "NPL" });
    const cdr = buildAdminFilterOptions(FIXTURE_ASSETS, { cat: "CDR" });

    expect(npl.prov).toEqual(["A CORUÑA", "Albacete", "Alicante"]);
    expect(cdr.prov).toEqual(["A Coruña", "ALICANTE"]);
    expect(cdr.prov).not.toEqual(npl.prov);
    expect(npl.pob).toEqual(["Alicante", "Bonete", "FERROL"]);
    expect(cdr.pob).toEqual(["ALICANTE/ALACANT", "Ferrol"]);
    expect(cdr.pob).not.toContain("Bonete");
    expect(npl.pob).not.toContain("ALICANTE/ALACANT");
    expect(all.prov.length).toBeGreaterThanOrEqual(npl.prov.length);
  });

  it("staff en portal ve el catálogo completo; visitantes solo publicados", () => {
    expect(portalCatalogAssets(FIXTURE_ASSETS, true).map((a) => a.id).sort()).toEqual(
      FIXTURE_ASSETS.map((a) => a.id).sort(),
    );
    expect(portalCatalogAssets(FIXTURE_ASSETS, false).map((a) => a.id).sort()).toEqual(
      FIXTURE_ASSETS.filter((a) => a.pub).map((a) => a.id).sort(),
    );
  });

  it("cuenta inmuebles suspendidos que coinciden con el filtro de categoría", () => {
    const suspendedNpl = countAssetsMatchingListFilters(
      FIXTURE_ASSETS.filter((a) => !a.pub),
      { cat: "NPL" },
    );
    expect(suspendedNpl).toBe(1);
  });

  it("filtra población por provincia con la misma lógica en admin y portal", () => {
    const adminPob = buildAssetListFilterOptions(FIXTURE_ASSETS, { prov: "A Coruña" }).pob;
    const portalPob = buildAssetListFilterOptions(
      FIXTURE_ASSETS.filter((a) => a.pub),
      { prov: "A CORUÑA" },
    ).pob;

    expect(portalPob).toEqual(["Ferrol"]);
    expect(adminPob).toEqual(["Ferrol"]);
    expect(portalPob).toEqual(adminPob);
  });
});

describe("categoría libre OCUPADO y columnas proceso/deuda", () => {
  it("incluye OCUPADO en opciones de categoría y filtra por ella", () => {
    const assets = [
      ...FIXTURE_ASSETS,
      makeAsset({ id: "OCC1", cat: "OCUPADO", prov: "Madrid", pob: "Valdemoro", tip: "PISO", pub: true }),
    ];
    const opts = buildCatFilterOptions(assets);
    expect(opts).toContain("OCUPADO");
    const filtered = filterAdminAssets(assets, { cat: "OCUPADO" });
    expect(filtered.map((a) => a.id)).toEqual(["OCC1"]);
  });

  it("filtra por proceso y deuda con la misma API de list filters", () => {
    const assets = [
      makeAsset({ id: "P1", cat: "NPL", proceso: "EJ-1", deuda: 100000, pub: true }),
      makeAsset({ id: "P2", cat: "NPL", proceso: "EJ-2", deuda: 50000, pub: true }),
    ];
    expect(filterAdminAssets(assets, { proceso: "EJ-1" }).map((a) => a.id)).toEqual(["P1"]);
    const withDeuda = buildAssetListFilterOptions(assets);
    expect(withDeuda.proceso).toEqual(expect.arrayContaining(["EJ-1", "EJ-2"]));
  });
});

describe("páginas admin y portal", () => {
  it("el listado admin importa los helpers compartidos", () => {
    const src = readFileSync(resolve(__dirname, "../app/admin/page.tsx"), "utf8");
    expect(src).toContain('@/lib/asset-filters');
    for (const symbol of SHARED_FILTER_SYMBOLS) {
      expect(src, `admin/page.tsx debe importar ${symbol}`).toContain(symbol);
    }
  });

  it("el listado de /portal filtra con los mismos helpers, en el servidor", () => {
    const src = readFileSync(resolve(__dirname, "../lib/portal-listing.ts"), "utf8");
    expect(src).toContain('@/lib/asset-filters');
    for (const symbol of SHARED_FILTER_SYMBOLS) {
      expect(src, `portal-listing.ts debe importar ${symbol}`).toContain(symbol);
    }
    const page = readFileSync(resolve(__dirname, "../app/portal/page.tsx"), "utf8");
    expect(page).toContain("loadPortalListing");
  });

  it("home usa asset-filters para handoff a /portal", () => {
    const listing = readFileSync(resolve(__dirname, "../lib/portal-listing.ts"), "utf8");
    expect(listing).toContain('@/lib/asset-filters');
    expect(listing).toContain("buildAssetListFilterOptions");
    const home = readFileSync(resolve(__dirname, "../components/HomeClient.tsx"), "utf8");
    expect(home).toContain('router.push(`/portal');
    expect(home).toContain("cat");
    expect(home).toContain("prov");
    expect(home).toContain("pob");
    expect(home).toContain("tipo");
  });
});
