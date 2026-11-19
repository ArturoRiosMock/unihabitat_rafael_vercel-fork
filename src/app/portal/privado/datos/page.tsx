"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Save } from "lucide-react";
import { ensureCompradorForEmail, fetchCompradorByEmail, updateMisDatosComprador } from "@/app/actions/compradores";
import { createClient } from "@/lib/supabase/client";
import { DatosFirmaFields, DatosOfertaEstado } from "@/components/DatosFirmaFields";
import { datosFirmaFromComprador, datosFirmaVacios, splitNombreCompleto, type DatosFirma } from "@/lib/comprador-oferta";
import { toast } from "@/lib/toast";

function readDevAuth(): { email: string; role: string; nombre: string } | null {
  const raw = document.cookie.split("; ").find((item) => item.startsWith("dev-auth="));
  if (!raw) return null;
  try {
    const dev = JSON.parse(decodeURIComponent(raw.split("=").slice(1).join("="))) as {
      email?: string;
      role?: string;
      nombre?: string;
    };
    if (!dev.email) return null;
    return { email: dev.email, role: dev.role ?? "cliente", nombre: dev.nombre ?? "" };
  } catch {
    return null;
  }
}

export default function MisDatosPage() {
  const [datos, setDatos] = useState<DatosFirma>(datosFirmaVacios());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [staff, setStaff] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const dev = readDevAuth();
      if (dev && (dev.role === "admin" || dev.role === "vendedor")) {
        if (!cancelled) {
          setStaff(true);
          setLoading(false);
        }
        return;
      }
      let email = dev?.email ?? "";
      let nombreCuenta = dev?.nombre ?? "";
      if (!email) {
        const sb = createClient();
        const { data: { user } } = await sb.auth.getUser();
        const role = (user?.user_metadata?.role as string | undefined) ?? "cliente";
        if (role === "admin" || role === "vendedor") {
          if (!cancelled) {
            setStaff(true);
            setLoading(false);
          }
          return;
        }
        email = user?.email ?? "";
        nombreCuenta = (user?.user_metadata?.nombre as string | undefined) ?? "";
      }
      if (!email) {
        if (!cancelled) {
          setError("Inicia sesión para ver tus datos.");
          setLoading(false);
        }
        return;
      }
      try {
        let row = await fetchCompradorByEmail(email);
        if (!row) {
          const partes = splitNombreCompleto(nombreCuenta || email);
          await ensureCompradorForEmail(email, partes.nombre, partes.apellidos);
          row = await fetchCompradorByEmail(email);
        }
        if (cancelled) return;
        if (!row) {
          setError("No encontramos tu ficha de comprador.");
        } else {
          setDatos(datosFirmaFromComprador(row));
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "No se pudo cargar la ficha");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    setSaving(true);
    try {
      await updateMisDatosComprador(datos);
      toast.success("Datos guardados");
    } catch (err) {
      toast.error("No se pudieron guardar", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="animate-spin text-gold" />
      </div>
    );
  }

  if (staff) {
    return (
      <div className="mx-auto max-w-xl px-6 py-12 text-sm text-muted">
        La ficha de firma se edita en el CRM, en el comprador asignado.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-navy">Mis datos</h1>
          <p className="mt-1 text-xs text-muted">
            Con estos datos, la oferta sale lista para revisar y firmar.
          </p>
        </div>
        <Link href="/portal/privado" className="text-xs font-medium text-navy hover:underline">
          Volver
        </Link>
      </div>
      {error ? (
        <p className="rounded-lg border border-red/20 bg-red/5 px-3 py-2 text-sm text-red">{error}</p>
      ) : (
        <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
          <div className="mb-4">
            <DatosOfertaEstado datos={datos} />
          </div>
          <DatosFirmaFields
            datos={datos}
            onChange={setDatos}
            emailReadOnly
            idPrefix="mis-datos"
          />
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-lg bg-navy px-4 py-2 text-xs font-medium text-white hover:bg-navy3 disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Guardar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
