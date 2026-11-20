"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Building2,
  CheckCircle2,
  ExternalLink,
  FlaskConical,
  ShoppingCart,
  FileText,
  Globe,
  AlertTriangle,
  ArrowRight,
  Shield,
  Users,
  Link2,
  Lock,
  Mail,
} from "lucide-react";
import { isStagingGuideEnabled } from "@/lib/staging-guide";

type Step = {
  id: string;
  fase: string;
  title: string;
  where: string;
  href: string;
  what: string[];
  howToTest: string[];
  icon?: typeof Building2;
};

const NOVIEMBRE_2026_STEPS: Step[] = [
  {
    id: "nov20-alta-manual",
    fase: "20 nov 2026",
    title: "Alta manual de un activo",
    where: "Admin → Activos → Nuevo activo",
    href: "/admin",
    icon: Building2,
    what: [
      "Formulario de alta: referencia catastral (con consulta al catastro), tipo, dirección, municipio, provincia, CP, superficie, precio, descripción, situación, deuda y proceso.",
      "Propietario y contacto solo los rellena el gestor. Por defecto el activo queda en borrador; Activar lo publica.",
      "Fotos y documentos van al mismo bucket documentos que la ficha. Si la referencia ya existe, no se crea.",
    ],
    howToTest: [
      "Entra como admin → Activos → Nuevo activo.",
      "Rellena referencia, tipo, dirección, municipio y provincia → Crear activo → se abre la ficha en borrador.",
      "Como agente no aparece el botón.",
    ],
  },
  {
    id: "nov20-envios",
    fase: "20 nov 2026",
    title: "Activos enviados al comprador",
    where: "Admin → Compradores → ficha",
    href: "/admin/compradores",
    icon: ShoppingCart,
    what: [
      "Tabla comprador_envios: activo, fecha, canal (email, WhatsApp, manual o cruce) y quién lo envió.",
      "Si ese activo se envió en los últimos 14 días, sale «Ya enviado el dd/mm» y hay que confirmar.",
      "El cruce automático excluye esos activos. El cron y el alta manual dejan constancia aquí.",
    ],
    howToTest: [
      "Abre el comprador TEST-COMP-001 (asignado a agente1) → Activos enviados.",
      "Registra un envío manual del activo TEST-DOC-001 y vuelve a registrarlo: debe pedir confirmación.",
    ],
  },
  {
    id: "nov20-demandas",
    fase: "20 nov 2026",
    title: "Varias demandas por comprador",
    where: "Ficha del comprador y /portal/privado/demanda",
    href: "/portal/privado/demanda",
    icon: FileText,
    what: [
      "Cada guardado crea una demanda con filtros, fecha, autor y estado activa o archivada.",
      "La demanda que ya existía se conserva como activa. El cruce usa todas las activas.",
      "Tras guardar se ve el mensaje «Demanda guardada» y la fila entra en Demandas guardadas.",
    ],
    howToTest: [
      "Como comprador1, en Mi demanda, guarda una búsqueda y comprueba que aparece en la lista.",
      "Archívala y confirma que el cruce deja de usarla. Borrar la quita de la lista.",
    ],
  },
  {
    id: "nov20-seguimiento",
    fase: "20 nov 2026",
    title: "Seguimiento de la oferta",
    where: "Admin → Ofertas y pestaña Clientes del activo",
    href: "/admin/ofertas",
    icon: FileText,
    what: [
      "Campo seguimiento, aparte del estado de workflow: Pendiente, En seguimiento, Enviado, Sin respuesta.",
      "El cambio queda en oferta_historial con autor y fecha, y se puede filtrar en Ofertas.",
      "notificarCambioSeguimiento en src/lib/oferta-workflow.ts es el punto para automatizaciones. Aún no hay ninguna.",
    ],
    howToTest: [
      "Como admin, en Ofertas, cambia el seguimiento y filtra por él.",
      "Como agente1, solo si tiene la sección Ofertas: mismo control en Ofertas y en Clientes del activo.",
    ],
  },
  {
    id: "nov20-avisos",
    fase: "20 nov 2026",
    title: "Avisos por email y WhatsApp",
    where: "Cruce de demanda, Mis datos y /api/whatsapp/webhook",
    href: "/admin/oportunidades",
    icon: Mail,
    what: [
      "Email con Resend si CRUCE_DEMANDA_EMAIL_ENABLED=true. EMAIL_DRY_RUN sigue mandando solo a consola.",
      "WhatsApp Cloud API en src/lib/whatsapp.ts. Desactivado salvo WHATSAPP_ENABLED=true. WHATSAPP_DRY_RUN (por defecto) solo escribe log.",
      "Hace falta teléfono y acepta_whatsapp. Máximo 2 avisos por semana y comprador (lunes UTC), controlado en comprador_avisos.",
      "Variables: WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN, WHATSAPP_TEMPLATE_OPORTUNIDADES (cuerpo {{1}} nombre, {{2}} resumen), WHATSAPP_VERIFY_TOKEN.",
      "GET /api/whatsapp/webhook verifica el token. POST guarda el mensaje en whatsapp_mensajes y lo enlaza por teléfono. Si WHATSAPP_ENABLED no es true, la ruta responde 404.",
    ],
    howToTest: [
      "En Mis datos, comprador1 marca el consentimiento de WhatsApp. El gestor también puede marcarlo en la ficha.",
      "Con EMAIL_DRY_RUN y el flag de email, lanza el cruce y mira la consola. Sin WHATSAPP_ENABLED no sale WhatsApp.",
      "Con WHATSAPP_ENABLED=true y WHATSAPP_DRY_RUN, el log muestra el aviso y no llama a Meta.",
    ],
  },
];

