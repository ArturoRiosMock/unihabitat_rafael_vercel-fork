/**
 * Adaptador Supabase del cruce de demanda y envío del resumen.
 * No es una server action: lo usan el cron y las actions.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { lunesSemanaUtc, planAvisoComprador } from "@/lib/aviso-comprador";
import { getPublicAppOrigin } from "@/lib/app-public-url";
import { DIAS_SIN_REPETIR_ENVIO, type CanalEnvio } from "@/lib/comprador-envios";
import {
  cruceDemandaEmailEnabled,
  ejecutarCruce,
  fichaPublicaOportunidad,
  hrefPrivadoActivo,
  limiteDesdeEnv,
  nivelEncajeActivo,
  ordenarEncaje,
  type ActivoCruce,
  type CanalOportunidad,
  type CruceComprador,
  type CruceStore,
  type DemandaComprador,
  type EjecucionCruce,
  type EstadoDemanda,
  type EstadoOportunidad,
  type NivelCruce,
  type EncajeComprador,
  type OportunidadInsert,
  type OportunidadVista,
  type ResultadoCruce,
} from "@/lib/cruce-demanda";
import { oportunidadesDemandaTemplate } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/send";
import { enviarWhatsappOportunidades, telefonoWhatsapp, whatsappHabilitado } from "@/lib/whatsapp";

const PAGE = 1000;
const MAX_PAGES = 100;

interface PageResult {
  data: unknown[] | null;
  error: { message: string } | null;
}

async function fetchPages(
  build: (from: number, to: number) => PromiseLike<PageResult>,
): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE;
    const to = from + PAGE - 1;
    const { data, error } = await build(from, to);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as Record<string, unknown>[];
    all.push(...batch);
    if (batch.length < PAGE) break;
  }
  return all;
}

function texto(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numero(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function textos(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function esNivel(value: string): value is NivelCruce {
  return value === "poblacion" || value === "provincia" || value === "sin_categoria" || value === "solo_categoria";
}

function esEstado(value: string): value is EstadoOportunidad {
  return value === "ofrecida" || value === "vista" || value === "interesado" || value === "descartada";
}

function esCanal(value: string): value is CanalOportunidad {
  return value === "cron" || value === "manual";
}

function estadoDemanda(value: unknown): EstadoDemanda {
  return texto(value) === "archivada" ? "archivada" : "activa";
}

function rowDemanda(row: Record<string, unknown>): DemandaComprador {
  return {
    id: texto(row.id) || undefined,
    compradorId: texto(row.comprador_id),
    categorias: textos(row.categorias),
    provincias: textos(row.provincias),
    poblaciones: textos(row.poblaciones),
    precioMin: numero(row.precio_min),
    precioMax: numero(row.precio_max),
    estado: estadoDemanda(row.estado),
    createdAt: texto(row.created_at) || undefined,
    autor: texto(row.autor) || null,
    autorRol: texto(row.autor_rol) || null,
  };
}

function categoriasActivo(
  row: Record<string, unknown>,
  cargas: Array<Record<string, unknown>>,
): string[] {
  return [
    texto(row.tip),
    texto(row.tip_c),
    texto(row.uso),
    texto(row.bien),
    texto(row.clase),
    ...cargas.flatMap((carga) => [texto(carga.categoria), texto(carga.tipologia)]),
  ].map((item) => item.trim()).filter(Boolean);
}

export function supabaseCruceStore(sb: SupabaseClient): CruceStore {
  return {
    async listCompradores(): Promise<CruceComprador[]> {
      const [compradores, enlaces, vendedores] = await Promise.all([
        fetchPages((from, to) => sb.from("compradores").select("id, email, nombre, apellidos").order("id").range(from, to)),
        fetchPages((from, to) => sb.from("vendedor_compradores").select("comprador_id, vendedor_id, assigned_at").order("assigned_at", { ascending: false }).range(from, to)),
        fetchPages((from, to) => sb.from("vendedores").select("id, email").order("id").range(from, to)),
      ]);
      const emailAgente = new Map(vendedores.map((row) => [texto(row.id), texto(row.email)]));
      const agentePorComprador = new Map<string, string>();
      for (const enlace of enlaces) {
        const compradorId = texto(enlace.comprador_id);
        if (!agentePorComprador.has(compradorId)) {
          agentePorComprador.set(compradorId, texto(enlace.vendedor_id));
        }
      }
      return compradores.map((row) => {
        const id = texto(row.id);
        const agenteId = agentePorComprador.get(id) ?? "";
        const nombre = [texto(row.nombre), texto(row.apellidos)].filter(Boolean).join(" ").trim();
        return {
          id,
          email: texto(row.email),
          nombre,
          agenteEmail: agenteId ? emailAgente.get(agenteId) ?? null : null,
        };
      });
    },

    async listDemandas(): Promise<DemandaComprador[]> {
      const rows = await fetchPages((from, to) => (
        sb.from("comprador_demanda").select("*").eq("estado", "activa").order("comprador_id").range(from, to)
      ));
      return rows.map(rowDemanda);
    },

    async listActivosPublicados(): Promise<ActivoCruce[]> {
      const assets = await fetchPages((from, to) => (
        sb.from("assets")
          .select("id, prov, pob, precio, pub, tip, tip_c, uso, bien, clase, public_slug")
          .eq("pub", true)
          .order("id")
          .range(from, to)
      ));
      const ids = assets.map((row) => texto(row.id)).filter(Boolean);
      const cargas: Record<string, unknown>[] = [];
      for (let i = 0; i < ids.length; i += 200) {
        const slice = ids.slice(i, i + 200);
        const rows = await fetchPages((from, to) => (
          sb.from("propiedades")
            .select("inmueble_id, categoria, tipologia")
            .in("inmueble_id", slice)
            .order("id")
            .range(from, to)
        ));
        cargas.push(...rows);
      }
      const porInmueble = new Map<string, Record<string, unknown>[]>();
      for (const carga of cargas) {
        const id = texto(carga.inmueble_id);
        const lista = porInmueble.get(id) ?? [];
        lista.push(carga);
        porInmueble.set(id, lista);
      }
      return assets.map((row) => ({
        id: texto(row.id),
        publicado: row.pub !== false,
        provincia: texto(row.prov),
        poblacion: texto(row.pob),
        precio: numero(row.precio),
        categorias: categoriasActivo(row, porInmueble.get(texto(row.id)) ?? []),
        tip: texto(row.tip),
        publicSlug: texto(row.public_slug) || undefined,
      }));
    },

    async listOfrecidos(compradorIds: string[]) {
      const filas: Array<{ compradorId: string; assetId: string }> = [];
      for (let i = 0; i < compradorIds.length; i += 200) {
        const slice = compradorIds.slice(i, i + 200);
        if (slice.length === 0) continue;
        const rows = await fetchPages((from, to) => (
          sb.from("comprador_oportunidades")
            .select("comprador_id, asset_id")
            .in("comprador_id", slice)
            .order("created_at", { ascending: true })
            .range(from, to)
        ));
        for (const row of rows) {
          filas.push({ compradorId: texto(row.comprador_id), assetId: texto(row.asset_id) });
        }
      }
      return filas;
    },

    async insertOportunidades(rows: OportunidadInsert[]) {
      const payload = rows.map((row) => ({
        comprador_id: row.compradorId,
        asset_id: row.assetId,
        nivel: row.nivel,
        canal: row.canal,
        estado: "ofrecida",
      }));
      for (let i = 0; i < payload.length; i += 500) {
        const { error } = await sb.from("comprador_oportunidades").upsert(payload.slice(i, i + 500), {
          onConflict: "comprador_id,asset_id",
          ignoreDuplicates: true,
        });
        if (error) throw new Error(error.message);
      }
    },

    async insertEjecucion(row: EjecucionCruce) {
      const { error } = await sb.from("cruce_demanda_ejecuciones").insert({
        origen: row.origen,
        compradores: row.compradores,
        con_demanda: row.conDemanda,
        oportunidades: row.oportunidades,
        por_nivel: row.porNivel,
        emails_enviados: row.emailsEnviados,
        emails_omitidos: row.emailsOmitidos,
        ...(row.createdAt ? { created_at: row.createdAt } : {}),
      });
      if (error) throw new Error(error.message);
    },
  };
}

export interface RunCruceInput {
  origen: "cron" | "manual";
  registrar: boolean;
  soloCompradorId?: string;
  emailEnabled?: boolean;
  limite?: number;
  /** Nombre visible de quien lanza el cruce. El cron usa «Gestor». */
  enviadoPor?: string;
  /**
   * El cruce manual confirma el reenvío en la action y no debe excluir
   * los activos de los últimos 14 días. El cron sí los excluye.
   */
  excluirRecientes?: boolean;
}

