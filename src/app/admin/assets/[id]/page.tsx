"use client";

import { use, useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useApp } from "@/lib/context";
import { isAdmin } from "@/lib/auth-helpers";
import Link from "next/link";
import type { Asset } from "@/lib/types";
import { publicationListLabel } from "@/lib/asset-publication";
import { Home, FolderOpen, Briefcase, Users, Lock, ArrowLeft, Upload, Download, FileText, FileSpreadsheet, Image, MessageSquare, Save, Plus, Mail, X, Loader2, AlertCircle, CheckCircle2, CheckCircle, Building, ExternalLink, RefreshCw, UserCog, Send, Link2 } from "lucide-react";
import { uploadDocumento, fetchDocumentos, deleteDocumento, getDocumentUrl, type DocRow } from "@/app/actions/documentos";
import { createNota, deleteNota, fetchNotas, type NotaRow } from "@/app/actions/notas";
import { AssetNoteCard } from "@/components/AssetNoteCard";
import { fetchCompradores } from "@/app/actions/compradores";
import { fetchAssetByIdForAdmin, fetchAssetsByActivoIdForAdmin, toggleAssetPub, updateAssetFields, updatePropiedadFields } from "@/app/actions/assets";
import { inviteCompradorToAsset, revokeCompradorFromAsset, fetchInvitedCompradores } from "@/app/actions/invitations";
import { enviarSolicitudInformacion } from "@/app/actions/email-info-request";
import { createOfertaAdmin } from "@/app/actions/ofertas";
import { refreshAssetCatastro } from "@/app/actions/catastro";
import { getAssetAgente, setAssetAgente } from "@/app/actions/vendedores";
import type { Comprador } from "@/lib/types";
import { InteractiveMap } from "@/components/InteractiveMap";
import { EditableSection, type FieldDef } from "@/components/EditableSection";
import { SituacionField } from "@/components/SituacionField";
import { EditableExcelRawSection } from "@/components/EditableExcelRawSection";
import { listEmptyExcelFields } from "@/lib/excel-raw-utils";
import { FASE_INTERNA_OPTIONS, faseToCode } from "@/lib/fase-interna";
import {
  getDescriptionText, getCategoria, getFaseInterna, getPropietario, getOwnerTel,
  getOwnerMail, getDeudaTotal, fmt, parseLocaleMoneyInput,
} from "@/lib/utils";
import { toast } from "@/lib/toast";

const tabs = [
  { icon: Home,       label: "Características", adminOnly: false, contentIndex: 0 },
  { icon: FolderOpen, label: "Documentación",   adminOnly: false, contentIndex: 1 },
  { icon: Briefcase,  label: "Agentes",         adminOnly: true,  contentIndex: 2 },
  { icon: Users,      label: "Clientes",        adminOnly: true,  contentIndex: 3 },
  { icon: Lock,       label: "Administrador",   adminOnly: true,  contentIndex: 4 },
];

