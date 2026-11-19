"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/send";
import { EMAIL_SUPPORT } from "@/lib/email/resend";
import { offerTemplate } from "@/lib/email/templates";
import { getServerSession, requireAdminOrVendor } from "@/lib/auth-server";
import { displayCommentAuthor } from "@/lib/comment-author";
import { canReadComprador, eventoRenuevaGestion } from "@/lib/comprador-gestion";
import { fetchAssignedVendedorId, touchUltimaGestionAgente } from "@/lib/comprador-gestion-run";
import { fetchCompradorByEmail } from "@/app/actions/compradores";
import {
  datosFirmaFromRow,
  mergeDatosFirma,
  nombreCompleto,
  patchDatosFirma,
  validarDatosFirma,
  type DatosFirma,
} from "@/lib/comprador-oferta";
import type { UserSession } from "@/lib/permissions";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface OfertaRow {
  id: string;
  comprador_id: string | null;
  vendedor_id: string | null;
  asset_id: string;
  propuesta_euros: number;
  comentarios: string | null;
  /** Nombre visible del comentario. El admin llega como «Gestor». */
  comentarios_author?: string | null;
  comentarios_author_role?: string | null;
  estado: "pendiente" | "validada" | "rechazada" | "nda_enviado" | "nda_firmado";
  nda_enviado_at: string | null;
  nda_firmado_at: string | null;
  created_at: string;
  updated_at: string;
}

function commentAttribution(session: UserSession | null, comentarios: string | null): {
  comentarios_author: string | null;
  comentarios_author_role: string | null;
} {
  if (!comentarios) {
    return { comentarios_author: null, comentarios_author_role: null };
  }
  return {
    comentarios_author: session?.nombre?.trim() || null,
    comentarios_author_role: session?.role ?? null,
  };
}