export async function runCruceDemanda(
  sb: SupabaseClient,
  input: RunCruceInput,
): Promise<ResultadoCruce> {
  const emailEnabled = input.emailEnabled ?? cruceDemandaEmailEnabled(process.env.CRUCE_DEMANDA_EMAIL_ENABLED);
  const whatsappOn = whatsappHabilitado(process.env);
  const semana = lunesSemanaUtc(new Date());
  const sinCupo = input.registrar && (emailEnabled || whatsappOn)
    ? await compradoresSinCupo(sb, semana)
    : new Set<string>();
  const excluirRecientes = input.excluirRecientes ?? input.origen === "cron";
  const excluir = excluirRecientes ? await listarEnviosRecientes(sb) : [];

  const resultado = await ejecutarCruce(supabaseCruceStore(sb), {
    origen: input.origen,
    registrar: input.registrar,
    soloCompradorId: input.soloCompradorId,
    limite: input.limite ?? limiteDesdeEnv(process.env.CRUCE_DEMANDA_LIMITE),
    emailEnabled,
    origenPublico: getPublicAppOrigin(),
    excluir,
    compradoresSinCupo: sinCupo,
    enviarEmail: async (envio) => {
      const template = oportunidadesDemandaTemplate({
        nombre: envio.nombre,
        oportunidades: envio.oportunidades,
      });
      const result = await sendEmail({
        to: envio.to,
        cc: envio.cc,
        subject: template.subject,
        html: template.html,
        text: template.text,
      });
      if (!result.ok) {
        console.error("[cruce-demanda] email:", result.error);
        return "error";
      }
      return "enviado";
    },
  });

  if (input.registrar) {
    await registrarAvisosDelCruce(sb, resultado, {
      whatsappOn,
      semana,
      enviadoPor: input.enviadoPor?.trim() || "Gestor",
    });
  }
  return resultado;
}

