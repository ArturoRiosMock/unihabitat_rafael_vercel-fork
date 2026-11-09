import { canViewSection } from "@/lib/auth-helpers";
import type { SectionId, UserSession, VendorPermission } from "@/lib/permissions";

export interface AdminAccessInput {
  session: UserSession | null;
  sessionResolved: boolean;
  permissions: VendorPermission[];
  currentSection: SectionId | "config" | null;
  isGuiaStaging: boolean;
  showStagingGuide: boolean;
}

/**
 * Un agente siempre acaba con una fila por sección (`defaultVendorPermissions`
 * o las de `vendedor_permissions`). La lista vacía solo existe mientras esa
 * carga no ha terminado. Tratarla como «sin permiso» ejecuta `router.replace("/admin")`
 * y saca al agente de la ficha sin un HTTP de error.
 */
export function vendorPermissionsReady(
  session: UserSession | null,
  permissions: VendorPermission[],
): boolean {
  return session?.role !== "vendedor" || permissions.length > 0;
}

export function isAdminSectionAllowed(input: AdminAccessInput): boolean {
  if (input.isGuiaStaging) return input.showStagingGuide && input.session?.role === "admin";
  if (!input.sessionResolved || !input.session) return true;
  if (input.session.role === "admin") return true;
  if (!input.currentSection || input.currentSection === "config") return true;
  if (!vendorPermissionsReady(input.session, input.permissions)) return true;
  return canViewSection(input.session, input.currentSection, input.permissions);
}

/** True cuando el agente ya tiene permisos cargados y la sección no es suya. */
export function shouldRedirectVendorToActivos(input: AdminAccessInput): boolean {
  if (!input.sessionResolved || !input.session || input.session.role === "admin") return false;
  if (!input.currentSection) return false;
  if (!vendorPermissionsReady(input.session, input.permissions)) return false;
  return !canViewSection(input.session, input.currentSection, input.permissions);
}
