import { describe, expect, it } from "vitest";
import { displayCommentAuthor, displayNdaSignerName, formatCommentTimestamp, GESTOR_AUTHOR_LABEL } from "@/lib/comment-author";

describe("displayCommentAuthor", () => {
  it("el administrador se muestra como Gestor", () => {
    expect(displayCommentAuthor({ author: "Modesto Manzano", authorRole: "admin" })).toBe(GESTOR_AUTHOR_LABEL);
  });

  it("el agente y el comprador se muestran con su nombre", () => {
    expect(displayCommentAuthor({ author: "Agente Uno", authorRole: "vendedor" })).toBe("Agente Uno");
    expect(displayCommentAuthor({ author: "  Cliente Demo  ", authorRole: "cliente" })).toBe("Cliente Demo");
  });

  it("una fila vieja con nombre y sin rol conserva el nombre", () => {
    expect(displayCommentAuthor({ author: "Lucía Agent", authorRole: null })).toBe("Lucía Agent");
  });

  it("sin dato de autor muestra Gestor", () => {
    expect(displayCommentAuthor({ author: "  ", authorRole: null })).toBe(GESTOR_AUTHOR_LABEL);
    expect(displayCommentAuthor({ author: null, authorRole: null })).toBe(GESTOR_AUTHOR_LABEL);
  });
});

describe("displayNdaSignerName", () => {
  it("muestra el nombre escrito y nunca Gestor", () => {
    expect(displayNdaSignerName("Lucía Agent")).toBe("Lucía Agent");
    expect(displayNdaSignerName("  Ana López  ")).toBe("Ana López");
    expect(displayNdaSignerName("")).toBe("Firmante");
    expect(displayNdaSignerName(null)).toBe("Firmante");
    expect(displayNdaSignerName("Lucía Agent")).not.toBe(GESTOR_AUTHOR_LABEL);
  });
});

describe("formatCommentTimestamp", () => {
  it("incluye fecha y hora", () => {
    const label = formatCommentTimestamp("2026-03-01T10:00:00.000Z");
    expect(label).toMatch(/2026/);
    expect(label).toMatch(/:/);
  });

  it("no inventa fecha si el valor no se puede leer", () => {
    expect(formatCommentTimestamp(null)).toBeNull();
    expect(formatCommentTimestamp("")).toBeNull();
    expect(formatCommentTimestamp("no-es-fecha")).toBeNull();
  });
});