async function compradoresSinCupo(sb: SupabaseClient, semana: string): Promise<Set<string>> {
  const rows = await fetchPages((from, to) => (
    sb.from("comprador_avisos").select("comprador_id").eq("semana", semana).order("comprador_id").range(from, to)
  ));
  const cuentas = new Map<string, number>();
  for (const row of rows) {
    const id = texto(row.comprador_id);
    if (!id) continue;
    cuentas.set(id, (cuentas.get(id) ?? 0) + 1);
  }
  return new Set([...cuentas.entries()].filter(([, total]) => total >= 2).map(([id]) => id));
}

async function listarEnviosRecientes(
  sb: SupabaseClient,
): Promise<Array<{ compradorId: string; assetId: string }>> {
  const desde = new Date(Date.now() - DIAS_SIN_REPETIR_ENVIO * 24 * 60 * 60 * 1000).toISOString();
  const rows = await fetchPages((from, to) => (
    sb.from("comprador_envios")
      .select("comprador_id, asset_id, enviado_at")
      .gte("enviado_at", desde)
      .order("enviado_at", { ascending: false })
      .range(from, to)
  ));
  return rows.map((row) => ({
    compradorId: texto(row.comprador_id),
    assetId: texto(row.asset_id),
  }));
}

async function registrarAvisosDelCruce(
  sb: SupabaseClient,
  resultado: ResultadoCruce,
  input: { whatsappOn: boolean; semana: string; enviadoPor: string },
): Promise<void> {
  const conActivos = resultado.detalles.filter((detalle) => detalle.assetIds.length > 0);
  if (conActivos.length === 0) return;
  const ids = conActivos.map((detalle) => detalle.compradorId);
  const { data, error } = await sb
    .from("compradores")
    .select("id, nombre, apellidos, tel, acepta_whatsapp, email")
    .in("id", ids);
  if (error) throw new Error(error.message);
  const ficha = new Map((data ?? []).map((row) => [texto((row as { id?: unknown }).id), row as Record<string, unknown>]));

  for (const detalle of conActivos) {
    const comprador = ficha.get(detalle.compradorId);
    const telefono = telefonoWhatsapp(texto(comprador?.tel));
    const acepta = comprador?.acepta_whatsapp === true;
    const plan = planAvisoComprador({
      avisosEnSemana: 0,
      emailEnabled: false,
      whatsappEnabled: input.whatsappOn,
      aceptaWhatsapp: acepta,
      tieneTelefono: Boolean(telefono),
      tieneEmail: texto(comprador?.email).includes("@"),
    });
    let whatsapp: "enviado" | "omitido" | "error" = "omitido";
    if (plan.whatsapp && telefono) {
      whatsapp = await enviarWhatsappOportunidades({
        telefono,
        nombre: [texto(comprador?.nombre), texto(comprador?.apellidos)].filter(Boolean).join(" ").trim() || "cliente",
        oportunidades: detalle.fichas.map((fichaPublica) => ({
          titulo: fichaPublica.titulo,
          lugar: fichaPublica.lugar,
          precioLabel: fichaPublica.precioLabel,
        })),
      });
    }
    const canales: CanalEnvio[] = [];
    if (detalle.email === "enviado") canales.push("email");
    if (whatsapp === "enviado") canales.push("whatsapp");
    if (canales.length === 0) canales.push("cruce");
    await insertarEnvios(sb, detalle.compradorId, detalle.assetIds, canales, input.enviadoPor);
    if (detalle.email === "enviado" || whatsapp === "enviado") {
      const { error: avisoError } = await sb.from("comprador_avisos").insert({
        comprador_id: detalle.compradorId,
        semana: input.semana,
        canales,
      });
      if (avisoError) {
        console.error("[cruce-demanda] aviso:", avisoError.message);
      }
    }
  }
}

