"use client";

import { use, useState, useEffect } from "react";
import { fetchAssetByPublicSlug } from "@/app/actions/assets";
import { createNota, fetchNotas, type NotaRow } from "@/app/actions/notas";
import { fetchDocumentos, getDocumentUrl, type DocRow } from "@/app/actions/documentos";
import { ensureCompradorForEmail } from "@/app/actions/compradores";
import type { Asset } from "@/lib/types";
import { fmtM, getDescriptionText, getPortalPriceDisplay } from "@/lib/utils";
import { useFavoritos } from "@/hooks/useFavoritos";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { ArrowLeft, Download, FileText, StickyNote, FolderOpen, Lock, Star, Loader2, Send } from "lucide-react";
import { InteractiveMap } from "@/components/InteractiveMap";
import { toast } from "@/lib/toast";

export default function PortalPrivadoInmuebleSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const [asset, setAsset] = useState<Asset | null>(null);
  const [tab, setTab] = useState<"info" | "notas" | "docs">("info");
  const [compradorId, setCompradorId] = useState<string | null>(null);
  const [authorName, setAuthorName] = useState("Cliente");
  const { isFavorito, toggleFavorito } = useFavoritos(compradorId);

  useEffect(() => {
    fetchAssetByPublicSlug(decodeURIComponent(slug)).then((data) => {
      if (data) setAsset(data);
    });
    let cancelled = false;
    (async () => {
      const devCookie = document.cookie.split("; ").find((c) => c.startsWith("dev-auth="));
      if (devCookie) {
        try {
          const dev = JSON.parse(decodeURIComponent(devCookie.split("=").slice(1).join("=")));
          if (cancelled) return;
          setAuthorName(dev.nombre ?? "Cliente");
          const cid = dev.compradorId ?? dev.comprador_id ?? null;
          if (cid) {
            setCompradorId(cid);
            return;
          }
          if (dev.email) {
            const idResolved = await ensureCompradorForEmail(dev.email, dev.nombre ?? "Cliente");
            if (!cancelled) setCompradorId(idResolved);
            return;
          }
        } catch {
          /* fallthrough */
        }
      }
      try {
        const sb = createClient();
        const { data: { user } } = await sb.auth.getUser();
        if (cancelled || !user?.email) return;
        const nombre = (user.user_metadata?.nombre as string | undefined) || user.email;
        setAuthorName(nombre);
        const cid = await ensureCompradorForEmail(user.email, nombre);
        if (!cancelled) setCompradorId(cid);
      } catch {
        /* sin sesión */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (!asset) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gold border-t-transparent" />
      </div>
    );
  }

  const fav = isFavorito(asset.id);
  const price = getPortalPriceDisplay(asset);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-5 flex items-center justify-between">
        <Link href="/portal/privado" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-navy">
          <ArrowLeft size={14} /> Volver a mi zona
        </Link>
        {compradorId && (
          <button
            type="button"
            onClick={() => toggleFavorito(asset.id)}
            aria-label={fav ? "Quitar de favoritos" : "Marcar como favorito"}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-all ${fav ? "border-gold/30 bg-gold/5 text-gold" : "border-border bg-white text-muted hover:border-gold/30 hover:text-gold"}`}
          >
            <Star size={13} className={fav ? "fill-gold" : ""} />
            {fav ? "Favorito" : "Marcar favorito"}
          </button>
        )}
      </div>

      <div className="mb-5 flex gap-2 border-b border-border">
        {(
          [
            ["info", "Información", FileText],
            ["notas", "Mis Notas", StickyNote],
            ["docs", "Documentos", FolderOpen],
          ] as const
        ).map(([key, lbl, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-xs font-medium transition-all ${tab === key ? "border-b-navy text-navy" : "border-b-transparent text-muted hover:text-navy"}`}
          >
            <Icon size={14} /> {lbl}
          </button>
        ))}
      </div>

      {tab === "info" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
          <div>
            <InteractiveMap
              key={`map-${asset.id}-${asset.lat ?? "x"}-${asset.lng ?? "x"}`}
              lat={asset.lat}
              lng={asset.lng}
              mapImageUrl={asset.map}
              label={asset.pob && asset.pob !== "—" ? asset.pob : undefined}
              className="mb-5 h-[260px] w-full rounded-xl border border-border"
            />
            <div className="rounded-lg border border-border bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[1.5px] text-gold after:h-px after:flex-1 after:bg-border">
                Información completa
              </div>
              <div className="grid grid-cols-3 gap-2">
                <InfoPill label="Tipo" value={asset.bien} />
                <InfoPill label="Municipio" value={asset.pob} />
                <InfoPill label="Provincia" value={asset.prov} />
                <InfoPill label="CCAA" value={asset.ccaa} />
                <InfoPill label="C.P." value={asset.cp} />
                <InfoPill label="Superficie" value={asset.supC || fmtM(asset.sqm)} />
                <InfoPill label="Clase" value={asset.clase} />
                <InfoPill label="Uso" value={asset.uso} />
              </div>
            </div>
            <div className="relative mt-4 overflow-hidden rounded-lg border border-border bg-white p-5 shadow-sm">
              <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm">
                <Lock size={24} className="text-navy" />
                <p className="mt-2 text-sm font-semibold text-navy">Información reservada</p>
                <p className="mt-0.5 text-xs text-muted">Firma tu NDA para acceder a los datos del propietario</p>
              </div>
              <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[1.5px] text-gold after:h-px after:flex-1 after:bg-border">
                Propietario
              </div>
              <div className="grid grid-cols-3 gap-2 blur-sm">
                <InfoPill label="Nombre" value="XXXXXXXXXXXX" />
                <InfoPill label="Telefono" value="+34 XXXXXXXXX" />
                <InfoPill label="Email" value="XXXX@XXXX.com" />
              </div>
            </div>
            <div className="mt-4 rounded-lg border border-border bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[1.5px] text-gold after:h-px after:flex-1 after:bg-border">
                Descripción
              </div>
              <p className="text-sm leading-[1.7] text-text">{getDescriptionText(asset)}</p>
            </div>
          </div>
          <div className="sticky top-20">
            <div className="rounded-lg border border-border bg-white p-5 shadow-sm">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{price.label}</div>
              <div className="mb-1 text-2xl font-bold text-navy">{price.value}</div>
              {price.kind === "precio" && asset.sqm && asset.precio ? (
                <div className="mb-4 text-xs text-muted">
                  {asset.sqm} m2 · {Math.round(asset.precio / asset.sqm).toLocaleString("es-ES")} euros/m2
                </div>
              ) : (
                <div className="mb-4" />
              )}
              <button
                type="button"
                onClick={() => setTab("notas")}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-navy py-3 text-xs font-medium text-white hover:bg-navy3"
              >
                <StickyNote size={13} /> Abrir Mis Notas
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === "notas" && (
        <MisNotasPanel
          assetId={asset.id}
          compradorId={compradorId}
          authorName={authorName}
          assetLabel={asset.pob}
        />
      )}

      {tab === "docs" && <MisDocumentosPanel assetId={asset.id} />}
    </div>
  );
}