const AUGUST_2026_STEPS: Step[] = [
  {
    id: "aug26-ofertas-agente",
    fase: "Agosto 2026",
    title: "Ofertas del agente: filtro y título dinámico",
    where: "Admin → Ofertas",
    href: "/admin/ofertas",
    icon: FileText,
    what: [
      "fetchOfertas filtra por vendedor_id cuando es agente. Admin ve todas.",
      "Título «Mis ofertas» para agentes vs «Ofertas de Compradores» para admin.",
      "createOfertaAdmin devuelve error explícito si el agente no tiene fila vendedores.",
    ],
    howToTest: [
      "Login como agente → Ofertas → título «Mis ofertas», solo sus ofertas.",
      "Login como admin → título «Ofertas de Compradores», ve todas.",
      "Crear oferta como agente sin fila vendedores → error descriptivo.",
    ],
  },
  {
    id: "aug26-auth-role",
    fase: "Agosto 2026",
    title: "Resolución de rol corporativo (@unihabitat.net)",
    where: "src/lib/auth-role.ts + middleware + login",
    href: "/admin",
    icon: Shield,
    what: [
      "auth-role.ts centraliza la resolución: DB/metadata → @unihabitat.net → cliente.",
      "Demo @propcrm.com solo en dev (NODE_ENV !== production o ALLOW_DEV_AUTH).",
      "Sin email hardcodeado admin@propcrm.com en paths de producción.",
    ],
    howToTest: [
      "Email @unihabitat.net sin rol → resuelve admin.",
      "En producción: login demo bloqueado (requiere Supabase real).",
      "Ficha activo: currentUser usa sesión, no fallback hardcodeado.",
    ],
  },
  {
    id: "aug26-multi-asset",
    fase: "Agosto 2026",
    title: "Activos de la misma operación (activoId)",
    where: "Admin → Activos → Detalle",
    href: "/admin",
    icon: Link2,
    what: [
      "fetchAssetsByActivoIdForAdmin busca hermanos por propiedades.activo_id.",
      "Bloque «Misma operación» con enlaces a hermanos en la ficha del activo.",
      "Excluye el activo actual; muestra población, provincia y tipo.",
    ],
    howToTest: [
      "Abre un activo con activoId compartido → debe aparecer el bloque.",
      "Clic en un hermano → navega a su ficha.",
      "Activo sin activoId → no muestra el bloque.",
    ],
  },
  {
    id: "aug26-contacto-antibot",
    fase: "Agosto 2026",
    title: "Contacto: honeypot, time-trap y rate limit",
    where: "Portal → Contacto",
    href: "/portal/contacto",
    icon: Shield,
    what: [
      "Honeypot: campo oculto «website» — si se rellena, se descarta silenciosamente.",
      "Time-trap: formulario enviado en <2s se descarta silenciosamente.",
      "Rate limit in-memory: 5 envíos por email/minuto.",
      "Turnstile opcional si TURNSTILE_SECRET_KEY + NEXT_PUBLIC_TURNSTILE_SITE_KEY.",
    ],
    howToTest: [
      "Rellena el campo website manualmente → retorna ok pero no envía.",
      "Envía >5 veces rápido → mensaje de rate limit.",
      "Con Turnstile configurado, aparece el widget.",
    ],
  },
  {
    id: "aug26-sidebar",
    fase: "Agosto 2026",
    title: "Sidebar admin: scroll sin tapar Salir",
    where: "Admin (cualquier página)",
    href: "/admin",
    icon: Users,
    what: [
      "Nav tiene min-h-0 overflow-y-auto para scroll si hay muchos items.",
      "Salir (form) es flex-shrink-0, siempre visible al fondo.",
    ],
    howToTest: [
      "Reduce altura del navegador → nav hace scroll, Salir sigue visible.",
    ],
  },
  {
    id: "aug26-password-reset",
    fase: "Agosto 2026",
    title: "Recuperación de contraseña",
    where: "Login → ¿Olvidaste tu contraseña?",
    href: "/login",
    icon: Lock,
    what: [
      "Enlace «¿Olvidaste tu contraseña?» en login (solo modo login).",
      "requestPasswordReset en actions.ts usa Supabase resetPasswordForEmail.",
      "Rechaza emails @propcrm.com (demo) con mensaje claro.",
      "/login/reset: solicita email o cambia contraseña si hay token.",
    ],
    howToTest: [
      "Login → clic «¿Olvidaste…» → pide email.",
      "Email demo → error «Las cuentas demo no pueden…».",
      "Email real → éxito, revisa bandeja (EMAIL_DRY_RUN en staging).",
      "Clic en link del email → formulario para nueva contraseña.",
    ],
  },
];

