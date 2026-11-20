"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/context";
import { chatMessages } from "@/lib/mock-data";
import Link from "next/link";
import type { Comprador, CompradorAcceso } from "@/lib/types";
import {
  User,
  FolderOpen,
  MessageSquare,
  ArrowLeft,
  Upload,
  FileText,
  Download,
  Send,
  Save,
  Loader2,
  CheckCircle,
  UserCog,
  Trash2,
  Shield,
  Phone,
} from "lucide-react";
import { raiseActionError } from "@/lib/action-result";
import { getCompradorAgente, setCompradorAgente } from "@/app/actions/vendedores";
import {
  deleteComprador,
  setCompradorAcceso,
  setAceptaWhatsapp,
  updateCompradorFields,
} from "@/app/actions/compradores";
import { fetchOfertasByComprador } from "@/app/actions/ofertas";
import { etiquetaEstado, type OfertaRow } from "@/lib/oferta-workflow";
import {
  createCompradorComentario,
  fetchCompradorComentarios,
} from "@/app/actions/comprador-comentarios";
import { CommentByline } from "@/components/CommentByline";
import { GestionPlazo } from "@/components/GestionPlazo";
import type { CompradorComentario } from "@/lib/comprador-comentarios";
import { fmt } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { datosFirmaFromComprador, nombreVisible, type DatosFirma } from "@/lib/comprador-oferta";
import { DatosFirmaFields, DatosOfertaEstado } from "@/components/DatosFirmaFields";
import { DemandaBloque } from "@/components/DemandaBloque";
import { ActivosEnviadosBloque } from "@/components/ActivosEnviadosBloque";

const tabs = [
  { icon: User, label: "Datos" },
  { icon: FolderOpen, label: "Documentos" },
  { icon: MessageSquare, label: "Conversación" },
];

