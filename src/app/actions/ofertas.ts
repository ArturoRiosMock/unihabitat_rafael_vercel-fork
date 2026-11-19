"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/send";
import { EMAIL_SUPPORT } from "@/lib/email/resend";
import { offerTemplate } from "@/lib/email/templates";
import { getServerSession, requireAdminOrVendor, requireAssetAccess } from "@/lib/auth-server";
import { displayCommentAuthor } from "@/lib/comment-author";
import { canReadComprador, eventoRenuevaGestion } from "@/lib/comprador-gestion";
import { fetchAssignedVendedorId, touchUltimaGestionAgente } from "@/lib/comprador-gestion-run";
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
import {
  authorHistorial,
  esOfertaEstado,
  mensajeErrorOferta,
  MENSAJE_OFERTA_AGENTE_DUPLICADA,
  MENSAJE_OFERTA_DUPLICADA,
  puedeVerOferta,
  validarCambioOferta,
  type CambioOfertaInput,
  type OfertaEstado,
  type OfertaHistorialRow,
  type OfertaRow,
} from "@/lib/oferta-workflow";

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

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asNumberOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function presentOferta(row: OfertaRow): OfertaRow {
  const presented: OfertaRow = {
    ...row,
    propuesta_euros: asNumber(row.propuesta_euros),
    fecha_firma: row.fecha_firma ?? null,
    contraoferta_nota: row.contraoferta_nota ?? null,
  };
  if (!presented.comentarios) return presented;
  return {
    ...presented,
    comentarios_author: displayCommentAuthor({
      author: row.comentarios_author,
      authorRole: row.comentarios_author_role,
    }),
  };
}

function presentHistorial(row: OfertaHistorialRow): OfertaHistorialRow {
  return {
    ...row,
    importe_anterior: asNumberOrNull(row.importe_anterior),
    importe_nuevo: asNumberOrNull(row.importe_nuevo),
    author: displayCommentAuthor({ author: row.author, authorRole: row.author_role }),
  };
}

function throwOfertaWriteError(error: { code?: string; message: string; details?: string | null }): never {
  throw new Error(mensajeErrorOferta(error));
}

async function assertSinDuplicado(
  sb: SupabaseClient,
  compradorId: string | null,
  vendedorId: string | null,
  assetId: string,
): Promise<void> {
  if (compradorId) {
    const { data, error } = await sb
      .from("ofertas")
      .select("id")
      .eq("comprador_id", compradorId)
      .eq("asset_id", assetId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) throw new Error(MENSAJE_OFERTA_DUPLICADA);
    return;
  }
  if (!vendedorId) return;
  const { data, error } = await sb
    .from("ofertas")
    .select("id")
    .eq("vendedor_id", vendedorId)
    .eq("asset_id", assetId)
    .is("comprador_id", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) throw new Error(MENSAJE_OFERTA_AGENTE_DUPLICADA);
}

async function insertHistorial(
  sb: SupabaseClient,
  row: {
    oferta_id: string;
    estado_desde: string | null;
    estado_hasta: string;
    importe_anterior: number | null;
    importe_nuevo: number | null;
    nota: string | null;
    author: string;
    author_role: string;
  },
): Promise<void> {
  const { error } = await sb.from("oferta_historial").insert(row);
  if (error) throw new Error(error.message);
}

async function adjuntarHistorial(sb: SupabaseClient, rows: OfertaRow[]): Promise<OfertaRow[]> {
  const presentadas = rows.map(presentOferta);
  if (presentadas.length === 0) return [];
  const ids = presentadas.map((row) => row.id);
  const { data, error } = await sb
    .from("oferta_historial")
    .select("*")
    .in("oferta_id", ids)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  const byOferta = new Map<string, OfertaHistorialRow[]>();
  for (const raw of data ?? []) {
    const item = presentHistorial(raw as OfertaHistorialRow);
    const list = byOferta.get(item.oferta_id) ?? [];
    list.push(item);
    byOferta.set(item.oferta_id, list);
  }
  return presentadas.map((row) => ({ ...row, historial: byOferta.get(row.id) ?? [] }));
}

