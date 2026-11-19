export interface CompradorComentario {
  id: string;
  compradorId: string;
  /** Nombre ya visible. El admin llega como «Gestor». */
  author: string;
  authorRole: string | null;
  text: string;
  createdAt: string;
}

export interface CompradorComentarioInsert {
  comprador_id: string;
  author: string | null;
  author_id: string | null;
  author_role: "admin" | "vendedor";
  text: string;
}

export type CompradorComentarioPlan =
  | { ok: true; row: CompradorComentarioInsert }
  | { ok: false; error: string };

const COMENTARIO_MAX = 8_000;

export interface CompradorComentarioAccess {
  role: "admin" | "vendedor" | "cliente";
  vendedorId: string | null;
  /** Agente actualmente asignado al comprador. Null si no hay. */
  assignedVendedorId: string | null;
}

/**
 * Admin ve todos. El agente solo el comprador que tiene asignado.
 * El comprador no ve este historial interno.
 */
export function canReadCompradorComentarios(input: CompradorComentarioAccess): boolean {
  switch (input.role) {
    case "admin":
      return true;
    case "vendedor":
      return !!input.vendedorId && input.vendedorId === input.assignedVendedorId;
    case "cliente":
      return false;
    default: {
      const unreachable: never = input.role;
      return unreachable;
    }
  }
}

/**
 * El autor sale de la sesión, no del cliente.
 * El agente solo escribe si es el asignado a ese comprador.
 */
export function planCompradorComentarioInsert(
  input: CompradorComentarioAccess & {
    userId: string | null;
    nombre: string;
    compradorId: string;
    text: string;
  },
): CompradorComentarioPlan {
  const text = input.text.trim();
  if (!text) return { ok: false, error: "Comentario vacío" };
  if (text.length > COMENTARIO_MAX) {
    return { ok: false, error: "El comentario supera el máximo permitido" };
  }
  if (!canReadCompradorComentarios(input)) {
    if (input.role === "vendedor") {
      return { ok: false, error: "Solo el agente asignado puede comentar este comprador" };
    }
    return { ok: false, error: "Acceso denegado" };
  }

  const author = input.nombre.trim() || null;
  switch (input.role) {
    case "admin":
      return {
        ok: true,
        row: {
          comprador_id: input.compradorId,
          author,
          author_id: input.userId,
          author_role: "admin",
          text,
        },
      };
    case "vendedor":
      return {
        ok: true,
        row: {
          comprador_id: input.compradorId,
          author,
          author_id: input.userId,
          author_role: "vendedor",
          text,
        },
      };
    case "cliente":
      return { ok: false, error: "Acceso denegado" };
    default: {
      const unreachable: never = input.role;
      return unreachable;
    }
  }
}
