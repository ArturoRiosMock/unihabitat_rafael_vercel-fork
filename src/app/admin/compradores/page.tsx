"use client";

import { useState, useMemo } from "react";
import { useApp } from "@/lib/context";
import Link from "next/link";
import { Search, X, Plus, ChevronRight, Loader2, AlertCircle } from "lucide-react";
import { createComprador } from "@/app/actions/compradores";
import { GestionPlazo } from "@/components/GestionPlazo";
import { plazoGestion } from "@/lib/comprador-gestion";
import { datosFirmaFromComprador, etiquetaDatosFirma, nombreVisible } from "@/lib/comprador-oferta";
import { toast } from "@/lib/toast";

const pillClass: Record<string, string> = {
  "fp-pub": "bg-green/8 text-green",
  "fp-sus": "bg-red/8 text-red",
  "fp-seg": "bg-blue/8 text-blue",
  "fp-res": "bg-orange/8 text-orange",
  "fp-nd": "bg-muted/8 text-muted",
};

const ESTADO_OPTIONS = [
  "Nuevo",
  "Seguimiento",
  "Negociación",
  "Contactado",
  "Oferta enviada",
  "Cerrado",
];

function agenteVisible(nombre: string, agenteId: string | null | undefined): string {
  if (!agenteId) return "Gestor";
  return nombre.trim() || "Agente";
}

const NEGOCIACION_ESTADOS = new Set(["Negociación", "Oferta enviada"]);
const CERRADO_ESTADOS = new Set(["Cerrado", "Cerrada", "Ganada", "Operación cerrada"]);

