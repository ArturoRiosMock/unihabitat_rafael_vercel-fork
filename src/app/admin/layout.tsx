"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  Building2, ShoppingCart, Handshake, CheckSquare, BarChart3,
  Settings, LogOut, FileText, BookOpen, type LucideIcon,
} from "lucide-react";
import { signOut } from "@/app/login/actions";
import { canViewSection } from "@/lib/auth-helpers";
import { isAdminSectionAllowed, shouldRedirectVendorToActivos } from "@/lib/admin-access";
import { hrefToSection } from "@/lib/permissions";
import type { SectionId } from "@/lib/permissions";
import { useApp } from "@/lib/context";
import { AssetsErrorBanner } from "@/components/AssetsErrorBanner";
import { isStagingGuideEnabled } from "@/lib/staging-guide";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  sectionId: SectionId | "config" | "guia-staging";
  sep?: boolean;
  stagingOnly?: boolean;
}

const ALL_NAV_ITEMS: NavItem[] = [
  { href: "/admin",              label: "Activos",     icon: Building2,    sectionId: "activos" },
  { href: "/admin/compradores",  label: "Compradores", icon: ShoppingCart,  sectionId: "compradores" },
  { href: "/admin/agentes",      label: "Agentes",     icon: Handshake,    sectionId: "agentes" },
  { href: "/admin/tareas",       label: "Tareas",      icon: CheckSquare,  sectionId: "tareas", sep: true },
  { href: "/admin/ofertas",      label: "Ofertas",     icon: FileText,     sectionId: "ofertas" },
  { href: "/admin/informes",     label: "Informes",    icon: BarChart3,    sectionId: "informes" },
  { href: "/admin/config",       label: "Config",      icon: Settings,     sectionId: "config", sep: true },
  {
    href: "/admin/guia-staging",
    label: "Guía",
    icon: BookOpen,
    sectionId: "guia-staging",
    stagingOnly: true,
    sep: true,
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { session, sessionResolved, permissions } = useApp();
  const showStagingGuide = isStagingGuideEnabled();

  const isActive = (href: string) => {
    if (href === "/admin") return pathname === "/admin" || pathname.startsWith("/admin/assets");
    return pathname.startsWith(href);
  };

  const visibleNav = ALL_NAV_ITEMS.filter((item) => {
    if (!sessionResolved || !session) return false;
    if (item.stagingOnly) {
      return showStagingGuide && session.role === "admin";
    }
    return canViewSection(session, item.sectionId as SectionId | "config", permissions);
  });

  const isGuiaStaging = pathname.startsWith("/admin/guia-staging");
  const access = {
    session,
    sessionResolved,
    permissions,
    currentSection: hrefToSection(pathname),
    isGuiaStaging,
    showStagingGuide,
  };
  const sectionAllowed = isAdminSectionAllowed(access);
  const redirectToActivos = shouldRedirectVendorToActivos(access);

  useEffect(() => {
    if (redirectToActivos) router.replace("/admin");
  }, [redirectToActivos, router]);

  if (!sessionResolved) return null;

  return (
    <div className="flex min-h-screen">
      <aside className="fixed left-0 top-0 z-50 flex h-screen w-[72px] flex-col items-center bg-navy py-5 shadow-[3px_0_20px_rgba(0,0,0,0.25)]">
        <Link href="/" className="mb-6 flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.jpg" alt="Logo" className="h-8 w-8 object-contain" width={40} height={40} />
        </Link>

        {session && (
          <div className="mb-4 flex flex-shrink-0 flex-col items-center gap-1">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-bold text-white"
              style={{ background: session.role === "admin" ? "linear-gradient(135deg,#b8933a,#0d1b2a)" : "linear-gradient(135deg,#2563a8,#0d2a4a)" }}
            >
              {session.nombre.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
            </div>
            <span className={`rounded px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider ${
              session.role === "admin" ? "bg-gold/20 text-gold" : "bg-blue-400/20 text-blue-300"
            }`}>
              {session.role === "admin" ? "Admin" : "Agente"}
            </span>
          </div>
        )}

        <nav className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto">
          {visibleNav.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <div key={item.href}>
                {item.sep && <div className="my-2 h-px w-8 bg-white/[0.08]" />}
                <Link
                  href={item.href}
                  className={`flex w-14 flex-col items-center justify-center gap-1.5 rounded-lg py-2.5 transition-all ${
                    active ? "bg-white/[0.08] text-gold" : "text-white/40 hover:bg-white/[0.05] hover:text-white/70"
                  }`}
                >
                  <Icon size={18} strokeWidth={active ? 2 : 1.5} />
                  <span className="text-[9px] font-medium uppercase tracking-[0.8px]">{item.label}</span>
                </Link>
              </div>
            );
          })}
        </nav>

        <form action={signOut} className="mt-auto flex-shrink-0">
          <button
            type="submit"
            className="flex w-14 flex-col items-center justify-center gap-1.5 rounded-lg py-2.5 text-white/40 transition-all hover:bg-white/[0.05] hover:text-red-400"
            title="Cerrar sesión"
          >
            <LogOut size={18} strokeWidth={1.5} />
            <span className="text-[9px] font-medium uppercase tracking-[0.8px]">Salir</span>
          </button>
        </form>
      </aside>

      <main className="ml-[72px] flex flex-1 flex-col min-h-screen">
        <AssetsErrorBanner />
        {sectionAllowed ? (
          children
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-muted">
            <p className="text-lg font-medium text-navy">Sin acceso</p>
            <p className="text-sm">No tienes permisos para ver esta sección.</p>
            <Link href="/admin" className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy3">
              Volver a Activos
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
