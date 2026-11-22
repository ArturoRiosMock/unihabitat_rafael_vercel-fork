"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";
import { SiteFooter } from "@/components/SiteFooter";
import { BrandMark } from "@/components/BrandMark";
import { useApp } from "@/lib/context";

function initialsOf(nombre: string): string {
  return (
    nombre
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "??"
  );
}

function firstNameOf(nombre: string, fallback: string): string {
  const first = nombre.split(/\s+/).filter(Boolean)[0];
  return first || fallback;
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const { session, sessionResolved } = useApp();
  const isLoggedIn = sessionResolved && session != null;
  const userNombre = session?.nombre ?? "";
  const userEmail = session?.email ?? "";
  const userRole = session?.role ?? "cliente";
  const userId = session?.userId;

  // Solo mostramos el bloque de identidad cuando el usuario es cliente/comprador.
  const showClientInfo =
    isLoggedIn && userRole !== "admin" && userRole !== "vendedor";
  return (
    <div className="flex min-h-screen flex-col bg-cream2">
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 border-b border-border bg-white shadow-sm">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center">
            <BrandMark size={32} textClassName="text-base text-navy" />
          </Link>

          <nav className="hidden items-center gap-5 md:flex">
            <Link href="/portal" className="text-sm font-medium text-navy transition-colors hover:text-gold">
              Propiedades
            </Link>
            <Link href="/portal/contacto" className="text-sm font-medium text-muted transition-colors hover:text-navy">
              Contáctanos
            </Link>
            {isLoggedIn && <NotificationBell userId={userId} />}
            {showClientInfo && userNombre && (
              <Link
                href="/portal/privado"
                className="hidden items-center gap-2 rounded-lg border border-border bg-cream px-2.5 py-1.5 transition-colors hover:bg-cream2 md:flex"
                title={userEmail || userNombre}
              >
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold text-white"
                  style={{ background: "linear-gradient(135deg,#0d2a4a,#b8933a)" }}
                >
                  {initialsOf(userNombre)}
                </div>
                <span className="text-xs font-medium text-navy">
                  Hola, {firstNameOf(userNombre, "Usuario")}
                </span>
              </Link>
            )}
            <Link
              href={
                !isLoggedIn
                  ? "/login"
                  : userRole === "admin" || userRole === "vendedor"
                    ? "/admin"
                    : "/portal/privado"
              }
              className="flex items-center gap-1.5 rounded-lg bg-navy px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-navy3"
            >
              <Lock size={12} />
              {isLoggedIn ? "Zona Privada" : "Acceso Privado"}
            </Link>
          </nav>

          {/* Mobile nav toggle */}
          <button className="flex h-9 w-9 items-center justify-center rounded-lg border border-border md:hidden" aria-label="Menú">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </header>

      {/* ── Page content ── */}
      <main className="flex-1">{children}</main>

      <SiteFooter />
    </div>
  );
}
