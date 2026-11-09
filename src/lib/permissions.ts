export const ADMIN_SECTIONS = [
  { id: "activos",        label: "Activos",        href: "/admin" },
  { id: "compradores",    label: "Compradores",    href: "/admin/compradores" },
  { id: "agentes",        label: "Agentes",         href: "/admin/agentes" },
  { id: "tareas",         label: "Tareas",         href: "/admin/tareas" },
  { id: "ofertas",        label: "Ofertas",        href: "/admin/ofertas" },
  { id: "informes",       label: "Informes",       href: "/admin/informes" },
  { id: "oportunidades",  label: "Oportunidades",  href: "/admin/oportunidades" },
  { id: "notificaciones", label: "Notificaciones", href: "/admin/notificaciones" },
] as const;

export type SectionId = (typeof ADMIN_SECTIONS)[number]["id"];

export interface VendorPermission {
  section: SectionId;
  canView: boolean;
  canEdit: boolean;
}

export interface UserSession {
  email: string;
  role: "admin" | "vendedor" | "cliente";
  nombre: string;
  vendedorId?: string;
  /** `auth.users.id` cuando la sesión viene de Supabase Auth. */
  userId?: string;
  /** Fila `compradores.id` del cliente (cookie demo o lookup). */
  compradorId?: string;
}

export function hrefToSection(pathname: string): SectionId | "config" | null {
  if (pathname === "/admin" || pathname.startsWith("/admin/assets")) return "activos";
  for (const s of ADMIN_SECTIONS) {
    if (s.href !== "/admin" && pathname.startsWith(s.href)) return s.id;
  }
  if (pathname.startsWith("/admin/config")) return "config";
  return null;
}

export function defaultVendorPermissions(): VendorPermission[] {
  return ADMIN_SECTIONS.map((s) => ({
    section: s.id,
    canView: s.id === "activos",
    canEdit: false,
  }));
}
