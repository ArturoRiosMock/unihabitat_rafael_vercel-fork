import { describe, expect, it } from "vitest";
import { defaultVendorPermissions, hrefToSection, type UserSession } from "@/lib/permissions";
import { isAdminSectionAllowed, shouldRedirectVendorToActivos } from "@/lib/admin-access";

const agente: UserSession = {
  email: "agente1@test",
  role: "vendedor",
  nombre: "Agente 1",
  vendedorId: "vend-1",
};

const base = {
  session: agente,
  sessionResolved: true,
  isGuiaStaging: false,
  showStagingGuide: false,
};

describe("el agente no sale de la ficha mientras cargan los permisos", () => {
  it("en /admin/assets no redirige si los permisos siguen vacíos", () => {
    const input = {
      ...base,
      permissions: [],
      currentSection: hrefToSection("/admin/assets/TEST-DOC-001"),
    };
    expect(input.currentSection).toBe("activos");
    expect(shouldRedirectVendorToActivos(input)).toBe(false);
    expect(isAdminSectionAllowed(input)).toBe(true);
  });

  it("con permiso de activos se queda en la ficha", () => {
    const input = {
      ...base,
      permissions: defaultVendorPermissions(),
      currentSection: hrefToSection("/admin/assets/TEST-DOC-001"),
    };
    expect(shouldRedirectVendorToActivos(input)).toBe(false);
    expect(isAdminSectionAllowed(input)).toBe(true);
  });

  it("sigue redirigiendo una sección que el agente no puede ver", () => {
    const input = {
      ...base,
      permissions: defaultVendorPermissions(),
      currentSection: hrefToSection("/admin/compradores"),
    };
    expect(input.currentSection).toBe("compradores");
    expect(shouldRedirectVendorToActivos(input)).toBe(true);
    expect(isAdminSectionAllowed(input)).toBe(false);
  });

  it("el admin no se redirige", () => {
    const input = {
      ...base,
      session: { ...agente, role: "admin" as const },
      permissions: [],
      currentSection: hrefToSection("/admin/config"),
    };
    expect(shouldRedirectVendorToActivos(input)).toBe(false);
    expect(isAdminSectionAllowed(input)).toBe(true);
  });
});
