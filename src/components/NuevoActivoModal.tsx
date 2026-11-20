"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { crearActivoManual, precargarCatastroActivo } from "@/app/actions/activo-manual";
import { uploadDocumento } from "@/app/actions/documentos";
import { raiseActionError } from "@/lib/action-result";
import { FASE_INTERNA_OPTIONS } from "@/lib/fase-interna";
import { CATALOGO_CATEGORIAS } from "@/lib/cruce-demanda";
import { toast } from "@/lib/toast";

function numero(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const normalized = trimmed.includes(",")
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : trimmed.replace(/\s/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

/**
 * Alta manual de un activo. Solo la abre el admin.
 * Las fotos usan el mismo `uploadDocumento` que la ficha.
 */
export function NuevoActivoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <NuevoActivoForm onClose={onClose} />;
}

function NuevoActivoForm({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [referencia, setReferencia] = useState("");
  const [tipo, setTipo] = useState("Vivienda");
  const [direccion, setDireccion] = useState("");
  const [municipio, setMunicipio] = useState("");
  const [provincia, setProvincia] = useState("");
  const [cp, setCp] = useState("");
  const [superficie, setSuperficie] = useState("");
  const [precio, setPrecio] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [situacion, setSituacion] = useState("");
  const [deuda, setDeuda] = useState("");
  const [proceso, setProceso] = useState("");
  const [propietario, setPropietario] = useState("");
  const [contacto, setContacto] = useState("");
  const [telefono, setTelefono] = useState("");
  const [mail, setMail] = useState("");
  const [activar, setActivar] = useState(false);
  const [archivos, setArchivos] = useState<File[]>([]);
  const [consultando, setConsultando] = useState(false);
  const [guardando, setGuardando] = useState(false);

  async function consultarCatastro() {
    setConsultando(true);
    try {
      const result = await precargarCatastroActivo(referencia);
      raiseActionError(result);
      const datos = result.precarga;
      if (datos.direccion) setDireccion(datos.direccion);
      if (datos.municipio) setMunicipio(datos.municipio);
      if (datos.provincia) setProvincia(datos.provincia);
      if (datos.cp) setCp(datos.cp);
      if (datos.superficie != null) setSuperficie(String(datos.superficie));
      if (datos.tipo) setTipo(datos.tipo);
      if (datos.descripcion) setDescripcion(datos.descripcion);
      toast.success("Datos del catastro cargados");
    } catch (err) {
      toast.error("No se pudo consultar el catastro", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setConsultando(false);
    }
  }

  async function crear() {
    const sqm = numero(superficie);
    const euros = numero(precio);
    const deudaNumero = numero(deuda);
    if (Number.isNaN(sqm) || Number.isNaN(euros) || Number.isNaN(deudaNumero)) {
      toast.error("Revisa los importes y la superficie");
      return;
    }
    setGuardando(true);
    try {
      const result = await crearActivoManual({
        referencia,
        tipo,
        direccion,
        municipio,
        provincia,
        cp,
        superficie: sqm,
        precio: euros,
        descripcion,
        situacion,
        deuda: deudaNumero,
        proceso,
        propietario,
        contacto,
        telefono,
        mail,
        activar,
      });
      raiseActionError(result);
      const fallos: string[] = [];
      for (const archivo of archivos) {
        const form = new FormData();
        form.set("file", archivo);
        form.set("asset_id", result.id);
        try {
          await uploadDocumento(form);
        } catch (err) {
          fallos.push(err instanceof Error ? err.message : archivo.name);
        }
      }
      if (fallos.length > 0) {
        toast.error("El activo se creó, pero algún archivo no se subió", { description: fallos[0] });
      } else {
        toast.success(activar ? "Activo creado y publicado" : "Activo creado en borrador");
      }
      window.dispatchEvent(new Event("propcrm-assets-updated"));
      onClose();
      router.push(`/admin/assets/${encodeURIComponent(result.id)}`);
    } catch (err) {
      toast.error("No se pudo crear el activo", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy/40 p-4">
      <div className="my-8 w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl" role="dialog" aria-labelledby="nuevo-activo-titulo">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="nuevo-activo-titulo" className="text-lg font-semibold text-navy">Nuevo activo</h2>
            <p className="mt-1 text-xs text-muted">
              Queda en borrador hasta que pulses Activar. Propietario y contacto solo los ve el gestor.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted hover:bg-cream" aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Referencia catastral" value={referencia} onChange={setReferencia} required />
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => void consultarCatastro()}
              disabled={consultando || !referencia.trim()}
              className="rounded-md border border-border px-3 py-2 text-xs font-medium text-navy hover:bg-cream disabled:opacity-50"
            >
              {consultando ? "Consultando…" : "Consultar catastro"}
            </button>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="alta-tipo" className="text-[10px] font-semibold uppercase tracking-wider text-muted">Tipo</label>
            <input
              id="alta-tipo"
              list="alta-tipos"
              value={tipo}
              onChange={(event) => setTipo(event.target.value)}
              className="rounded-md border border-border bg-cream2 px-2.5 py-2 text-sm outline-none focus:border-navy"
            />
            <datalist id="alta-tipos">
              {CATALOGO_CATEGORIAS.map((item) => <option key={item} value={item} />)}
            </datalist>
          </div>
          <Campo label="Código postal" value={cp} onChange={setCp} />
          <div className="sm:col-span-2">
            <Campo label="Dirección" value={direccion} onChange={setDireccion} required />
          </div>
          <Campo label="Municipio" value={municipio} onChange={setMunicipio} required />
          <Campo label="Provincia" value={provincia} onChange={setProvincia} required />
          <Campo label="Superficie (m²)" value={superficie} onChange={setSuperficie} />
          <Campo label="Precio (€)" value={precio} onChange={setPrecio} />
          <div className="flex flex-col gap-1">
            <label htmlFor="alta-situacion" className="text-[10px] font-semibold uppercase tracking-wider text-muted">Situación</label>
            <select
              id="alta-situacion"
              value={situacion}
              onChange={(event) => setSituacion(event.target.value)}
              className="rounded-md border border-border bg-cream2 px-2.5 py-2 text-sm outline-none focus:border-navy"
            >
              <option value="">Sin situación</option>
              {FASE_INTERNA_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          <Campo label="Proceso" value={proceso} onChange={setProceso} />
          <Campo label="Deuda (€)" value={deuda} onChange={setDeuda} />
          <Campo label="Propietario" value={propietario} onChange={setPropietario} />
          <Campo label="Contacto" value={contacto} onChange={setContacto} />
          <Campo label="Teléfono de contacto" value={telefono} onChange={setTelefono} />
          <Campo label="Email de contacto" value={mail} onChange={setMail} />
          <div className="sm:col-span-2 flex flex-col gap-1">
            <label htmlFor="alta-descripcion" className="text-[10px] font-semibold uppercase tracking-wider text-muted">Descripción</label>
            <textarea
              id="alta-descripcion"
              value={descripcion}
              onChange={(event) => setDescripcion(event.target.value)}
              rows={3}
              className="rounded-md border border-border bg-cream2 px-2.5 py-2 text-sm outline-none focus:border-navy"
            />
          </div>
          <div className="sm:col-span-2 flex flex-col gap-1">
            <label htmlFor="alta-archivos" className="text-[10px] font-semibold uppercase tracking-wider text-muted">Fotos y documentos</label>
            <input
              id="alta-archivos"
              type="file"
              multiple
              onChange={(event) => setArchivos([...(event.target.files ?? [])])}
              className="text-xs text-navy"
            />
          </div>
          <label className="sm:col-span-2 flex items-center gap-2 text-sm text-navy">
            <input type="checkbox" checked={activar} onChange={(event) => setActivar(event.target.checked)} />
            Activar (publicar en el portal). Si no, se guarda como borrador.
          </label>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border border-border px-3 py-2 text-xs font-medium text-navy">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void crear()}
            disabled={guardando}
            className="flex items-center gap-1.5 rounded-md bg-navy px-3 py-2 text-xs font-medium text-white hover:bg-navy3 disabled:opacity-50"
          >
            {guardando ? <Loader2 size={14} className="animate-spin" /> : null}
            Crear activo
          </button>
        </div>
      </div>
    </div>
  );
}

function Campo({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  const id = `alta-${label.toLowerCase().replace(/[^a-z0-9]+/gi, "-")}`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[10px] font-semibold uppercase tracking-wider text-muted">
        {label}{required ? " *" : ""}
      </label>
      <input
        id={id}
        value={value}
        required={required}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-md border border-border bg-cream2 px-2.5 py-2 text-sm outline-none focus:border-navy focus:bg-white"
      />
    </div>
  );
}
