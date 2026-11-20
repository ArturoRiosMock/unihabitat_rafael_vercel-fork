"use server";

import { actionError, type ActionResult } from "@/lib/action-result";
import {
  mensajeReferenciaDuplicada,
  normalizarReferenciaActivo,
  precargaDesdeCatastro,
  referenciaDuplicada,
  validarAltaActivo,
  type AltaActivoInput,
  type PrecargaCatastro,
} from "@/lib/activo-manual";
import { requireAdmin } from "@/lib/auth-server";
import { isPlausibleCadastralRef, normalizeCadastralRef, fetchConsultaDnprc } from "@/lib/catastro/dnp";
import { catastroParsedToPartialAsset } from "@/lib/catastro/to-partial-asset";
import { buildPublicSlug } from "@/lib/public-slug";
import { assetToRow } from "@/lib/supabase/db";
import { createServiceClient } from "@/lib/supabase/server";
import type { Asset } from "@/lib/types";

function assetDesdeAlta(alta: ReturnType<typeof validarAltaActivo> & { ok: true }, publicSlug: string): Asset {
  const datos = alta.activo;
  return {
    id: datos.id,
    referencia: datos.referencia,
    publicSlug,
    prov: datos.provincia,
    pob: datos.municipio,
    cp: datos.cp,
    addr: datos.direccion,
    tip: datos.tipo,
    tipC: "",
    precio: datos.precio,
    fav: false,
    chk: false,
    sqm: datos.superficie,
    tvia: "",
    nvia: "",
    num: "",
    esc: "",
    pla: "",
    pta: "",
    map: "",
    clase: "",
    uso: "",
    bien: "",
    supC: datos.superficie != null ? `${datos.superficie} m²` : "",
    supG: "",
    coef: "",
    ccaa: "",
    fullAddr: datos.direccion,
    desc: datos.descripcion,
    pub: datos.publicado,
    publishedAt: datos.publicado ? new Date().toISOString() : null,
    propiedades: [],
  };
}

/** Consulta el catastro y devuelve campos para el formulario. No guarda el activo. */
export async function precargarCatastroActivo(
  referencia: string,
): Promise<ActionResult<{ precarga: PrecargaCatastro }>> {
  try {
    await requireAdmin();
    const limpia = normalizarReferenciaActivo(referencia);
    if (!isPlausibleCadastralRef(limpia)) {
      return { ok: false, error: "La referencia catastral no tiene un formato reconocible" };
    }
    const row = await fetchConsultaDnprc(normalizeCadastralRef(limpia));
    if (row.error) return { ok: false, error: row.error };
    const partial = catastroParsedToPartialAsset(row, "");
    return { ok: true, precarga: precargaDesdeCatastro(partial) };
  } catch (err) {
    return actionError(err, "No se pudo consultar el catastro");
  }
}

/**
 * Da de alta un activo y su carga en borrador, salvo que se active.
 * Solo el admin. Tras crearlo, la ficha admite las mismas fotos y documentos.
 */
export async function crearActivoManual(
  input: AltaActivoInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requireAdmin();
    const plan = validarAltaActivo(input);
    if (!plan.ok) return plan;

    const sb = await createServiceClient();
    const [{ data: porId, error: errorId }, { data: porRef, error: errorRef }] = await Promise.all([
      sb.from("assets").select("id, referencia").eq("id", plan.activo.id).maybeSingle(),
      sb.from("assets").select("id, referencia").eq("referencia", plan.activo.referencia).limit(5),
    ]);
    if (errorId) return { ok: false, error: errorId.message };
    if (errorRef) return { ok: false, error: errorRef.message };
    const existentes = [
      ...(porId ? [porId as { id: string; referencia: string }] : []),
      ...((porRef ?? []) as Array<{ id: string; referencia: string }>),
    ];
    if (referenciaDuplicada(existentes, plan.activo.referencia)) {
      return { ok: false, error: mensajeReferenciaDuplicada() };
    }

    let publicSlug = buildPublicSlug({
      id: plan.activo.id,
      tip: plan.activo.tipo,
      pob: plan.activo.municipio,
    });
    const { data: slugTomado, error: slugError } = await sb
      .from("assets")
      .select("id")
      .eq("public_slug", publicSlug)
      .maybeSingle();
    if (slugError) return { ok: false, error: slugError.message };
    if (slugTomado) {
      publicSlug = buildPublicSlug(
        { id: plan.activo.id, tip: plan.activo.tipo, pob: plan.activo.municipio },
        new Set([publicSlug]),
      );
    }

    const asset = assetDesdeAlta(plan, publicSlug);
    const row = assetToRow(asset);
    if (plan.activo.publicado) row.published_at = new Date().toISOString();
    const { error: insertAsset } = await sb.from("assets").insert(row);
    if (insertAsset) {
      if (insertAsset.code === "23505") return { ok: false, error: mensajeReferenciaDuplicada() };
      return { ok: false, error: insertAsset.message };
    }

    const { error: insertCarga } = await sb.from("propiedades").insert({
      id: `${plan.activo.id}__manual`,
      inmueble_id: plan.activo.id,
      activo_id: plan.activo.id,
      categoria: plan.activo.tipo,
      propietario: plan.activo.propietario,
      contacto: plan.activo.contacto,
      telefono: plan.activo.telefono,
      mail: plan.activo.mail,
      fase_interna: plan.activo.situacion,
      fase_c: plan.activo.faseCodigo,
      proceso: plan.activo.proceso,
      deuda: plan.activo.deuda,
      tipologia: plan.activo.tipo,
    });
    if (insertCarga) {
      await sb.from("assets").delete().eq("id", plan.activo.id);
      return { ok: false, error: insertCarga.message };
    }

    return { ok: true, id: plan.activo.id };
  } catch (err) {
    return actionError(err, "No se pudo crear el activo");
  }
}