export async function insertarEnvios(
  sb: SupabaseClient,
  compradorId: string,
  assetIds: string[],
  canales: CanalEnvio[],
  enviadoPor: string,
  nota?: string | null,
): Promise<void> {
  const ahora = new Date().toISOString();
  const filas = canales.flatMap((canal) => assetIds.map((assetId) => ({
    comprador_id: compradorId,
    asset_id: assetId,
    canal,
    enviado_por: enviadoPor,
    enviado_at: ahora,
    nota: nota?.trim() || null,
  })));
  for (let i = 0; i < filas.length; i += 500) {
    const { error } = await sb.from("comprador_envios").insert(filas.slice(i, i + 500));
    if (error) throw new Error(error.message);
  }
}

export async function listDemandasComprador(
  sb: SupabaseClient,
  compradorId: string,
): Promise<DemandaComprador[]> {
  const { data, error } = await sb
    .from("comprador_demanda")
    .select("*")
    .eq("comprador_id", compradorId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(rowDemanda);
}

export async function insertDemanda(
  sb: SupabaseClient,
  demanda: DemandaComprador,
  autor: { nombre: string; rol: string },
): Promise<DemandaComprador> {
  const { data, error } = await sb
    .from("comprador_demanda")
    .insert({
      comprador_id: demanda.compradorId,
      categorias: demanda.categorias,
      provincias: demanda.provincias,
      poblaciones: demanda.poblaciones,
      precio_min: demanda.precioMin,
      precio_max: demanda.precioMax,
      estado: "activa",
      autor: autor.nombre,
      autor_rol: autor.rol,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return rowDemanda(data as Record<string, unknown>);
}

export async function setEstadoDemanda(
  sb: SupabaseClient,
  demandaId: string,
  estado: EstadoDemanda,
): Promise<DemandaComprador> {
  const { data, error } = await sb
    .from("comprador_demanda")
    .update({ estado })
    .eq("id", demandaId)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Demanda no encontrada");
  return rowDemanda(data as Record<string, unknown>);
}

export async function deleteDemanda(sb: SupabaseClient, demandaId: string): Promise<void> {
  const { error } = await sb.from("comprador_demanda").delete().eq("id", demandaId);
  if (error) throw new Error(error.message);
}

export async function listEnviosComprador(
  sb: SupabaseClient,
  compradorId: string,
): Promise<Array<{
  id: string;
  compradorId: string;
  assetId: string;
  canal: string;
  enviadoPor: string;
  enviadoAt: string;
  nota: string;
}>> {
  const { data, error } = await sb
    .from("comprador_envios")
    .select("id, comprador_id, asset_id, canal, enviado_por, enviado_at, nota")
    .eq("comprador_id", compradorId)
    .order("enviado_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: texto(row.id),
    compradorId: texto(row.comprador_id),
    assetId: texto(row.asset_id),
    canal: texto(row.canal),
    enviadoPor: texto(row.enviado_por),
    enviadoAt: texto(row.enviado_at),
    nota: texto(row.nota),
  }));
}

export async function listOportunidadesVista(
  sb: SupabaseClient,
  compradorId: string,
): Promise<OportunidadVista[]> {
  const { data, error } = await sb
    .from("comprador_oportunidades")
    .select("id, comprador_id, asset_id, nivel, canal, estado, created_at")
    .eq("comprador_id", compradorId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const filas = (data ?? []) as Record<string, unknown>[];
  const assetIds = [...new Set(filas.map((fila) => texto(fila.asset_id)).filter(Boolean))];
  const activos = new Map<string, ActivoCruce>();
  if (assetIds.length > 0) {
    const { data: assetRows, error: assetError } = await sb
      .from("assets")
      .select("id, prov, pob, precio, pub, tip, public_slug")
      .in("id", assetIds);
    if (assetError) throw new Error(assetError.message);
    for (const row of (assetRows ?? []) as Record<string, unknown>[]) {
      const activo: ActivoCruce = {
        id: texto(row.id),
        publicado: row.pub !== false,
        provincia: texto(row.prov),
        poblacion: texto(row.pob),
        precio: numero(row.precio),
        categorias: [],
        tip: texto(row.tip),
        publicSlug: texto(row.public_slug) || undefined,
      };
      activos.set(activo.id, activo);
    }
  }
  const origen = getPublicAppOrigin();
  return filas.flatMap((fila) => {
    const nivel = texto(fila.nivel);
    const estado = texto(fila.estado);
    const canal = texto(fila.canal);
    if (!esNivel(nivel) || !esEstado(estado) || !esCanal(canal)) return [];
    const activo = activos.get(texto(fila.asset_id));
    const ficha = activo
      ? fichaPublicaOportunidad(activo, nivel, origen)
      : null;
    return [{
      id: texto(fila.id),
      compradorId: texto(fila.comprador_id),
      assetId: texto(fila.asset_id),
      nivel,
      canal,
      estado,
      createdAt: texto(fila.created_at),
      titulo: ficha?.titulo ?? "Inmueble",
      lugar: ficha?.lugar ?? "",
      precioLabel: ficha?.precioLabel ?? null,
      hrefPublico: ficha?.url ?? "",
      hrefPrivado: activo ? hrefPrivadoActivo(activo) : "",
    }];
  });
}

export async function fetchActivoParaCruce(
  sb: SupabaseClient,
  assetId: string,
): Promise<ActivoCruce | null> {
  const { data, error } = await sb
    .from("assets")
    .select("id, prov, pob, precio, pub, tip, tip_c, uso, bien, clase, public_slug")
    .eq("id", assetId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as Record<string, unknown>;
  const { data: cargas, error: cargasError } = await sb
    .from("propiedades")
    .select("categoria, tipologia")
    .eq("inmueble_id", assetId);
  if (cargasError) throw new Error(cargasError.message);
  const extras = ((cargas ?? []) as Record<string, unknown>[]).flatMap((carga) => [
    texto(carga.categoria),
    texto(carga.tipologia),
  ]);
  return {
    id: texto(row.id),
    publicado: row.pub === true,
    provincia: texto(row.prov),
    poblacion: texto(row.pob),
    precio: numero(row.precio),
    categorias: [texto(row.tip), texto(row.tip_c), texto(row.uso), texto(row.bien), texto(row.clase), ...extras]
      .map((item) => item.trim())
      .filter(Boolean),
    tip: texto(row.tip),
    publicSlug: texto(row.public_slug) || undefined,
  };
}

export async function listarEncajeActivo(
  sb: SupabaseClient,
  activo: ActivoCruce,
): Promise<EncajeComprador[]> {
  const [demandas, compradores] = await Promise.all([
    fetchPages((from, to) => sb.from("comprador_demanda").select("*").eq("estado", "activa").order("comprador_id").range(from, to)),
    fetchPages((from, to) => sb.from("compradores").select("id, nombre, apellidos, agente").order("id").range(from, to)),
  ]);
  const ficha = new Map(compradores.map((row) => {
    const nombre = [texto(row.nombre), texto(row.apellidos)].filter(Boolean).join(" ").trim();
    return [texto(row.id), { nombre: nombre || texto(row.id), agente: texto(row.agente) || "Gestor" }] as const;
  }));
  const encajes: EncajeComprador[] = [];
  const mejorPorComprador = new Map<string, EncajeComprador>();
  for (const row of demandas) {
    const demanda = rowDemanda(row);
    const nivel = nivelEncajeActivo(demanda, activo);
    if (!nivel) continue;
    const datos = ficha.get(demanda.compradorId);
    const encaje: EncajeComprador = {
      compradorId: demanda.compradorId,
      nombre: datos?.nombre || demanda.compradorId,
      agente: datos?.agente || "Gestor",
      nivel,
    };
    const previo = mejorPorComprador.get(demanda.compradorId);
    if (!previo || ordenNivel(nivel) < ordenNivel(previo.nivel)) {
      mejorPorComprador.set(demanda.compradorId, encaje);
    }
  }
  encajes.push(...mejorPorComprador.values());
  return ordenarEncaje(encajes);
}

function ordenNivel(nivel: NivelCruce): number {
  switch (nivel) {
    case "poblacion":
      return 0;
    case "provincia":
      return 1;
    case "solo_categoria":
      return 2;
    case "sin_categoria":
      return 3;
    default: {
      const desconocido: never = nivel;
      return desconocido;
    }
  }
}

export async function fetchUltimaEjecucion(sb: SupabaseClient): Promise<EjecucionCruce | null> {
  const { data, error } = await sb
    .from("cruce_demanda_ejecuciones")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as Record<string, unknown>;
  const porNivelRaw = (row.por_nivel ?? {}) as Record<string, unknown>;
  return {
    origen: texto(row.origen) === "cron" ? "cron" : "manual",
    compradores: numero(row.compradores) ?? 0,
    conDemanda: numero(row.con_demanda) ?? 0,
    oportunidades: numero(row.oportunidades) ?? 0,
    porNivel: {
      poblacion: numero(porNivelRaw.poblacion) ?? 0,
      provincia: numero(porNivelRaw.provincia) ?? 0,
      sin_categoria: numero(porNivelRaw.sin_categoria) ?? 0,
      solo_categoria: numero(porNivelRaw.solo_categoria) ?? 0,
    },
    emailsEnviados: numero(row.emails_enviados) ?? 0,
    emailsOmitidos: numero(row.emails_omitidos) ?? 0,
    createdAt: texto(row.created_at),
  };
}