async function assertPuedeGestionarOferta(
  session: UserSession,
  sb: SupabaseClient,
  oferta: OfertaRow,
): Promise<void> {
  let asignado: string | null = null;
  if (session.role === "vendedor" && oferta.comprador_id) {
    asignado = await fetchAssignedVendedorId(sb, oferta.comprador_id);
  }
  const visible = puedeVerOferta({
    role: session.role,
    vendedorId: session.vendedorId ?? null,
    compradorAsignadoA: asignado,
    ofertaVendedorId: oferta.vendedor_id,
    ofertaCompradorId: oferta.comprador_id,
  });
  if (!visible) {
    throw new Error("Solo puedes gestionar las ofertas de tus compradores");
  }
}

async function asignacionDeCompradores(
  sb: SupabaseClient,
  compradorIds: string[],
): Promise<Map<string, string | null>> {
  const asignacion = new Map<string, string | null>();
  for (const id of compradorIds) asignacion.set(id, null);
  if (compradorIds.length === 0) return asignacion;
  const { data, error } = await sb
    .from("vendedor_compradores")
    .select("comprador_id, vendedor_id, assigned_at")
    .in("comprador_id", compradorIds)
    .order("assigned_at", { ascending: false });
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    const compradorId = row.comprador_id as string;
    if (asignacion.get(compradorId)) continue;
    asignacion.set(compradorId, row.vendedor_id as string);
  }
  return asignacion;
}

function ofertaVisibleParaSesion(
  session: UserSession,
  oferta: OfertaRow,
  asignacion: Map<string, string | null>,
): boolean {
  return puedeVerOferta({
    role: session.role,
    vendedorId: session.vendedorId ?? null,
    compradorAsignadoA: oferta.comprador_id ? (asignacion.get(oferta.comprador_id) ?? null) : null,
    ofertaVendedorId: oferta.vendedor_id,
    ofertaCompradorId: oferta.comprador_id,
  });
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
  await assertSinDuplicado(service, params.compradorId, null, params.assetId);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ofertas")
    .insert({
      comprador_id: params.compradorId,
      asset_id: params.assetId,
      propuesta_euros: params.propuestaEuros,
      comentarios,
      ...commentAttribution(session, comentarios),
      estado: "realizada",
    })
    .select()
    .single();
  if (error) throwOfertaWriteError(error);

  const oferta = presentOferta(data as OfertaRow);
  const author = authorHistorial(session);
  await insertHistorial(service, {
    oferta_id: oferta.id,
    estado_desde: null,
    estado_hasta: "realizada",
    importe_anterior: null,
    importe_nuevo: oferta.propuesta_euros,
    nota: null,
    author: author.author,
    author_role: author.author_role,
  });
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

  await assertSinDuplicado(supabase, compradorId, vendedorId, assetId);

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
      estado: "realizada",
    })
    .select()
    .single();
  if (error) throwOfertaWriteError(error);

  const author = authorHistorial(session);
  await insertHistorial(supabase, {
    oferta_id: (data as OfertaRow).id,
    estado_desde: null,
    estado_hasta: "realizada",
    importe_anterior: null,
    importe_nuevo: propuesta,
    nota: null,
    author: author.author,
    author_role: author.author_role,
  });

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

async function leerOfertas(
  sb: SupabaseClient,
  session: UserSession,
  filtro: { estado?: OfertaEstado | ""; assetId?: string },
): Promise<OfertaRow[]> {
  let query = sb.from("ofertas").select("*").order("created_at", { ascending: false });
  if (filtro.assetId) query = query.eq("asset_id", filtro.assetId);
  if (filtro.estado && esOfertaEstado(filtro.estado)) query = query.eq("estado", filtro.estado);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as OfertaRow[];
  if (session.role === "admin") return adjuntarHistorial(sb, rows);

  const compradorIds = [...new Set(rows.map((row) => row.comprador_id).filter((id): id is string => !!id))];
  const asignacion = await asignacionDeCompradores(sb, compradorIds);
  const visibles = rows.filter((row) => ofertaVisibleParaSesion(session, row, asignacion));
  return adjuntarHistorial(sb, visibles);
}

export async function fetchOfertasByAsset(assetId: string): Promise<OfertaRow[]> {
  const session = await requireAdminOrVendor();
  const id = assetId.trim();
  if (!id) return [];
  await requireAssetAccess(session, id);
  const supabase = await createServiceClient();
  return leerOfertas(supabase, session, { assetId: id });
}

