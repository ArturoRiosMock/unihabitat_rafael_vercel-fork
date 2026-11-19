"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { upsertComprador, ensureCompradorForEmail } from "@/app/actions/compradores";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isDevAuthEnabled, resolveRole, isDemoEmail } from "@/lib/auth-role";
import { inicialesComprador, nombreCompleto } from "@/lib/comprador-oferta";

const cookieBase = {
  path: "/" as const,
  httpOnly: false,
  sameSite: "lax" as const,
  maxAge: 60 * 60 * 24,
  // Vercel define VERCEL en deploy (HTTPS). En local sin VERCEL la cookie sigue siendo usable en http.
  secure: Boolean(process.env.VERCEL),
};

// ── Demo / dev users (bypass de Supabase Auth) ──
// Sirven para roleplay local sin necesidad de tener usuarios reales en
// `auth.users`. Cualquier email fuera de esta lista pasa por Supabase Auth.
// Only available when isDevAuthEnabled() returns true.
const DEV_USERS: Record<string, { password: string; role: string; nombre: string }> = {
  "admin@propcrm.com": { password: "Admin1234!", role: "admin", nombre: "Administrador" },
  "cliente@propcrm.com": { password: "Cliente1234!", role: "cliente", nombre: "Cliente Demo" },
  "vendedor@propcrm.com": { password: "Vendedor1234!", role: "vendedor", nombre: "Carlos Martínez" },
};

const ZW_RE = /[\u200b\u200c\u200d\ufeff]/g;

function normalizeEmailKey(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(ZW_RE, "").trim().toLowerCase();
}

function normalizePasswordInput(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(ZW_RE, "").trim().normalize("NFC");
}

function destinationForRole(role: string | undefined, redirectTo: string): string {
  if (redirectTo) return redirectTo;
  return role === "admin" || role === "vendedor" ? "/admin" : "/portal/privado";
}