export default function AssetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { getAsset, togglePub, session } = useApp();
  const userIsAdmin = isAdmin(session);
  const visibleTabs = useMemo(
    () => tabs.filter((t) => userIsAdmin || !t.adminOnly),
    [userIsAdmin],
  );
  const ctxAsset = getAsset(id);
  const [remoteAsset, setRemoteAsset] = useState<Asset | null | undefined>(undefined);
  const [tab, setTab] = useState(0);
  const [docSubTab, setDocSubTab] = useState(0);
  const [currentUser, setCurrentUser] = useState<{ nombre: string; email: string } | null>(null);

  const loadRemote = useCallback(() => {
    fetchAssetByIdForAdmin(id)
      .then((a) => setRemoteAsset(a))
      .catch(() => setRemoteAsset(null));
  }, [id]);

  useEffect(() => {
    setRemoteAsset(undefined);
    loadRemote();
  }, [id, loadRemote]);

  useEffect(() => {
    const onMerged = () => {
      setRemoteAsset(undefined);
      loadRemote();
    };
    window.addEventListener("propcrm-assets-updated", onMerged);
    return () => window.removeEventListener("propcrm-assets-updated", onMerged);
  }, [loadRemote]);

  useEffect(() => {
    if (session?.nombre && session?.email) {
      setCurrentUser({ nombre: session.nombre, email: session.email });
      return;
    }
    const cookie = document.cookie.split("; ").find(c => c.startsWith("dev-auth="));
    if (cookie) {
      try {
        const data = JSON.parse(decodeURIComponent(cookie.split("=")[1]));
        if (data.nombre && data.email) {
          setCurrentUser({ nombre: data.nombre, email: data.email });
          return;
        }
      } catch {
        /* ignore parse error */
      }
    }
    setCurrentUser({ nombre: session?.nombre || "Usuario", email: session?.email || "" });
  }, [session]);

  useEffect(() => {
    if (!userIsAdmin && tab > 1) setTab(0);
  }, [userIsAdmin, tab]);

  const asset = remoteAsset ?? ctxAsset ?? null;

  const [toggling, setToggling] = useState(false);
  const handleTogglePub = async () => {
    if (!asset || toggling) return;
    setToggling(true);
    try {
      await toggleAssetPub(asset.id);
      togglePub(asset.id);
      loadRemote();
    } catch (err) {
      toast.error("Error al cambiar el estado del activo", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setToggling(false);
    }
  };

  if (!asset) return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted">
      <Building size={40} strokeWidth={1} className="text-border" />
      <p className="text-base font-medium">Activo no encontrado</p>
      <Link href="/admin" className="text-sm text-gold hover:underline">Volver</Link>
    </div>
  );

  const publication = publicationListLabel(asset);

  return (
    <>
      {/* Topbar */}
      <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-white px-6">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-navy">{asset.pob}, {asset.prov}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={asset?.publicSlug ? `/portal/inmueble/${encodeURIComponent(asset.publicSlug)}` : `/portal/${encodeURIComponent(id)}`}
            target="_blank"
            className="flex items-center gap-1.5 rounded-lg border border-gold/30 bg-gold/5 px-3.5 py-2 text-xs font-medium text-gold transition-colors hover:bg-gold/10"
          >
            <ExternalLink size={13} /> Ver en portal
          </Link>
          <span className="rounded-md bg-gold/10 px-2.5 py-1 text-xs font-medium text-gold">{userIsAdmin ? "Admin" : "Agente"}</span>
          <Link href="/admin" className="flex items-center gap-1.5 rounded-lg border border-border bg-white px-3.5 py-2 text-xs font-medium text-navy transition-colors hover:bg-cream">
            <ArrowLeft size={14} /> Volver
          </Link>
        </div>
      </div>

      {/* Sub-bar */}
      <div className="flex h-11 items-center gap-3 border-b border-border bg-white px-5">
        {getCategoria(asset) !== "—" && <span className="rounded-md bg-gold/10 px-2 py-0.5 text-[10px] font-semibold text-gold">{getCategoria(asset)}</span>}
        <span className="flex-1 truncate text-sm text-navy">{asset.addr}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            role="switch"
            aria-checked={asset.pub}
            aria-label={asset.pub ? "Despublicar activo" : "Publicar activo"}
            disabled={toggling}
            className={`relative h-5 w-10 rounded-full transition-colors ${toggling ? "opacity-50 cursor-wait" : "cursor-pointer"} ${asset.pub ? "bg-green" : "bg-navy3"}`}
            onClick={() => void handleTogglePub()}
          >
            <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${asset.pub ? "left-[22px]" : "left-0.5"}`} />
          </button>
          <span className={`text-xs font-semibold ${asset.pub ? "text-green" : "text-red"}`}>
            {toggling ? "Actualizando..." : asset.pub ? "Publicado" : "Suspendido"}
          </span>
          <span className="text-[11px] text-muted" title={publication.title}>
            Publicación: {publication.text}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden" style={{ height: "calc(100vh - 102px)" }}>
        {/* Left nav */}
        <div className="flex w-44 min-w-[176px] flex-col bg-navy py-3">
          {visibleTabs.map((t, i) => {
            const Icon = t.icon;
            const isLast = i === visibleTabs.length - 1;
            const isAdminBtn = t.adminOnly && t.contentIndex === 4;
            return (
              <button
                key={t.contentIndex}
                onClick={() => setTab(t.contentIndex)}
                className={`flex items-center gap-2.5 border-l-[3px] px-4 py-2.5 text-left transition-all ${
                  tab === t.contentIndex ? "border-l-gold bg-white/[0.06] text-gold" : "border-l-transparent text-white/35 hover:bg-white/[0.03] hover:text-white/60"
                } ${isAdminBtn && isLast ? "mt-auto border-t border-t-white/[0.06] pt-3" : ""}`}
              >
                <Icon size={15} strokeWidth={1.5} />
                <span className="text-xs font-medium">{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-cream p-6">
          {tab === 0 && <TabCaracteristicas asset={asset} assetId={id} currentUser={currentUser} reloadAsset={loadRemote} canDeleteNotes={userIsAdmin} />}
          {tab === 1 && <TabDocumentacion assetId={id} docSubTab={docSubTab} setDocSubTab={setDocSubTab} currentUser={currentUser} canDeleteNotes={userIsAdmin} />}
          {tab === 2 && userIsAdmin && <TabAgentes asset={asset} assetId={id} currentUser={currentUser} canDeleteNotes={userIsAdmin} />}
          {tab === 3 && userIsAdmin && <TabClientes assetId={id} />}
          {tab === 4 && userIsAdmin && <TabAdmin asset={asset} assetId={id} togglePub={() => void handleTogglePub()} currentUser={currentUser} reloadAsset={loadRemote} canDeleteNotes={userIsAdmin} />}
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

function ExcelEmptyFieldsBanner({ excelRaw }: { excelRaw: Record<string, Record<string, string>> }) {
  const empty = listEmptyExcelFields(excelRaw);
  if (empty.length === 0) return null;
  const max = 14;
  const parts = empty.slice(0, max).map((e) => `${e.sheet}: ${e.header}`);
  const more = empty.length - max;
  return (
    <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2 text-[11px] leading-snug text-amber-950">
      <span className="font-semibold">Celdas sin dato en el Excel ({empty.length}): </span>
      <span className="text-amber-900/90">
        {parts.join("; ")}
        {more > 0 ? ` … y ${more} más` : ""}
      </span>
    </div>
  );
}

function DataPill({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md bg-cream2 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</div>
      <div className={`text-sm leading-snug ${mono ? "font-mono text-xs text-muted" : "text-text"}`}>{value}</div>
    </div>
  );
}

async function deleteAssetNote(noteId: string, reload: () => Promise<void>): Promise<void> {
  try {
    await deleteNota(noteId);
    await reload();
    toast.success("Nota eliminada");
  } catch (err) {
    toast.error("Error al eliminar la nota", {
      description: err instanceof Error ? err.message : String(err),
    });
  }
}

function DocItemRow({ doc, onDelete }: { doc: DocRow; onDelete?: () => void }) {
  const [downloading, setDownloading] = useState(false);
  const icons: Record<string, typeof FileText> = { pdf: FileText, xls: FileSpreadsheet, img: Image, zip: FileText, other: FileText };
  const colors: Record<string, string> = { pdf: "text-red", xls: "text-green", img: "text-blue", zip: "text-orange", other: "text-muted" };
  const Icon = icons[doc.icon_type] || FileText;
  const color = colors[doc.icon_type] || "text-muted";

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const url = await getDocumentUrl(doc.storage_path);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      toast.error("Error al descargar el documento", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-white p-3">
      <div className={`flex h-9 w-9 items-center justify-center rounded-md bg-cream2 ${color}`}><Icon size={16} /></div>
      <div className="flex-1">
        <div className="text-sm font-medium text-navy">{doc.name}</div>
        <div className="text-[11px] text-muted">{doc.uploaded_by} · {formatSize(doc.size_bytes)} · {formatDate(doc.created_at)}</div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-navy hover:bg-cream disabled:opacity-50"
        >
          {downloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} Descargar
        </button>
        {onDelete && (
          <button
            onClick={onDelete}
            className="flex items-center gap-1 rounded-md border border-red/20 px-2.5 py-1.5 text-xs font-medium text-red hover:bg-red/5"
          >
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

function TabCaracteristicas({ asset, assetId, currentUser, reloadAsset, canDeleteNotes }: { asset: Asset; assetId: string; currentUser: { nombre: string; email: string } | null; reloadAsset: () => void; canDeleteNotes: boolean }) {
  const { compradores, session } = useApp();
  const isAgente = session?.role === "vendedor";
  const canEditSituacion = isAdmin(session);
  const [generalNote, setGeneralNote] = useState("");
  const [assetNotesList, setAssetNotesList] = useState<NotaRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [descDraft, setDescDraft] = useState(asset.desc && asset.desc !== "—" ? asset.desc : "");
  const [savingDesc, setSavingDesc] = useState(false);
  const [catastroRefreshing, setCatastroRefreshing] = useState(false);
  const [catastroMsg, setCatastroMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showConsultarModal, setShowConsultarModal] = useState(false);
  const [consultarMsg, setConsultarMsg] = useState("");
  const [consultarStatus, setConsultarStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [consultarError, setConsultarError] = useState("");
  const [showOfertaModal, setShowOfertaModal] = useState(false);
  const [ofertaCompradorId, setOfertaCompradorId] = useState("");
  const [ofertaImporte, setOfertaImporte] = useState("");
  const [ofertaComentarios, setOfertaComentarios] = useState("");
  const [ofertaStatus, setOfertaStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [ofertaError, setOfertaError] = useState("");
  const [siblingAssets, setSiblingAssets] = useState<Asset[]>([]);
  const [loadingSiblings, setLoadingSiblings] = useState(false);

  useEffect(() => {
    setDescDraft(asset.desc && asset.desc !== "—" ? asset.desc : "");
  }, [asset.desc, assetId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const notes = await fetchNotas({ assetId });
        if (!cancelled) setAssetNotesList(notes);
      } catch {
        if (!cancelled) setAssetNotesList([]);
      }
    })();
    return () => { cancelled = true; };
  }, [assetId]);

  // Fetch sibling assets (same activoId / operación)
  useEffect(() => {
    const activoId = asset.propiedades[0]?.activoId;
    if (!activoId || activoId === "—") {
      setSiblingAssets([]);
      return;
    }
    let cancelled = false;
    setLoadingSiblings(true);
    fetchAssetsByActivoIdForAdmin(activoId, assetId)
      .then((siblings) => {
        if (!cancelled) setSiblingAssets(siblings);
      })
      .catch(() => {
        if (!cancelled) setSiblingAssets([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingSiblings(false);
      });
    return () => { cancelled = true; };
  }, [asset.propiedades, assetId]);

  // La columna `referencia` guarda la RC limpia; el id es compuesto (id1__ref).
  const hasCatRef = !!asset.referencia && asset.referencia !== "—";

  const precioFields: FieldDef[] = useMemo(
    () => [
      {
        label: "Precio estimado (€)",
        dbCol: "precio",
        value: asset.precio != null ? String(asset.precio) : "—",
        numeric: true,
      },
    ],
    [asset.precio],
  );

  const handleRefreshCatastro = async (force?: boolean) => {
    setCatastroRefreshing(true);
    setCatastroMsg(null);
    try {
      const result = await refreshAssetCatastro(assetId, { forceOverwrite: force });
      if (result.success) {
        setCatastroMsg({ ok: true, text: `Actualizado: ${result.updatedFields?.length ?? 0} campos enriquecidos` });
        reloadAsset();
      } else {
        setCatastroMsg({ ok: false, text: result.error ?? "Error desconocido" });
      }
    } catch (err) {
      setCatastroMsg({ ok: false, text: err instanceof Error ? err.message : "Error de conexión" });
    } finally {
      setCatastroRefreshing(false);
    }
  };

  const handleOpenConsultar = () => {
    setConsultarMsg(`Consulta interna admin sobre el activo ${assetId}`);
    setConsultarStatus("idle");
    setConsultarError("");
    setShowConsultarModal(true);
  };

  const handleOpenOferta = () => {
    setOfertaCompradorId("");
    setOfertaImporte("");
    setOfertaComentarios("");
    setOfertaStatus("idle");
    setOfertaError("");
    setShowOfertaModal(true);
  };

  const handleSendOferta = async () => {
    if (!isAgente && !ofertaCompradorId) {
      setOfertaStatus("error");
      setOfertaError("Selecciona un comprador");
      return;
    }
    const importe = parseLocaleMoneyInput(ofertaImporte);
    if (importe == null || importe <= 0) {
      setOfertaStatus("error");
      setOfertaError("Indica un importe válido mayor que 0");
      return;
    }
    setOfertaStatus("sending");
    setOfertaError("");
    try {
      await createOfertaAdmin({
        ...(isAgente ? {} : { compradorId: ofertaCompradorId }),
        assetId,
        propuestaEuros: importe,
        comentarios: ofertaComentarios.trim() || undefined,
      });
      setOfertaStatus("success");
      toast.success("Oferta registrada", {
        description: isAgente ? "Asignada a tu usuario · pendiente" : "Estado: pendiente",
      });
    } catch (err) {
      setOfertaStatus("error");
      setOfertaError(err instanceof Error ? err.message : "No se pudo registrar la oferta");
    }
  };

  const handleSendConsultar = async () => {
    if (!currentUser?.email) {
      setConsultarStatus("error");
      setConsultarError("Sesión no disponible");
      return;
    }
    if (!consultarMsg.trim()) {
      setConsultarStatus("error");
      setConsultarError("Escribe un mensaje antes de enviar");
      return;
    }
    setConsultarStatus("sending");
    setConsultarError("");
    try {
      const result = await enviarSolicitudInformacion({
        assetId,
        nombre: currentUser.nombre,
        email: currentUser.email,
        mensaje: consultarMsg.trim(),
      });
      if (result.error) {
        setConsultarStatus("error");
        setConsultarError(result.error);
      } else {
        setConsultarStatus("success");
        toast.success("Consulta enviada");
      }
    } catch (err) {
      setConsultarStatus("error");
      setConsultarError(err instanceof Error ? err.message : "No se pudo enviar la consulta");
    }
  };

  const catastroFields: FieldDef[] = [
    { label: "Referencia", dbCol: "referencia", value: asset.referencia, mono: true },
    { label: "Clase", dbCol: "clase", value: asset.clase },
    { label: "Uso", dbCol: "uso", value: asset.uso },
    { label: "Bien", dbCol: "bien", value: asset.bien },
    { label: "Sup. Construida", dbCol: "sup_c", value: asset.supC },
    { label: "Sup. Gráfica", dbCol: "sup_g", value: asset.supG },
    { label: "Antigüedad", dbCol: "age", value: asset.age || "—" },
    { label: "Coef. Part.", dbCol: "coef", value: asset.coef },
  ];

  const locFields: FieldDef[] = [
    { label: "Tipo de Vía", dbCol: "tvia", value: asset.tvia },
    { label: "Nombre de Vía", dbCol: "nvia", value: asset.nvia },
    { label: "Número", dbCol: "num", value: asset.num },
    { label: "Escalera", dbCol: "esc", value: asset.esc },
    { label: "Planta", dbCol: "pla", value: asset.pla },
    { label: "Puerta", dbCol: "pta", value: asset.pta },
    { label: "Municipio", dbCol: "pob", value: asset.pob },
    { label: "Provincia", dbCol: "prov", value: asset.prov },
    { label: "C.P.", dbCol: "cp", value: asset.cp },
    { label: "CCAA", dbCol: "ccaa", value: asset.ccaa },
    { label: "Dirección Completa", dbCol: "full_addr", value: asset.fullAddr, colSpan: 4 },
  ];

  return (
    <>
      <div className="mb-4 grid grid-cols-[1fr_260px] gap-4">
        <div className="flex flex-col gap-3">
          <EditableSection title="Datos Catastrales" assetId={assetId} fields={catastroFields} cols={4} onSaved={reloadAsset} />
          <EditableSection title="Localización" assetId={assetId} fields={locFields} cols={4} onSaved={reloadAsset} />
          {(siblingAssets.length > 0 || loadingSiblings) && (
            <div className="rounded-lg border border-border bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[1.5px] text-gold after:h-px after:flex-1 after:bg-border">
                <Link2 size={13} /> Misma operación
              </div>
              {loadingSiblings ? (
                <div className="flex items-center gap-2 text-xs text-muted">
                  <Loader2 size={14} className="animate-spin" /> Buscando activos relacionados…
                </div>
              ) : (
                <>
                  <p className="mb-2 text-xs text-muted">
                    Otros activos con el mismo ID de operación ({asset.propiedades[0]?.activoId}):
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {siblingAssets.map((s) => (
                      <Link
                        key={s.id}
                        href={`/admin/assets/${encodeURIComponent(s.id)}`}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-cream px-2.5 py-1.5 text-xs font-medium text-navy hover:border-gold/40 hover:bg-gold/5"
                      >
                        <Building size={12} />
                        {s.pob}, {s.prov}
                        <span className="text-[10px] text-muted">({s.tip})</span>
                      </Link>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-3">
          <InteractiveMap
            key={`map-${asset.id}-${asset.lat ?? "x"}-${asset.lng ?? "x"}`}
            lat={asset.lat}
            lng={asset.lng}
            mapImageUrl={asset.map}
            className="h-[260px] w-[260px] rounded-lg border border-border"
            label={asset.pob && asset.pob !== "—" ? asset.pob : undefined}
          />
          {hasCatRef && (
            <div className="flex flex-col gap-1.5">
              <div className="flex gap-1.5">
                <button
                  onClick={() => handleRefreshCatastro(false)}
                  disabled={catastroRefreshing}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-white py-2 text-xs font-medium text-navy transition-colors hover:bg-cream disabled:opacity-50"
                >
                  {catastroRefreshing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                  Actualizar Catastro
                </button>
                <button
                  onClick={() => handleRefreshCatastro(true)}
                  disabled={catastroRefreshing}
                  title="Sobrescribir todos los campos con datos frescos del Catastro"
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-gold/30 bg-gold/5 px-3 py-2 text-xs font-medium text-gold transition-colors hover:bg-gold/10 disabled:opacity-50"
                >
                  <RefreshCw size={13} /> Forzar
                </button>
              </div>
              {catastroMsg && (
                <div className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] ${catastroMsg.ok ? "bg-green/10 text-green" : "bg-red/10 text-red"}`}>
                  {catastroMsg.ok ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                  {catastroMsg.text}
                </div>
              )}
            </div>
          )}
          <div className="flex flex-col gap-2">
            <EditableSection title="Precio" assetId={assetId} fields={precioFields} cols={1} onSaved={reloadAsset} />
            <SituacionField asset={asset} canEdit={canEditSituacion} onSaved={reloadAsset} />
            {(getDeudaTotal(asset) != null || asset.propiedades[0]?.proceso) && (
              <div className="rounded-lg border border-border bg-cream2 px-3 py-2 text-xs text-text">
                {getDeudaTotal(asset) != null && (
                  <p><span className="font-semibold text-muted">Deuda: </span>{fmt(getDeudaTotal(asset)!)}</p>
                )}
                {asset.propiedades[0]?.proceso && (
                  <p className="mt-0.5"><span className="font-semibold text-muted">Proceso: </span>{asset.propiedades[0].proceso}</p>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleOpenConsultar}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-border py-2.5 text-xs font-medium text-navy hover:bg-cream"
              >
                <MessageSquare size={13} /> Consultar
              </button>
              <button
                type="button"
                onClick={handleOpenOferta}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-gold py-2.5 text-xs font-medium text-white hover:bg-gold2"
              >
                <FileText size={13} /> Oferta
              </button>
            </div>
            <Link
              href={`/admin/ofertas?asset=${encodeURIComponent(assetId)}`}
              className="block text-center text-[11px] font-medium text-navy underline-offset-2 hover:underline"
            >
              Ver ofertas de este activo
            </Link>
          </div>
        </div>
      </div>
      {showOfertaModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          onClick={() => ofertaStatus !== "sending" && setShowOfertaModal(false)}
        >
          <div className="w-full max-w-md rounded-xl border border-border bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h3 className="text-base font-semibold text-navy">Registrar oferta</h3>
              <button
                type="button"
                onClick={() => ofertaStatus !== "sending" && setShowOfertaModal(false)}
                disabled={ofertaStatus === "sending"}
                className="rounded-lg p-1.5 text-muted hover:bg-cream hover:text-navy disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-5">
              {ofertaStatus === "success" ? (
                <div className="flex flex-col items-center gap-3 py-4 text-center">
                  <CheckCircle2 size={32} className="text-green" />
                  <p className="text-sm font-medium text-navy">Oferta registrada correctamente</p>
                  <p className="text-xs text-muted">Queda en estado pendiente.</p>
                  <div className="mt-2 flex flex-wrap justify-center gap-2">
                    <Link
                      href={`/admin/ofertas?asset=${encodeURIComponent(assetId)}`}
                      className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-navy hover:bg-cream"
                    >
                      Ver ofertas de este activo
                    </Link>
                    <button
                      type="button"
                      onClick={() => setShowOfertaModal(false)}
                      className="rounded-lg bg-navy px-4 py-2 text-xs font-medium text-white hover:bg-navy3"
                    >
                      Cerrar
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {isAgente ? (
                    <p className="mb-3 rounded-md border border-border bg-cream2 px-3 py-2 text-sm text-navy">
                      Oferta a nombre de: <span className="font-semibold">{session?.nombre ?? "Agente"}</span>
                    </p>
                  ) : (
                    <>
                      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted">Comprador</label>
                      <select
                        value={ofertaCompradorId}
                        onChange={(e) => setOfertaCompradorId(e.target.value)}
                        disabled={ofertaStatus === "sending"}
                        className="mb-3 w-full rounded-md border border-border bg-cream2 px-3 py-2 text-sm text-text outline-none focus:border-navy disabled:opacity-50"
                      >
                        <option value="">Seleccionar comprador…</option>
                        {compradores.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nombre}{c.email ? ` · ${c.email}` : ""}
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                  <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted">Importe (€)</label>
                  <input
                    type="text"
                    value={ofertaImporte}
                    onChange={(e) => setOfertaImporte(e.target.value)}
                    disabled={ofertaStatus === "sending"}
                    placeholder="Ej. 125.000,00"
                    className="mb-3 w-full rounded-md border border-border bg-cream2 px-3 py-2 text-sm text-text outline-none focus:border-navy disabled:opacity-50"
                  />
                  <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted">Comentarios (opcional)</label>
                  <textarea
                    value={ofertaComentarios}
                    onChange={(e) => setOfertaComentarios(e.target.value)}
                    disabled={ofertaStatus === "sending"}
                    rows={3}
                    className="w-full rounded-md border border-border bg-cream2 p-3 text-sm text-text outline-none focus:border-navy disabled:opacity-50"
                    placeholder="Notas internas sobre la oferta…"
                  />
                  {ofertaStatus === "error" && ofertaError && (
                    <div className="mt-2 flex items-center gap-2 rounded-lg bg-red/10 px-3 py-2 text-xs text-red">
                      <AlertCircle size={14} /> {ofertaError}
                    </div>
                  )}
                  {!isAgente && compradores.length === 0 && (
                    <p className="mt-2 text-xs text-muted">No hay compradores cargados. Créalos en Admin → Compradores.</p>
                  )}
                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowOfertaModal(false)}
                      disabled={ofertaStatus === "sending"}
                      className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text hover:bg-cream disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSendOferta()}
                      disabled={
                        ofertaStatus === "sending"
                        || !ofertaImporte.trim()
                        || (!isAgente && !ofertaCompradorId)
                      }
                      className="flex items-center gap-1.5 rounded-md bg-gold px-3 py-1.5 text-xs font-medium text-white hover:bg-gold2 disabled:opacity-50"
                    >
                      {ofertaStatus === "sending" ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
                      {ofertaStatus === "sending" ? "Guardando…" : "Registrar oferta"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {showConsultarModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={() => consultarStatus !== "sending" && setShowConsultarModal(false)}>
          <div className="w-full max-w-md rounded-xl border border-border bg-white shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h3 className="text-base font-semibold text-navy">Enviar consulta</h3>
              <button
                type="button"
                onClick={() => consultarStatus !== "sending" && setShowConsultarModal(false)}
                disabled={consultarStatus === "sending"}
                className="rounded-lg p-1.5 text-muted hover:bg-cream hover:text-navy disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-5">
              {consultarStatus === "success" ? (
                <div className="flex flex-col items-center gap-3 py-4 text-center">
                  <CheckCircle2 size={32} className="text-green" />
                  <p className="text-sm font-medium text-navy">Consulta enviada correctamente</p>
                  <button
                    type="button"
                    onClick={() => setShowConsultarModal(false)}
                    className="mt-2 rounded-lg bg-navy px-4 py-2 text-xs font-medium text-white hover:bg-navy3"
                  >
                    Cerrar
                  </button>
                </div>
              ) : (
                <>
                  <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted">Mensaje</label>
                  <textarea
                    value={consultarMsg}
                    onChange={(e) => setConsultarMsg(e.target.value)}
                    disabled={consultarStatus === "sending"}
                    rows={5}
                    className="w-full rounded-md border border-border bg-cream2 p-3 text-sm text-text outline-none focus:border-navy disabled:opacity-50"
                    placeholder="Escribe tu consulta sobre este activo..."
                  />
                  {consultarStatus === "error" && consultarError && (
                    <div className="mt-2 flex items-center gap-2 rounded-lg bg-red/10 px-3 py-2 text-xs text-red">
                      <AlertCircle size={14} /> {consultarError}
                    </div>
                  )}
                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowConsultarModal(false)}
                      disabled={consultarStatus === "sending"}
                      className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text hover:bg-cream disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSendConsultar()}
                      disabled={consultarStatus === "sending" || !consultarMsg.trim()}
                      className="flex items-center gap-1.5 rounded-md bg-gold px-3 py-1.5 text-xs font-medium text-white hover:bg-gold2 disabled:opacity-50"
                    >
                      {consultarStatus === "sending" ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                      {consultarStatus === "sending" ? "Enviando..." : "Enviar"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      <SectionCard title="Descripción del Activo">
        <textarea
          value={descDraft}
          onChange={(e) => setDescDraft(e.target.value)}
          rows={4}
          className="w-full rounded-md border border-border bg-cream2 p-3 text-sm leading-[1.7] text-text outline-none focus:border-navy"
          placeholder={getDescriptionText(asset)}
        />
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            disabled={savingDesc}
            onClick={async () => {
              setSavingDesc(true);
              try {
                await updateAssetFields(assetId, { descr: descDraft.trim() || null });
                reloadAsset();
                toast.success("Descripción guardada");
              } catch (err) {
                toast.error("No se pudo guardar la descripción", {
                  description: err instanceof Error ? err.message : String(err),
                });
              } finally {
                setSavingDesc(false);
              }
            }}
            className="flex items-center gap-1.5 rounded-md bg-gold px-3 py-1.5 text-xs font-medium text-white hover:bg-gold2 disabled:opacity-50"
          >
            {savingDesc ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Guardar descripción
          </button>
        </div>
      </SectionCard>
      <div className="mt-3">
        <SectionCard title="Notas del activo">
          <p className="mb-2 text-[11px] text-muted">Notas visibles para agentes. Solo administración/agentes con permiso las añaden aquí.</p>
          {assetNotesList.length > 0 && (
            <div className="mb-3 flex flex-col gap-2">
              {assetNotesList.map((n) => (
                <AssetNoteCard
                  key={n.id}
                  note={n}
                  onDelete={canDeleteNotes ? (noteId) => deleteAssetNote(noteId, async () => {
                    setAssetNotesList(await fetchNotas({ assetId }));
                  }) : undefined}
                />
              ))}
            </div>
          )}
          <textarea
            value={generalNote}
            onChange={(e) => setGeneralNote(e.target.value)}
            className="w-full rounded-md border border-border bg-cream2 p-3 text-sm text-text outline-none focus:border-navy"
            rows={3}
            placeholder="Añade notas adicionales sobre el activo..."
          />
          <div className="mt-2 flex justify-end">
            <button
              onClick={async () => {
                if (!generalNote.trim() || !currentUser) return;
                setSaving(true);
                try {
                  await createNota({
                    assetId,
                    author: currentUser.nombre,
                    text: generalNote.trim(),
                  });
                  setGeneralNote("");
                  const notes = await fetchNotas({ assetId });
                  setAssetNotesList(notes);
                  toast.success("Nota guardada", { description: "La nota general fue añadida al activo." });
                } catch (err) {
                  toast.error("Error al guardar la nota", { description: err instanceof Error ? err.message : String(err) });
                } finally {
                  setSaving(false);
                }
              }}
              disabled={!generalNote.trim() || saving}
              className="flex items-center gap-1.5 rounded-md bg-gold px-3 py-1.5 text-xs font-medium text-white hover:bg-gold2 disabled:opacity-50"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Guardar
            </button>
          </div>
        </SectionCard>
      </div>
    </>
  );
}

function TabDocumentacion({ assetId, docSubTab, setDocSubTab, currentUser, canDeleteNotes }: { assetId: string; docSubTab: number; setDocSubTab: (n: number) => void; currentUser: { nombre: string; email: string } | null; canDeleteNotes: boolean }) {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [notes, setNotes] = useState<NotaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    loadData();
  }, [assetId, docSubTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (docSubTab === 0) {
        const fetched = await fetchDocumentos({ assetId });
        setDocs(fetched);
      } else {
        const fetched = await fetchNotas({ assetId });
        setNotes(fetched);
      }
    } catch (err) {
      console.error("Error cargando datos:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (file.size > 50 * 1024 * 1024) {
      setUploadError("El archivo excede el tamaño máximo de 50MB");
      return;
    }
    setUploading(true);
    setUploadError("");
    setUploadSuccess(false);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("asset_id", assetId);
      formData.append("uploaded_by", currentUser?.nombre || "Admin");
      await uploadDocumento(formData);
      setUploadSuccess(true);
      setTimeout(() => setUploadSuccess(false), 3000);
      await loadData();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Error al subir el archivo");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeleteDoc = async (docId: string) => {
    if (!confirm("¿Eliminar este documento?")) return;
    try {
      await deleteDocumento(docId);
      await loadData();
      toast.success("Documento eliminado");
    } catch (err) {
      toast.error("Error al eliminar el documento", { description: err instanceof Error ? err.message : String(err) });
    }
  };

  const handleSaveNote = async () => {
    if (!noteText.trim() || !currentUser) return;
    setSavingNote(true);
    try {
      await createNota({
        assetId,
        author: currentUser.nombre,
        text: noteText.trim(),
      });
      setNoteText("");
      setShowNoteForm(false);
      await loadData();
      toast.success("Nota guardada");
    } catch (err) {
      toast.error("Error al guardar la nota", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setSavingNote(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    handleFileSelect(e.dataTransfer.files);
  };

  return (
    <>
      <div className="mb-4 flex gap-0 border-b border-border">
        {[["Documentos", FileText], ["Notas", MessageSquare]].map(([lbl, Icon], i) => {
          const I = Icon as typeof FileText;
          return (
            <button key={i} onClick={() => setDocSubTab(i)} className={`-mb-px flex items-center gap-1.5 border-b-2 px-4 py-2 text-xs font-medium transition-all ${docSubTab === i ? "border-b-navy text-navy" : "border-b-transparent text-muted"}`}>
              <I size={13} /> {lbl as string}
            </button>
          );
        })}
      </div>
      {docSubTab === 0 && (
        <>
          <div
            ref={dropZoneRef}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`mb-4 flex cursor-pointer flex-col items-center rounded-lg border-2 border-dashed bg-cream2 p-6 transition-all ${
              dragging ? "border-navy bg-gold/5" : uploading ? "border-gold bg-gold/5" : "border-border hover:border-navy/30"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.xls,.xlsx,.csv,.jpg,.jpeg,.png,.gif,.webp,.zip,.rar"
              onChange={(e) => handleFileSelect(e.target.files)}
            />
            {uploading ? (
              <>
                <Loader2 size={24} className="mb-2 animate-spin text-gold" />
                <p className="text-sm font-medium text-text">Subiendo archivo...</p>
              </>
            ) : (
              <>
                <Upload size={24} className="mb-2 text-muted" />
                <p className="text-sm text-muted"><span className="font-medium text-text">Arrastra archivos</span> o haz clic para seleccionar</p>
                <p className="mt-0.5 text-[11px] text-muted">PDF, Excel, imágenes — Máx. 50MB</p>
              </>
            )}
          </div>
          {uploadError && (
            <div className="mb-3 flex items-center gap-2 rounded-lg bg-red/10 px-3 py-2 text-xs text-red">
              <AlertCircle size={14} /> {uploadError}
            </div>
          )}
          {uploadSuccess && (
            <div className="mb-3 flex items-center gap-2 rounded-lg bg-green/10 px-3 py-2 text-xs text-green">
              <CheckCircle2 size={14} /> Archivo subido correctamente
            </div>
          )}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={24} className="animate-spin text-gold" />
            </div>
          ) : docs.length === 0 ? (
            <div className="rounded-lg border border-border bg-white p-6 text-center text-sm text-muted">
              No hay documentos subidos aún
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {docs.map((d) => (
                <DocItemRow key={d.id} doc={d} onDelete={() => handleDeleteDoc(d.id)} />
              ))}
            </div>
          )}
        </>
      )}
      {docSubTab === 1 && (
        <>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Notas y aclaraciones</p>
            <button
              onClick={() => setShowNoteForm(!showNoteForm)}
              className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-text hover:bg-cream"
            >
              <Plus size={12} /> Nueva nota
            </button>
          </div>
          {showNoteForm && (
            <div className="mb-3 rounded-lg border border-border bg-white p-4">
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                className="mb-2 w-full rounded-md border border-border bg-cream2 p-3 text-sm text-text outline-none focus:border-navy"
                rows={3}
                placeholder="Escribe tu nota aquí..."
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => { setShowNoteForm(false); setNoteText(""); }}
                  className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text hover:bg-cream"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveNote}
                  disabled={!noteText.trim() || savingNote}
                  className="flex items-center gap-1.5 rounded-md bg-gold px-3 py-1.5 text-xs font-medium text-white hover:bg-gold2 disabled:opacity-50"
                >
                  {savingNote ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Guardar
                </button>
              </div>
            </div>
          )}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={24} className="animate-spin text-gold" />
            </div>
          ) : notes.length === 0 ? (
            <div className="rounded-lg border border-border bg-white p-6 text-center text-sm text-muted">
              No hay notas aún
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {notes.map((n) => (
                <AssetNoteCard
                  key={n.id}
                  note={n}
                  onDelete={canDeleteNotes ? (noteId) => deleteAssetNote(noteId, loadData) : undefined}
                />
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

function TabAgentes({ asset, assetId, currentUser, canDeleteNotes }: { asset: Asset; assetId: string; currentUser: { nombre: string; email: string } | null; canDeleteNotes: boolean }) {
  const [notes, setNotes] = useState<NotaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  useEffect(() => {
    loadNotes();
  }, [assetId]);

  const loadNotes = async () => {
    setLoading(true);
    try {
      const fetched = await fetchNotas({ assetId });
      setNotes(fetched);
    } catch (err) {
      console.error("Error cargando notas:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveNote = async () => {
    if (!noteText.trim() || !currentUser) return;
    setSavingNote(true);
    try {
      await createNota({
        assetId,
        author: currentUser.nombre,
        text: noteText.trim(),
      });
      setNoteText("");
      setShowNoteForm(false);
      await loadNotes();
      toast.success("Nota guardada");
    } catch (err) {
      toast.error("Error al guardar la nota", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setSavingNote(false);
    }
  };

  return (
    <>
      <div className="mb-4 rounded-lg bg-gradient-to-br from-navy to-navy3 p-4">
        <div className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-white/30">Resumen del Activo</div>
        <div className="grid grid-cols-3 gap-3">
          {[
            ["Categoría", getCategoria(asset)],
            ["Fase Judicial", asset.propiedades[0]?.hitoJudicial || asset.propiedades[0]?.ultimaFaseCalculada || "—"],
            ["Deuda total", (() => { const d = getDeudaTotal(asset); return d != null ? d.toLocaleString("es-ES") + " €" : "—"; })()],
          ].map(([l, v]) => (
            <div key={l}><div className="text-[10px] font-medium uppercase tracking-wider text-muted">{l}</div><div className="text-sm text-white/80">{v}</div></div>
          ))}
        </div>
      </div>

      <AssetAgenteAssignmentCard assetId={assetId} />

      <div className="mb-3 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Notas del agente</p>
        <button
          onClick={() => setShowNoteForm(!showNoteForm)}
          className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-text hover:bg-cream"
        >
          <Plus size={12} /> Añadir nota
        </button>
      </div>
      {showNoteForm && (
        <div className="mb-3 rounded-lg border border-border bg-white p-4">
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            className="mb-2 w-full rounded-md border border-border bg-cream2 p-3 text-sm text-text outline-none focus:border-navy"
            rows={3}
            placeholder="Escribe tu nota aquí..."
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setShowNoteForm(false); setNoteText(""); }}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text hover:bg-cream"
            >
              Cancelar
            </button>
            <button
              onClick={handleSaveNote}
              disabled={!noteText.trim() || savingNote}
              className="flex items-center gap-1.5 rounded-md bg-gold px-3 py-1.5 text-xs font-medium text-white hover:bg-gold2 disabled:opacity-50"
            >
              {savingNote ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Guardar
            </button>
          </div>
        </div>
      )}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={24} className="animate-spin text-gold" />
        </div>
      ) : notes.length === 0 ? (
        <div className="rounded-lg border border-border bg-white p-6 text-center text-sm text-muted">
          No hay notas del agente aún
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {notes.map((n) => (
            <AssetNoteCard
              key={n.id}
              note={n}
              onDelete={canDeleteNotes ? (noteId) => deleteAssetNote(noteId, loadNotes) : undefined}
            />
          ))}
        </div>
      )}
    </>
  );
}

function TabClientes({ assetId }: { assetId: string }) {
  const { compradores } = useApp();
  const [loading, setLoading] = useState(true);
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());
  const [inviting, setInviting] = useState<string | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);

  useEffect(() => {
    fetchInvitedCompradores(assetId)
      .then((rows) => setInvitedIds(new Set(rows.map(r => r.compradorId))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [assetId]);

  const handleInvite = async (compradorId: string) => {
    setInviting(compradorId);
    const result = await inviteCompradorToAsset(compradorId, assetId);
    setInviting(null);
    if (result.success) {
      setInvitedIds(prev => new Set([...prev, compradorId]));
      const cl = compradores.find(c => c.id === compradorId);
      toast.success("Activo compartido", { description: `Compartido con ${cl?.nombre ?? "el cliente"}.` });
      setShowInviteModal(false);
    } else {
      toast.error("No se pudo compartir el activo", { description: result.error ?? "error desconocido" });
    }
  };

  const handleRevoke = async (compradorId: string) => {
    setInviting(compradorId);
    const result = await revokeCompradorFromAsset(compradorId, assetId);
    setInviting(null);
    if (result.success) {
      setInvitedIds(prev => { const n = new Set(prev); n.delete(compradorId); return n; });
      const cl = compradores.find(c => c.id === compradorId);
      toast.success("Acceso revocado", { description: `Para ${cl?.nombre ?? "el cliente"}.` });
    } else {
      toast.error("No se pudo revocar el acceso", { description: result.error ?? "error desconocido" });
    }
  };

  const getInitials = (name: string) => name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
  const getColorGradient = (ini: string) => {
    const colors = ["#2563a8,#0d2a4a", "#2a8c5e,#0d3a22", "#b8933a,#7a5f26", "#c0392b,#7a1f15", "#d4762a,#8a4e1a"];
    return colors[ini.charCodeAt(0) % colors.length];
  };

  const invitedComps = compradores.filter(c => invitedIds.has(c.id));
  const notInvitedComps = compradores.filter(c => !invitedIds.has(c.id));

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
          Clientes con acceso ({invitedIds.size})
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setShowInviteModal(true)}
            className="flex items-center gap-1.5 rounded-md bg-gold px-3 py-1.5 text-xs font-medium text-white hover:bg-gold2"
          >
            <Plus size={12} /> Compartir con cliente
          </button>
          <Link
            href="/admin/compradores"
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-navy hover:bg-cream"
          >
            Gestionar clientes
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={24} className="animate-spin text-gold" />
        </div>
      ) : invitedComps.length === 0 ? (
        <div className="rounded-lg border border-border bg-white p-6 text-center text-sm text-muted">
          No se ha compartido este activo con ningún cliente
        </div>
      ) : (
        invitedComps.map((cl) => {
          const ini = getInitials(cl.nombre);
          const col = getColorGradient(ini);
          return (
            <div key={cl.id} className="mb-3 rounded-lg border border-border bg-white p-4">
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: `linear-gradient(135deg,${col})` }}>
                  {ini}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-navy">{cl.nombre}</div>
                  <div className="text-[11px] text-muted">{cl.tipo} · {cl.email} · NDA {cl.nda.toLowerCase()}</div>
                </div>
                <button
                  onClick={() => handleRevoke(cl.id)}
                  disabled={inviting === cl.id}
                  className="flex items-center gap-1 rounded-md border border-red/20 px-2.5 py-1.5 text-xs font-medium text-red hover:bg-red/5 disabled:opacity-50"
                >
                  {inviting === cl.id ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />} Revocar
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <DataPill label="Teléfono" value={cl.tel || "—"} />
                <DataPill label="Intereses" value={cl.intereses || "—"} />
                <DataPill label="Estado" value={cl.estado || "Nuevo"} />
              </div>
            </div>
          );
        })
      )}

      {showInviteModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={() => setShowInviteModal(false)}>
          <div className="w-full max-w-md rounded-xl border border-border bg-white shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h3 className="text-base font-semibold text-navy">Compartir activo con cliente</h3>
              <button onClick={() => setShowInviteModal(false)} className="rounded-lg p-1.5 text-muted hover:bg-cream hover:text-navy"><X size={18} /></button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-4">
              {notInvitedComps.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted">Todos los clientes ya tienen acceso a este activo</p>
              ) : (
                notInvitedComps.map(cl => {
                  const ini = getInitials(cl.nombre);
                  const col = getColorGradient(ini);
                  return (
                    <div key={cl.id} className="mb-2 flex items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-cream/50">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: `linear-gradient(135deg,${col})` }}>
                        {ini}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="truncate text-sm font-medium text-navy">{cl.nombre}</div>
                        <div className="truncate text-[11px] text-muted">{cl.email}</div>
                      </div>
                      <button
                        onClick={() => handleInvite(cl.id)}
                        disabled={inviting === cl.id}
                        className="flex shrink-0 items-center gap-1 rounded-md bg-navy px-3 py-1.5 text-xs font-medium text-white hover:bg-navy3 disabled:opacity-50"
                      >
                        {inviting === cl.id ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />} Compartir
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function TabAdmin({ asset, assetId, togglePub, currentUser, reloadAsset, canDeleteNotes }: { asset: Asset; assetId: string; togglePub: () => void; currentUser: { nombre: string; email: string } | null; reloadAsset: () => void; canDeleteNotes: boolean }) {
  const [adminNote, setAdminNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingFase, setSavingFase] = useState(false);
  const [notes, setNotes] = useState<NotaRow[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [faseInterna, setFaseInterna] = useState(getFaseInterna(asset));

  useEffect(() => {
    setFaseInterna(getFaseInterna(asset));
  }, [asset]);

  // El propietario vive en la PROPIEDAD (lien) — no en el inmueble. Mostramos
  // los datos de la primera propiedad asociada como referencia. La edición
  // por propiedad se hará desde su panel propio en una iteración futura.
  const ownerName = getPropietario(asset);
  const ownerTel = getOwnerTel(asset);
  const ownerMail = getOwnerMail(asset);

  useEffect(() => {
    loadAdminNotes();
  }, [assetId]);

  const loadAdminNotes = async () => {
    setLoadingNotes(true);
    try {
      const fetched = await fetchNotas({ assetId });
      setNotes(fetched.filter(n => n.author === "Admin" || n.author === (currentUser?.nombre || "Admin")));
    } catch (err) {
      console.error("Error cargando notas admin:", err);
    } finally {
      setLoadingNotes(false);
    }
  };

  const handleSaveAdminNote = async () => {
    if (!adminNote.trim() || !currentUser) return;
    setSaving(true);
    try {
      await createNota({
        assetId,
        author: currentUser.nombre,
        text: adminNote.trim(),
      });
      setAdminNote("");
      await loadAdminNotes();
      toast.success("Nota administrativa guardada");
    } catch (err) {
      toast.error("Error al guardar la nota administrativa", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  };
  // En el modelo nuevo, los datos administrativos viven en la primera propiedad.
  // Aquí solo los listamos como referencia (no editable desde el inmueble).
  const p = asset.propiedades[0];
  const provFields: FieldDef[] = p ? [
    { label: "Categoría", dbCol: "categoria", value: p.categoria },
    { label: "ID Activo (préstamo)", dbCol: "activo_id", value: p.activoId, mono: true },
    { label: "Collateral ID", dbCol: "collateral_id", value: p.collateralId || "—", mono: true },
    { label: "ID Prinex", dbCol: "id_prinex", value: p.idPrinex || "—", mono: true },
    { label: "ID Property (CDR)", dbCol: "id_property", value: p.idProperty || "—" },
    { label: "Portfolio", dbCol: "portfolio", value: p.portfolio },
    { label: "Folder", dbCol: "folder", value: p.folder },
    { label: "Stage Status", dbCol: "stage_status", value: p.stageStatus },
    { label: "Stage SubStatus", dbCol: "stage_substatus", value: p.stageSubstatus },
    { label: "Lien", dbCol: "lien", value: p.lien },
    { label: "Deuda", dbCol: "deuda", value: p.deuda != null ? p.deuda.toLocaleString("es-ES") + " €" : "—" },
    { label: "Precio Publicación", dbCol: "precio_publicacion", value: p.precioPublicacion != null ? p.precioPublicacion.toLocaleString("es-ES") + " €" : "—" },
    { label: "Fase Interna", dbCol: "fase_interna", value: p.faseInterna },
    { label: "Proceso", dbCol: "proceso", value: p.proceso, colSpan: 2 },
    { label: "Juzgado Larga", dbCol: "juzgado_larga", value: p.juzgadoLarga, colSpan: 2 },
    { label: "Hito Judicial (CDR)", dbCol: "hito_judicial", value: p.hitoJudicial },
    { label: "Fecha Lanzamiento", dbCol: "fecha_lanzamiento", value: p.fechaLanzamiento },
    { label: "Info Ocupantes", dbCol: "info_ocupantes", value: p.infoOcupantes, colSpan: 2 },
  ] : [];

  const propExcelRaw = p?.excelRaw;
  const hasDynamicExcel =
    !!propExcelRaw &&
    Object.keys(propExcelRaw).length > 0 &&
    Object.values(propExcelRaw).some((cols) => cols && Object.keys(cols).length > 0);

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-4">
        <SectionCard title="Estado de publicación">
          <div className="mb-3 flex items-center gap-2.5">
            <button
              type="button"
              role="switch"
              aria-checked={asset.pub}
              aria-label={asset.pub ? "Despublicar activo" : "Publicar activo"}
              className={`relative h-5 w-10 cursor-pointer rounded-full transition-colors ${asset.pub ? "bg-green" : "bg-navy3"}`}
              onClick={togglePub}
            >
              <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${asset.pub ? "left-[22px]" : "left-0.5"}`} />
            </button>
            <span className={`text-xs font-semibold ${asset.pub ? "text-green" : "text-red"}`}>{asset.pub ? "Publicado" : "Suspendido"}</span>
          </div>
          <p className="mb-3 text-[11px] text-muted" title={publicationListLabel(asset).title}>
            Fecha de publicación: {publicationListLabel(asset).text}
          </p>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">Fase interna</p>
          <select
            value={faseInterna === "—" ? "" : faseInterna}
            disabled={savingFase || !asset.propiedades[0]?.id}
            onChange={async (e) => {
              const next = e.target.value;
              const propId = asset.propiedades[0]?.id;
              if (!propId || !next) return;
              setFaseInterna(next);
              setSavingFase(true);
              try {
                await updatePropiedadFields(propId, {
                  fase_interna: next,
                  fase_c: faseToCode(next),
                });
                reloadAsset();
                toast.success("Fase interna actualizada");
              } catch (err) {
                setFaseInterna(getFaseInterna(asset));
                toast.error("No se pudo guardar la fase interna", {
                  description: err instanceof Error ? err.message : String(err),
                });
              } finally {
                setSavingFase(false);
              }
            }}
            className="w-full cursor-pointer appearance-none rounded-md border border-border bg-cream2 px-3 py-2 text-xs text-text outline-none focus:border-navy disabled:opacity-50"
          >
            <option value="">—</option>
            {FASE_INTERNA_OPTIONS.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
            {faseInterna && faseInterna !== "—" && !(FASE_INTERNA_OPTIONS as readonly string[]).includes(faseInterna) && (
              <option value={faseInterna}>{faseInterna}</option>
            )}
          </select>
        </SectionCard>
        <SectionCard title="Propietario / Vendedor (primera propiedad)">
          <p className="mb-2 text-[10px] text-muted">
            Datos derivados de la primera carga/propiedad asociada al inmueble.
            La edición por propiedad se hará desde su propio panel.
          </p>
          <div className="mb-3 grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-0.5">
              <label className="text-[9px] font-semibold uppercase tracking-wider text-muted">Nombre</label>
              <div className="rounded-md border border-border bg-cream2 px-2.5 py-[7px] text-xs text-text">{ownerName}</div>
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-[9px] font-semibold uppercase tracking-wider text-muted">Teléfono</label>
              <div className="rounded-md border border-border bg-cream2 px-2.5 py-[7px] text-xs text-text">{ownerTel}</div>
            </div>
            <div className="col-span-2 flex flex-col gap-0.5">
              <label className="text-[9px] font-semibold uppercase tracking-wider text-muted">Email</label>
              <div className="rounded-md border border-border bg-cream2 px-2.5 py-[7px] text-xs text-text">{ownerMail}</div>
            </div>
          </div>
          {ownerMail && ownerMail !== "—" && (
            <a
              href={`mailto:${ownerMail}`}
              className="flex w-full items-center justify-center gap-1.5 rounded-md bg-gold px-4 py-2 text-xs font-medium text-white hover:bg-gold2"
            >
              <Mail size={13} /> Enviar correo
            </a>
          )}
        </SectionCard>
      </div>

      <div className="mb-4">
        {hasDynamicExcel && propExcelRaw ? (
          <>
            <ExcelEmptyFieldsBanner excelRaw={propExcelRaw} />
            <EditableExcelRawSection
              assetId={p?.id ?? ""}
              excelRaw={propExcelRaw}
              cols={4}
              onSaved={reloadAsset}
            />
          </>
        ) : (
          <>
            <p className="mb-3 text-xs leading-relaxed text-muted">
              Este activo no tiene columnas del Excel almacenadas en <span className="font-mono text-[11px]">excel_raw</span>. Importe de
              nuevo un archivo con hojas Proveedor, o ejecute en Supabase el script{" "}
              <span className="font-mono text-[11px]">supabase-migration-excel-raw.sql</span> del repositorio.
            </p>
            <EditableSection
              title="Datos administrativos (primera propiedad)"
              assetId={assetId}
              cols={4}
              onSaved={reloadAsset}
              fields={provFields}
            />
          </>
        )}
      </div>

      <div className="mb-4">
        <SectionCard title="Notas privadas">
          <textarea
            value={adminNote}
            onChange={(e) => setAdminNote(e.target.value)}
            className="w-full rounded-md border border-border bg-cream2 p-3 text-sm text-text outline-none focus:border-navy"
            rows={3}
            placeholder="Notas privadas del administrador..."
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              onClick={() => setAdminNote("")}
              className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-text hover:bg-cream"
            >
              <X size={12} /> Limpiar
            </button>
            <button
              onClick={handleSaveAdminNote}
              disabled={!adminNote.trim() || saving}
              className="flex items-center gap-1.5 rounded-md bg-gold px-3 py-1.5 text-xs font-medium text-white hover:bg-gold2 disabled:opacity-50"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Guardar
            </button>
          </div>
          {loadingNotes ? (
            <div className="mt-3 flex items-center justify-center py-4">
              <Loader2 size={20} className="animate-spin text-gold" />
            </div>
          ) : notes.length > 0 && (
            <div className="mt-3 flex flex-col gap-2">
              {notes.map((n) => (
                <AssetNoteCard
                  key={n.id}
                  note={n}
                  onDelete={canDeleteNotes ? (noteId) => deleteAssetNote(noteId, loadAdminNotes) : undefined}
                />
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Conversaciones">
        <p className="text-xs text-muted">
          El chat interno aún no está disponible. Usa Consultar (pestaña Características) o el email del propietario.
        </p>
      </SectionCard>
    </>
  );
}

function AssetAgenteAssignmentCard({ assetId }: { assetId: string }) {
  const { vendedores, vendedoresLoading, refreshAssets } = useApp();
  const [currentAgenteId, setCurrentAgenteId] = useState("");
  const [pendingAgenteId, setPendingAgenteId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getAssetAgente(assetId)
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
  }, [assetId]);

  const dirty = pendingAgenteId !== currentAgenteId;
  const selectedVendor = vendedores.find((v) => v.id === pendingAgenteId);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await setAssetAgente(assetId, pendingAgenteId || null);
      setCurrentAgenteId(pendingAgenteId);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      void refreshAssets();
      if (pendingAgenteId && selectedVendor) {
        toast.success("Agente asignado al activo", { description: `Agente: ${selectedVendor.nombre}` });
      } else {
        toast.success("Agente retirado del activo");
      }
    } catch (err) {
      toast.error("No se pudo asignar el agente", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-4 rounded-lg border border-border bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[1.5px] text-gold after:h-px after:flex-1 after:bg-border">
        <UserCog size={13} /> Agente principal del activo
      </div>

      <p className="mb-3 text-xs text-muted">
        Designa al agente responsable de gestionar este activo. Recibirá una notificación al asignarlo.
      </p>

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
        <div className="mt-3 flex items-center gap-2 rounded-md bg-cream2 p-2 text-xs text-muted">
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
  );
}

