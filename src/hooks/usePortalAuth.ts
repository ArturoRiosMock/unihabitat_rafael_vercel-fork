"use client";

import { useState, useEffect } from "react";
import { getDevAuthFromDocument } from "@/lib/dev-auth-client";
import { createClient } from "@/lib/supabase/client";

export type PortalRole = "admin" | "vendedor" | "cliente" | null;

export type PortalAuthState = {
  /** true cuando hay sesión (cookie dev-auth o Supabase): datos reservados del portal. */
  sensitiveVisible: boolean;
  /** true solo para personal interno (admin / vendedor). Datos privados del activo. */
  isStaff: boolean;
  role: PortalRole;
  currentUser: { email: string; nombre: string } | null;
  userResolved: boolean;
};

function normalizeRole(raw: string | undefined | null): PortalRole {
  if (raw === "admin" || raw === "vendedor" || raw === "cliente") return raw;
  return null;
}

type PortalAuthSnapshot = {
  loggedIn: boolean;
  role: PortalRole;
  currentUser: { email: string; nombre: string } | null;
};

let portalAuthSnapshot: Promise<PortalAuthSnapshot> | null = null;

async function readPortalAuth(): Promise<PortalAuthSnapshot> {
  const dev = getDevAuthFromDocument();
  if (dev) {
    const devRole = normalizeRole(dev.role);
    return {
      loggedIn: true,
      role: devRole,
      currentUser: devRole === "cliente" || devRole === "vendedor"
        ? { email: dev.email, nombre: dev.nombre }
        : null,
    };
  }
  try {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return { loggedIn: false, role: null, currentUser: null };
    const userRole = normalizeRole(user.user_metadata?.role as string | undefined) ?? "cliente";
    return {
      loggedIn: true,
      role: userRole,
      currentUser: (userRole === "cliente" || userRole === "vendedor") && user.email
        ? {
            email: user.email,
            nombre: (user.user_metadata?.nombre as string | undefined) || "Usuario",
          }
        : null,
    };
  } catch {
    return { loggedIn: false, role: null, currentUser: null };
  }
}

function loadPortalAuthOnce(): Promise<PortalAuthSnapshot> {
  if (!portalAuthSnapshot) portalAuthSnapshot = readPortalAuth();
  return portalAuthSnapshot;
}

export function usePortalAuth(): PortalAuthState {
  const [portalAuthChecked, setPortalAuthChecked] = useState(false);
  const [portalLoggedIn, setPortalLoggedIn] = useState(false);
  const [role, setRole] = useState<PortalRole>(null);
  const [currentUser, setCurrentUser] = useState<{ email: string; nombre: string } | null>(null);
  const [userResolved, setUserResolved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadPortalAuthOnce().then((snapshot) => {
      if (cancelled) return;
      setPortalLoggedIn(snapshot.loggedIn);
      setRole(snapshot.role);
      setCurrentUser(snapshot.currentUser);
      setPortalAuthChecked(true);
      setUserResolved(true);
    });
    return () => { cancelled = true; };
  }, []);

  return {
    sensitiveVisible: portalAuthChecked && portalLoggedIn,
    isStaff: portalAuthChecked && (role === "admin" || role === "vendedor"),
    role,
    currentUser,
    userResolved,
  };
}
