import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  compareByPublicationDate,
  effectivePublishedAt,
  formatPublicationDate,
  formatPublicationDateTime,
  isMissingPublishedAtColumn,
  publicationFileDate,
} from "@/lib/asset-publication";
import { assetToRow, rowToAsset } from "@/lib/supabase/db";
import type { Asset } from "@/lib/types";

describe("fecha de publicación", () => {
  it("usa published_at y, si falta en un publicado, created_at", () => {
    expect(effectivePublishedAt({
      pub: true,
      publishedAt: "2026-06-01T12:00:00.000Z",
      createdAt: "2020-01-01T00:00:00.000Z",
    })).toBe("2026-06-01T12:00:00.000Z");

    expect(effectivePublishedAt({
      pub: true,
      publishedAt: null,
      createdAt: "2020-01-01T00:00:00.000Z",
    })).toBe("2020-01-01T00:00:00.000Z");

    expect(effectivePublishedAt({
      pub: false,
      publishedAt: "2024-05-01T10:00:00.000Z",
      createdAt: "2020-01-01T00:00:00.000Z",
    })).toBe("2024-05-01T10:00:00.000Z");

    expect(effectivePublishedAt({
      pub: false,
      publishedAt: null,
      createdAt: "2020-01-01T00:00:00.000Z",
    })).toBeNull();
  });

  it("ordena de más reciente a más antigua y deja sin fecha al final", () => {
    const rows = [
      { id: "old", pub: true, publishedAt: "2024-01-15T12:00:00.000Z" },
      { id: "none", pub: false, publishedAt: null, createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "new", pub: true, publishedAt: "2026-06-01T12:00:00.000Z" },
      { id: "fallback", pub: true, publishedAt: null, createdAt: "2025-04-02T12:00:00.000Z" },
    ];
    const newest = [...rows].sort((a, b) => compareByPublicationDate(a, b, -1));
    expect(newest.map((row) => row.id)).toEqual(["new", "fallback", "old", "none"]);
    const oldest = [...rows].sort((a, b) => compareByPublicationDate(a, b, 1));
    expect(oldest.map((row) => row.id)).toEqual(["old", "fallback", "new", "none"]);
  });

  it("formatea en Europe/Madrid", () => {
    expect(formatPublicationDate("2026-01-02T23:30:00.000Z")).toBe("03/01/2026");
    expect(formatPublicationDateTime("2026-01-02T23:30:00.000Z")).toBe("2026-01-03 00:30");
    expect(formatPublicationDate(null)).toBe("—");
    expect(formatPublicationDateTime(undefined)).toBe("");
    expect(publicationFileDate(new Date("2026-11-09T23:30:00.000Z"))).toBe("2026-11-10");
  });

  it("detecta la columna ausente y no confunde otros errores", () => {
    expect(isMissingPublishedAtColumn({
      code: "PGRST204",
      message: "Could not find the 'published_at' column of 'assets' in the schema cache",
    })).toBe(true);
    expect(isMissingPublishedAtColumn({
      code: "42703",
      message: 'column "published_at" of relation "assets" does not exist',
    })).toBe(true);
    expect(isMissingPublishedAtColumn({ code: "42501", message: "permission denied" })).toBe(false);
    expect(isMissingPublishedAtColumn({
      code: "PGRST204",
      message: "Could not find the 'lat' column of 'assets' in the schema cache",
    })).toBe(false);
    expect(isMissingPublishedAtColumn(null)).toBe(false);
  });

  it("mapea la fila aunque published_at no venga y no lo reescribe en el import", () => {
    const mapped = rowToAsset({
      id: "ACT__REF1",
      pub: true,
      created_at: "2024-08-01T00:00:00.000Z",
    });
    expect(mapped.publishedAt).toBeNull();
    expect(mapped.createdAt).toBe("2024-08-01T00:00:00.000Z");
    expect(effectivePublishedAt(mapped)).toBe("2024-08-01T00:00:00.000Z");

    const stamped = rowToAsset({
      id: "ACT__REF2",
      pub: false,
      published_at: "2025-02-02T08:00:00.000Z",
      created_at: "2020-01-01T00:00:00.000Z",
    });
    expect(stamped.publishedAt).toBe("2025-02-02T08:00:00.000Z");

    const row = assetToRow({
      ...mapped,
      publishedAt: "2099-01-01T00:00:00.000Z",
      referencia: "REF1",
      prov: "Madrid",
      pob: "Madrid",
      cp: "28001",
      addr: "Calle 1",
      tip: "PISO",
      tipC: "tp-viv",
      precio: 1,
      fav: false,
      chk: false,
      sqm: 1,
      tvia: "CALLE",
      nvia: "UNO",
      num: "1",
      esc: "",
      pla: "",
      pta: "",
      map: "",
      clase: "",
      uso: "",
      bien: "",
      supC: "",
      supG: "",
      coef: "",
      ccaa: "",
      fullAddr: "",
      desc: "",
      propiedades: [],
    } satisfies Asset);
    expect(row).not.toHaveProperty("published_at");
    expect(row.pub).toBe(true);
  });

  it("la migración SQL es idempotente y rellena los ya publicados", () => {
    const sql = readFileSync(
      resolve(__dirname, "../../supabase/migrations/20261109_assets_published_at.sql"),
      "utf8",
    );
    expect(sql).toMatch(/add column if not exists published_at timestamptz/i);
    expect(sql).toMatch(/where pub is true/i);
    expect(sql).toMatch(/published_at is null/i);
    expect(sql).toMatch(/created_at/i);
    expect(sql).toMatch(/create index if not exists idx_assets_published_at/i);
    expect(sql).toMatch(/notify pgrst, 'reload schema'/i);
    expect(sql).not.toMatch(/drop column/i);
  });
});