const LEGACY_STEPS: Step[] = [
  {
    id: "f1-filtros",
    fase: "Fase 1",
    title: "Filtros de Activos (Situación, Proceso, Deuda)",
    where: "Admin → Activos",
    href: "/admin",
    what: [
      "Nuevos filtros operativos alineados al Excel: Situación, Proceso y Deuda.",
      "Siguen disponibles Categoría, Provincia, Población, Tipología y Estado de publicación.",
    ],
    howToTest: [
      "Abre Activos y localiza la fila de filtros bajo el buscador.",
      "Cambia Situación / Proceso / Deuda y comprueba que el listado se reduce.",
      "En la tabla, verifica columnas Situación, Proceso y Deuda en cada fila.",
      "Pulsa Limpiar filtros y verifica que vuelven ~2597 activos (datos de staging).",
    ],
  },
  {
    id: "f1-categoria",
    fase: "Fase 1",
    title: "Categoría libre en el Excel (CDR, NPL, OCUPADO…)",
    where: "Admin → Activos → Importar Excel",
    href: "/admin",
    what: [
      "Migración staging: assets.referencia + public_slug + sin CHECK CDR/NPL.",
      "Preflight aborta si el schema no está listo (evita errores parciales).",
      "El import acepta textos libres del Excel (p. ej. OCUPADO).",
      "Plantilla recomendada: «Plantilla subidas Master Ejemplo Ocupados (2).xlsx» (100 filas).",
    ],
    howToTest: [
      "Confirma que se aplicó supabase-migration-feedback-cliente-staging.sql en Supabase staging.",
      "Sube el Excel de 100 OCUPADO: 0 batches fallidos, categoría OCUPADO filtrable.",
      "Filtra por Categoría = OCUPADO en el listado.",
    ],
  },
  {
    id: "f1-detalle",
    fase: "Fase 1",
    title: "Detalle del activo: Consultar y Oferta (modales de alta)",
    where: "Admin → Activos → clic en una fila",
    href: "/admin",
    what: [
      "Consultar abre modal con mensaje editable (enviando / éxito / error).",
      "Admin: Oferta pide comprador + importe. Agente: sin comprador; se asigna al agente de la sesión.",
      "Tras guardar, enlace a /admin/ofertas?asset=…; empty state con «Volver al activo».",
      "Requiere migración supabase-migration-ofertas-vendedor.sql en staging.",
      "En staging EMAIL_DRY_RUN=true (no spamea).",
    ],
    howToTest: [
      "Abre un activo → Consultar → edita mensaje → enviar → ver éxito o dry-run.",
      "Login como agente → Oferta → no hay selector comprador → importe → ver «Agente: …» en listado.",
    ],
  },
  {
    id: "f2-acceso",
    fase: "Fase 2",
    title: "Acceso al portal (fail-closed, sin bypass demo)",
    where: "Admin → Compradores + /portal/privado",
    href: "/admin/compradores",
    what: [
      "sin_acceso bloquea también a usuarios demo.",
      "Errores de consulta → acceso pendiente (fail-closed).",
      "Solo acceso=activo entra al privado (admin/vendedor siempre pasan).",
    ],
    howToTest: [
      "Pon un comprador en Sin acceso → login como ese cliente → debe ver «Acceso pendiente».",
      "Activa acceso → debe entrar a /portal/privado.",
    ],
  },
  {
    id: "f2-ofertas",
    fase: "Fase 2",
    title: "Ofertas: Cambiar estado + acciones rápidas",
    where: "Admin → Ofertas",
    href: "/admin/ofertas",
    what: [
      "Select etiquetado «Cambiar estado» con los 5 estados.",
      "Validar / Rechazar / Enviar NDA siguen disponibles.",
      "Mutaciones protegidas server-side (admin/vendedor).",
    ],
    howToTest: [
      "Cambia estado con el select y verifica toast + tarjeta actualizada.",
      "Prueba filtro ?asset= desde la ficha de un activo.",
      "EMAIL_DRY_RUN=true al enviar NDA.",
    ],
  },
  {
    id: "f3-portal",
    fase: "Fase 3",
    title: "Home→portal, legales y URL slug",
    where: "Home + Portal público",
    href: "/portal",
    what: [
      "Home: mismos filtros en cascada (Categoría, Provincia, Población, Tipología).",
      "URL ficha: /portal/inmueble/{slug} (sin catastral ni ID1).",
      "Legacy /portal/{id} redirige al slug.",
      "Contacto: enlaces reales a /legal/privacidad#…",
    ],
    howToTest: [
      "Desde / busca con filtros → aterriza en /portal?cat&prov&pob&tipo aplicados.",
      "Abre una ficha: pathname tipo /portal/inmueble/piso-…-xxxxxx.",
      "Contacto → Privacidad / Aviso legal abren el documento legal.",
    ],
  },
];

