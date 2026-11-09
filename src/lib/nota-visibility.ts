export type NotaScope = "activo" | "privada";

export interface NotaVisibilitySession {
  role: "admin" | "vendedor" | "cliente";
  userId?: string | null;
  nombre: string;
  compradorId?: string | null;
}

export interface NotaVisibilityRow {
  author: string;
  author_id?: string | null;
  scope?: string | null;
  comprador_id?: string | null;
}

export interface NotaInsertRow {
  asset_id: string | null;
  comprador_id: string | null;
  author: string;
  author_id: string | null;
  scope: NotaScope;
  text: string;
}

export type NotaInsertPlan =
  | { ok: true; row: NotaInsertRow }
  | { ok: false; error: string };

export function noteScope(row: NotaVisibilityRow): NotaScope {
  return row.scope === "privada" ? "privada" : "activo";
}

function ownsNota(session: NotaVisibilitySession, row: NotaVisibilityRow): boolean {
  if (row.author_id) return !!session.userId && row.author_id === session.userId;
  return row.author === session.nombre;
}

/**
 * Misma regla que las políticas SELECT de `public.notas`.
 * El admin ve el alcance pedido. El agente solo las notas de activo que creó.
 * El comprador solo las suyas. Las notas privadas no salen de Administración.
 */
export function canReadNota(
  session: NotaVisibilitySession,
  row: NotaVisibilityRow,
  view: { scope: NotaScope; compradorId?: string | null },
): boolean {
  const scope = noteScope(row);
  switch (session.role) {
    case "admin":
      if (view.compradorId) return row.comprador_id === view.compradorId;
      if (view.scope === "privada") return scope === "privada" && !row.comprador_id;
      return scope === "activo" && !row.comprador_id;
    case "vendedor":
      if (view.scope === "privada" || view.compradorId) return false;
      if (scope !== "activo" || row.comprador_id) return false;
      return ownsNota(session, row);
    case "cliente": {
      const own = session.compradorId;
      if (!own) return false;
      if (view.compradorId && view.compradorId !== own) return false;
      return row.comprador_id === own && scope === "activo";
    }
    default: {
      const unreachable: never = session.role;
      return unreachable;
    }
  }
}

/**
 * La fila que se inserta ignora el autor que mande el cliente:
 * el nombre y el `author_id` salen de la sesión.
 */
export function planNotaInsert(input: {
  role: NotaVisibilitySession["role"];
  userId: string | null;
  nombre: string;
  compradorId: string | null;
  assetId?: string;
  requestedCompradorId?: string;
  scope: NotaScope;
  text: string;
}): NotaInsertPlan {
  const text = input.text.trim();
  if (!text) return { ok: false, error: "Nota vacía" };

  switch (input.role) {
    case "admin":
      return {
        ok: true,
        row: {
          asset_id: input.assetId ?? null,
          comprador_id: input.scope === "privada" ? null : (input.requestedCompradorId ?? null),
          author: input.nombre,
          author_id: input.userId,
          scope: input.scope,
          text,
        },
      };
    case "vendedor":
      if (input.scope === "privada") {
        return { ok: false, error: "Solo el administrador crea notas privadas" };
      }
      if (input.requestedCompradorId) {
        return { ok: false, error: "Un agente no crea notas de comprador" };
      }
      return {
        ok: true,
        row: {
          asset_id: input.assetId ?? null,
          comprador_id: null,
          author: input.nombre,
          author_id: input.userId,
          scope: "activo",
          text,
        },
      };
    case "cliente":
      if (input.scope === "privada") {
        return { ok: false, error: "Solo el administrador crea notas privadas" };
      }
      if (!input.compradorId) {
        return { ok: false, error: "Necesitas sesión de comprador para guardar notas" };
      }
      if (input.requestedCompradorId && input.requestedCompradorId !== input.compradorId) {
        return { ok: false, error: "No puedes crear notas para otro comprador" };
      }
      return {
        ok: true,
        row: {
          asset_id: input.assetId ?? null,
          comprador_id: input.compradorId,
          author: input.nombre,
          author_id: input.userId,
          scope: "activo",
          text,
        },
      };
    default: {
      const unreachable: never = input.role;
      return unreachable;
    }
  }
}
