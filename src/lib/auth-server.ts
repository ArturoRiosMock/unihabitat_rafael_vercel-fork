import { cookies } from "next/headers";
import type { UserSession, SectionId } from "./permissions";
import { isDevAuthEnabled, resolveRole } from "./auth-role";

/**
 * Resuelve la sesión actual desde cookies. Prioriza `dev-auth` (cuentas demo)
 * y, si no existe, intenta resolver con Supabase Auth para que los usuarios
 * registrados vía signUp/signIn también queden reconocidos.
 */
export async function getServerSession(): Promise<UserSession | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get("dev-auth")?.value;
  if (raw && isDevAuthEnabled()) {
    try {
      return JSON.parse(raw) as UserSession;
    } catch {
      /* fallthrough a Supabase */
    }
  }

  const hasSupabaseCookie = cookieStore
    .getAll()
    .some((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name));
  if (!hasSupabaseCookie) return null;

  try {
    const { createClient } = await import("./supabase/server");
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const metadataRole = user.user_metadata?.role as string | undefined;
    const role = resolveRole(metadataRole, user.email);

    const nombre =
      (user.user_metadata?.nombre as string | undefined) ||
      user.email ||
      "Usuario";

    let vendedorId: string | undefined;
    if (role === "vendedor" && user.email) {
      const { createServiceClient } = await import("./supabase/server");
      const sb = await createServiceClient();
      const { data: vRow } = await sb
        .from("vendedores")
        .select("id")
        .or(`user_id.eq.${user.id},email.ilike.${user.email}`)
        .limit(1)
        .maybeSingle();
      vendedorId = (vRow?.id as string | undefined) ?? undefined;
    }

    return {
      email: user.email ?? "",
      role,
      nombre,
      userId: user.id,
      ...(vendedorId ? { vendedorId } : {}),
    };
  } catch {
    return null;
  }
}

export async function requireAdmin(): Promise<UserSession> {
  const session = await getServerSession();
  if (!session || session.role !== "admin") {
    throw new Error("Acceso denegado: se requiere rol admin");
  }
  return session;
}

export async function requireAdminOrVendor(): Promise<UserSession> {
  const session = await getServerSession();
  if (!session || (session.role !== "admin" && session.role !== "vendedor")) {
    throw new Error("Acceso denegado: se requiere autenticación");
  }
  return session;
}

/**
 * Verifies vendor has canEdit for a section. Admins always pass.
 */
export async function requireEditPermission(sectionId: SectionId): Promise<UserSession> {
  const session = await requireAdminOrVendor();
  if (session.role === "admin") return session;

  if (!session.vendedorId) throw new Error("Vendedor sin ID asignado");

  const { createServiceClient } = await import("./supabase/server");
  const sb = await createServiceClient();
  const { data } = await sb
    .from("vendedor_permissions")
    .select("can_edit")
    .eq("vendedor_id", session.vendedorId)
    .eq("section", sectionId)
    .maybeSingle();

  if (!data?.can_edit) {
    throw new Error(`Sin permiso de edición en "${sectionId}"`);
  }
  return session;
}

/**
 * Vendedores share the admin asset universe: they can view (and, when
 * `requireEditPermission` allows, edit) every asset. Kept as a function so
 * existing callers stay unchanged and the gate can be re-tightened later if
 * the product reintroduces per-vendedor asset assignments.
 */
export async function requireAssetAccess(_session: UserSession, _assetId: string): Promise<void> {
  return;
}