function withWelcome(path: string): string {
  if (!path) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}welcome=1`;
}

async function clearAuthCookies() {
  const cookieStore = await cookies();
  cookieStore.delete("dev-auth");
  for (const c of cookieStore.getAll()) {
    if (/^sb-.*-auth-token(\.\d+)?$/.test(c.name)) {
      cookieStore.delete(c.name);
    }
  }
}

async function clearDevAuthOnly() {
  const cookieStore = await cookies();
  cookieStore.delete("dev-auth");
}

/** Login para usuarios demo (DEV_USERS). Setea cookie dev-auth y redirige. */
async function signInDevUser(
  emailKey: string,
  passwordKey: string,
  redirectTo: string,
): Promise<{ error?: string }> {
  const devUser = DEV_USERS[emailKey];
  if (!devUser) return { error: "Cuenta demo no encontrada." };
  if (devUser.password !== passwordKey) {
    return { error: "Contraseña incorrecta." };
  }

  let vendedorId: string | undefined;
  let compradorId: string | undefined;
  if (devUser.role === "vendedor") {
    try {
      const sb = await createServiceClient();
      const { data } = await sb
        .from("vendedores")
        .select("id")
        .eq("email", emailKey)
        .maybeSingle();
      vendedorId = data?.id ?? undefined;
    } catch {
      /* BD no disponible — continuamos sin vendedorId */
    }
  } else if (devUser.role === "cliente") {
    try {
      compradorId = await ensureCompradorForEmail(emailKey, devUser.nombre);
    } catch {
      /* BD no disponible — continuamos sin compradorId */
    }
  }

  await clearAuthCookies();
  const cookieStore = await cookies();
  cookieStore.set(
    "dev-auth",
    JSON.stringify({
      email: emailKey,
      role: devUser.role,
      nombre: devUser.nombre,
      ...(vendedorId ? { vendedorId } : {}),
      ...(compradorId ? { compradorId } : {}),
    }),
    cookieBase,
  );

  return {};
}

export async function signIn(formData: FormData) {
  const emailRaw = formData.get("email");
  const password = formData.get("password");
  const redirectTo = (formData.get("redirect") as string) || "";

  const emailKey = normalizeEmailKey(emailRaw);
  const passwordKey = normalizePasswordInput(password);

  if (!emailKey) {
    return { error: "Introduce un email válido." };
  }
  if (!passwordKey) {
    return { error: "Introduce tu contraseña." };
  }

  // 1) Cuentas demo: bypass total de Supabase Auth (solo en dev/staging).
  if (isDevAuthEnabled() && DEV_USERS[emailKey]) {
    const devResult = await signInDevUser(emailKey, passwordKey, redirectTo);
    if (devResult.error) return devResult;
    redirect(withWelcome(destinationForRole(DEV_USERS[emailKey].role, redirectTo)));
  }

  // 2) Usuarios reales: Supabase Auth.
  const result = await trySupabaseSignIn(emailKey, passwordKey);
  if (result.error) return result.error;

  // Limpia dev-auth si quedó de un login demo previo.
  await clearDevAuthOnly();

  redirect(withWelcome(destinationForRole(result.role, redirectTo)));
}

/**
 * Intenta `signInWithPassword`. Si Supabase responde "email not confirmed"
 * (configuración por defecto del proyecto), auto-confirma el email vía
 * service-role y reintenta una vez. Esto es necesario porque la respuesta
 * genérica "Invalid login credentials" de Supabase ahora oculta este caso
 * por defecto, lo que rompía el login post-registro en este entorno.
 */
async function trySupabaseSignIn(
  email: string,
  password: string,
): Promise<{ role?: string; error?: { error: string } }> {
  let supabaseError: string | null = null;
  let role: string | undefined;

  const attemptSignIn = async () => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        supabaseError = error.message;
        return null;
      }
      supabaseError = null;
      return data;
    } catch (e) {
      supabaseError = e instanceof Error ? e.message : "Error de conexión";
      console.error("[signIn] signInWithPassword falló:", supabaseError);
      return null;
    }
  };

  let data = await attemptSignIn();

  // Reintento: si el error sugiere que la cuenta existe pero no está
  // confirmada, auto-confirmamos vía service-role y reintentamos.
  if (
    !data &&
    supabaseError &&
    (/email not confirmed/i.test(supabaseError) ||
      /invalid login credentials/i.test(supabaseError))
  ) {
    const confirmed = await tryAutoConfirmEmail(email);
    if (confirmed) {
      data = await attemptSignIn();
    }
  }

  if (!data) {
    if (supabaseError && /fetch failed/i.test(supabaseError)) {
      return { error: { error: "No se pudo contactar al servidor de autenticación. Revisa tu conexión." } };
    }
    if (supabaseError && /rate limit/i.test(supabaseError)) {
      return { error: { error: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo." } };
    }
    return { error: { error: "Email o contraseña incorrectos." } };
  }

  const metadataRole = data.user?.user_metadata?.role as string | undefined;
  role = resolveRole(metadataRole, data.user?.email);

  // Asegura que exista una fila de comprador para este usuario (idempotente).
  if (role === "cliente" && data.user?.email) {
    try {
      const nombreFromMeta =
        (data.user.user_metadata?.nombre as string | undefined) || data.user.email;
      await ensureCompradorForEmail(data.user.email, nombreFromMeta);
    } catch {
      /* No bloqueante */
    }
  }

  return { role };
}

/**
 * Auto-confirma el email de un usuario existente usando el service-role.
 * Devuelve true si el email quedó confirmado (ya lo estaba o lo confirmó
 * ahora). Devuelve false si no se encontró el usuario o falla el admin API.
 */
async function tryAutoConfirmEmail(email: string): Promise<boolean> {
  try {
    const admin = await createServiceClient();
    // listUsers acepta email como filtro en versiones recientes; si no, paginamos.
    // Usamos un page sencillo: la mayoría de proyectos en dev tienen pocos users.
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error || !data?.users) return false;

    const user = data.users.find((u) => (u.email || "").toLowerCase() === email);
    if (!user) return false;

    if (user.email_confirmed_at) return true;

    const { error: updErr } = await admin.auth.admin.updateUserById(user.id, {
      email_confirm: true,
    });
    if (updErr) {
      console.warn("[tryAutoConfirmEmail] updateUserById falló:", updErr.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn(
      "[tryAutoConfirmEmail] excepción:",
      e instanceof Error ? e.message : e,
    );
    return false;
  }
}

export async function signUp(formData: FormData): Promise<{ error?: string }> {
  const emailRaw = formData.get("email");
  const passwordRaw = formData.get("password");
  const nombre = ((formData.get("nombre") as string) || "").trim();
  const apellidos = ((formData.get("apellidos") as string) || "").trim();
  const tel = (formData.get("tel") as string) || "";
  const redirectTo = (formData.get("redirect") as string) || "";

  const email = normalizeEmailKey(emailRaw);
  const password = normalizePasswordInput(passwordRaw);

  if (!email) return { error: "Introduce un email válido." };
  if (password.length < 6) return { error: "La contraseña debe tener al menos 6 caracteres." };
  if (!nombre) return { error: "Introduce tu nombre." };
  if (!apellidos) return { error: "Introduce tus apellidos." };
  const nombreVisible = nombreCompleto(nombre, apellidos);
  if (isDevAuthEnabled() && DEV_USERS[email]) {
    return { error: "Este email está reservado para una cuenta demo." };
  }
  if (isDemoEmail(email)) {
    return { error: "No se puede registrar con un email @propcrm.com" };
  }

  const initials = inicialesComprador(nombre, apellidos);

  let authUserId: string | null = null;
  let hasSupabaseSession = false;
  let supabaseError: string | null = null;

  // Estrategia: usar el admin API (service-role) para crear el usuario ya
  // confirmado y luego firmar la sesión con el cliente normal. Esto evita el
  // requisito de "email confirmation" del proyecto Supabase, que es lo que
  // estaba dejando a los recién registrados sin poder loguearse.
  try {
    const admin = await createServiceClient();
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: "cliente", nombre: nombreVisible, tel },
    });

    if (createErr) {
      supabaseError = createErr.message;
    } else {
      authUserId = created.user?.id ?? null;
    }
  } catch (e) {
    supabaseError = e instanceof Error ? e.message : "Error de conexión";
    console.warn("[signUp] admin.createUser lanzó excepción:", supabaseError);
  }

  // Si el admin API no está disponible (sin SUPABASE_SERVICE_ROLE_KEY o falla
  // de red), caemos al signUp normal. El usuario podrá necesitar confirmar el
  // email después.
  if (supabaseError && !authUserId) {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { role: "cliente", nombre: nombreVisible, tel } },
      });
      if (error) {
        supabaseError = error.message;
      } else {
        supabaseError = null;
        authUserId = data.user?.id ?? null;
        hasSupabaseSession = Boolean(data.session);
      }
    } catch (e) {
      supabaseError = e instanceof Error ? e.message : "Error de conexión";
      console.warn("[signUp] auth.signUp fallback falló:", supabaseError);
    }
  }

  if (supabaseError && !authUserId) {
    if (/already (registered|exists)/i.test(supabaseError) || /User already/i.test(supabaseError)) {
      return { error: "Ya existe una cuenta con ese email. Prueba a iniciar sesión." };
    }
    if (/password.*(weak|short|6)/i.test(supabaseError)) {
      return { error: "La contraseña no cumple los requisitos mínimos de seguridad." };
    }
    if (/rate limit/i.test(supabaseError)) {
      return { error: "Demasiados intentos de registro. Espera unos minutos e inténtalo de nuevo." };
    }
    console.warn("[signUp] Supabase falló — usando fallback dev-auth:", supabaseError);
  }

  // Si conseguimos crear el auth user vía admin (sin sesión todavía), iniciamos
  // sesión inmediatamente con la API normal para que las cookies de Supabase
  // queden seteadas y el usuario aterrice autenticado en /portal/privado.
  if (authUserId && !hasSupabaseSession) {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (!error && data.session) {
        hasSupabaseSession = true;
      } else if (error) {
        console.warn("[signUp] auto-login post-createUser falló:", error.message);
      }
    } catch (e) {
      console.warn(
        "[signUp] auto-login post-createUser excepción:",
        e instanceof Error ? e.message : e,
      );
    }
  }

  const compradorId = authUserId || crypto.randomUUID();

  try {
    await upsertComprador({
      id: compradorId,
      nombre,
      apellidos,
      tipoPersona: "fisica",
      razonSocial: "",
      documento: "",
      direccion: "",
      cp: "",
      poblacion: "",
      provincia: "",
      pais: "España",
      ini: initials || "??",
      col: "",
      tipo: "Privado",
      agente: "",
      email,
      tel,
      intereses: "",
      presupuesto: "",
      activos: "",
      actividad: "",
      estado: "Nuevo",
      estadoC: "fp-nd",
      nda: "Pendiente",
      acceso: "sin_acceso",
    });
  } catch (e) {
    console.warn(
      "[signUp] upsertComprador falló, continuamos solo con la sesión:",
      e instanceof Error ? e.message : e,
    );
  }

  // Si Supabase ya creó una sesión, sus cookies están bien. Si no (email
  // confirmation pendiente, o Supabase no disponible), usamos dev-auth como
  // acceso temporal para que el usuario pueda llegar al portal.
  if (!hasSupabaseSession) {
    await clearAuthCookies();
    const cookieStore = await cookies();
    cookieStore.set(
      "dev-auth",
      JSON.stringify({ email, role: "cliente", nombre: nombreVisible, compradorId }),
      cookieBase,
    );
  } else {
    await clearDevAuthOnly();
  }

  redirect(withWelcome(redirectTo || "/portal/privado"));
}

export async function signOut() {
  // Cierra la sesión de Supabase si la hubiera y borra cookies dev-auth.
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch {
    /* sin Supabase: ignoramos */
  }
  await clearAuthCookies();
  redirect("/login");
}

export async function getSession() {
  const cookieStore = await cookies();
  const raw = cookieStore.get("dev-auth")?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function requestPasswordReset(formData: FormData): Promise<{ error?: string; success?: boolean }> {
  const emailRaw = formData.get("email");
  const email = normalizeEmailKey(emailRaw);

  if (!email) {
    return { error: "Introduce un email válido." };
  }

  if (isDemoEmail(email)) {
    return { error: "Las cuentas demo no pueden restablecer su contraseña." };
  }

  try {
    const supabase = await createClient();

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_ORIGIN || "";
    const redirectTo = appUrl ? `${appUrl}/login/reset` : undefined;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    if (error) {
      console.warn("[requestPasswordReset] Supabase error:", error.message);
      if (/rate limit/i.test(error.message)) {
        return { error: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo." };
      }
      return { error: "No se pudo enviar el email de recuperación. Inténtalo más tarde." };
    }

    return { success: true };
  } catch (e) {
    console.error("[requestPasswordReset] Exception:", e);
    return { error: "Error de conexión. Inténtalo más tarde." };
  }
}

export async function updatePassword(formData: FormData): Promise<{ error?: string; success?: boolean }> {
  const password = normalizePasswordInput(formData.get("password"));
  const confirmPassword = normalizePasswordInput(formData.get("confirmPassword"));

  if (!password || password.length < 6) {
    return { error: "La contraseña debe tener al menos 6 caracteres." };
  }

  if (password !== confirmPassword) {
    return { error: "Las contraseñas no coinciden." };
  }

  try {
    const supabase = await createClient();

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      console.warn("[updatePassword] Supabase error:", error.message);
      if (/same as the old password/i.test(error.message)) {
        return { error: "La nueva contraseña debe ser diferente a la anterior." };
      }
      return { error: "No se pudo actualizar la contraseña. Inténtalo de nuevo." };
    }

    return { success: true };
  } catch (e) {
    console.error("[updatePassword] Exception:", e);
    return { error: "Error de conexión. Inténtalo más tarde." };
  }
}