export default function CompradorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { getComprador, refreshCompradores, session } = useApp();
  const isAgente = session?.role === "vendedor";
  const c = getComprador(id);
  const [tab, setTab] = useState(0);
  const [deleting, setDeleting] = useState(false);

  if (!c) return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted">
      <User size={40} strokeWidth={1} className="text-border" />
      <p className="text-base font-medium">Comprador no encontrado</p>
      <Link href="/admin/compradores" className="text-sm text-gold hover:underline">Volver</Link>
    </div>
  );

  async function handleDelete() {
    if (!confirm(`¿Eliminar comprador ${nombreVisible(c!)}? Esta acción no se puede deshacer.`)) return;
    setDeleting(true);
    try {
      await deleteComprador(c!.id);
      toast.success("Comprador eliminado");
      await refreshCompradores();
      router.push("/admin/compradores");
    } catch (err) {
      toast.error("No se pudo eliminar", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-white px-6">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-navy">{nombreVisible(c)}</h1>
          <DatosOfertaEstado datos={datosFirmaFromComprador(c)} />
          <span
            className={`rounded-md px-2.5 py-0.5 text-xs font-medium ${
              c.acceso === "activo" ? "bg-green/10 text-green" : "bg-red/10 text-red"
            }`}
          >
            {c.acceso === "activo" ? "Acceso activo" : "Sin acceso"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isAgente ? null : (
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={deleting}
              className="flex items-center gap-1.5 rounded-lg border border-red/30 px-3.5 py-2 text-xs font-medium text-red hover:bg-red/5 disabled:opacity-50"
            >
              {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Eliminar
            </button>
          )}
          <Link href="/admin/compradores" className="flex items-center gap-1.5 rounded-lg border border-border bg-white px-3.5 py-2 text-xs font-medium text-navy hover:bg-cream"><ArrowLeft size={14} /> Volver</Link>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden" style={{ height: "calc(100vh - 56px)" }}>
        <div className="flex w-44 min-w-[176px] flex-col bg-navy py-3">
          {tabs.map((t, i) => {
            const Icon = t.icon;
            return (
              <button key={i} onClick={() => setTab(i)} className={`flex items-center gap-2.5 border-l-[3px] px-4 py-2.5 text-left transition-all ${tab === i ? "border-l-gold bg-white/[0.06] text-gold" : "border-l-transparent text-white/35 hover:bg-white/[0.03] hover:text-white/60"}`}>
                <Icon size={15} strokeWidth={1.5} />
                <span className="text-xs font-medium">{t.label}</span>
              </button>
            );
          })}
        </div>
        <div className="flex-1 overflow-y-auto bg-cream p-6">
          {tab === 0 && <TabDatos c={c} isAgente={isAgente} />}
          {tab === 1 && <TabDocs />}
          {tab === 2 && <TabConversacion />}
        </div>
      </div>
    </>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[1.5px] text-gold after:h-px after:flex-1 after:bg-border">{title}</div>
      {children}
    </div>
  );
}

function ConsentimientoWhatsapp({ compradorId, acepta }: { compradorId: string; acepta: boolean }) {
  const { refreshCompradores } = useApp();
  const [valor, setValor] = useState(acepta);
  const [guardando, setGuardando] = useState(false);

  async function cambiar(next: boolean) {
    setValor(next);
    setGuardando(true);
    try {
      const result = await setAceptaWhatsapp(compradorId, next);
      raiseActionError(result);
      await refreshCompradores();
      toast.success(next ? "WhatsApp activado" : "WhatsApp desactivado");
    } catch (err) {
      setValor(!next);
      toast.error("No se pudo guardar", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="mb-4 rounded-lg border border-border bg-white p-5 shadow-sm">
      <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-[1.5px] text-gold">WhatsApp</h2>
      <label className="flex items-center gap-2 text-sm text-navy">
        <input
          type="checkbox"
          checked={valor}
          disabled={guardando}
          onChange={(event) => void cambiar(event.target.checked)}
        />
        Acepta avisos de oportunidades por WhatsApp
      </label>
    </section>
  );
}

function DataPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-cream2 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</div>
      <div className="text-sm text-text">{value}</div>
    </div>
  );
}

const FICHA_ESTADOS = ["Nuevo", "Seguimiento", "Negociación", "Contactado", "Oferta enviada", "Cerrado"];

function FichaCompradorCard({ c }: { c: Comprador }) {
  const { refreshCompradores } = useApp();
  const [firma, setFirma] = useState<DatosFirma>(() => datosFirmaFromComprador(c));
  const [tipo, setTipo] = useState<"Privado" | "Free">(c.tipo);
  const [estado, setEstado] = useState(c.estado);
  const [intereses, setIntereses] = useState(c.intereses);
  const [presupuesto, setPresupuesto] = useState(c.presupuesto);
  const [nda, setNda] = useState<"Firmada" | "Pendiente">(c.nda);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFirma(datosFirmaFromComprador(c));
    setTipo(c.tipo);
    setEstado(c.estado);
    setIntereses(c.intereses);
    setPresupuesto(c.presupuesto);
    setNda(c.nda);
  }, [c]);

  async function save() {
    setSaving(true);
    try {
      const result = await updateCompradorFields(c.id, {
        nombre: firma.nombre,
        apellidos: firma.apellidos,
        email: firma.email,
        tel: firma.tel,
        tipoPersona: firma.tipoPersona,
        razonSocial: firma.razonSocial,
        documento: firma.documento,
        direccion: firma.direccion,
        cp: firma.cp,
        poblacion: firma.poblacion,
        provincia: firma.provincia,
        pais: firma.pais,
        tipo,
        estado,
        intereses,
        presupuesto,
        nda,
      });
      raiseActionError(result);
      await refreshCompradores();
      toast.success("Ficha actualizada");
    } catch (err) {
      toast.error("No se pudo guardar la ficha", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard title="Ficha">
      <div className="mb-3">
        <DatosOfertaEstado datos={firma} />
      </div>
      <DatosFirmaFields datos={firma} onChange={setFirma} idPrefix={`ficha-${c.id}`} />
      <div className="mt-3 grid grid-cols-2 gap-3">
        <FichaField label="Presupuesto" value={presupuesto} onChange={setPresupuesto} />
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted">Tipo</label>
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as "Privado" | "Free")}
            className="rounded-md border border-border bg-cream2 px-2.5 py-2 text-sm outline-none focus:border-navy"
          >
            <option value="Privado">Privado</option>
            <option value="Free">Free</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted">Estado</label>
          <select
            value={estado}
            onChange={(e) => setEstado(e.target.value)}
            className="rounded-md border border-border bg-cream2 px-2.5 py-2 text-sm outline-none focus:border-navy"
          >
            {estado && !FICHA_ESTADOS.includes(estado) ? <option value={estado}>{estado}</option> : null}
            {FICHA_ESTADOS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted">NDA</label>
          <select
            value={nda}
            onChange={(e) => setNda(e.target.value as "Firmada" | "Pendiente")}
            className="rounded-md border border-border bg-cream2 px-2.5 py-2 text-sm outline-none focus:border-navy"
          >
            <option value="Pendiente">Pendiente</option>
            <option value="Firmada">Firmada</option>
          </select>
        </div>
        <div className="col-span-2 flex flex-col gap-1">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted">Intereses</label>
          <textarea
            value={intereses}
            onChange={(e) => setIntereses(e.target.value)}
            rows={2}
            className="rounded-md border border-border bg-cream2 px-2.5 py-2 text-sm outline-none focus:border-navy"
          />
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="flex items-center gap-1.5 rounded-md bg-gold px-3 py-1.5 text-xs font-medium text-white hover:bg-gold2 disabled:opacity-50"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          Guardar ficha
        </button>
      </div>
    </SectionCard>
  );
}

function FichaField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-border bg-cream2 px-2.5 py-2 text-sm outline-none focus:border-navy focus:bg-white"
      />
    </div>
  );
}

