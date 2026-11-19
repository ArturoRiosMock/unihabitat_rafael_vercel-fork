"use server";

import { getServerSession } from "@/lib/auth-server";
import { displayCommentAuthor } from "@/lib/comment-author";
import {
  canReadInformacionAdicional,
  planInformacionAdicionalWrite,
  type InformacionAdicionalView,
} from "@/lib/informacion-adicional";
import { createServiceClient } from "@/lib/supabase/server";

interface InformacionAdicionalStored {
  texto?: string | null;
  updated_at?: string | null;
  updated_by_name?: string | null;
  updated_by_role?: string | null;
}

function presentInformacion(data: InformacionAdicionalStored | null): InformacionAdicionalView {
  const texto = typeof data?.texto === "string" ? data.texto : "";
  const updatedAt = typeof data?.updated_at === "string" ? data.updated_at : null;
  const hasContent = texto.trim().length > 0 || updatedAt != null;
  if (!hasContent) {
    return { texto, author: null, authorRole: null, updatedAt: null };
  }
  const authorRole = data?.updated_by_role ?? "admin";
  return {
    texto,
    author: displayCommentAuthor({ author: data?.updated_by_name, authorRole }),
    authorRole,
    updatedAt,
  };
}

/**
 * Texto de «Información Adicional» de un activo.
 * Lo leen admin y agentes. No lee `notas` ni las notas privadas.
 */
export async function fetchInformacionAdicional(assetId: string): Promise<InformacionAdicionalView> {
  const session = await getServerSession();
  if (!session || !canReadInformacionAdicional(session.role)) {
    throw new Error("Acceso denegado");
  }
  const id = assetId.trim();
  if (!id) throw new Error("Activo no válido");

  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("asset_informacion_adicional")
    .select("texto, updated_at, updated_by_name, updated_by_role")
    .eq("asset_id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return presentInformacion(data);
}

/** Persistencia por activo. Solo admin. El agente queda rechazado en servidor. */
export async function saveInformacionAdicional(assetId: string, text: string): Promise<void> {
  const session = await getServerSession();
  if (!session) throw new Error("Acceso denegado");

  const plan = planInformacionAdicionalWrite(session.role, text);
  if (!plan.ok) throw new Error(plan.error);

  const id = assetId.trim();
  if (!id) throw new Error("Activo no válido");

  const supabase = await createServiceClient();
  const { error } = await supabase.from("asset_informacion_adicional").upsert(
    {
      asset_id: id,
      texto: plan.texto,
      updated_at: new Date().toISOString(),
      updated_by: session.userId ?? null,
      updated_by_name: session.nombre.trim() || null,
      updated_by_role: session.role,
    },
    { onConflict: "asset_id" },
  );
  if (error) throw new Error(error.message);
}