export async function fetchOfertasByComprador(compradorId: string): Promise<OfertaRow[]> {
  const session = await getServerSession();
  if (!session) throw new Error("Acceso denegado");
  const supabase = await createServiceClient();

  if (session.role === "cliente") {
    const { data: dueno, error: duenoErr } = await supabase
      .from("compradores")
      .select("id, email")
      .eq("id", compradorId)
      .maybeSingle();
    if (duenoErr) throw new Error(duenoErr.message);
    const email = ((dueno?.email as string | undefined) ?? "").trim().toLowerCase();
    const propio = (session.compradorId && session.compradorId === compradorId)
      || (email && email === session.email.trim().toLowerCase());
    if (!propio) throw new Error("Acceso denegado");
  } else if (session.role === "admin" || session.role === "vendedor") {
    const assigned = await fetchAssignedVendedorId(supabase, compradorId);
    if (
      !canReadComprador(
        { role: session.role, vendedorId: session.vendedorId ?? null },
        assigned,
      )
    ) {
      throw new Error("Solo el agente asignado puede ver este comprador");
    }
  } else {
    throw new Error("Acceso denegado");
  }

  const { data, error } = await supabase
    .from("ofertas")
    .select("*")
    .eq("comprador_id", compradorId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return adjuntarHistorial(supabase, (data ?? []) as OfertaRow[]);
}

/** Ofertas aún abiertas: realizada o contraofertada. */
export async function fetchOfertasPendientes(): Promise<OfertaRow[]> {
  const session = await requireAdminOrVendor();
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("ofertas")
    .select("*")
    .in("estado", ["realizada", "contraofertada"])
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as OfertaRow[];
  if (session.role === "admin") return adjuntarHistorial(supabase, rows);
  const compradorIds = [...new Set(rows.map((row) => row.comprador_id).filter((id): id is string => !!id))];
  const asignacion = await asignacionDeCompradores(supabase, compradorIds);
  return adjuntarHistorial(
    supabase,
    rows.filter((row) => ofertaVisibleParaSesion(session, row, asignacion)),
  );
}

/**
 * Listado admin/agente.
 * Admin: todas. Agente: las suyas (vendedor_id) y las de sus compradores.
 * No incluye ofertas de compradores de otro agente.
 */
export async function fetchOfertas(estado?: OfertaEstado | ""): Promise<OfertaRow[]> {
  const session = await requireAdminOrVendor();
  const supabase = await createServiceClient();
  return leerOfertas(supabase, session, { estado });
}

/**
 * Cambia el estado si la transición es válida. La contraoferta actualiza
 * la misma oferta y añade una fila al historial. No envía email al comprador.
 */
export async function updateOfertaEstado(input: CambioOfertaInput): Promise<void> {
  const session = await requireAdminOrVendor();
  const ofertaId = input.ofertaId?.trim();
  if (!ofertaId) throw new Error("Falta la oferta");

  const sb = await createServiceClient();
  const { data, error } = await sb.from("ofertas").select("*").eq("id", ofertaId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Oferta no encontrada");
  const actual = presentOferta(data as OfertaRow);
  await assertPuedeGestionarOferta(session, sb, actual);

  const check = validarCambioOferta(actual, input);
  if (!check.ok) throw new Error(check.error);

  const patch: Record<string, unknown> = {
    estado: check.estado,
    updated_at: new Date().toISOString(),
  };
  if (check.estado === "contraofertada") {
    patch.propuesta_euros = check.importe;
    patch.contraoferta_nota = check.nota;
  }
  if (check.estado === "firmada") {
    patch.fecha_firma = check.fechaFirma;
  }

  const { error: updateError } = await sb.from("ofertas").update(patch).eq("id", ofertaId);
  if (updateError) throw new Error(updateError.message);

  const author = authorHistorial(session);
  await insertHistorial(sb, {
    oferta_id: ofertaId,
    estado_desde: actual.estado,
    estado_hasta: check.estado,
    importe_anterior: actual.propuesta_euros,
    importe_nuevo: check.estado === "contraofertada" ? check.importe : actual.propuesta_euros,
    nota: check.estado === "contraofertada" ? check.nota : null,
    author: author.author,
    author_role: author.author_role,
  });
}

/**
 * El NDA ya no va ligado al estado de la oferta: se acepta en la
 * documentación del activo (`asset_nda_aceptaciones`).
 */
export async function firmarNDA(ofertaId: string): Promise<void> {
  const session = await getServerSession();
  if (!session?.email) {
    throw new Error("Acceso denegado: se requiere autenticación");
  }
  if (!ofertaId.trim()) throw new Error("Falta la oferta");
  throw new Error("El NDA se acepta en la documentación del activo");
}