export default function GuiaStagingPage() {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    setEnabled(isStagingGuideEnabled());
  }, []);

  if (enabled === null) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted">
        Cargando guía…
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <AlertTriangle className="text-amber-600" size={36} />
        <h1 className="text-lg font-semibold text-navy">Guía no disponible</h1>
        <p className="max-w-md text-sm text-muted">
          Este tutorial solo existe en el entorno de staging. No forma parte de producción
          (<code className="mx-1 rounded bg-black/5 px-1">www.unihabitat.net</code>.
        </p>
        <Link href="/admin" className="text-sm font-medium text-gold hover:underline">
          Volver a Activos
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <div className="mb-8 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
        <div className="flex items-start gap-3">
          <FlaskConical className="mt-0.5 shrink-0 text-amber-700" size={22} />
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-amber-800">
              Solo staging — no producción
            </p>
            <p className="mt-1 text-sm text-amber-900/90">
              Esta guía describe las mejoras y cómo probarlas en{" "}
              <strong>unihabitat-staging</strong>. No se muestra en el CRM de producción.
              Login demo (solo staging):{" "}
              <code className="rounded bg-white/70 px-1">admin@propcrm.com</code> /{" "}
              <code className="rounded bg-white/70 px-1">Admin1234!</code>
            </p>
          </div>
        </div>
      </div>

      <header className="mb-8">
        <div className="mb-2 flex items-center gap-2 text-gold">
          <BookOpen size={22} />
          <span className="text-xs font-bold uppercase tracking-wider">Tutorial de demos</span>
        </div>
        <h1 className="text-2xl font-semibold text-navy">Actualizaciones Unihabitat (staging)</h1>
        <p className="mt-2 text-sm text-muted">
          Recorrido paso a paso para enseñar al cliente qué cambió y cómo validarlo antes de
          promover a producción.
        </p>
      </header>

      {/* 20 nov 2026 */}
      <section className="mb-10">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-navy">
          <span className="rounded-full bg-gold/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-gold">
            20 nov 2026
          </span>
          Alta, demandas, seguimiento y avisos
        </h2>
        <ol className="space-y-6">
          {NOVIEMBRE_2026_STEPS.map((step, index) => {
            const StepIcon = step.icon || Building2;
            return (
              <li key={step.id} id={step.id} className="rounded-2xl border border-border bg-white p-5 shadow-sm">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gold text-xs font-bold text-white">
                    {index + 1}
                  </span>
                  <StepIcon size={16} className="text-gold" />
                  <h3 className="text-base font-semibold text-navy">{step.title}</h3>
                </div>
                <p className="mb-3 text-xs text-muted">{step.where}</p>
                <ul className="mb-3 list-disc space-y-1 pl-4 text-sm text-navy/90">
                  {step.what.map((line) => <li key={line}>{line}</li>)}
                </ul>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted">Cómo probarlo</p>
                <ol className="list-decimal space-y-1 pl-4 text-sm text-navy/90">
                  {step.howToTest.map((line) => <li key={line}>{line}</li>)}
                </ol>
                <Link href={step.href} className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-gold hover:underline">
                  Ir a la pantalla
                  <ArrowRight size={14} />
                </Link>
              </li>
            );
          })}
        </ol>
      </section>

      {/* Agosto 2026 changes - newest first */}
      <section className="mb-10">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-navy">
          <span className="rounded-full bg-gold/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-gold">
            Agosto 2026
          </span>
          Qué hay de nuevo
        </h2>
        <ol className="space-y-6">
          {AUGUST_2026_STEPS.map((step, index) => {
            const StepIcon = step.icon || Building2;
            return (
              <li
                key={step.id}
                id={step.id}
                className="rounded-2xl border border-border bg-white p-5 shadow-sm"
              >
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gold text-xs font-bold text-white">
                    {index + 1}
                  </span>
                  <StepIcon size={16} className="text-gold" />
                  <span className="text-xs text-muted">{step.where}</span>
                </div>
                <h3 className="text-base font-semibold text-navy">{step.title}</h3>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted">
                      <CheckCircle2 size={12} /> Qué hay de nuevo
                    </p>
                    <ul className="space-y-1.5 text-sm text-navy/90">
                      {step.what.map((line) => (
                        <li key={line} className="flex gap-2">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                          <span>{line}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted">
                      <FlaskConical size={12} /> Cómo probarlo
                    </p>
                    <ol className="list-decimal space-y-1.5 pl-4 text-sm text-navy/90">
                      {step.howToTest.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ol>
                  </div>
                </div>

                <Link
                  href={step.href}
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-gold hover:underline"
                >
                  Ir a {step.where.split("→").pop()?.trim() ?? "pantalla"}
                  <ArrowRight size={14} />
                </Link>
              </li>
            );
          })}
        </ol>
      </section>

      {/* Legacy F1-F3 steps */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-navy">
          Ya en staging (Fases 1–3)
        </h2>
        <ol className="space-y-6">
          {LEGACY_STEPS.map((step, index) => (
            <li
              key={step.id}
              id={step.id}
              className="rounded-2xl border border-border bg-white p-5 shadow-sm"
            >
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-navy text-xs font-bold text-white">
                  {index + 1}
                </span>
                <span className="rounded-full bg-navy/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-navy">
                  {step.fase}
                </span>
                <span className="text-xs text-muted">{step.where}</span>
              </div>
              <h3 className="text-base font-semibold text-navy">{step.title}</h3>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted">
                    <CheckCircle2 size={12} /> Qué hay de nuevo
                  </p>
                  <ul className="space-y-1.5 text-sm text-navy/90">
                    {step.what.map((line) => (
                      <li key={line} className="flex gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-navy/30" />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted">
                    <FlaskConical size={12} /> Cómo probarlo
                  </p>
                  <ol className="list-decimal space-y-1.5 pl-4 text-sm text-navy/90">
                    {step.howToTest.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ol>
                </div>
              </div>

              <Link
                href={step.href}
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-gold hover:underline"
              >
                Ir a {step.where.split("→").pop()?.trim() ?? "pantalla"}
                <ArrowRight size={14} />
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-10 rounded-2xl border border-border bg-white p-5">
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-navy">
          <Globe size={18} /> Atajos rápidos
        </h2>
        <div className="flex flex-wrap gap-2">
          <QuickLink href="/admin" icon={Building2} label="Activos" />
          <QuickLink href="/admin/compradores" icon={ShoppingCart} label="Compradores" />
          <QuickLink href="/admin/ofertas" icon={FileText} label="Ofertas" />
          <QuickLink href="/portal" icon={Globe} label="Portal" external />
        </div>
        <p className="mt-4 text-xs text-muted">
          Tras el OK del cliente: migraciones SQL en Supabase prod + merge de la rama{" "}
          <code className="rounded bg-black/5 px-1">staging</code> →{" "}
          <code className="rounded bg-black/5 px-1">main</code>. Esta página no se despliega
          útil en prod (flag apagado).
        </p>
      </section>
    </div>
  );
}

function QuickLink({
  href,
  icon: Icon,
  label,
  external,
}: {
  href: string;
  icon: typeof Building2;
  label: string;
  external?: boolean;
}) {
  return (
    <Link
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      className="inline-flex items-center gap-2 rounded-lg border border-border bg-cream px-3 py-2 text-sm font-medium text-navy hover:border-gold/40"
    >
      <Icon size={16} />
      {label}
      {external && <ExternalLink size={12} className="text-muted" />}
    </Link>
  );
}