function TabDatos({ c, isAgente }: { c: Comprador; isAgente: boolean }) {
  return (
    <>
      <div className="mb-4 rounded-lg bg-gradient-to-br from-navy to-navy3 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: `linear-gradient(135deg,${c.col})` }}>{c.ini}</div>
          <div className="flex-1">
            <div className="text-base font-semibold text-white">{nombreVisible(c)}</div>
            <div className="mt-1">
              <DatosOfertaEstado datos={datosFirmaFromComprador(c)} />
            </div>
            <div className="text-xs text-white/40">{c.tipo} · NDA {c.nda}</div>
          </div>
          <span className="rounded-md bg-white/10 px-2.5 py-1 text-xs font-medium text-gold">{c.estado}</span>
        </div>
      </div>

      <GestionPlazo
        ultimaGestionAgenteAt={c.ultimaGestionAgenteAt}
        assigned={Boolean(c.agenteId)}
        verbose
      />

      {isAgente ? null : (
        <div className="mb-4">
          <AccesoYNdaCard c={c} />
        </div>
      )}

      <div className="mb-4">
        <FichaCompradorCard c={c} />
      </div>

      <DemandaBloque compradorId={c.id} modo="staff" />

      <ActivosEnviadosBloque compradorId={c.id} />

      {isAgente ? null : (
        <ConsentimientoWhatsapp compradorId={c.id} acepta={c.aceptaWhatsapp === true} />
      )}

      {isAgente ? null : (
        <div className="mb-4">
          <AgenteAssignmentCard compradorId={c.id} />
        </div>
      )}

      <div className="mb-4">
        <ActividadCompradorCard compradorId={c.id} />
      </div>

      <div className="mb-4"><SectionCard title="Perfil de Búsqueda">
        <div className="grid grid-cols-3 gap-2">
          <DataPill label="Intereses" value={c.intereses || "—"} />
          <DataPill label="Presupuesto" value={c.presupuesto || "—"} />
          <DataPill label="Activos vinculados" value={c.activos || "0"} />
        </div>
      </SectionCard></div>

      <div className="mb-4">
        <HistorialOfertasCard compradorId={c.id} />
      </div>
    </>
  );
}

