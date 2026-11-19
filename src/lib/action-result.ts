export type ActionFailure = { ok: false; error: string };

export type ActionSuccess<T extends object = Record<never, never>> = { ok: true } & T;

export type ActionResult<T extends object = Record<never, never>> = ActionSuccess<T> | ActionFailure;

export function actionError(error: unknown, fallback: string): ActionFailure {
  const message = error instanceof Error ? error.message.trim() : "";
  return { ok: false, error: message || fallback };
}

/**
 * El fallo ya viene en `error`. Se lanza en el cliente para que el aviso
 * muestre ese texto: un `throw` dentro de la server action llega como digest.
 */
export function raiseActionError(result: { ok: boolean; error?: string }): void {
  if (!result.ok) throw new Error(result.error || "No se pudo completar la acción");
}
