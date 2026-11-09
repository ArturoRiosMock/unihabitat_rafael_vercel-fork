"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { fmt, fmtM, shortAddr, formatFullAddress, getDescriptionText, getCategoria, getPortalPriceDisplay, displaySituacion } from "@/lib/utils";
import { assetPortalHref } from "@/lib/public-slug";
import type { Asset } from "@/lib/types";
import Link from "next/link";
import {
  ArrowLeft, Lock, FileText, MapPin, X, Loader2,
  CheckCircle2, AlertCircle, Send, Building, Ruler,
  Tag, Home, Layers, CalendarDays, Hash,
} from "lucide-react";
import { createOferta } from "@/app/actions/ofertas";
import { fetchCompradorByEmail, ensureCompradorForEmail } from "@/app/actions/compradores";
import { enviarSolicitudInformacion } from "@/app/actions/email-info-request";
import { usePortalAuth } from "@/hooks/usePortalAuth";
import { InteractiveMap } from "@/components/InteractiveMap";

const BASE_SECTION_IDS = [
  "descripcion",
  "ubicacion",
  "caracteristicas",
  "propietario",
] as const;

const SECTION_META: Record<(typeof BASE_SECTION_IDS)[number], string> = {
  descripcion: "Descripción",
  ubicacion: "Ubicación",
  caracteristicas: "Características",
  propietario: "Propietario",
};

interface PortalDetailClientProps {
  asset: Asset;
  siblings: Asset[];
}