function MisDocumentosPanel({ assetId }: { assetId: string }) {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchDocumentos({ assetId })
      .then((rows) => {
        if (!cancelled) setDocs(rows);
      })
      .catch(() => {
        if (!cancelled) setDocs([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [assetId]);

  async function handleDownload(doc: DocRow) {
    setDownloadingId(doc.id);
    try {
      const url = await getDocumentUrl(doc.storage_path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error("No se pudo abrir el documento", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setDownloadingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Loader2 size={16} className="animate-spin" /> Cargando documentos…
      </div>
    );
  }

  if (docs.length === 0) {
    return (
      <div className="py-16 text-center">
        <FolderOpen size={40} className="mx-auto mb-3 text-border" />
        <p className="text-sm text-muted">No hay documentos compartidos contigo</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {docs.map((doc) => (
        <div key={doc.id} className="flex items-center gap-3 rounded-lg border border-border bg-white p-3">
          <FileText size={16} className="text-navy" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-navy">{doc.name}</div>
            <div className="text-[11px] text-muted">{doc.uploaded_by}</div>
          </div>
          <button
            type="button"
            onClick={() => void handleDownload(doc)}
            disabled={downloadingId === doc.id}
            aria-label={`Descargar ${doc.name}`}
            className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-navy hover:bg-cream disabled:opacity-50"
          >
            {downloadingId === doc.id ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
            Descargar
          </button>
        </div>
      ))}
    </div>
  );
}

function MisNotasPanel({
  assetId,
  compradorId,
  authorName,
  assetLabel,
}: {
  assetId: string;
  compradorId: string | null;
  authorName: string;
  assetLabel: string;
}) {
  const [notas, setNotas] = useState<NotaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchNotas({ assetId, compradorId: compradorId ?? undefined })
      .then((rows) => {
        if (!cancelled) setNotas(rows);
      })
      .catch(() => {
        if (!cancelled) setNotas([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [assetId, compradorId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    if (!compradorId) {
      toast.error("Necesitas sesión de comprador para guardar notas");
      return;
    }
    setSaving(true);
    try {
      await createNota({
        assetId,
        compradorId,
        author: authorName,
        text: body,
      });
      setText("");
      const rows = await fetchNotas({ assetId, compradorId });
      setNotas(rows);
      toast.success("Nota guardada");
    } catch (err) {
      toast.error("No se pudo guardar la nota", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-xs font-semibold text-navy">Mis notas · {assetLabel}</span>
      </div>
      <div className="flex max-h-[400px] flex-col gap-2 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted">
            <Loader2 size={16} className="animate-spin" /> Cargando notas…
          </div>
        ) : notas.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">Aún no tienes notas en este activo.</p>
        ) : (
          notas.map((n) => (
            <div key={n.id} className="rounded-md border border-border bg-cream2 px-3 py-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-navy">{n.author}</span>
                <span className="text-[10px] text-muted">
                  {new Date(n.created_at).toLocaleString("es-ES")}
                </span>
              </div>
              <p className="text-sm text-text whitespace-pre-wrap">{n.text}</p>
            </div>
          ))
        )}
      </div>
      <form onSubmit={(e) => void handleSubmit(e)} className="flex gap-2 border-t border-border p-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="Escribe una nota privada sobre este activo…"
          className="flex-1 rounded-md border border-border bg-cream2 p-2.5 text-sm outline-none focus:border-navy"
        />
        <button
          type="submit"
          disabled={saving || !text.trim()}
          className="flex items-center gap-1 self-end rounded-md bg-gold px-3.5 py-2.5 text-xs font-medium text-white hover:bg-gold2 disabled:opacity-50"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
          Guardar
        </button>
      </form>
    </div>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-cream2 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</div>
      <div className="text-sm text-text">{value}</div>
    </div>
  );
}
