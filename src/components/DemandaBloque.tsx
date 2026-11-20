"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Save, Search } from "lucide-react";
import {
  archivarDemandaComprador,
  borrarDemandaComprador,
  buscarOportunidadesComprador,
  fetchDemandaComprador,
  fetchOportunidadesComprador,
  guardarDemandaComprador,
  marcarOportunidadEstado,
  registrarOportunidadesComprador,
} from "@/app/actions/cruce-demanda";
import { raiseActionError } from "@/lib/action-result";
import { formatCommentTimestamp } from "@/lib/comment-author";
import {
  CATALOGO_CATEGORIAS,
  ETIQUETA_ESTADO_OPORTUNIDAD,
  ETIQUETA_NIVEL,
  etiquetaNivel,
  type DemandaComprador,
  type EstadoOportunidad,
  type FichaPublicaOportunidad,
  type OportunidadVista,
} from "@/lib/cruce-demanda";
import { toast } from "@/lib/toast";

function listaTexto(values: string[]): string {
  return values.join(", ");
}

function precioTexto(value: number | null): string {
  return value == null ? "" : String(value);
}

function precioNumero(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const normalized = trimmed.includes(",")
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : trimmed.replace(/\s/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

/**
 * Demanda editable y oportunidades ofrecidas.
 * En el CRM el agente o el gestor pueden buscar y registrar.
 * En el portal el comprador marca interesado o descartada.
 */
export function DemandaBloque({
  compradorId,
  modo,
}: {
  compradorId: string;
  modo: "staff" | "portal";
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [categorias, setCategorias] = useState<string[]>([]);
  const [extraCategoria, setExtraCategoria] = useState("");
  const [provincias, setProvincias] = useState("");
  const [poblaciones, setPoblaciones] = useState("");
  const [precioMin, setPrecioMin] = useState("");
  const [precioMax, setPrecioMax] = useState("");
  const [saving, setSaving] = useState(false);
  const [demandas, setDemandas] = useState<DemandaComprador[]>([]);
  const [avisoGuardada, setAvisoGuardada] = useState("");
  const [oportunidades, setOportunidades] = useState<OportunidadVista[]>([]);
  const [preview, setPreview] = useState<FichaPublicaOportunidad[] | null>(null);
  const [previewNivel, setPreviewNivel] = useState<string>("");
  const [buscando, setBuscando] = useState(false);
  const [registrando, setRegistrando] = useState(false);
  const [marcando, setMarcando] = useState<string | null>(null);

  const aplicar = useCallback((demanda: DemandaComprador) => {
    setCategorias(demanda.categorias);
    setProvincias(listaTexto(demanda.provincias));
    setPoblaciones(listaTexto(demanda.poblaciones));
    setPrecioMin(precioTexto(demanda.precioMin));
    setPrecioMax(precioTexto(demanda.precioMax));
  }, []);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [demandaResult, oportunidadesResult] = await Promise.all([
        fetchDemandaComprador(compradorId),
        fetchOportunidadesComprador(compradorId),
      ]);
      raiseActionError(demandaResult);
      raiseActionError(oportunidadesResult);
      aplicar(demandaResult.demanda);
      setDemandas(demandaResult.demandas);
      setOportunidades(oportunidadesResult.oportunidades);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la demanda");
    } finally {
      setLoading(false);
    }
  }, [aplicar, compradorId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  function toggleCategoria(valor: string) {
    setCategorias((prev) => (
      prev.some((item) => item.toLowerCase() === valor.toLowerCase())
        ? prev.filter((item) => item.toLowerCase() !== valor.toLowerCase())
        : [...prev, valor]
    ));
  }

  function agregarExtra() {
    const valor = extraCategoria.trim();
    if (!valor) return;
    toggleCategoria(valor);
    setExtraCategoria("");
  }

  async function guardar() {
    const min = precioNumero(precioMin);
    const max = precioNumero(precioMax);
    if (Number.isNaN(min) || Number.isNaN(max)) {
      toast.error("Revisa el rango de precio");
      return;
    }
    setSaving(true);
    try {
      const result = await guardarDemandaComprador(compradorId, {
        categorias,
        provincias: provincias.split(/[,;\n]/),
        poblaciones: poblaciones.split(/[,;\n]/),
        precioMin: min,
        precioMax: max,
      });
      raiseActionError(result);
      aplicar(result.demanda);
      setDemandas(result.demandas);
      setAvisoGuardada("Demanda guardada");
      toast.success("Demanda guardada");
    } catch (err) {
      toast.error("No se pudo guardar la demanda", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  }

  async function buscar() {
    setBuscando(true);
    setPreview(null);
    try {
      const result = await buscarOportunidadesComprador(compradorId);
      raiseActionError(result);
      setPreview(result.fichas);
      setPreviewNivel(result.nivel ? etiquetaNivel(result.nivel) : "");
    } catch (err) {
      toast.error("No se pudo buscar", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBuscando(false);
    }
  }

  async function registrar() {
    setRegistrando(true);
    try {
      const result = await registrarOportunidadesComprador(compradorId);
      raiseActionError(result);
      if (result.requiereConfirmacion) {
        const texto = result.avisos.map((aviso) => `${aviso.assetId}: ${aviso.mensaje}`).join("\n");
        const sigue = window.confirm(`${texto}\n¿Quieres enviarlo de nuevo?`);
        if (!sigue) return;
        const confirmado = await registrarOportunidadesComprador(compradorId, true);
        raiseActionError(confirmado);
        setPreview(null);
        await cargar();
        toast.success("Oportunidades registradas", {
          description: confirmado.fichas.length === 0
            ? "No había activos nuevos para esta demanda"
            : `${confirmado.fichas.length} activos`,
        });
        return;
      }
      setPreview(null);
      await cargar();
      const aviso = result.email === "enviado"
        ? "Oportunidades registradas y email enviado"
        : "Oportunidades registradas";
      toast.success(aviso, {
        description: result.fichas.length === 0
          ? "No había activos nuevos para esta demanda"
          : `${result.fichas.length} activos`,
      });
    } catch (err) {
      toast.error("No se pudieron registrar", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setRegistrando(false);
    }
  }

  async function archivar(id: string) {
    try {
      const result = await archivarDemandaComprador(compradorId, id);
      raiseActionError(result);
      setDemandas(result.demandas);
      toast.success("Demanda archivada");
    } catch (err) {
      toast.error("No se pudo archivar", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function borrar(id: string) {
    if (!window.confirm("¿Borrar esta demanda?")) return;
    try {
      const result = await borrarDemandaComprador(compradorId, id);
      raiseActionError(result);
      setDemandas(result.demandas);
      toast.success("Demanda borrada");
    } catch (err) {
      toast.error("No se pudo borrar", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function marcar(id: string, estado: EstadoOportunidad) {
    setMarcando(id);
    try {
      const result = await marcarOportunidadEstado(id, estado);
      raiseActionError(result);
      setOportunidades((prev) => prev.map((item) => (item.id === id ? { ...item, estado } : item)));
      toast.success(estado === "interesado" ? "Marcada como interesado" : "Oportunidad descartada");
    } catch (err) {
      toast.error("No se pudo actualizar", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setMarcando(null);
    }
  }

  const extras = categorias.filter((categoria) => (
    !CATALOGO_CATEGORIAS.some((item) => item.toLowerCase() === categoria.toLowerCase())
  ));

  if (loading) {
    return (
      <div className="mb-4 flex items-center justify-center rounded-lg border border-border bg-white py-8">
        <Loader2 size={22} className="animate-spin text-gold" />
      </div>
    );
  }

  return (
    <div className="mb-4 flex flex-col gap-4" data-testid="demanda-bloque">
      {error ? (
        <p className="rounded-lg border border-red/20 bg-red/5 px-3 py-2 text-sm text-red" role="alert">{error}</p>
      ) : null}

      <section className="rounded-lg border border-border bg-white p-5 shadow-sm">
        <h2 className="mb-1 text-[10px] font-semibold uppercase tracking-[1.5px] text-gold">Demanda</h2>
        <p className="mb-4 text-xs text-muted">
          Categoría, provincia y población de interés. El cruce ofrece primero población, luego provincia y, si no hay, la ubicación sin categoría.
        </p>
        <div className="mb-3 flex flex-wrap gap-2">
          {CATALOGO_CATEGORIAS.map((categoria) => {
            const activa = categorias.some((item) => item.toLowerCase() === categoria.toLowerCase());
            return (
              <button
                key={categoria}
                type="button"
                aria-pressed={activa}
                onClick={() => toggleCategoria(categoria)}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  activa ? "border-navy bg-navy text-white" : "border-border bg-cream2 text-navy"
                }`}
              >
                {categoria}
              </button>
            );
          })}
          {extras.map((categoria) => (
            <button
              key={categoria}
              type="button"
              aria-pressed
              onClick={() => toggleCategoria(categoria)}
              className="rounded-full border border-navy bg-navy px-3 py-1 text-xs font-medium text-white"
            >
              {categoria}
            </button>
          ))}
        </div>
        <div className="mb-3 flex gap-2">
          <label className="sr-only" htmlFor={`categoria-extra-${compradorId}`}>Otra categoría</label>
          <input
            id={`categoria-extra-${compradorId}`}
            value={extraCategoria}
            onChange={(event) => setExtraCategoria(event.target.value)}
            placeholder="Otra categoría (p. ej. OCUPADO)"
            className="flex-1 rounded-md border border-border bg-cream2 px-2.5 py-2 text-sm outline-none focus:border-navy"
          />
          <button
            type="button"
            onClick={agregarExtra}
            className="rounded-md border border-border px-3 py-2 text-xs font-medium text-navy hover:bg-cream"
          >
            Añadir
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Provincias" value={provincias} onChange={setProvincias} placeholder="Madrid, Málaga" />
          <Campo label="Poblaciones" value={poblaciones} onChange={setPoblaciones} placeholder="Getafe, Marbella" />
          <Campo label="Precio mínimo (€)" value={precioMin} onChange={setPrecioMin} placeholder="Opcional" />
          <Campo label="Precio máximo (€)" value={precioMax} onChange={setPrecioMax} placeholder="Opcional" />
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={() => void guardar()}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-md bg-gold px-3 py-1.5 text-xs font-medium text-white hover:bg-gold2 disabled:opacity-50"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            Guardar demanda
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-white p-5 shadow-sm" data-testid="demandas-guardadas">
        <h2 className="mb-1 text-[10px] font-semibold uppercase tracking-[1.5px] text-gold">Demandas guardadas</h2>
        <p className="mb-3 text-xs text-muted">
          Cada guardado crea una demanda. El cruce usa todas las que están activas.
        </p>
        {avisoGuardada ? (
          <p className="mb-3 rounded-md border border-green/30 bg-green/5 px-3 py-2 text-sm font-medium text-navy" role="status">
            {avisoGuardada}
          </p>
        ) : null}
        {demandas.length === 0 ? (
          <p className="text-sm text-muted">Todavía no hay demandas guardadas.</p>
        ) : (
          <ul className="divide-y divide-border">
            {demandas.map((demanda) => (
              <li key={demanda.id ?? demanda.createdAt} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div>
                  <p className="text-sm text-navy">{resumenDemanda(demanda)}</p>
                  <p className="text-xs text-muted">
                    {formatCommentTimestamp(demanda.createdAt) ?? "—"}
                    {" · "}
                    {demanda.autor || "Gestor"}
                    {" · "}
                    {demanda.estado === "archivada" ? "Archivada" : "Activa"}
                  </p>
                </div>
                <div className="flex gap-2">
                  {demanda.estado !== "archivada" && demanda.id ? (
                    <button
                      type="button"
                      onClick={() => void archivar(demanda.id as string)}
                      className="rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-navy"
                    >
                      Archivar
                    </button>
                  ) : null}
                  {demanda.id ? (
                    <button
                      type="button"
                      onClick={() => void borrar(demanda.id as string)}
                      className="rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-red"
                    >
                      Borrar
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-border bg-white p-5 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[10px] font-semibold uppercase tracking-[1.5px] text-gold">
            Oportunidades ({oportunidades.length})
          </h2>
          {modo === "staff" ? (
            <button
              type="button"
              onClick={() => void buscar()}
              disabled={buscando}
              className="flex items-center gap-1.5 rounded-md bg-navy px-3 py-1.5 text-xs font-medium text-white hover:bg-navy3 disabled:opacity-50"
            >
              {buscando ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
              Buscar oportunidades ahora
            </button>
          ) : null}
        </div>

        {preview ? (
          <div className="mb-4 rounded-md border border-gold/40 bg-gold/5 p-3" data-testid="preview-oportunidades">
            <p className="mb-2 text-xs font-medium text-navy">
              {preview.length === 0
                ? "No hay activos nuevos para esta demanda."
                : `Previsualización${previewNivel ? ` · ${previewNivel}` : ""} (${preview.length})`}
            </p>
            <ul className="mb-3 space-y-1 text-sm text-text">
              {preview.map((ficha) => (
                <li key={ficha.url}>
                  {ficha.titulo} · {ficha.lugar}
                  {ficha.precioLabel ? ` · ${ficha.precioLabel}` : ""}
                </li>
              ))}
            </ul>
            {preview.length > 0 ? (
              <button
                type="button"
                onClick={() => void registrar()}
                disabled={registrando}
                className="rounded-md bg-gold px-3 py-1.5 text-xs font-medium text-white hover:bg-gold2 disabled:opacity-50"
              >
                {registrando ? "Registrando…" : "Registrar estas oportunidades"}
              </button>
            ) : null}
          </div>
        ) : null}

        {oportunidades.length === 0 ? (
          <p className="text-sm text-muted">Todavía no hay oportunidades ofrecidas.</p>
        ) : (
          <ul className="divide-y divide-border">
            {oportunidades.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium text-navy">{item.titulo}</p>
                  <p className="text-xs text-muted">
                    {item.lugar || "Sin ubicación"}
                    {item.precioLabel ? ` · ${item.precioLabel}` : ""}
                    {" · "}
                    {ETIQUETA_NIVEL[item.nivel]}
                    {" · "}
                    {ETIQUETA_ESTADO_OPORTUNIDAD[item.estado]}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {item.hrefPrivado && modo === "portal" ? (
                    <Link href={item.hrefPrivado} className="text-xs font-medium text-navy hover:underline">
                      Ver ficha
                    </Link>
                  ) : null}
                  {item.hrefPublico && modo === "staff" ? (
                    <a href={item.hrefPublico} className="text-xs font-medium text-navy hover:underline" target="_blank" rel="noreferrer">
                      Ficha pública
                    </a>
                  ) : null}
                  {modo === "portal" && item.estado !== "interesado" ? (
                    <button
                      type="button"
                      disabled={marcando === item.id}
                      onClick={() => void marcar(item.id, "interesado")}
                      className="rounded-md bg-navy px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-50"
                    >
                      Me interesa
                    </button>
                  ) : null}
                  {item.estado !== "descartada" ? (
                    <button
                      type="button"
                      disabled={marcando === item.id}
                      onClick={() => void marcar(item.id, "descartada")}
                      className="rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-navy disabled:opacity-50"
                    >
                      Descartar
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function resumenDemanda(demanda: DemandaComprador): string {
  const partes = [
    demanda.categorias.join(", ") || "Sin categoría",
    demanda.provincias.join(", "),
    demanda.poblaciones.join(", "),
  ].filter(Boolean);
  const min = demanda.precioMin != null ? `desde ${demanda.precioMin.toLocaleString("es-ES")} €` : "";
  const max = demanda.precioMax != null ? `hasta ${demanda.precioMax.toLocaleString("es-ES")} €` : "";
  const precio = [min, max].filter(Boolean).join(" ");
  return [partes.join(" · "), precio].filter(Boolean).join(" · ");
}

function Campo({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const id = label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</label>
      <input
        id={id}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-md border border-border bg-cream2 px-2.5 py-2 text-sm outline-none focus:border-navy focus:bg-white"
      />
    </div>
  );
}