export default function PortalDetailClient({ asset, siblings }: PortalDetailClientProps) {
  const id = asset.id;
  const [showOfertaModal, setShowOfertaModal] = useState(false);
  const { sensitiveVisible, isStaff, currentUser, userResolved } = usePortalAuth();
  const [activeSection, setActiveSection] = useState<string>("descripcion");
  const [contactSent, setContactSent] = useState(false);
  const [contactSubmitting, setContactSubmitting] = useState(false);
  const [contactError, setContactError] = useState("");
  const [contactForm, setContactForm] = useState({ nombre: "", email: "", telefono: "", mensaje: "" });

  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const sections = useMemo(() => {
    const base = BASE_SECTION_IDS.filter(id => id !== "ubicacion" || sensitiveVisible).map(id => ({
      id,
      label: SECTION_META[id],
    }));
    if (siblings.length > 0) {
      return [...base, { id: "colaterales", label: `Colaterales (${siblings.length + 1})` }];
    }
    return base;
  }, [siblings.length, sensitiveVisible]);

  // IntersectionObserver for sticky tabs
  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    for (const s of sections) {
      const el = sectionRefs.current[s.id];
      if (!el) continue;
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setActiveSection(s.id); },
        { rootMargin: "-120px 0px -60% 0px", threshold: 0.1 },
      );
      obs.observe(el);
      observers.push(obs);
    }
    return () => observers.forEach(o => o.disconnect());
  }, [asset, sections]);

  const scrollTo = useCallback((sectionId: string) => {
    sectionRefs.current[sectionId]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const handleContactSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setContactError("");
    setContactSubmitting(true);
    try {
      const result = await enviarSolicitudInformacion({
        assetId: asset.id,
        nombre: contactForm.nombre,
        email: contactForm.email,
        telefono: contactForm.telefono || undefined,
        mensaje: contactForm.mensaje,
      });
      if (result.ok) {
        setContactSent(true);
        setContactForm({ nombre: "", email: "", telefono: "", mensaje: "" });
      } else {
        setContactError(result.error ?? "No se pudo enviar la solicitud");
      }
    } catch (err) {
      setContactError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setContactSubmitting(false);
    }
  }, [asset.id, contactForm]);

  return (
    <>
      {/* ── Sticky tab bar ── */}
      <div className="sticky top-14 z-40 border-b border-border bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center gap-1 px-6">
          <Link href="/portal" className="mr-3 flex items-center gap-1.5 py-3 text-xs font-medium text-muted transition-colors hover:text-navy">
            <ArrowLeft size={14} />
          </Link>
          {sections.map(s => (
            <button
              key={s.id}
              onClick={() => scrollTo(s.id)}
              className={`-mb-px border-b-2 px-3 py-3 text-xs font-medium transition-all ${
                activeSection === s.id
                  ? "border-gold text-navy"
                  : "border-transparent text-muted hover:text-navy"
              }`}
            >
              {s.label}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2 py-2">
            {getCategoria(asset) !== "—" && (
              <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${
                getCategoria(asset) === "NPL" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
              }`}>{getCategoria(asset)}</span>
            )}
            <span className="text-sm font-bold text-navy">{getPortalPriceDisplay(asset).value}</span>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-8">
        {/* ── Breadcrumb ── */}
        <div className="mb-4 flex items-center gap-1.5 text-[11px] text-muted">
          <Link href="/portal" className="hover:text-navy">Propiedades</Link>
          <span>/</span>
          <span className="text-navy">{asset.pob}, {asset.prov}</span>
        </div>

        {/* ── Title area ── */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-navy md:text-2xl">
            {shortAddr(asset)}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted">
            <span className="flex items-center gap-1"><MapPin size={12} /> {asset.pob}, {asset.prov}</span>
            {asset.tip && <span className="flex items-center gap-1"><Building size={12} /> {asset.tip}</span>}
            {asset.sqm && <span className="flex items-center gap-1"><Ruler size={12} /> {fmtM(asset.sqm)}</span>}
            {sensitiveVisible && asset.referencia && (
              <span className="flex items-center gap-1 font-mono"><Tag size={11} /> {asset.referencia}</span>
            )}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          {/* ── Main content ── */}
          <div className="flex flex-col gap-6">
            {/* Description section */}
            <section id="descripcion" ref={el => { sectionRefs.current.descripcion = el; }}>
              <InteractiveMap
                key={`map-${asset.id}-${asset.lat ?? "x"}-${asset.lng ?? "x"}`}
                lat={asset.lat}
                lng={asset.lng}
                mapImageUrl={asset.map}
                label={`${asset.pob}, ${asset.prov}`}
                className="mb-5 h-[320px] w-full rounded-xl border border-border"
              />

              <div className="rounded-lg border border-border bg-white p-5 shadow-sm">
                <SectionTitle>Descripción</SectionTitle>
                <p className="text-sm leading-[1.8] text-text">
                  {getDescriptionText(asset)}
                </p>
              </div>
            </section>

            {/* Location section: solo usuarios con sesión */}
            {sensitiveVisible && (
              <section id="ubicacion" ref={el => { sectionRefs.current.ubicacion = el; }}>
                <div className="rounded-lg border border-border bg-white p-5 shadow-sm">
                  <SectionTitle>Ubicación</SectionTitle>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <InfoPill icon={<MapPin size={13} />} label="Municipio" value={asset.pob} />
                    <InfoPill icon={<MapPin size={13} />} label="Provincia" value={asset.prov} />
                    <InfoPill icon={<MapPin size={13} />} label="CCAA" value={asset.ccaa} />
                    <InfoPill icon={<Hash size={13} />} label="Código Postal" value={asset.cp} />
                    {asset.tvia && <InfoPill icon={<MapPin size={13} />} label="Tipo vía" value={asset.tvia} />}
                    {asset.nvia && <InfoPill icon={<MapPin size={13} />} label="Nombre vía" value={asset.nvia} />}
                    {asset.num && <InfoPill icon={<Hash size={13} />} label="Número" value={asset.num} />}
                    {asset.esc && <InfoPill icon={<Layers size={13} />} label="Escalera" value={asset.esc} />}
                    {asset.pla && <InfoPill icon={<Layers size={13} />} label="Planta" value={asset.pla} />}
                    {asset.pta && <InfoPill icon={<Hash size={13} />} label="Puerta" value={asset.pta} />}
                  </div>
                  {isStaff && (() => {
                    const fullAddr = formatFullAddress(asset);
                    return fullAddr ? (
                      <div className="mt-3 rounded-md bg-cream2 px-3 py-2 text-xs text-muted">
                        <span className="font-semibold text-navy">Dirección completa:</span> {fullAddr}
                      </div>
                    ) : null;
                  })()}
                </div>
              </section>
            )}

            {/* Characteristics section */}
            <section id="caracteristicas" ref={el => { sectionRefs.current.caracteristicas = el; }}>
              <div className="rounded-lg border border-border bg-white p-5 shadow-sm">
                <SectionTitle>Características</SectionTitle>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <InfoPill icon={<Home size={13} />} label="Tipo inmueble" value={asset.bien} />
                  <InfoPill icon={<Building size={13} />} label="Tipología" value={asset.tip} />
                  <InfoPill icon={<Tag size={13} />} label="Categoría" value={getCategoria(asset)} />
                  <InfoPill icon={<Tag size={13} />} label="Situación" value={displaySituacion(asset)} />
                  <InfoPill icon={<Ruler size={13} />} label="Sup. Construida" value={asset.supC || fmtM(asset.sqm)} />
                  {asset.supG && <InfoPill icon={<Ruler size={13} />} label="Sup. Gráfica" value={asset.supG} />}
                  {asset.clase && <InfoPill icon={<Layers size={13} />} label="Clase" value={asset.clase} />}
                  {asset.uso && <InfoPill icon={<Building size={13} />} label="Uso" value={asset.uso} />}
                  {sensitiveVisible && asset.referencia && (
                    <InfoPill icon={<Tag size={13} />} label="Ref. Catastral" value={asset.referencia} mono />
                  )}
                  {asset.coef && <InfoPill icon={<Hash size={13} />} label="Coef. Participación" value={asset.coef} />}
                  {asset.age && <InfoPill icon={<CalendarDays size={13} />} label="Antigüedad" value={asset.age} />}
                </div>
              </div>
            </section>

            {/* Owner section - locked */}
            <section id="propietario" ref={el => { sectionRefs.current.propietario = el; }}>
              <div className="relative overflow-hidden rounded-lg border border-border bg-white p-5 shadow-sm">
                <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm">
                  <Lock size={24} className="text-navy" />
                  <p className="mt-2 text-sm font-semibold text-navy">Información reservada</p>
                  <p className="mt-0.5 text-xs text-muted">Firma tu NDA para acceder a todos los datos</p>
                </div>
                <SectionTitle>Datos del Propietario</SectionTitle>
                <div className="grid grid-cols-2 gap-2 blur-sm">
                  <InfoPill label="Nombre" value="XXXXXXXXXXXX" />
                  <InfoPill label="Teléfono" value="+34 XXXXXXXXX" />
                  <InfoPill label="Email" value="XXXX@XXXX.com" />
                  {sensitiveVisible && <InfoPill label="Ref. Catastral" value="XXXXXXXXXXXXXX" />}
                </div>
              </div>
            </section>

            {/* Collateral assets section */}
            {siblings.length > 0 && (
              <section id="colaterales" ref={el => { sectionRefs.current.colaterales = el; }}>
                <div className="rounded-lg border border-border bg-white p-5 shadow-sm">
                  <SectionTitle>
                    Grupo del contrato ({siblings.length + 1} inmuebles)
                  </SectionTitle>
                  <p className="mb-4 text-xs text-muted">
                    Mismo ID1 / activo: {siblings.length + 1} inmuebles publicados (coherente con el listado).
                  </p>
                  <div className="flex flex-col gap-3">
                    {[{ ...asset, _current: true as const }, ...siblings.map((s) => ({ ...s, _current: false as const }))].map((s) => {
                      const price = getPortalPriceDisplay(s);
                      const body = (
                        <>
                          <InteractiveMap
                            key={`map-${s.id}-${s.lat ?? "x"}-${s.lng ?? "x"}`}
                            lat={s.lat}
                            lng={s.lng}
                            mapImageUrl={s.map}
                            className="h-[80px] w-[120px] shrink-0 rounded-md"
                          />
                          <div className="flex min-w-0 flex-1 flex-col justify-center">
                            <div className="text-sm font-semibold text-navy group-hover:text-gold">
                              {s._current ? "Este inmueble · " : ""}
                              {s.bien || s.tip} en {shortAddr(s)}
                            </div>
                            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
                              <span className="flex items-center gap-1">
                                <MapPin size={10} /> {s.pob}, {s.prov}
                              </span>
                              {s.sqm && (
                                <span className="flex items-center gap-1">
                                  <Ruler size={10} /> {fmtM(s.sqm)}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-col items-end justify-center">
                            <span className="text-[10px] uppercase text-muted">{price.label}</span>
                            <span className="text-sm font-bold text-navy">{price.value}</span>
                            {getCategoria(s) !== "—" && (
                              <span className={`mt-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                                getCategoria(s) === "NPL" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                              }`}>{getCategoria(s)}</span>
                            )}
                          </div>
                        </>
                      );
                      if (s._current) {
                        return (
                          <div
                            key={s.id}
                            className="flex gap-4 rounded-lg border border-gold/40 bg-gold/5 p-3"
                          >
                            {body}
                          </div>
                        );
                      }
                      return (
                        <Link
                          key={s.id}
                          href={assetPortalHref(s)}
                          className="group flex gap-4 rounded-lg border border-border p-3 transition-all hover:border-gold/40 hover:shadow-sm"
                        >
                          {body}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </section>
            )}
          </div>

          {/* ── Sidebar ── */}
          <div className="lg:sticky lg:top-[7.5rem] lg:self-start">
            <div className="flex flex-col gap-4">
              {/* Price card */}
              <div className="rounded-lg border border-border bg-white p-5 shadow-sm">
                {(() => {
                  const price = getPortalPriceDisplay(asset);
                  return (
                    <>
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{price.label}</div>
                      <div className="mb-1 text-2xl font-bold text-navy">{price.value}</div>
                      {price.kind === "precio" && asset.sqm && asset.precio ? (
                        <div className="mb-4 text-xs text-muted">
                          {asset.sqm} m² · {Math.round(asset.precio / asset.sqm).toLocaleString("es-ES")} €/m²
                        </div>
                      ) : (
                        <div className="mb-4" />
                      )}
                    </>
                  );
                })()}

                {/* Quick data */}
                <div className="mb-4 flex flex-col gap-1.5 border-b border-border pb-4">
                  {[
                    ["Tipo", asset.tip],
                    ["Ubicación", `${asset.pob}, ${asset.prov}`],
                    ["Superficie", asset.supC || fmtM(asset.sqm)],
                    ["Categoría", getCategoria(asset)],
                  ].map(([l, v]) => (
                    <div key={l} className="flex items-center justify-between text-xs">
                      <span className="text-muted">{l}</span>
                      <span className="font-medium text-navy">{v}</span>
                    </div>
                  ))}
                </div>

                {sensitiveVisible && asset.referencia && (
                  <div className="mb-4 rounded-md bg-cream2 px-3 py-2">
                    <div className="text-[9px] font-semibold uppercase tracking-wider text-muted">Ref. Catastral</div>
                    <div className="font-mono text-xs text-navy">{asset.referencia}</div>
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => scrollTo("contacto-form")}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-navy py-3 text-xs font-medium text-white hover:bg-navy3"
                  >
                    <FileText size={13} /> Solicitar información
                  </button>
                </div>
              </div>

              {/* Offer card */}
              <div className="rounded-lg bg-gradient-to-br from-navy to-navy3 p-5">
                <div className="mb-2 text-sm font-semibold text-gold">Acceso Completo</div>
                <p className="mb-4 text-xs leading-relaxed text-white/40">
                  Presenta una oferta para acceder a datos completos: propietario, referencia catastral, fase judicial, documentación.
                </p>
                <button
                  type="button"
                  disabled={!userResolved}
                  onClick={() => {
                    if (!userResolved) return;
                    if (!currentUser) {
                      window.location.href = "/login?redirect=" + encodeURIComponent(window.location.pathname);
                      return;
                    }
                    setShowOfertaModal(true);
                  }}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-gold py-2.5 text-xs font-medium text-white hover:bg-gold2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <FileText size={12} /> Presentar oferta
                </button>
              </div>

              {/* Contact form */}
              <div id="contacto-form" className="rounded-lg border border-border bg-white p-5 shadow-sm">
                <div className="mb-3 text-sm font-semibold text-navy">Solicitar Información</div>
                {contactSent ? (
                  <div className="flex flex-col items-center gap-2 py-4 text-center">
                    <CheckCircle2 size={28} className="text-emerald-500" />
                    <p className="text-sm font-medium text-navy">Solicitud enviada</p>
                    <p className="text-xs text-muted">Nos pondremos en contacto contigo</p>
                  </div>
                ) : (
                  <form onSubmit={handleContactSubmit} className="flex flex-col gap-2.5">
                    <input
                      type="text"
                      placeholder="Tu nombre"
                      required
                      value={contactForm.nombre}
                      onChange={e => setContactForm(p => ({ ...p, nombre: e.target.value }))}
                      className="rounded-md border border-border bg-cream2 px-3 py-2 text-xs outline-none transition-all focus:border-navy focus:bg-white"
                    />
                    <input
                      type="email"
                      placeholder="Tu email"
                      required
                      value={contactForm.email}
                      onChange={e => setContactForm(p => ({ ...p, email: e.target.value }))}
                      className="rounded-md border border-border bg-cream2 px-3 py-2 text-xs outline-none transition-all focus:border-navy focus:bg-white"
                    />
                    <input
                      type="tel"
                      placeholder="Teléfono (opcional)"
                      value={contactForm.telefono}
                      onChange={e => setContactForm(p => ({ ...p, telefono: e.target.value }))}
                      className="rounded-md border border-border bg-cream2 px-3 py-2 text-xs outline-none transition-all focus:border-navy focus:bg-white"
                    />
                    <textarea
                      placeholder="Tu mensaje..."
                      required
                      rows={3}
                      value={contactForm.mensaje}
                      onChange={e => setContactForm(p => ({ ...p, mensaje: e.target.value }))}
                      className="rounded-md border border-border bg-cream2 px-3 py-2 text-xs outline-none transition-all focus:border-navy focus:bg-white"
                    />
                    <label className="flex items-start gap-2 text-[11px] text-muted">
                      <input type="checkbox" required name="legal"
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-border accent-navy" />
                      <span>
                        He leído y acepto el{" "}
                        <a href="/legal/privacidad#aviso-legal" className="font-medium text-navy underline underline-offset-2">Aviso Legal</a>{" "}
                        y la{" "}
                        <a href="/legal/privacidad#privacidad" className="font-medium text-navy underline underline-offset-2">Política de Privacidad</a>
                      </span>
                    </label>
                    {contactError && (
                      <div className="flex items-start gap-1.5 rounded-md bg-red/10 px-3 py-2 text-[11px] text-red">
                        <AlertCircle size={12} className="mt-0.5 shrink-0" /> <span>{contactError}</span>
                      </div>
                    )}
                    <button
                      type="submit"
                      disabled={contactSubmitting}
                      className="flex items-center justify-center gap-1.5 rounded-lg bg-gold py-2.5 text-xs font-medium text-white hover:bg-gold2 disabled:opacity-50"
                    >
                      {contactSubmitting ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                      {contactSubmitting ? "Enviando..." : "Enviar solicitud"}
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {showOfertaModal && currentUser && (
        <OfertaModal
          asset={asset}
          assetId={id}
          currentUser={currentUser}
          onClose={() => setShowOfertaModal(false)}
        />
      )}
    </>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[1.5px] text-gold after:h-px after:flex-1 after:bg-border">
      {children}
    </div>
  );
}

function InfoPill({ label, value, icon, mono }: { label: string; value: string; icon?: React.ReactNode; mono?: boolean }) {
  return (
    <div className="rounded-md bg-cream2 px-3 py-2.5">
      <div className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-muted">
        {icon}
        {label}
      </div>
      <div className={`mt-0.5 text-sm text-text ${mono ? "font-mono text-xs" : ""}`}>{value || "—"}</div>
    </div>
  );
}

function OfertaModal({
  asset,
  assetId,
  currentUser,
  onClose,
}: {
  asset: Asset;
  assetId: string;
  currentUser: { email: string; nombre: string };
  onClose: () => void;
}) {
  const [compradorId, setCompradorId] = useState<string | null>(null);
  const [resolvingComprador, setResolvingComprador] = useState(true);
  const [propuesta, setPropuesta] = useState("");
  const [comentarios, setComentarios] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [resolveAttempt, setResolveAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setResolvingComprador(true);
      setError("");
      try {
        let row = await fetchCompradorByEmail(currentUser.email);
        let id = row?.id ?? null;
        if (!id) {
          id = await ensureCompradorForEmail(currentUser.email, currentUser.nombre);
        }
        if (!cancelled) setCompradorId(id);
      } catch (err) {
        if (!cancelled) {
          setCompradorId(null);
          setError(err instanceof Error ? err.message : "No se pudo preparar tu perfil de comprador");
        }
      } finally {
        if (!cancelled) setResolvingComprador(false);
      }
    })();
    return () => { cancelled = true; };
  }, [currentUser.email, currentUser.nombre, resolveAttempt]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!compradorId) {
      setError("Espera a que termine de cargar tu perfil o inténtalo de nuevo");
      return;
    }
    const euros = parseFloat(propuesta.replace(/[^\d.,]/g, "").replace(",", "."));
    if (isNaN(euros) || euros <= 0) {
      setError("Ingresa una propuesta válida en euros");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await createOferta({ compradorId, assetId, propuestaEuros: euros, comentarios: comentarios.trim() || undefined });
      setSuccess(true);
      setTimeout(() => { onClose(); setSuccess(false); }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al enviar la oferta");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-border bg-white shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold text-navy">Presentar oferta</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted transition-colors hover:bg-cream hover:text-navy">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5">
          <div className="mb-4 rounded-lg border border-border bg-navy/5 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">Tus datos</div>
            <div className="mt-1 text-sm font-medium text-navy">{currentUser.nombre}</div>
            <div className="text-xs text-muted">{currentUser.email}</div>
          </div>

          {resolvingComprador && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-cream2 px-3 py-2.5 text-xs text-muted">
              <Loader2 size={14} className="animate-spin text-gold" /> Preparando tu perfil de comprador…
            </div>
          )}

          {!resolvingComprador && !compradorId && error && (
            <div className="mb-4 flex flex-col gap-2 rounded-lg border border-red/20 bg-red/5 px-3 py-2.5 text-xs text-red">
              <div className="flex items-start gap-2"><AlertCircle size={14} className="mt-0.5 shrink-0" /><span>{error}</span></div>
              <button type="button" onClick={() => { setError(""); setResolveAttempt(n => n + 1); }} className="self-start rounded-md bg-navy px-3 py-1.5 text-[11px] font-medium text-white hover:bg-navy3">Reintentar</button>
            </div>
          )}

          <div className="mb-4 rounded-lg border border-border bg-cream2 p-3">
            <div className="text-xs font-semibold text-muted">Activo</div>
            <div className="text-sm font-medium text-navy">{asset.pob}, {asset.prov}</div>
            <div className="text-xs text-muted">{asset.tip}</div>
          </div>

          <div className="mb-4">
            <label className="mb-1.5 block text-xs font-medium text-navy">Propuesta en euros <span className="text-red">*</span></label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">€</span>
              <input
                type="text" value={propuesta} onChange={e => setPropuesta(e.target.value)} placeholder="0,00" required
                disabled={resolvingComprador || !compradorId}
                className="w-full rounded-lg border border-border bg-white py-2.5 pl-8 pr-4 text-sm text-text outline-none placeholder:text-muted/70 focus:border-navy focus:ring-2 focus:ring-navy/5 disabled:opacity-50"
              />
            </div>
            {(() => {
              const price = getPortalPriceDisplay(asset);
              if (price.kind === "oferta") return null;
              return (
                <p className="mt-1 text-[11px] text-muted">
                  {price.label}: {price.value}
                </p>
              );
            })()}
          </div>

          <div className="mb-4">
            <label className="mb-1.5 block text-xs font-medium text-navy">Comentarios (opcional)</label>
            <textarea
              value={comentarios} onChange={e => setComentarios(e.target.value)} rows={3}
              placeholder="Añade información adicional sobre tu oferta..."
              disabled={resolvingComprador || !compradorId}
              className="w-full rounded-lg border border-border bg-white p-3 text-sm text-text outline-none placeholder:text-muted/70 focus:border-navy focus:ring-2 focus:ring-navy/5 disabled:opacity-50"
            />
          </div>

          {error && compradorId && (
            <div className="mb-3 flex items-center gap-2 rounded-lg bg-red/10 px-3 py-2 text-xs text-red">
              <AlertCircle size={14} /> {error}
            </div>
          )}

          {success && (
            <div className="mb-3 flex items-center gap-2 rounded-lg bg-green/10 px-3 py-2 text-xs text-green">
              <CheckCircle2 size={14} /> Oferta enviada correctamente. El administrador la revisará.
            </div>
          )}

          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-border px-4 py-2.5 text-xs font-medium text-navy hover:bg-cream">Cancelar</button>
            <button
              type="submit"
              disabled={submitting || resolvingComprador || !compradorId || !propuesta.trim()}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-gold px-4 py-2.5 text-xs font-medium text-white hover:bg-gold2 disabled:opacity-50"
            >
              {submitting ? <><Loader2 size={14} className="animate-spin" /> Enviando...</> : "Enviar oferta"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