export default function CompradoresPage() {
  const { compradores, compradoresLoading, compradoresError, refreshCompradores, session } = useApp();
  const isAgente = session?.role === "vendedor";
  const [q, setQ] = useState("");
  const [fTipo, setFTipo] = useState("");
  const [fEstado, setFEstado] = useState("");
  const [fAgente, setFAgente] = useState("");
  const [fNda, setFNda] = useState("");
  const [fAcceso, setFAcceso] = useState("");
  const [fGestion, setFGestion] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const agenteOptions = useMemo(() => {
    const set = new Set<string>();
    for (const c of compradores) {
      set.add(agenteVisible(c.agente, c.agenteId));
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
  }, [compradores]);

  const stats = useMemo(() => {
    const total = compradores.length;
    let firmados = 0;
    let negociacion = 0;
    let cerradas = 0;
    let sinAcceso = 0;
    for (const c of compradores) {
      if (c.nda === "Firmada") firmados += 1;
      if (NEGOCIACION_ESTADOS.has(c.estado)) negociacion += 1;
      if (CERRADO_ESTADOS.has(c.estado)) cerradas += 1;
      if (c.acceso === "sin_acceso") sinAcceso += 1;
    }
    return { total, firmados, negociacion, cerradas, sinAcceso };
  }, [compradores]);

  const filtered = useMemo(() => {
    return compradores.filter((p) => {
      if (fTipo && p.tipo !== fTipo) return false;
      if (fEstado && p.estado !== fEstado) return false;
      if (fAgente && agenteVisible(p.agente, p.agenteId) !== fAgente) return false;
      if (fNda && p.nda !== fNda) return false;
      if (fAcceso && p.acceso !== fAcceso) return false;
      if (fGestion === "sin_agente" && p.agenteId) return false;
      if (fGestion === "por_vencer") {
        const plazo = plazoGestion(p.ultimaGestionAgenteAt, Boolean(p.agenteId));
        if (!plazo.warning) return false;
      }
      if (q) {
        const blob = [
          nombreVisible(p),
          p.apellidos,
          p.documento,
          p.razonSocial,
          p.poblacion,
          p.email,
          p.tel,
          p.agente,
          p.estado,
          p.intereses,
        ]
          .join(" ")
          .toLowerCase();
        if (!blob.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [compradores, q, fTipo, fEstado, fAgente, fNda, fAcceso, fGestion]);

  const clearFilters = () => {
    setQ("");
    setFTipo("");
    setFEstado("");
    setFAgente("");
    setFNda("");
    setFAcceso("");
    setFGestion("");
  };

  return (
    <>
      <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-white px-6">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-navy">Compradores</h1>
          <span className="rounded-md bg-cream px-2.5 py-0.5 text-xs font-medium text-muted">
            {compradoresLoading ? "Cargando…" : `${stats.total} compradores`}
          </span>
          {stats.sinAcceso > 0 && (
            <span className="rounded-md bg-orange/10 px-2.5 py-0.5 text-xs font-medium text-orange">
              {stats.sinAcceso} sin acceso
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-gold/10 px-2.5 py-1 text-xs font-medium text-gold">
            {isAgente ? "Agente" : "Admin"}
          </span>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 rounded-lg bg-navy px-3.5 py-2 text-xs font-medium text-white hover:bg-navy3"
          >
            <Plus size={14} /> Nuevo Comprador
          </button>
        </div>
      </div>

      <div className="p-5">
        <p className="mb-3 text-xs text-muted">
          {isAgente
            ? "Solo los compradores que gestionas. Si pasan 90 días sin tu gestión, pasan a ser propiedad del gestor."
            : "Clientes interesados en adquirir activos. El agente asignado tiene 90 días para gestionarlos."}
        </p>

        {compradoresError && (
          <div className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-red/30 bg-red/5 p-3 text-sm text-red">
            <div className="flex items-start gap-2">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-semibold">No se pudo cargar la lista de compradores</div>
                <div className="mt-0.5 text-xs text-red/80">{compradoresError}</div>
              </div>
            </div>
            <button
              onClick={() => void refreshCompradores()}
              className="flex-shrink-0 rounded-md border border-red/30 bg-white px-2.5 py-1 text-xs font-medium text-red hover:bg-red/5"
            >
              Reintentar
            </button>
          </div>
        )}

        <div className="mb-4 grid grid-cols-4 gap-3">
          <Kpi value={stats.total} label="Total compradores" />
          <Kpi value={stats.firmados} label="Con NDA firmada" />
          <Kpi value={stats.negociacion} label="En negociación" />
          <Kpi value={stats.sinAcceso} label="Sin acceso portal" />
        </div>

        <div className="relative mb-3">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            className="w-full rounded-lg border border-border bg-white py-2.5 pl-9 pr-4 text-sm text-text shadow-sm outline-none placeholder:text-muted/70 focus:border-navy focus:ring-2 focus:ring-navy/5"
            placeholder="Buscar por nombre, apellidos, documento, email, teléfono..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <div className="mb-3 rounded-lg border border-border bg-white p-3.5 shadow-sm">
          <div className="flex flex-wrap items-end gap-2.5">
            <FSelect label="Tipo" value={fTipo} onChange={setFTipo} options={["Privado", "Free"]} />
            <FSelect label="Estado" value={fEstado} onChange={setFEstado} options={ESTADO_OPTIONS} />
            <FSelect label="Agente" value={fAgente} onChange={setFAgente} options={agenteOptions} />
            <FSelect label="NDA" value={fNda} onChange={setFNda} options={["Firmada", "Pendiente"]} />
            <FSelect
              label="Acceso"
              value={fAcceso}
              onChange={setFAcceso}
              options={["activo", "sin_acceso"]}
              optionLabels={{ activo: "Activo", sin_acceso: "Sin acceso" }}
            />
            <FSelect
              label="Gestión"
              value={fGestion}
              onChange={setFGestion}
              options={["por_vencer", "sin_agente"]}
              optionLabels={{ por_vencer: "Menos de 15 días", sin_agente: "Propiedad del gestor" }}
            />
            <div className="h-8 w-px self-end bg-border2" />
            <button
              type="button"
              onClick={clearFilters}
              className="self-end rounded-md border border-border px-2.5 py-[7px] text-muted hover:border-red hover:text-red"
              title="Limpiar filtros"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        <p className="mb-2 text-xs text-muted">
          Mostrando <strong className="font-semibold text-navy">{filtered.length}</strong> de{" "}
          <strong className="font-semibold text-navy">{stats.total}</strong> compradores
        </p>

        <div className="overflow-hidden rounded-lg border border-border bg-white shadow-sm">
          <div className="grid grid-cols-[minmax(0,2fr)_64px_80px_110px_120px_90px_100px_72px_28px] items-center gap-2 bg-navy px-3.5 py-2.5">
            {["Cliente", "Tipo", "Acceso", "Agente", "Gestión", "Presupuesto", "Estado", "NDA", ""].map((h, i) => (
              <div key={`${h}-${i}`} className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
                {h}
              </div>
            ))}
          </div>

          {compradoresLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
              <Loader2 size={16} className="animate-spin" /> Cargando compradores…
            </div>
          ) : stats.total === 0 ? (
            <div className="py-12 text-center text-sm text-muted">
              Aún no hay compradores registrados en la base de datos.
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted">
              No se encontraron compradores con los filtros actuales.
            </div>
          ) : (
            filtered.map((p) => {
              const datosEtiqueta = etiquetaDatosFirma(datosFirmaFromComprador(p));
              const datosOk = datosEtiqueta === "Datos completos";
              return (
              <Link
                key={p.id}
                href={`/admin/compradores/${p.id}`}
                className="grid grid-cols-[minmax(0,2fr)_64px_80px_110px_120px_90px_100px_72px_28px] items-center gap-2 border-b border-border2 px-3.5 py-2 transition-colors last:border-b-0 hover:bg-cream/50"
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <div
                    className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                    style={{ background: `linear-gradient(135deg,${p.col || "#2563a8,#0d2a4a"})` }}
                  >
                    {p.ini}
                  </div>
                  <div className="overflow-hidden">
                    <div className="truncate text-sm font-medium">{nombreVisible(p)}</div>
                    <div className="truncate text-[11px] text-muted">{p.email}</div>
                    <div
                      className={`truncate text-[10px] font-medium ${datosOk ? "text-green" : "text-orange"}`}
                      title={datosEtiqueta}
                    >
                      {datosEtiqueta}
                    </div>
                  </div>
                </div>
                <span
                  className={`inline-flex w-fit rounded-md px-2 py-0.5 text-[10px] font-semibold ${p.tipo === "Privado" ? pillClass["fp-seg"] : pillClass["fp-nd"]}`}
                >
                  {p.tipo}
                </span>
                <span
                  className={`inline-flex w-fit rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                    p.acceso === "activo" ? pillClass["fp-pub"] : pillClass["fp-sus"]
                  }`}
                >
                  {p.acceso === "activo" ? "Activo" : "Sin acceso"}
                </span>
                <span className="truncate text-xs">{agenteVisible(p.agente, p.agenteId)}</span>
                <GestionPlazo ultimaGestionAgenteAt={p.ultimaGestionAgenteAt} assigned={Boolean(p.agenteId)} />
                <span className="text-xs font-semibold text-navy">{p.presupuesto || "—"}</span>
                <span className={`inline-flex w-fit rounded-md px-2 py-0.5 text-[10px] font-semibold ${pillClass[p.estadoC] || ""}`}>
                  {p.estado || "—"}
                </span>
                <span
                  className={`inline-flex w-fit rounded-md px-2 py-0.5 text-[10px] font-semibold ${p.nda === "Firmada" ? pillClass["fp-pub"] : pillClass["fp-nd"]}`}
                >
                  {p.nda}
                </span>
                <ChevronRight size={14} className="text-border" />
              </Link>
              );
            })
          )}
        </div>
      </div>

      {showCreate && (
        <NuevoCompradorModal
          isAgente={isAgente}
          onClose={() => setShowCreate(false)}
          onCreated={async () => {
            setShowCreate(false);
            await refreshCompradores();
          }}
        />
      )}
    </>
  );
}

function NuevoCompradorModal({
  isAgente,
  onClose,
  onCreated,
}: {
  isAgente: boolean;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [nombre, setNombre] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [email, setEmail] = useState("");
  const [tel, setTel] = useState("");
  const [tipo, setTipo] = useState<"Privado" | "Free">("Privado");
  const [acceso, setAcceso] = useState<"sin_acceso" | "activo">("sin_acceso");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await createComprador({
        nombre,
        apellidos,
        email,
        tel,
        tipo,
        acceso: isAgente ? "sin_acceso" : acceso,
      });
      toast.success("Comprador creado", {
        description: isAgente
          ? "Queda asignado a ti, sin acceso al portal hasta que el gestor lo active."
          : acceso === "sin_acceso"
            ? "Queda sin acceso al portal hasta que lo actives."
            : "Tiene acceso activo al área privada.",
      });
      await onCreated();
    } catch (err) {
      toast.error("No se pudo crear", {
        description: err instanceof Error ? err.message : "Error desconocido",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => void handleSubmit(e)}
        className="w-full max-w-md rounded-xl border border-border bg-white p-5 shadow-xl"
      >
        <h2 className="mb-1 text-base font-semibold text-navy">Nuevo comprador</h2>
        <p className="mb-4 text-xs text-muted">
          {isAgente
            ? "Queda asignado a ti. El acceso al portal lo activa el gestor."
            : "Por defecto queda sin acceso al portal privado hasta activación manual."}
        </p>
        <div className="flex flex-col gap-3">
          <Field label="Nombre *" value={nombre} onChange={setNombre} required />
          <Field label="Apellidos" value={apellidos} onChange={setApellidos} />
          <Field label="Email *" value={email} onChange={setEmail} type="email" required />
          <Field label="Teléfono" value={tel} onChange={setTel} />
          <div className={isAgente ? "" : "grid grid-cols-2 gap-3"}>
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
            {isAgente ? null : (
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted">Acceso portal</label>
                <select
                  value={acceso}
                  onChange={(e) => setAcceso(e.target.value as "sin_acceso" | "activo")}
                  className="rounded-md border border-border bg-cream2 px-2.5 py-2 text-sm outline-none focus:border-navy"
                >
                  <option value="sin_acceso">Sin acceso</option>
                  <option value="activo">Activo</option>
                </select>
              </div>
            )}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-3.5 py-2 text-xs font-medium text-navy hover:bg-cream"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-navy px-3.5 py-2 text-xs font-medium text-white hover:bg-navy3 disabled:opacity-60"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Crear
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</label>
      <input
        type={type}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-border bg-cream2 px-2.5 py-2 text-sm outline-none focus:border-navy focus:bg-white"
      />
    </div>
  );
}

function Kpi({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-lg border border-border bg-white p-4 shadow-sm">
      <div className="text-2xl font-bold text-navy">{value}</div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</div>
    </div>
  );
}

function FSelect({
  label,
  value,
  onChange,
  options,
  optionLabels,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  optionLabels?: Record<string, string>;
}) {
  return (
    <div className="flex min-w-[90px] flex-1 flex-col gap-1">
      <label className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full cursor-pointer appearance-none rounded-md border border-border bg-cream2 py-[7px] pl-2.5 pr-6 text-xs text-text outline-none focus:border-navy focus:bg-white"
      >
        <option value="">Todos</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {optionLabels?.[o] ?? o}
          </option>
        ))}
      </select>
    </div>
  );
}
