"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { fetchCompradorDeSesion } from "@/app/actions/compradores";
import { DemandaBloque } from "@/components/DemandaBloque";

export default function DemandaPortalPage() {
  const [compradorId, setCompradorId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const comprador = await fetchCompradorDeSesion();
        if (cancelled) return;
        if (!comprador) setError("No encontramos tu ficha de comprador.");
        else setCompradorId(comprador.id);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "No se pudo abrir tu demanda");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <Link href="/portal/privado" className="mb-5 inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-navy">
        <ArrowLeft size={14} /> Volver a mi zona
      </Link>
      <h1 className="mb-4 text-2xl font-bold text-navy">Mi demanda</h1>
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-gold" /></div>
      ) : error ? (
        <p className="rounded-lg border border-red/20 bg-red/5 px-3 py-2 text-sm text-red" role="alert">{error}</p>
      ) : compradorId ? (
        <DemandaBloque compradorId={compradorId} modo="portal" />
      ) : null}
    </div>
  );
}
