import { describe, expect, it } from "vitest";
import type { PortalCard } from "@/lib/portal-listing";
import {
  clampPortalPageSize,
  paginatePortalCards,
  parsePortalSearchParams,
  portalQueryToSearchParams,
  PORTAL_PAGE_SIZE_DEFAULT,
} from "@/lib/portal-listing";
import { catalogNeedsForPath } from "@/lib/catalog-scope";
import { clusterMapPoints } from "@/lib/map-cluster";
import { cardImageSize, cardImageSrc, isOptimizableImageSrc } from "@/lib/portal-card-media";

function card(partial: Partial<PortalCard> & Pick<PortalCard, "id">): PortalCard {
  return {
    publicSlug: partial.id.toLowerCase(),
    referencia: partial.id,
    prov: "Alicante",
    pob: "Alicante",
    cp: "03001",
    addr: "C/ Test",
    fullAddr: "C/ Test",
    ccaa: "Comunidad Valenciana",
    tip: "PISO",
    tvia: "CALLE",
    nvia: "TEST",
    num: "1",
    clase: "URBANO",
    uso: "Residencial",
    bien: "VIVIENDA",
    precio: 100000,
    sqm: 80,
    map: "",
    lat: 38.34,
    lng: -0.48,
    pub: true,
    propiedades: [{
      id: `${partial.id}-P`,
      inmuebleId: partial.id,
      activoId: "ACT-1",
      categoria: "CDR",
      deuda: null,
      precioPublicacion: null,
      collateralId: "",
      idPrinex: "",
      idProperty: "",
      mainLocalCcc14: "",
      portfolio: "Cartera",
    }],
    ...partial,
  };
}

describe("listado público — query string", () => {
  it("deja la página 1 y 24 tarjetas cuando la URL no trae paginación", () => {
    const query = parsePortalSearchParams({ cat: "NPL" });
    expect(query.page).toBe(1);
    expect(query.pageSize).toBe(PORTAL_PAGE_SIZE_DEFAULT);
    expect(query.pageSize).toBe(24);
    expect(query.cat).toBe("NPL");
    expect(query.sort).toBe("none");
  });

  it("trata REO como catálogo completo y limita el tamaño de página a 24 o 48", () => {
    const query = parsePortalSearchParams({ cat: "REO", size: "200", page: "3", sort: "price_asc", q: "  alicante " });
    expect(query.cat).toBe("");
    expect(query.pageSize).toBe(48);
    expect(query.page).toBe(3);
    expect(query.sort).toBe("price_asc");
    expect(query.q).toBe("alicante");
    expect(clampPortalPageSize(50)).toBe(48);
    expect(clampPortalPageSize(10)).toBe(24);
  });

  it("omite los valores por defecto al serializar la URL", () => {
    const query = parsePortalSearchParams({ prov: "Alicante" });
    expect(portalQueryToSearchParams(query)).toBe("?prov=Alicante");
  });
});