function presentOferta(row: OfertaRow): OfertaRow {
  if (!row.comentarios) return row;
  return {
    ...row,
    comentarios_author: displayCommentAuthor({
      author: row.comentarios_author,
      authorRole: row.comentarios_author_role,
    }),
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const FIRMA_COLUMNS =
  "nombre, apellidos, tipo_persona, razon_social, documento, direccion, cp, poblacion, provincia, pais, tel, email";

/**
 * La oferta con comprador no se envía si faltan datos de firma.
 * Lo que el formulario complete se guarda en la ficha antes del insert.
 */
async function exigirDatosFirma(
  sb: SupabaseClient,
  compradorId: string,
  datos: DatosFirma | undefined,
): Promise<void> {
  const { data, error } = await sb
    .from("compradores")
    .select(FIRMA_COLUMNS)
    .eq("id", compradorId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Comprador no encontrado");

  const stored = datosFirmaFromRow(data);
  const merged = mergeDatosFirma(stored, datos);
  const check = validarDatosFirma(merged);
  if (!check.ok) throw new Error(check.error);

  const patch = patchDatosFirma(stored, check.datos);
  if (Object.keys(patch).length === 0) return;
  const { error: updateError } = await sb.from("compradores").update(patch).eq("id", compradorId);
  if (updateError) throw new Error(updateError.message);
}

async function notifyOfferRecipients(
  ofertaId: string,
  assetId: string,
  compradorId: string | null,
  propuestaEuros: number,
  comentarios: string | null,
  vendedorId?: string | null,
): Promise<void> {
  try {
    const sb = await createServiceClient();
    const [{ data: assetRow }, { data: compRow }, { data: vendRow }, { data: vaRows }] =
      await Promise.all([
        sb.from("assets")
          .select("id, full_addr, addr, pob, prov, cp, tip, precio, owner_mail")
          .eq("id", assetId)
          .maybeSingle(),
        compradorId
          ? sb.from("compradores").select(FIRMA_COLUMNS).eq("id", compradorId).maybeSingle()
          : Promise.resolve({ data: null }),
        vendedorId
          ? sb.from("vendedores").select("nombre, email").eq("id", vendedorId).maybeSingle()
          : Promise.resolve({ data: null }),
        sb.from("vendedor_assets").select("vendedor_id").eq("asset_id", assetId),
      ]);

    const vendorIds = (vaRows ?? []).map(r => r.vendedor_id as string).filter(Boolean);
    let vendorEmails: string[] = [];
    if (vendorIds.length > 0) {
      const { data: vRows } = await sb
        .from("vendedores")
        .select("email")
        .in("id", vendorIds);
      vendorEmails = (vRows ?? [])
        .map(r => (r.email as string | undefined)?.trim() ?? "")
        .filter(e => EMAIL_RE.test(e));
    }

    const ownerMail = (assetRow?.owner_mail as string | undefined)?.trim() ?? "";
    if (vendorEmails.length === 0 && EMAIL_RE.test(ownerMail)) {
      vendorEmails = [ownerMail];
    }

    const recipients = vendorEmails.length > 0 ? vendorEmails : [EMAIL_SUPPORT];

    const buyerEmail = (compRow?.email as string | undefined)?.trim()
      ?? (vendRow?.email as string | undefined)?.trim()
      ?? "";
    const buyerNombre = compRow
      ? nombreCompleto(compRow.nombre as string | undefined, compRow.apellidos as string | undefined)
      : ((vendRow?.nombre as string | undefined) ?? (vendedorId ? "Agente" : "Comprador"));
    const domicilio = compRow
      ? [
          compRow.direccion,
          [compRow.cp, compRow.poblacion].filter(Boolean).join(" "),
          compRow.provincia,
          compRow.pais,
        ].filter((part) => typeof part === "string" && part.trim()).join(", ")
      : "";

    const tpl = offerTemplate({
      buyer: {
        nombre: buyerNombre || (vendedorId ? "Agente" : "Comprador"),
        email: buyerEmail,
        telefono: (compRow?.tel as string | undefined) || undefined,
        documento: (compRow?.documento as string | undefined) || undefined,
        direccion: domicilio || undefined,
        tipoPersona: compRow?.tipo_persona === "juridica" ? "Persona jurídica" : compRow ? "Persona física" : undefined,
        razonSocial: (compRow?.razon_social as string | undefined) || undefined,
      },
      asset: {
        id: (assetRow?.id as string | undefined) ?? assetId,
        fullAddr: (assetRow?.full_addr as string | undefined) ?? undefined,
        addr: (assetRow?.addr as string | undefined) ?? undefined,
        pob: (assetRow?.pob as string | undefined) ?? undefined,
        prov: (assetRow?.prov as string | undefined) ?? undefined,
        cp: (assetRow?.cp as string | undefined) ?? undefined,
        tip: (assetRow?.tip as string | undefined) ?? undefined,
        precio: (assetRow?.precio as number | null | undefined) ?? null,
      },
      propuestaEuros,
      comentarios: comentarios || undefined,
      ofertaId,
    });

    const subject = vendorEmails.length === 0 ? `${tpl.subject} [Sin vendedor asignado]` : tpl.subject;
    await sendEmail({
      to: recipients,
      subject,
      html: tpl.html,
      text: tpl.text,
      replyTo: EMAIL_RE.test(buyerEmail) ? buyerEmail : undefined,
    });
  } catch (err) {
    console.error("[ofertas] email notification failed:", err);
  }
}

export async function createOferta(params: {
  compradorId: string;
  assetId: string;
  propuestaEuros: number;
  comentarios?: string;
  datos?: DatosFirma;
}): Promise<OfertaRow> {
  const session = await getServerSession();
  if (!session?.email) throw new Error("Acceso denegado: se requiere autenticación");
  const comentarios = params.comentarios?.trim() || null;
  const service = await createServiceClient();
  const { data: dueno, error: duenoErr } = await service
    .from("compradores")
    .select("email")
    .eq("id", params.compradorId)
    .maybeSingle();
  if (duenoErr) throw new Error(duenoErr.message);
  if (!dueno) throw new Error("Comprador no encontrado");
  if ((dueno.email as string).trim().toLowerCase() !== session.email.trim().toLowerCase()) {
    throw new Error("Acceso denegado: no puedes presentar esta oferta");
  }
  await exigirDatosFirma(service, params.compradorId, params.datos);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ofertas")
    .insert({
      comprador_id: params.compradorId,
      asset_id: params.assetId,
      propuesta_euros: params.propuestaEuros,
      comentarios,
      ...commentAttribution(session, comentarios),
      estado: "pendiente",
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  const oferta = presentOferta(data as OfertaRow);
  await notifyOfferRecipients(
    oferta.id,
    oferta.asset_id,
    oferta.comprador_id,
    oferta.propuesta_euros,
    oferta.comentarios,
    oferta.vendedor_id,
  );
  return oferta;
}

/**
 * Alta de oferta desde admin/vendedor (ficha del activo).
 * Agente: se asigna a session.vendedorId (sin comprador).
 * Admin: requiere compradorId.
 */
export async function createOfertaAdmin(params: {
  compradorId?: string;
  assetId: string;
  propuestaEuros: number;
  comentarios?: string;
  datos?: DatosFirma;
}): Promise<OfertaRow> {
  const session = await requireAdminOrVendor();

  const assetId = params.assetId?.trim();
  const propuesta = Number(params.propuestaEuros);

  if (!assetId) throw new Error("Falta el activo");
  if (!Number.isFinite(propuesta) || propuesta <= 0) {
    throw new Error("El importe debe ser un número mayor que 0");
  }

  const supabase = await createServiceClient();

  const { data: assetRow, error: assetErr } = await supabase
    .from("assets")
    .select("id")
    .eq("id", assetId)
    .maybeSingle();
  if (assetErr) throw new Error(assetErr.message);
  if (!assetRow) throw new Error("Activo no encontrado");

  let compradorId: string | null = null;
  let vendedorId: string | null = null;

  if (session.role === "vendedor") {
    if (!session.vendedorId) {
      throw new Error("El agente no tiene una fila vendedores asociada. Contacte al administrador.");
    }
    vendedorId = session.vendedorId;
    const { data: vendRow, error: vendErr } = await supabase
      .from("vendedores")
      .select("id")
      .eq("id", vendedorId)
      .maybeSingle();
    if (vendErr) throw new Error(vendErr.message);
    if (!vendRow) {
      throw new Error("La fila vendedores del agente no existe en la base de datos. Contacte al administrador.");
    }
    const requested = params.compradorId?.trim() || "";
    if (requested) {
      const assigned = await fetchAssignedVendedorId(supabase, requested);
      if (
        !eventoRenuevaGestion({
          evento: "oferta",
          actor: { role: "vendedor", vendedorId },
          assignedVendedorId: assigned,
          compradorId: requested,
        })
      ) {
        throw new Error("Solo puedes registrar ofertas de compradores que gestionas");
      }
      compradorId = requested;
    }
  } else {
    compradorId = params.compradorId?.trim() || null;
    if (!compradorId) throw new Error("Selecciona un comprador");
    const { data: compRow, error: compErr } = await supabase
      .from("compradores")
      .select("id")
      .eq("id", compradorId)
      .maybeSingle();
    if (compErr) throw new Error(compErr.message);
    if (!compRow) throw new Error("Comprador no encontrado");
  }

  if (compradorId) {
    await exigirDatosFirma(supabase, compradorId, params.datos);
  }

  const comentarios = params.comentarios?.trim() || null;
  const { data, error } = await supabase
    .from("ofertas")
    .insert({
      comprador_id: compradorId,
      vendedor_id: vendedorId,
      asset_id: assetId,
      propuesta_euros: propuesta,
      comentarios,
      ...commentAttribution(session, comentarios),
      estado: "pendiente",
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  const oferta = presentOferta(data as OfertaRow);
  if (
    oferta.comprador_id &&
    eventoRenuevaGestion({
      evento: "oferta",
      actor: { role: session.role, vendedorId: session.vendedorId ?? null },
      assignedVendedorId: session.vendedorId ?? null,
      compradorId: oferta.comprador_id,
    })
  ) {
    await touchUltimaGestionAgente(supabase, oferta.comprador_id);
  }
  await notifyOfferRecipients(
    oferta.id,
    oferta.asset_id,
    oferta.comprador_id,
    oferta.propuesta_euros,
    oferta.comentarios,
    oferta.vendedor_id,
  );
  return oferta;
}

export async function fetchOfertasByAsset(assetId: string): Promise<OfertaRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ofertas")
    .select("*")
    .eq("asset_id", assetId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as OfertaRow[]).map(presentOferta);
}

export async function fetchOfertasByComprador(compradorId: string): Promise<OfertaRow[]> {
  const session = await getServerSession();
  if (!session || (session.role !== "admin" && session.role !== "vendedor")) {
    throw new Error("Acceso denegado");
  }
  const supabase = await createServiceClient();
  const assigned = await fetchAssignedVendedorId(supabase, compradorId);
  if (
    !canReadComprador(
      { role: session.role, vendedorId: session.vendedorId ?? null },
      assigned,
    )
  ) {
    throw new Error("Solo el agente asignado puede ver este comprador");
  }
  const { data, error } = await supabase
    .from("ofertas")
    .select("*")
    .eq("comprador_id", compradorId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as OfertaRow[]).map(presentOferta);
}

export async function fetchOfertasPendientes(): Promise<OfertaRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ofertas")
    .select("*")
    .in("estado", ["pendiente", "nda_enviado"])
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as OfertaRow[]).map(presentOferta);
}

/**
 * Ofertas para el panel admin/vendedor.
 * Admin: ve todas. Vendedor: solo las que tienen su vendedor_id.
 * Filtro opcional por estado.
 */
export async function fetchOfertas(estado?: OfertaRow["estado"] | ""): Promise<OfertaRow[]> {
  const session = await getServerSession();
  const supabase = await createClient();
  let q = supabase.from("ofertas").select("*").order("created_at", { ascending: false });

  if (session?.role === "vendedor" && session.vendedorId) {
    q = q.eq("vendedor_id", session.vendedorId);
  }

  if (estado) q = q.eq("estado", estado);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data ?? []) as OfertaRow[]).map(presentOferta);
}

export async function updateOfertaEstado(
  ofertaId: string,
  estado: OfertaRow["estado"]
): Promise<void> {
  await requireAdminOrVendor();
  const serviceClient = await createServiceClient();
  const updateData: Partial<OfertaRow> = { estado, updated_at: new Date().toISOString() };
  if (estado === "nda_enviado") {
    updateData.nda_enviado_at = new Date().toISOString();
  } else if (estado === "nda_firmado") {
    updateData.nda_firmado_at = new Date().toISOString();
  }
  const { error } = await serviceClient
    .from("ofertas")
    .update(updateData)
    .eq("id", ofertaId);
  if (error) throw new Error(error.message);
}

export async function firmarNDA(ofertaId: string): Promise<void> {
  const session = await getServerSession();
  if (!session?.email) {
    throw new Error("Acceso denegado: se requiere autenticación");
  }
  if (session.role === "admin" || session.role === "vendedor") {
    throw new Error("Acceso denegado: acción reservada al comprador");
  }

  const comprador = await fetchCompradorByEmail(session.email);
  if (!comprador) {
    throw new Error("Comprador no encontrado");
  }

  const supabase = await createClient();
  const { data: oferta, error: fetchErr } = await supabase
    .from("ofertas")
    .select("comprador_id, asset_id, estado")
    .eq("id", ofertaId)
    .maybeSingle();
  if (fetchErr) throw new Error(fetchErr.message);
  if (!oferta) throw new Error("Oferta no encontrada");
  if (oferta.comprador_id !== comprador.id) {
    throw new Error("Acceso denegado: no puedes firmar esta oferta");
  }
  if (oferta.estado !== "nda_enviado") {
    throw new Error("Esta oferta no está pendiente de firma de NDA");
  }

  const { error } = await supabase
    .from("ofertas")
    .update({
      estado: "nda_firmado",
      nda_firmado_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", ofertaId);
  if (error) throw new Error(error.message);

  // Sincroniza flag NDA del comprador (no automatiza acceso al portal).
  if (oferta?.comprador_id) {
    const service = await createServiceClient();
    await service
      .from("compradores")
      .update({ nda: "Firmada" })
      .eq("id", oferta.comprador_id);

    if (oferta.asset_id) {
      await service
        .from("oportunidades")
        .update({ estado: "contactada", updated_at: new Date().toISOString() })
        .eq("comprador_id", oferta.comprador_id)
        .eq("asset_id", oferta.asset_id);
    }
  }
}
