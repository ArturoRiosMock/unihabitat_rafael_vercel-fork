/** Qué listas del CRM hace falta pedir según la ruta de admin. */

export interface CatalogScope {
  assets: boolean;
  compradores: boolean;
  vendedores: boolean;
}

export const EMPTY_CATALOG_SCOPE: CatalogScope = {
  assets: false,
  compradores: false,
  vendedores: false,
};

/**
 * El portal, la home y el login no entran aquí: no deben descargar activos.
 * Cada pantalla de admin pide solo las listas que pinta.
 */
export function catalogNeedsForPath(pathname: string): CatalogScope {
  if (!pathname.startsWith("/admin")) return { ...EMPTY_CATALOG_SCOPE };

  if (pathname.startsWith("/admin/tareas")) return { ...EMPTY_CATALOG_SCOPE };
  if (pathname.startsWith("/admin/guia-staging")) return { ...EMPTY_CATALOG_SCOPE };
  if (pathname.startsWith("/admin/notificaciones")) return { ...EMPTY_CATALOG_SCOPE };

  if (pathname.startsWith("/admin/informes") || pathname.startsWith("/admin/config")) {
    return { assets: true, compradores: true, vendedores: true };
  }

  if (pathname.startsWith("/admin/agentes")) {
    return { assets: true, compradores: true, vendedores: true };
  }

  if (pathname.startsWith("/admin/ofertas")) {
    return { assets: true, compradores: false, vendedores: true };
  }

  if (pathname.startsWith("/admin/oportunidades")) {
    return { assets: true, compradores: true, vendedores: false };
  }

  if (pathname.startsWith("/admin/compradores/")) {
    return { assets: true, compradores: true, vendedores: true };
  }

  if (pathname === "/admin/compradores") {
    return { assets: false, compradores: true, vendedores: false };
  }

  if (pathname.startsWith("/admin/assets/")) {
    return { assets: true, compradores: true, vendedores: true };
  }

  if (pathname === "/admin" || pathname.startsWith("/admin/assets")) {
    return { assets: true, compradores: false, vendedores: false };
  }

  return { ...EMPTY_CATALOG_SCOPE };
}
