"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Save, Plus, Pencil, Shield, Loader2, CheckCircle, UserCog } from "lucide-react";
import Link from "next/link";
import { useApp } from "@/lib/context";
import { ADMIN_SECTIONS, type VendorPermission, type SectionId } from "@/lib/permissions";
import {
  fetchVendorPermissions,
  upsertVendorPermissions,
  fetchVendorAssignedAssetIds,
  fetchVendorAssignedCompradorIds,
  assignAssetToVendor,
  unassignAssetFromVendor,
  assignCompradorToVendor,
  unassignCompradorFromVendor,
} from "@/app/actions/permissions";
import { GeoapifyDiagnostics } from "@/components/GeoapifyDiagnostics";
import { nombreVisible } from "@/lib/comprador-oferta";

interface ToggleItem { label: string; desc: string; enabled: boolean; }

export default function ConfigPage() {
  const { vendedores, assets, compradores } = useApp();

  const [general, setGeneral] = useState<ToggleItem[]>([
    { label: "Portal público activo", desc: "Permite el acceso público al portal de propiedades", enabled: true },
    { label: "Registro de compradores", desc: "Permite que nuevos compradores se registren", enabled: true },
    { label: "Notificaciones por email", desc: "Enviar alertas automáticas al equipo", enabled: false },
    { label: "Modo mantenimiento", desc: "Desactiva temporalmente el portal público", enabled: false },
  ]);

  const [nda, setNda] = useState<ToggleItem[]>([
    { label: "NDA obligatoria", desc: "Requiere firma de NDA para ver datos sensibles", enabled: true },
    { label: "Firma electrónica", desc: "Permitir firma digital de NDA", enabled: true },
    { label: "Caducidad automática", desc: "NDA expira a los 12 meses", enabled: false },
  ]);

  const [pubConf, setPubConf] = useState<ToggleItem[]>([
    { label: "Mostrar precios", desc: "Los precios son visibles en el portal público", enabled: false },
    { label: "Mostrar dirección exacta", desc: "Solo muestra municipio si está desactivado", enabled: false },
    { label: "Formulario de contacto", desc: "Habilita el formulario para cada activo público", enabled: true },
  ]);

  const toggle = (list: ToggleItem[], setList: (v: ToggleItem[]) => void, i: number) => {
    const copy = [...list];
    copy[i] = { ...copy[i], enabled: !copy[i].enabled };
    setList(copy);
  };

  // --- Vendor permissions state ---
  const [selectedVendor, setSelectedVendor] = useState<string | null>(null);
  const [vendorPerms, setVendorPerms] = useState<VendorPermission[]>([]);
  const [vendorAssetIds, setVendorAssetIds] = useState<string[]>([]);
  const [vendorCompIds, setVendorCompIds] = useState<string[]>([]);
  const [permLoading, setPermLoading] = useState(false);
  const [permSaving, setPermSaving] = useState(false);
  const [permSaved, setPermSaved] = useState(false);

  const loadVendorData = useCallback(async (vid: string) => {
    setPermLoading(true);
    setPermSaved(false);
    try {
      const [perms, aIds, cIds] = await Promise.all([
        fetchVendorPermissions(vid),
        fetchVendorAssignedAssetIds(vid),
        fetchVendorAssignedCompradorIds(vid),
      ]);
      setVendorPerms(perms);
      setVendorAssetIds(aIds);
      setVendorCompIds(cIds);
    } catch { /* keep defaults */ }
    setPermLoading(false);
  }, []);

  useEffect(() => {
    if (selectedVendor) loadVendorData(selectedVendor);
  }, [selectedVendor, loadVendorData]);

  const handleTogglePerm = (section: SectionId, field: "canView" | "canEdit") => {
    setVendorPerms((prev) =>
      prev.map((p) => {
        if (p.section !== section) return p;
        const updated = { ...p, [field]: !p[field] };
        if (field === "canView" && !updated.canView) updated.canEdit = false;
        if (field === "canEdit" && updated.canEdit) updated.canView = true;
        return updated;
      }),
    );
    setPermSaved(false);
  };

  const handleSavePerms = async () => {
    if (!selectedVendor) return;
    setPermSaving(true);
    try {
      await upsertVendorPermissions(selectedVendor, vendorPerms);
      setPermSaved(true);
      setTimeout(() => setPermSaved(false), 2000);
    } catch { /* toast error */ }
    setPermSaving(false);
  };

  const handleToggleAsset = async (assetId: string) => {
    if (!selectedVendor) return;
    if (vendorAssetIds.includes(assetId)) {
      await unassignAssetFromVendor(selectedVendor, assetId);
      setVendorAssetIds((prev) => prev.filter((id) => id !== assetId));
    } else {
      await assignAssetToVendor(selectedVendor, assetId);
      setVendorAssetIds((prev) => [...prev, assetId]);
    }
  };

  const handleToggleComp = async (compId: string) => {
    if (!selectedVendor) return;
    if (vendorCompIds.includes(compId)) {
      await unassignCompradorFromVendor(selectedVendor, compId);
      setVendorCompIds((prev) => prev.filter((id) => id !== compId));
    } else {
      await assignCompradorToVendor(selectedVendor, compId);
      setVendorCompIds((prev) => [...prev, compId]);
    }
  };

  const permSectionRef = useRef<HTMLDivElement>(null);

  const handleEditVendor = (vendorId: string) => {
    setSelectedVendor(vendorId);
    setTimeout(() => {
      permSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  const selectedV = vendedores.find((v) => v.id === selectedVendor);

  return (
    <>
      <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-white px-6">
        <h1 className="text-lg font-semibold text-navy">Configuración</h1>
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-gold/10 px-2.5 py-1 text-xs font-medium text-gold">Admin</span>
          <button className="flex items-center gap-1.5 rounded-lg bg-navy px-3.5 py-2 text-xs font-medium text-white hover:bg-navy3"><Save size={14} /> Guardar todo</button>
        </div>
      </div>

      <div className="p-5">
        <p className="mb-4 text-xs text-muted">Ajustes generales del CRM y portal público</p>

        <div className="flex flex-col gap-4">
          <GeoapifyDiagnostics />
          <SettingsSection title="General" items={general} onToggle={(i) => toggle(general, setGeneral, i)} />
          <SettingsSection title="NDA y Privacidad" items={nda} onToggle={(i) => toggle(nda, setNda, i)} />
          <SettingsSection title="Portal Público" items={pubConf} onToggle={(i) => toggle(pubConf, setPubConf, i)} />

          {/* Vendor Permissions Section */}
          <div ref={permSectionRef} className="rounded-lg border border-border bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[1.5px] text-gold after:h-px after:flex-1 after:bg-border">
              <Shield size={14} /> Permisos de Vendedores
            </div>

            <div className="mb-4 flex flex-wrap gap-2">
              {vendedores.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setSelectedVendor(v.id === selectedVendor ? null : v.id)}
                  className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-all ${
                    v.id === selectedVendor
                      ? "border-gold bg-gold/10 text-navy"
                      : "border-border bg-cream2 text-text hover:border-navy/30"
                  }`}
                >
                  <div
                    className="flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-bold text-white"
                    style={{ background: `linear-gradient(135deg,${v.col})` }}
                  >
                    {v.ini}
                  </div>
                  {v.nombre}
                </button>
              ))}
            </div>

            {selectedVendor && permLoading && (
              <div className="flex items-center justify-center gap-2 py-8 text-muted">
                <Loader2 size={20} className="animate-spin" /> Cargando permisos…
              </div>
            )}

            {selectedVendor && !permLoading && selectedV && (
              <div className="space-y-4">
                {/* Permissions matrix */}
                <div className="rounded-md border border-border">
                  <div className="flex items-center justify-between border-b border-border bg-cream2 px-4 py-2">
                    <span className="text-xs font-semibold text-navy">Secciones de {selectedV.nombre}</span>
                    <div className="flex gap-8 text-[10px] font-semibold uppercase tracking-wider text-muted">
                      <span className="w-12 text-center">Ver</span>
                      <span className="w-12 text-center">Editar</span>
                    </div>
                  </div>
                  {ADMIN_SECTIONS.map((s) => {
                    const perm = vendorPerms.find((p) => p.section === s.id);
                    return (
                      <div key={s.id} className="flex items-center justify-between border-b border-border px-4 py-2.5 last:border-b-0">
                        <span className="text-sm text-text">{s.label}</span>
                        <div className="flex gap-8">
                          <div className="flex w-12 justify-center">
                            <PermToggle checked={perm?.canView ?? false} onChange={() => handleTogglePerm(s.id, "canView")} />
                          </div>
                          <div className="flex w-12 justify-center">
                            <PermToggle checked={perm?.canEdit ?? false} onChange={() => handleTogglePerm(s.id, "canEdit")} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <button
                  onClick={handleSavePerms}
                  disabled={permSaving}
                  className="flex items-center gap-1.5 rounded-lg bg-gold px-4 py-2 text-xs font-medium text-white hover:bg-gold2 disabled:opacity-50"
                >
                  {permSaving ? <Loader2 size={14} className="animate-spin" /> : permSaved ? <CheckCircle size={14} /> : <Save size={14} />}
                  {permSaved ? "Guardado" : "Guardar permisos"}
                </button>

                {/* Assigned assets */}
                <div>
                  <div className="mb-2 text-xs font-semibold text-navy">Activos asignados ({vendorAssetIds.length})</div>
                  <div className="max-h-48 overflow-y-auto rounded-md border border-border">
                    {assets.length === 0 && <p className="p-3 text-xs text-muted">No hay activos</p>}
                    {assets.slice(0, 50).map((a) => (
                      <label key={a.id} className="flex cursor-pointer items-center gap-2 border-b border-border px-3 py-2 last:border-b-0 hover:bg-cream2">
                        <input
                          type="checkbox"
                          checked={vendorAssetIds.includes(a.id)}
                          onChange={() => handleToggleAsset(a.id)}
                          className="accent-gold"
                        />
                        <span className="flex-1 truncate text-xs text-text">
                          <span className="font-medium">{a.id}</span> · {a.prov} · {a.addr !== "—" ? a.addr : a.pob}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Assigned compradores */}
                <div>
                  <div className="mb-2 text-xs font-semibold text-navy">Compradores asignados ({vendorCompIds.length})</div>
                  <div className="max-h-48 overflow-y-auto rounded-md border border-border">
                    {compradores.length === 0 && <p className="p-3 text-xs text-muted">No hay compradores</p>}
                    {compradores.map((c) => (
                      <label key={c.id} className="flex cursor-pointer items-center gap-2 border-b border-border px-3 py-2 last:border-b-0 hover:bg-cream2">
                        <input
                          type="checkbox"
                          checked={vendorCompIds.includes(c.id)}
                          onChange={() => handleToggleComp(c.id)}
                          className="accent-gold"
                        />
                        <span className="flex-1 truncate text-xs text-text">
                          <span className="font-medium">{nombreVisible(c)}</span> · {c.email}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[1.5px] text-gold after:h-px after:flex-1 after:bg-border">Carteras Activas</div>
            <div className="flex flex-wrap gap-2">
              {["ALOE", "OMEGA", "HERCULES", "ROCK"].map(c => (
                <div key={c} className="flex items-center gap-2 rounded-md border border-border bg-cream2 px-3.5 py-2">
                  <span className="text-sm font-semibold text-navy">{c}</span>
                  <span className="rounded bg-green/8 px-1.5 py-0.5 text-[10px] font-semibold text-green">Activa</span>
                </div>
              ))}
              <button className="flex items-center gap-1 rounded-md border-2 border-dashed border-border px-3.5 py-2 text-xs font-medium text-muted hover:border-navy/30 hover:text-navy"><Plus size={12} /> Añadir cartera</button>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[1.5px] text-gold after:h-px after:flex-1 after:bg-border">Equipo / Agentes</div>
            <div className="flex flex-col gap-2">
              {/* Admin fijo */}
              <div className="flex items-center gap-3 rounded-md border border-border bg-cream2 p-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: "linear-gradient(135deg,#b8933a,#0d1b2a)" }}>AD</div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-navy">Administrador</div>
                  <div className="text-[11px] text-muted">Admin — Acceso completo</div>
                </div>
                <span className="rounded bg-gold/10 px-2 py-0.5 text-[10px] font-semibold text-gold">Admin</span>
              </div>

              {/* Vendedores dinámicos */}
              {vendedores.map((v) => (
                <div key={v.id} className="flex items-center gap-3 rounded-md border border-border bg-cream2 p-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: `linear-gradient(135deg,${v.col})` }}>{v.ini}</div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-navy">{v.nombre}</div>
                    <div className="text-[11px] text-muted">Vendedor · {v.email || "Sin email"}</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleEditVendor(v.id)}
                      className="flex items-center gap-1 rounded-md border border-gold/30 bg-gold/5 px-2.5 py-1 text-xs font-medium text-gold hover:bg-gold/10"
                    >
                      <UserCog size={11} /> Permisos
                    </button>
                    <Link
                      href={`/admin/agentes/${v.id}`}
                      className="flex items-center gap-1 rounded-md border border-border bg-white px-2.5 py-1 text-xs text-muted hover:text-navy"
                    >
                      <Pencil size={11} /> Detalle
                    </Link>
                  </div>
                </div>
              ))}

              {vendedores.length === 0 && (
                <p className="py-3 text-center text-xs text-muted">No hay vendedores registrados. Crea uno desde la sección Vendedores.</p>
              )}

              <Link
                href="/admin/agentes"
                className="flex items-center justify-center gap-1.5 rounded-md border-2 border-dashed border-border p-3 text-xs font-medium text-muted hover:border-navy/30 hover:text-navy"
              >
                <Plus size={13} /> Gestionar agentes
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function SettingsSection({ title, items, onToggle }: { title: string; items: ToggleItem[]; onToggle: (i: number) => void }) {
  return (
    <div className="rounded-lg border border-border bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[1.5px] text-gold after:h-px after:flex-1 after:bg-border">{title}</div>
      <div className="flex flex-col gap-2.5">
        {items.map((item, i) => (
          <div key={i} className="flex items-center justify-between rounded-md border border-border bg-cream2 p-3">
            <div>
              <div className="text-sm font-medium text-navy">{item.label}</div>
              <div className="text-xs text-muted">{item.desc}</div>
            </div>
            <div
              className={`relative h-5 w-10 cursor-pointer rounded-full transition-colors ${item.enabled ? "bg-green" : "bg-border"}`}
              onClick={() => onToggle(i)}
            >
              <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${item.enabled ? "left-[22px]" : "left-0.5"}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PermToggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <div
      className={`relative h-5 w-10 cursor-pointer rounded-full transition-colors ${checked ? "bg-gold" : "bg-border"}`}
      onClick={onChange}
    >
      <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
    </div>
  );
}
