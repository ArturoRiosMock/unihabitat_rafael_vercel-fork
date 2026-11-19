"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Save,
  Loader2,
  CheckCircle,
  Trash2,
  Shield,
  Users,
  Building2,
  AlertCircle,
  Mail,
} from "lucide-react";
import { useApp } from "@/lib/context";
import { nombreVisible } from "@/lib/comprador-oferta";
import {
  fetchVendorPermissions,
  upsertVendorPermissions,
  fetchVendorAssignedAssetIds,
  fetchVendorAssignedCompradorIds,
} from "@/app/actions/permissions";
import { toast } from "@/lib/toast";
import {
  updateVendedor,
  deleteVendedor,
  setCompradorAgente,
  setAssetAgente,
  reinviteVendedor,
} from "@/app/actions/vendedores";
import { ADMIN_SECTIONS, type VendorPermission, type SectionId } from "@/lib/permissions";

const ESTADO_OPTIONS = ["Activo", "Inactivo", "En vacaciones"];
const ESTADO_C: Record<string, string> = {
  Activo: "fp-pub",
  Inactivo: "fp-sus",
  "En vacaciones": "fp-seg",
};

export default function AgenteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const {
    vendedores,
    compradores,
    assets,
    refreshVendedores,
    refreshCompradores,
    refreshAssets,
  } = useApp();
  const v = useMemo(() => vendedores.find((x) => x.id === id), [vendedores, id]);

  const [tab, setTab] = useState<"datos" | "compradores" | "activos" | "permisos">("datos");

  /* ----------------- Datos editables ----------------- */
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [tel, setTel] = useState("");
  const [cartera, setCartera] = useState("");
  const [estado, setEstado] = useState("Activo");
  const [savingDatos, setSavingDatos] = useState(false);
  const [datosSaved, setDatosSaved] = useState(false);
  const [datosError, setDatosError] = useState<string | null>(null);

  useEffect(() => {
    if (!v) return;
    setNombre(v.nombre);
    setEmail(v.email || "");
    setTel(v.tel || "");
    setCartera(v.cartera || "");
    setEstado(v.estado || "Activo");
  }, [v]);

  const handleSaveDatos = async () => {
    if (!v) return;
    setDatosError(null);
    setSavingDatos(true);
    try {
      await updateVendedor(v.id, {
        nombre,
        email,
        tel,
        cartera,
        estado,
        estadoC: ESTADO_C[estado] || "fp-nd",
      });
      setDatosSaved(true);
      setTimeout(() => setDatosSaved(false), 2000);
      void refreshVendedores();
    } catch (err) {
      setDatosError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSavingDatos(false);
    }
  };

  const handleDelete = async () => {
    if (!v) return;
    const ok = confirm(`¿Eliminar agente "${v.nombre}"? Se desvinculará de sus compradores y activos.`);
    if (!ok) return;
    try {
      await deleteVendedor(v.id);
      void refreshVendedores();
      void refreshCompradores();
      void refreshAssets();
      toast.success("Agente eliminado", { description: `"${v.nombre}" ha sido desvinculado correctamente.` });
      window.location.href = "/admin/agentes";
    } catch (err) {
      toast.error("No se pudo eliminar el agente", { description: err instanceof Error ? err.message : String(err) });
    }
  };

  const [reinviting, setReinviting] = useState(false);
  const handleReinvite = async () => {
    if (!v) return;
    if (!v.email) {
      toast.error("Sin email", { description: "Guarda primero un email para este agente." });
      return;
    }
    const ok = confirm(
      `Se enviará un nuevo enlace seguro a ${v.email} para que (re)defina su contraseña. ¿Continuar?`,
    );
    if (!ok) return;
    setReinviting(true);
    try {
      const result = await reinviteVendedor(v.id);
      if (result.ok) {
        toast.success("Invitación enviada", { description: result.message });
      } else {
        toast.error("No se pudo enviar la invitación", { description: result.message });
      }
    } catch (err) {
      toast.error("No se pudo enviar la invitación", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setReinviting(false);
    }
  };

  /* ----------------- Asignaciones ----------------- */
  const [assignedCompradores, setAssignedCompradores] = useState<string[]>([]);
  const [assignedAssets, setAssignedAssets] = useState<string[]>([]);
  const [assigningC, setAssigningC] = useState<string | null>(null);
  const [assigningA, setAssigningA] = useState<string | null>(null);

  const loadAssignments = useCallback(async () => {
    if (!v) return;
    try {
      const [cIds, aIds] = await Promise.all([
        fetchVendorAssignedCompradorIds(v.id),
        fetchVendorAssignedAssetIds(v.id),
      ]);
      setAssignedCompradores(cIds);
      setAssignedAssets(aIds);
    } catch {
      setAssignedCompradores([]);
      setAssignedAssets([]);
    }
  }, [v]);

  useEffect(() => {
    void loadAssignments();
  }, [loadAssignments]);

  const handleToggleComprador = async (cId: string) => {
    if (!v) return;
    setAssigningC(cId);
    try {
      const isAssigned = assignedCompradores.includes(cId);
      if (isAssigned) {
        await setCompradorAgente(cId, null);
        setAssignedCompradores((prev) => prev.filter((x) => x !== cId));
        toast.success("Comprador desasignado", { description: `Retirado del agente ${v.nombre}` });
      } else {
        await setCompradorAgente(cId, v.id);
        setAssignedCompradores((prev) => [...prev, cId]);
        toast.success("Comprador asignado al agente", { description: `Agente: ${v.nombre}` });
      }
      void refreshCompradores();
    } catch (err) {
      toast.error("No se pudo asignar el comprador", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setAssigningC(null);
    }
  };

  const handleToggleAsset = async (aId: string) => {
    if (!v) return;
    setAssigningA(aId);
    try {
      const isAssigned = assignedAssets.includes(aId);
      if (isAssigned) {
        await setAssetAgente(aId, null);
        setAssignedAssets((prev) => prev.filter((x) => x !== aId));
        toast.success("Activo desasignado", { description: `Retirado del agente ${v.nombre}` });
      } else {
        await setAssetAgente(aId, v.id);
        setAssignedAssets((prev) => [...prev, aId]);
        toast.success("Activo asignado al agente", { description: `Agente: ${v.nombre}` });
      }
      void refreshAssets();
    } catch (err) {
      toast.error("No se pudo asignar el activo", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setAssigningA(null);
    }
  };

  /* ----------------- Permisos ----------------- */
  const [perms, setPerms] = useState<VendorPermission[]>([]);
  const [permsLoading, setPermsLoading] = useState(true);
  const [permsSaving, setPermsSaving] = useState(false);
  const [permsSaved, setPermsSaved] = useState(false);

  useEffect(() => {
    if (!v) return;
    setPermsLoading(true);
    fetchVendorPermissions(v.id)
      .then(setPerms)
      .catch(() => setPerms([]))
      .finally(() => setPermsLoading(false));
  }, [v]);

  const togglePerm = (section: SectionId, field: "canView" | "canEdit") => {
    setPerms((prev) =>
      prev.map((p) => {
        if (p.section !== section) return p;
        const next = { ...p, [field]: !p[field] };
        if (field === "canView" && !next.canView) next.canEdit = false;
        if (field === "canEdit" && next.canEdit) next.canView = true;
        return next;
      }),
    );
  };

  const handleSavePerms = async () => {
    if (!v) return;
    setPermsSaving(true);
    try {
      await upsertVendorPermissions(v.id, perms);
      setPermsSaved(true);
      setTimeout(() => setPermsSaved(false), 2000);
      toast.success("Permisos guardados", { description: `Actualizados para ${v.nombre}` });
    } catch (err) {
      toast.error("No se pudieron guardar los permisos", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setPermsSaving(false);
    }
  };

  /* ----------------- Filtros para asignaciones ----------------- */
  const [qC, setQC] = useState("");
  const [qA, setQA] = useState("");
  const filteredCompradores = useMemo(() => {
    if (!qC) return compradores;
    const lower = qC.toLowerCase();
    return compradores.filter((c) =>
      [nombreVisible(c), c.apellidos, c.documento, c.email, c.tel, c.intereses].join(" ").toLowerCase().includes(lower),
    );
  }, [compradores, qC]);
  const filteredAssets = useMemo(() => {
    if (!qA) return assets.slice(0, 200);
    const lower = qA.toLowerCase();
    return assets
      .filter((a) =>
        [a.id, a.prov, a.pob, a.addr, a.propiedades[0]?.categoria ?? ""].join(" ").toLowerCase().includes(lower),
      )
      .slice(0, 200);
  }, [assets, qA]);

  const tabRefs = useRef<Record<string, HTMLDivElement | null>>({});

  if (!v) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted">
        <Users size={40} strokeWidth={1} className="text-border" />
        <p className="text-base font-medium">Agente no encontrado</p>
        <Link href="/admin/agentes" className="text-sm text-gold hover:underline">
          Volver al listado
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-white px-6">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-navy">{v.nombre}</h1>
          <span className="rounded-md bg-cream px-2.5 py-0.5 text-xs text-muted">{v.id}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-gold/10 px-2.5 py-1 text-xs font-medium text-gold">Admin</span>
          <Link
            href="/admin/agentes"
            className="flex items-center gap-1.5 rounded-lg border border-border bg-white px-3.5 py-2 text-xs font-medium text-navy hover:bg-cream"
          >
            <ArrowLeft size={14} /> Volver
          </Link>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden" style={{ height: "calc(100vh - 56px)" }}>
        {/* Sub-sidebar */}
        <div className="flex w-44 min-w-[176px] flex-col bg-navy py-3">
          {[
            { id: "datos", icon: Users, label: "Datos" },
            { id: "compradores", icon: Users, label: "Compradores" },
            { id: "activos", icon: Building2, label: "Activos" },
            { id: "permisos", icon: Shield, label: "Permisos" },
          ].map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id as typeof tab)}
                className={`flex items-center gap-2.5 border-l-[3px] px-4 py-2.5 text-left transition-all ${
                  active
                    ? "border-l-gold bg-white/[0.06] text-gold"
                    : "border-l-transparent text-white/35 hover:bg-white/[0.03] hover:text-white/60"
                }`}
              >
                <Icon size={15} strokeWidth={1.5} />
                <span className="text-xs font-medium">{t.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto bg-cream p-6">
          {/* Cabecera con avatar */}
          <div className="mb-4 rounded-lg bg-gradient-to-br from-navy to-navy3 p-4">
            <div className="flex items-center gap-3">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold text-white"
                style={{ background: `linear-gradient(135deg,${v.col || "#2563a8,#0d2a4a"})` }}
              >
                {v.ini || v.nombre.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1">
                <div className="text-base font-semibold text-white">{v.nombre}</div>
                <div className="text-xs text-white/40">
                  {v.email || "Sin email"} · {assignedCompradores.length} compradores ·{" "}
                  {assignedAssets.length} activos
                </div>
              </div>
              <span className="rounded-md bg-white/10 px-2.5 py-1 text-xs font-medium text-gold">
                {v.estado || "—"}
              </span>
            </div>
          </div>

          {tab === "datos" && (
            <div
              ref={(el) => {
                tabRefs.current.datos = el;
              }}
              className="rounded-lg border border-border bg-white p-5 shadow-sm"
            >
              <div className="mb-4 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[1.5px] text-gold after:h-px after:flex-1 after:bg-border">
                Información del agente
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nombre completo">
                  <input
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    className="w-full rounded-md border border-border bg-cream2 px-3 py-2 text-sm outline-none focus:border-navy focus:bg-white"
                  />
                </Field>
                <Field label="Email">
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    type="email"
                    className="w-full rounded-md border border-border bg-cream2 px-3 py-2 text-sm outline-none focus:border-navy focus:bg-white"
                  />
                </Field>
                <Field label="Teléfono">
                  <input
                    value={tel}
                    onChange={(e) => setTel(e.target.value)}
                    className="w-full rounded-md border border-border bg-cream2 px-3 py-2 text-sm outline-none focus:border-navy focus:bg-white"
                  />
                </Field>
                <Field label="Cartera">
                  <input
                    value={cartera}
                    onChange={(e) => setCartera(e.target.value)}
                    className="w-full rounded-md border border-border bg-cream2 px-3 py-2 text-sm outline-none focus:border-navy focus:bg-white"
                  />
                </Field>
                <Field label="Estado">
                  <select
                    value={estado}
                    onChange={(e) => setEstado(e.target.value)}
                    className="w-full cursor-pointer appearance-none rounded-md border border-border bg-cream2 px-3 py-2 text-sm outline-none focus:border-navy focus:bg-white"
                  >
                    {ESTADO_OPTIONS.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              {datosError && (
                <div className="mt-3 flex items-start gap-2 rounded-md border border-red/30 bg-red/5 p-2 text-xs text-red">
                  <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                  <span>{datosError}</span>
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <button
                  onClick={handleDelete}
                  className="flex items-center gap-1.5 rounded-md border border-red/30 bg-red/5 px-3 py-1.5 text-xs font-medium text-red hover:bg-red/10"
                >
                  <Trash2 size={12} /> Eliminar agente
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleReinvite}
                    disabled={reinviting || !email}
                    title={
                      email
                        ? "Envía un nuevo enlace seguro al email del agente para definir su contraseña"
                        : "Añade un email antes de reenviar la invitación"
                    }
                    className="flex items-center gap-1.5 rounded-md border border-navy/20 bg-white px-3 py-1.5 text-xs font-medium text-navy hover:bg-cream disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {reinviting ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Mail size={12} />
                    )}
                    Reenviar invitación
                  </button>
                  <button
                    onClick={handleSaveDatos}
                    disabled={savingDatos}
                    className="flex items-center gap-1.5 rounded-md bg-gold px-3.5 py-1.5 text-xs font-medium text-white hover:bg-gold2 disabled:opacity-50"
                  >
                    {savingDatos ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : datosSaved ? (
                      <CheckCircle size={12} />
                    ) : (
                      <Save size={12} />
                    )}
                    {datosSaved ? "Guardado" : "Guardar cambios"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {tab === "compradores" && (
            <div className="rounded-lg border border-border bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[1.5px] text-gold after:h-px after:flex-1 after:bg-border">
                Compradores asignados
              </div>
              <input
                value={qC}
                onChange={(e) => setQC(e.target.value)}
                placeholder="Buscar comprador..."
                className="mb-3 w-full rounded-md border border-border bg-cream2 px-3 py-2 text-sm outline-none focus:border-navy focus:bg-white"
              />
              <div className="max-h-[55vh] overflow-y-auto rounded-md border border-border">
                {filteredCompradores.length === 0 && (
                  <p className="p-4 text-center text-xs text-muted">No hay compradores</p>
                )}
                {filteredCompradores.map((c) => {
                  const checked = assignedCompradores.includes(c.id);
                  const busy = assigningC === c.id;
                  return (
                    <label
                      key={c.id}
                      className="flex cursor-pointer items-center gap-2 border-b border-border px-3 py-2 last:border-b-0 hover:bg-cream2"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={busy}
                        onChange={() => void handleToggleComprador(c.id)}
                        className="accent-gold"
                      />
                      <div className="flex-1 overflow-hidden">
                        <div className="truncate text-xs font-medium text-text">{nombreVisible(c)}</div>
                        <div className="truncate text-[10px] text-muted">{c.email}</div>
                      </div>
                      {busy && <Loader2 size={12} className="animate-spin text-gold" />}
                      {checked && !busy && (
                        <span className="rounded bg-green/10 px-1.5 py-0.5 text-[9px] font-bold text-green">
                          Asignado
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
              <p className="mt-3 text-[11px] text-muted">
                Al asignar un comprador, el agente recibirá una notificación en su panel.
              </p>
            </div>
          )}

          {tab === "activos" && (
            <div className="rounded-lg border border-border bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[1.5px] text-gold after:h-px after:flex-1 after:bg-border">
                Activos asignados
              </div>
              <input
                value={qA}
                onChange={(e) => setQA(e.target.value)}
                placeholder="Buscar activo por id, provincia, dirección..."
                className="mb-3 w-full rounded-md border border-border bg-cream2 px-3 py-2 text-sm outline-none focus:border-navy focus:bg-white"
              />
              <div className="max-h-[55vh] overflow-y-auto rounded-md border border-border">
                {filteredAssets.length === 0 && (
                  <p className="p-4 text-center text-xs text-muted">No hay activos</p>
                )}
                {filteredAssets.map((a) => {
                  const checked = assignedAssets.includes(a.id);
                  const busy = assigningA === a.id;
                  return (
                    <label
                      key={a.id}
                      className="flex cursor-pointer items-center gap-2 border-b border-border px-3 py-2 last:border-b-0 hover:bg-cream2"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={busy}
                        onChange={() => void handleToggleAsset(a.id)}
                        className="accent-gold"
                      />
                      <div className="flex-1 overflow-hidden">
                        <div className="truncate text-xs font-medium text-text">
                          {a.id} · {a.propiedades[0]?.categoria ?? "—"}
                        </div>
                        <div className="truncate text-[10px] text-muted">
                          {a.prov} · {a.addr !== "—" ? a.addr : a.pob}
                        </div>
                      </div>
                      {busy && <Loader2 size={12} className="animate-spin text-gold" />}
                      {checked && !busy && (
                        <span className="rounded bg-green/10 px-1.5 py-0.5 text-[9px] font-bold text-green">
                          Asignado
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
              <p className="mt-3 text-[11px] text-muted">
                Al asignar un activo, el agente recibirá una notificación en su panel.
              </p>
            </div>
          )}

          {tab === "permisos" && (
            <div className="rounded-lg border border-border bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[1.5px] text-gold after:h-px after:flex-1 after:bg-border">
                <Shield size={14} /> Permisos por sección
              </div>
              {permsLoading ? (
                <div className="flex items-center justify-center gap-2 py-8 text-muted">
                  <Loader2 size={16} className="animate-spin" /> Cargando…
                </div>
              ) : (
                <>
                  <div className="rounded-md border border-border">
                    <div className="flex items-center justify-between border-b border-border bg-cream2 px-4 py-2">
                      <span className="text-xs font-semibold text-navy">Sección</span>
                      <div className="flex gap-8 text-[10px] font-semibold uppercase tracking-wider text-muted">
                        <span className="w-12 text-center">Ver</span>
                        <span className="w-12 text-center">Editar</span>
                      </div>
                    </div>
                    {ADMIN_SECTIONS.map((s) => {
                      const p = perms.find((x) => x.section === s.id);
                      return (
                        <div
                          key={s.id}
                          className="flex items-center justify-between border-b border-border px-4 py-2.5 last:border-b-0"
                        >
                          <span className="text-sm text-text">{s.label}</span>
                          <div className="flex gap-8">
                            <Toggle checked={p?.canView ?? false} onChange={() => togglePerm(s.id, "canView")} />
                            <Toggle checked={p?.canEdit ?? false} onChange={() => togglePerm(s.id, "canEdit")} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-4 flex justify-end">
                    <button
                      onClick={handleSavePerms}
                      disabled={permsSaving}
                      className="flex items-center gap-1.5 rounded-md bg-gold px-3.5 py-1.5 text-xs font-medium text-white hover:bg-gold2 disabled:opacity-50"
                    >
                      {permsSaving ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : permsSaved ? (
                        <CheckCircle size={12} />
                      ) : (
                        <Save size={12} />
                      )}
                      {permsSaved ? "Guardado" : "Guardar permisos"}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</span>
      {children}
    </label>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <div className="flex w-12 justify-center">
      <div
        className={`relative h-5 w-10 cursor-pointer rounded-full transition-colors ${
          checked ? "bg-gold" : "bg-border"
        }`}
        onClick={onChange}
      >
        <div
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
            checked ? "left-[22px]" : "left-0.5"
          }`}
        />
      </div>
    </div>
  );
}