describe("listado público — página y filtros", () => {
  const catalog = [
    card({ id: "A1", prov: "Alicante", pob: "Alicante", tip: "PISO", precio: 90000 }),
    card({ id: "A2", prov: "Alicante", pob: "Elche", tip: "LOCAL", precio: 120000, propiedades: [{
      id: "A2-P", inmuebleId: "A2", activoId: "ACT-2", categoria: "NPL", deuda: 40000,
      precioPublicacion: null, collateralId: "", idPrinex: "", idProperty: "", mainLocalCcc14: "", portfolio: "",
    }] }),
    card({ id: "A3", prov: "Madrid", pob: "Madrid", tip: "PISO", precio: 200000 }),
  ];

  it("filtra por provincia, pagina y cuenta el total", () => {
    const page = paginatePortalCards({
      catalog,
      allCategorias: ["CDR", "NPL"],
      query: parsePortalSearchParams({ prov: "Alicante", size: "24" }),
      role: "other",
      countSuspended: false,
    });
    expect(page.total).toBe(2);
    expect(page.items.map((item) => item.id)).toEqual(["A1", "A2"]);
    expect(page.options.pob).toEqual(expect.arrayContaining(["Alicante", "Elche"]));
    expect(page.options.pob).not.toContain("Madrid");
    expect(page.items[0].propiedades[0]).not.toHaveProperty("propietario");
  });

  it("ordena por precio ascendente con los vacíos al final", () => {
    const page = paginatePortalCards({
      catalog: [
        card({ id: "CARO", precio: 300000 }),
        card({ id: "SIN", precio: null }),
        card({ id: "BARATO", precio: 50000 }),
      ],
      allCategorias: ["CDR"],
      query: parsePortalSearchParams({ sort: "price_asc", size: "24" }),
      role: "other",
      countSuspended: false,
    });
    expect(page.items.map((item) => item.id)).toEqual(["BARATO", "CARO", "SIN"]);
  });

  it("cuenta suspendidos solo cuando el filtro público no devuelve filas", () => {
    const hidden = [card({ id: "OFF", pub: false, prov: "Teruel", pob: "Teruel" })];
    const empty = paginatePortalCards({
      catalog: [],
      unpublished: hidden,
      allCategorias: ["CDR"],
      query: parsePortalSearchParams({ prov: "Teruel" }),
      role: "other",
      countSuspended: true,
    });
    expect(empty.total).toBe(0);
    expect(empty.suspendedMatchCount).toBe(1);

    const some = paginatePortalCards({
      catalog,
      unpublished: hidden,
      allCategorias: ["CDR"],
      query: parsePortalSearchParams({ prov: "Alicante" }),
      role: "other",
      countSuspended: true,
    });
    expect(some.suspendedMatchCount).toBe(0);
  });
});

describe("catálogo por pantalla", () => {
  it("no carga activos fuera del admin", () => {
    expect(catalogNeedsForPath("/portal")).toEqual({ assets: false, compradores: false, vendedores: false });
    expect(catalogNeedsForPath("/")).toEqual({ assets: false, compradores: false, vendedores: false });
  });

  it("en activos solo pide inmuebles y en compradores solo compradores", () => {
    expect(catalogNeedsForPath("/admin")).toEqual({ assets: true, compradores: false, vendedores: false });
    expect(catalogNeedsForPath("/admin/compradores")).toEqual({
      assets: false,
      compradores: true,
      vendedores: false,
    });
    expect(catalogNeedsForPath("/admin/tareas").assets).toBe(false);
  });
});

describe("mapa — agrupación", () => {
  const madrid = [
    { id: "m1", lat: 40.42, lng: -3.70 },
    { id: "m2", lat: 40.421, lng: -3.701 },
  ];

  it("agrupa puntos cercanos con poco zoom y los separa al acercar", () => {
    const far = clusterMapPoints(madrid, 5);
    expect(far).toHaveLength(1);
    expect(far[0].count).toBe(2);
    const near = clusterMapPoints(madrid, 14);
    expect(near).toHaveLength(2);
    expect(near.every((cluster) => cluster.count === 1)).toBe(true);
  });
});

describe("miniatura de tarjeta", () => {
  it("reserva ancho y alto y no usa el mapa placeholder de España", () => {
    expect(cardImageSize()).toEqual({ width: 640, height: 360 });
    const placeholder = "https://maps.geoapify.com/v1/staticmap?center=lonlat:-3.7038,40.4168&zoom=6&apiKey=k";
    expect(cardImageSrc({ map: placeholder, lat: null, lng: null })).toBe("");
    const src = cardImageSrc({ map: "", lat: 39.47, lng: -0.38 });
    expect(src).toContain("39.47");
    expect(isOptimizableImageSrc(src)).toBe(true);
    expect(isOptimizableImageSrc("https://example.com/mapa.png")).toBe(false);
  });
});
