import type { UserSession, SectionId, VendorPermission } from "./permissions";

/**
 * Parse the dev-auth cookie from document.cookie (client-side).
 * Returns null when not authenticated.
 */
export function getDevAuthFromDocument(): UserSession | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((c) => c.startsWith("dev-auth="));
  if (!match) return null;
  try {
    return JSON.parse(decodeURIComponent(match.split("=").slice(1).join("=")));
  } catch {
    return null;
  }
}

export function isAdmin(session: UserSession | null): boolean {
  return session?.role === "admin";
}

export function isVendedor(session: UserSession | null): boolean {
  return session?.role === "vendedor";
}

export function canViewSection(
  session: UserSession | null,
  sectionId: SectionId | "config",
  permissions: VendorPermission[],
): boolean {
  if (!session) return false;
  if (session.role === "admin") return true;
  if (sectionId === "config") return false;
  // El agente siempre entra en Compradores. El servidor limita las filas a las suyas.
  if (session.role === "vendedor" && sectionId === "compradores") return true;
  const perm = permissions.find((p) => p.section === sectionId);
  return perm?.canView ?? false;
}

export function canEditSection(
  session: UserSession | null,
  sectionId: SectionId | "config",
  permissions: VendorPermission[],
): boolean {
  if (!session) return false;
  if (session.role === "admin") return true;
  if (sectionId === "config") return false;
  if (session.role === "vendedor" && sectionId === "compradores") return true;
  const perm = permissions.find((p) => p.section === sectionId);
  return perm?.canEdit ?? false;
}
