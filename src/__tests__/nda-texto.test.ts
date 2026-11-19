import { describe, expect, it } from "vitest";
import {
  ASSET_NDA_PROVISIONAL_NOTICE,
  ASSET_NDA_VERSION,
  assertNdaSignature,
  assetNdaLabel,
  buildAssetNdaText,
} from "@/lib/nda";

describe("texto del NDA por activo", () => {
  it("marca el texto como provisional e incluye el activo y la versión", () => {
    const label = assetNdaLabel({
      id: "TEST-DOC-001",
      referencia: "RC-001",
      pob: "Valdemoro",
      addr: "Calle Mayor 1",
    });
    const text = buildAssetNdaText(label);

    expect(label).toBe("Valdemoro, Calle Mayor 1 (ref. RC-001)");
    expect(text).toContain("TEXTO PROVISIONAL");
    expect(text).toContain(ASSET_NDA_PROVISIONAL_NOTICE);
    expect(text).toContain("Valdemoro, Calle Mayor 1 (ref. RC-001)");
    expect(text).toContain(ASSET_NDA_VERSION);
    expect(text).toContain("únicamente para el activo");
  });

  it("exige la casilla y un nombre completo", () => {
    expect(() => assertNdaSignature("Ana", false)).toThrow(/aceptas el NDA/);
    expect(() => assertNdaSignature("Ana", true)).toThrow(/nombre completo/);
    expect(assertNdaSignature("  Ana   López  ", true)).toBe("Ana López");
  });
});