function AccesoYNdaCard({ c }: { c: Comprador }) {
  const { refreshCompradores } = useApp();
  const [acceso, setAcceso] = useState<CompradorAcceso>(c.acceso);
  const [nda, setNda] = useState<"Firmada" | "Pendiente">(c.nda);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setAcceso(c.acceso);
    setNda(c.nda);
  }, [c.acceso, c.nda]);

  async function save() {
    setSaving(true);
    try {
      const result = await updateCompradorFields(c.id, { acceso, nda });
      raiseActionError(result);
      await refreshCompradores();
      toast.success("Acceso y NDA actualizados");
    } catch (err) {
      toast.error("No se pudo guardar", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  }

  async function toggleAccesoRapido(next: CompradorAcceso) {
    setSaving(true);
    try {
      const result = await setCompradorAcceso(c.id, next);
      raiseActionError(result);
      setAcceso(next);
      await refreshCompradores();
      toast.success(next === "activo" ? "Acceso activado" : "Acceso desactivado");
    } catch (err) {
      toast.error("No se pudo cambiar el acceso", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard title="Acceso al portal y NDA">
      <div className="mb-3 flex items-start gap-2 text-xs text-muted">
        <Shield size={14} className="mt-0.5 flex-shrink-0 text-gold" />
        <p>
          El acceso al área privada es manual. Firmar NDA en una oferta actualiza el flag NDA,
          pero no abre el portal automáticamente.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted">Acceso portal</label>
          <select
            value={acceso}
            onChange={(e) => setAcceso(e.target.value as CompradorAcceso)}
            className="rounded-md border border-border bg-cream2 px-2.5 py-2 text-sm outline-none focus:border-navy"
          >
            <option value="sin_acceso">Sin acceso</option>
            <option value="activo">Activo</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted">NDA</label>
          <select
            value={nda}
            onChange={(e) => setNda(e.target.value as "Firmada" | "Pendiente")}
            className="rounded-md border border-border bg-cream2 px-2.5 py-2 text-sm outline-none focus:border-navy"
          >
            <option value="Pendiente">Pendiente</option>
            <option value="Firmada">Firmada</option>
          </select>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        {acceso === "sin_acceso" ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => void toggleAccesoRapido("activo")}
            className="rounded-md border border-green/30 px-3 py-1.5 text-xs font-medium text-green hover:bg-green/5 disabled:opacity-50"
          >
            Activar acceso
          </button>
        ) : (
          <button
            type="button"
            disabled={saving}
            onClick={() => void toggleAccesoRapido("sin_acceso")}
            className="rounded-md border border-red/30 px-3 py-1.5 text-xs font-medium text-red hover:bg-red/5 disabled:opacity-50"
          >
            Desactivar acceso
          </button>
        )}
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="flex items-center gap-1.5 rounded-md bg-gold px-3 py-1.5 text-xs font-medium text-white hover:bg-gold2 disabled:opacity-50"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          Guardar
        </button>
      </div>
    </SectionCard>
  );
}

function HistorialOfertasCard({ compradorId }: { compradorId: string }) {
  const [ofertas, setOfertas] = useState<OfertaRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchOfertasByComprador(compradorId)
      .then((rows) => {
        if (!cancelled) setOfertas(rows);
      })
      .catch(() => {
        if (!cancelled) setOfertas([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [compradorId]);

  return (
    <SectionCard title="Historial de Ofertas">
      {loading ? (
        <div className="flex items-center gap-2 py-4 text-xs text-muted">
          <Loader2 size={14} className="animate-spin" /> Cargando ofertas…
        </div>
      ) : ofertas.length === 0 ? (
        <p className="py-2 text-sm text-muted">Sin ofertas registradas para este comprador.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {ofertas.map((o) => (
            <div key={o.id} className="flex items-center gap-3 rounded-md border border-border bg-cream2 p-3">
              <FileText size={16} className="flex-shrink-0 text-blue" />
              <div className="flex-1 overflow-hidden">
                <div className="truncate text-sm font-medium text-navy">Activo {o.asset_id}</div>
                <div className="text-[11px] text-muted">
                  {fmt(o.propuesta_euros)} € · {new Date(o.created_at).toLocaleDateString("es-ES")}
                </div>
                {o.comentarios ? (
                  <div className="mt-1">
                    <CommentByline
                      author={o.comentarios_author}
                      authorRole={o.comentarios_author_role}
                      createdAt={o.created_at}
                    />
                    <p className="mt-0.5 text-xs text-text">{o.comentarios}</p>
                  </div>
                ) : null}
              </div>
              <span className="rounded-md bg-blue/8 px-2 py-0.5 text-[10px] font-semibold text-blue">
                {etiquetaEstado(o.estado)}
              </span>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function TabDocs() {
  return (
    <>
      <div className="mb-4 flex cursor-pointer flex-col items-center rounded-lg border-2 border-dashed border-border bg-cream2 p-6 hover:border-navy/30">
        <Upload size={24} className="mb-2 text-muted" />
        <p className="text-sm text-muted"><span className="font-medium text-text">Arrastra archivos</span> o haz clic</p>
      </div>
      {[{ name: "NDA_Firmada_JRG.pdf", meta: "Admin · 250 KB · 15 Feb 2026" }, { name: "Documentos_identidad.pdf", meta: "Admin · 1.5 MB · 10 Feb 2026" }].map((d, i) => (
        <div key={i} className="mb-2 flex items-center gap-3 rounded-lg border border-border bg-white p-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-cream2 text-red"><FileText size={16} /></div>
          <div className="flex-1">
            <div className="text-sm font-medium text-navy">{d.name}</div>
            <div className="text-[11px] text-muted">{d.meta}</div>
          </div>
          <button className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-navy hover:bg-cream"><Download size={12} /></button>
        </div>
      ))}
    </>
  );
}

function TabConversacion() {
  return (
    <>
      <div className="flex max-h-[400px] flex-col gap-2 overflow-y-auto">
        {chatMessages.map((m, i) => (
          <div key={i} className={`max-w-[76%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
            m.from === "cli" ? "self-start bg-white text-text" : "self-end bg-navy text-white"
          }`}>
            {m.text}
            <div className={`mt-0.5 text-[10px] ${m.from === "cli" ? "text-muted" : "text-right text-white/40"}`}>{m.time}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <textarea className="flex-1 rounded-md border border-border p-2.5 text-sm outline-none focus:border-navy" rows={2} placeholder="Escribe un mensaje..." />
        <button className="flex items-center gap-1 self-end rounded-md bg-gold px-3.5 py-2.5 text-xs font-medium text-white hover:bg-gold2"><Send size={12} /></button>
      </div>
    </>
  );
}

function isActividadDenied(message: string): boolean {
  return message.startsWith("Acceso")
    || message.includes("agente asignado")
    || message.includes("No tienes acceso");
}

function ActividadCompradorCard({ compradorId }: { compradorId: string }) {
  const { refreshCompradores } = useApp();
  const [rows, setRows] = useState<CompradorComentario[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchCompradorComentarios(compradorId)
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setRows([]);
          setError(result.error);
          return;
        }
        setRows(result.comentarios);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setRows([]);
        setError(err instanceof Error ? err.message : "No se pudieron cargar los comentarios");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [compradorId, reloadKey]);

  const denied = error != null && isActividadDenied(error);

  async function handleSave() {
    if (!text.trim() || saving) return;
    setSaving(true);
    try {
      const result = await createCompradorComentario(compradorId, text);
      raiseActionError(result);
      setText("");
      toast.success("Comentario guardado");
      setReloadKey((current) => current + 1);
      void refreshCompradores();
    } catch (err) {
      toast.error("No se pudo guardar el comentario", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard title="Llamadas y acciones">
      <div className="mb-3 flex items-start gap-2">
        <Phone size={16} className="mt-0.5 flex-shrink-0 text-gold" />
        <p className="text-xs text-muted">
          Comentarios de llamadas y acciones. El administrador aparece como Gestor. El agente asignado aparece con su nombre. Los más recientes van primero.
        </p>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 py-3 text-xs text-muted">
          <Loader2 size={14} className="animate-spin" /> Cargando comentarios…
        </div>
      ) : denied ? (
        <p className="py-2 text-sm text-muted">{error}</p>
      ) : (
        <>
          {error ? <p className="mb-2 text-xs text-red">{error}</p> : null}
          {rows.length === 0 ? (
            <p className="mb-3 text-sm text-muted">Todavía no hay comentarios de llamadas o acciones.</p>
          ) : (
            <div className="mb-3 flex flex-col gap-2">
              {rows.map((row) => (
                <div key={row.id} className="rounded-lg border border-border bg-cream2 p-3" data-testid="comentario-comprador">
                  <CommentByline author={row.author} authorRole={row.authorRole} createdAt={row.createdAt} />
                  <p className="mt-1 text-sm leading-relaxed text-text whitespace-pre-wrap">{row.text}</p>
                </div>
              ))}
            </div>
          )}
          <textarea
            aria-label="Comentario de llamada o acción"
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={3}
            className="w-full rounded-md border border-border bg-cream2 p-3 text-sm text-text outline-none focus:border-navy"
            placeholder="Qué se habló o qué acción se hizo…"
          />
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              disabled={saving || !text.trim()}
              onClick={() => void handleSave()}
              className="flex items-center gap-1.5 rounded-md bg-gold px-3 py-1.5 text-xs font-medium text-white hover:bg-gold2 disabled:opacity-50"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              Guardar comentario
            </button>
          </div>
        </>
      )}
    </SectionCard>
  );
}

function AgenteAssignmentCard({ compradorId }: { compradorId: string }) {
  const { vendedores, vendedoresLoading, refreshCompradores } = useApp();
  const [currentAgenteId, setCurrentAgenteId] = useState<string>("");
  const [pendingAgenteId, setPendingAgenteId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getCompradorAgente(compradorId)
      .then((id) => {
        if (cancelled) return;
        const value = id ?? "";
        setCurrentAgenteId(value);
        setPendingAgenteId(value);
      })
      .catch(() => {
        if (cancelled) return;
        setCurrentAgenteId("");
        setPendingAgenteId("");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [compradorId]);

  const dirty = pendingAgenteId !== currentAgenteId;
  const selectedVendor = vendedores.find((v) => v.id === pendingAgenteId);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await setCompradorAgente(compradorId, pendingAgenteId || null);
      setCurrentAgenteId(pendingAgenteId);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      void refreshCompradores();
      if (pendingAgenteId && selectedVendor) {
        toast.success("Agente asignado al comprador", { description: `Agente: ${selectedVendor.nombre}` });
      } else {
        toast.success("Agente retirado del comprador");
      }
    } catch (err) {
      toast.error("No se pudo asignar el agente", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard title="Agente asignado">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <UserCog size={18} className="flex-shrink-0 text-gold" />
          <p className="text-xs text-muted">
            Selecciona el agente responsable. Al guardar, recibirá una notificación en su panel.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted">
            <Loader2 size={14} className="animate-spin" /> Cargando agente actual…
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <select
              value={pendingAgenteId}
              onChange={(e) => setPendingAgenteId(e.target.value)}
              disabled={saving || vendedoresLoading}
              className="flex-1 cursor-pointer appearance-none rounded-md border border-border bg-cream2 px-3 py-2 text-sm outline-none focus:border-navy focus:bg-white"
            >
              <option value="">Sin asignar</option>
              {vendedores.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nombre}
                  {v.email ? ` — ${v.email}` : ""}
                </option>
              ))}
            </select>
            <button
              onClick={handleSave}
              disabled={!dirty || saving}
              className="flex items-center gap-1.5 rounded-md bg-gold px-3.5 py-2 text-xs font-medium text-white hover:bg-gold2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? (
                <Loader2 size={12} className="animate-spin" />
              ) : saved ? (
                <CheckCircle size={12} />
              ) : (
                <Save size={12} />
              )}
              {saved ? "Guardado" : "Guardar"}
            </button>
          </div>
        )}

        {selectedVendor && (
          <div className="flex items-center gap-2 rounded-md bg-cream2 p-2 text-xs text-muted">
            <div
              className="flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-bold text-white"
              style={{ background: `linear-gradient(135deg,${selectedVendor.col || "#2563a8,#0d2a4a"})` }}
            >
              {selectedVendor.ini || selectedVendor.nombre.slice(0, 2).toUpperCase()}
            </div>
            <span>
              <strong className="font-semibold text-navy">{selectedVendor.nombre}</strong>
              {selectedVendor.tel ? ` · ${selectedVendor.tel}` : ""}
            </span>
            <Link
              href={`/admin/agentes/${selectedVendor.id}`}
              className="ml-auto text-gold hover:underline"
            >
              Ver agente
            </Link>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
