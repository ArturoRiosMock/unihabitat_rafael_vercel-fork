"use client";

import { useState, useEffect, useCallback } from "react";
import { useApp } from "@/lib/context";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { Zap, RefreshCw } from "lucide-react";
import { nombreVisible } from "@/lib/comprador-oferta";

interface OpRow { id: string; comprador_id: string; asset_id: string; score: number; estado: string; created_at: string }

export default function OportunidadesPage() {
  const { assets, compradores } = useApp();
  const supabase = createClient();
  const [ops, setOps] = useState<OpRow[]>([]);
  const [computing, setComputing] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("oportunidades").select("*").order("score", { ascending: false }).limit(100);
    if (data) setOps(data as OpRow[]);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  async function recomputeAll() {
    setComputing(true);
    const { computeMatchesForAsset } = await import("@/app/actions/matching");
    for (const a of assets.slice(0, 50)) {
      await computeMatchesForAsset(a.id);
    }
    await load();
    setComputing(false);
  }

  return (
    <>
      <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-white px-6">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-navy">Cruce de Oportunidades</h1>
          <span className="rounded-md bg-cream px-2.5 py-0.5 text-xs font-medium text-muted">{ops.length} matches</span>
        </div>
        <button
          onClick={recomputeAll}
          disabled={computing}
          className="flex items-center gap-1.5 rounded-lg bg-navy px-3.5 py-2 text-xs font-medium text-white hover:bg-navy3 disabled:opacity-50"
        >
          <RefreshCw size={14} className={computing ? "animate-spin" : ""} />
          {computing ? "Calculando..." : "Recalcular todos"}
        </button>
      </div>

      <div className="p-5">
        <p className="mb-4 text-xs text-muted">Relación automática de compradores con activos según criterios de búsqueda, provincia, tipología y presupuesto.</p>

        <div className="overflow-hidden rounded-lg border border-border bg-white shadow-sm">
          <div className="grid grid-cols-[2fr_2fr_80px_100px_120px] items-center gap-2 bg-navy px-4 py-2.5">
            {["Comprador", "Activo", "Score", "Estado", "Fecha"].map(h => (
              <div key={h} className="text-[10px] font-semibold uppercase tracking-wider text-white/40">{h}</div>
            ))}
          </div>
          {ops.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted">
              <Zap size={32} className="mx-auto mb-2 text-border" />
              No hay matches calculados. Pulsa &quot;Recalcular todos&quot; para empezar.
            </div>
          ) : (
            ops.map(op => {
              const c = compradores.find(x => x.id === op.comprador_id);
              const a = assets.find(x => x.id === op.asset_id);
              if (!c || !a) return null;
              const barW = Math.min(op.score, 100);
              return (
                <div key={op.id} className="grid grid-cols-[2fr_2fr_80px_100px_120px] items-center gap-2 border-b border-border2 px-4 py-3 last:border-b-0">
                  <Link href={`/admin/compradores/${c.id}`} className="flex items-center gap-2 hover:underline">
                    <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: `linear-gradient(135deg,${c.col})` }}>{c.ini}</div>
                    <div className="overflow-hidden">
                      <div className="truncate text-sm font-medium text-navy">{nombreVisible(c)}</div>
                      <div className="truncate text-[11px] text-muted">{c.intereses}</div>
                    </div>
                  </Link>
                  <Link href={`/admin/assets/${a.id}`} className="overflow-hidden hover:underline">
                    <div className="truncate text-sm font-medium text-navy">{a.pob}, {a.prov}</div>
                    <div className="truncate text-[11px] text-muted">{a.tip} · {a.id}</div>
                  </Link>
                  <div>
                    <div className="mb-0.5 text-xs font-bold text-gold">{op.score}</div>
                    <div className="h-1.5 rounded-full bg-cream2">
                      <div className="h-1.5 rounded-full bg-gradient-to-r from-gold to-gold3" style={{ width: `${barW}%` }} />
                    </div>
                  </div>
                  <span className={`inline-flex w-fit rounded-md px-2 py-0.5 text-[10px] font-semibold ${op.estado === "nueva" ? "bg-blue/8 text-blue" : op.estado === "contactada" ? "bg-green/8 text-green" : "bg-muted/8 text-muted"}`}>
                    {op.estado}
                  </span>
                  <span className="text-xs text-muted">{new Date(op.created_at).toLocaleDateString("es-ES")}</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
