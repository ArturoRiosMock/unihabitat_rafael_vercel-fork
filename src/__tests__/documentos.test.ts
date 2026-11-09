import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
}));

function makeStorageMock(opts: {
  createSignedUrl?: { data: { signedUrl: string } | null; error: Error | null };
  upload?: { error: Error | null };
  remove?: { error: Error | null };
}) {
  return {
    from: vi.fn(() => ({
      createSignedUrl: vi.fn(async () => opts.createSignedUrl ?? { data: { signedUrl: "https://signed.url" }, error: null }),
      upload: vi.fn(async () => opts.upload ?? { error: null }),
      remove: vi.fn(async () => opts.remove ?? { error: null }),
    })),
  };
}

function makeDbMock(opts: {
  selectData?: unknown[];
  insertError?: Error | null;
  deleteError?: Error | null;
  maybeSingleData?: unknown;
}) {
  const maybeSingle = vi.fn(async () => ({ data: opts.maybeSingleData ?? null, error: null }));
  const eq = vi.fn(() => ({ maybeSingle }));
  const deleteEq = vi.fn(async () => ({ error: opts.deleteError ?? null }));
  const order = vi.fn(async () => ({ data: opts.selectData ?? [], error: null }));
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ order, eq })),
        order,
      })),
      insert: vi.fn(async () => ({ error: opts.insertError ?? null })),
      delete: vi.fn(() => ({ eq: deleteEq })),
    })),
  };
}

describe("getDocumentUrl", () => {
  beforeEach(() => vi.resetModules());

  it("returns a signed URL for a valid storage path", async () => {
    const storageMock = makeStorageMock({
      createSignedUrl: { data: { signedUrl: "https://example.com/signed?token=abc" }, error: null },
    });
    const dbMock = makeDbMock({});

    vi.doMock("@/lib/supabase/server", () => ({
      createClient: vi.fn(async () => dbMock),
      createServiceClient: vi.fn(async () => ({
        ...dbMock,
        storage: storageMock,
      })),
    }));

    const { getDocumentUrl } = await import("@/app/actions/documentos");
    const url = await getDocumentUrl("assets/123/test.pdf");

    expect(url).toBe("https://example.com/signed?token=abc");
    expect(storageMock.from).toHaveBeenCalledWith("documentos");
    const signed = storageMock.from.mock.results[0]?.value.createSignedUrl as ReturnType<typeof vi.fn>;
    expect(signed).toHaveBeenCalledWith("assets/123/test.pdf", 3600);
  });

  it("throws an error when createSignedUrl fails", async () => {
    const storageMock = makeStorageMock({
      createSignedUrl: { data: null, error: new Error("Bucket not found") },
    });
    const dbMock = makeDbMock({});

    vi.doMock("@/lib/supabase/server", () => ({
      createClient: vi.fn(async () => dbMock),
      createServiceClient: vi.fn(async () => ({
        ...dbMock,
        storage: storageMock,
      })),
    }));

    const { getDocumentUrl } = await import("@/app/actions/documentos");

    await expect(getDocumentUrl("assets/123/test.pdf")).rejects.toThrow("Bucket not found");
  });

  it("throws when signedUrl is missing from response", async () => {
    const storageMock = makeStorageMock({
      createSignedUrl: { data: null, error: null },
    });
    const dbMock = makeDbMock({});

    vi.doMock("@/lib/supabase/server", () => ({
      createClient: vi.fn(async () => dbMock),
      createServiceClient: vi.fn(async () => ({
        ...dbMock,
        storage: storageMock,
      })),
    }));

    const { getDocumentUrl } = await import("@/app/actions/documentos");

    await expect(getDocumentUrl("assets/123/test.pdf")).rejects.toThrow("Failed to generate signed URL");
  });
});

describe("uploadDocumento", () => {
  beforeEach(() => vi.resetModules());

  it("throws when no file is attached", async () => {
    const dbMock = makeDbMock({});
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: vi.fn(async () => dbMock),
      createServiceClient: vi.fn(async () => dbMock),
    }));

    const { uploadDocumento } = await import("@/app/actions/documentos");

    const formData = new FormData();
    formData.append("asset_id", "ASSET-123");

    await expect(uploadDocumento(formData)).rejects.toThrow("No se adjuntó archivo");
  });
});

function listTypeScriptFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listTypeScriptFiles(full));
      continue;
    }
    if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

describe("descarga de documentos sin URL pública", () => {
  const srcRoot = resolve(__dirname, "..");
  const adminPage = readFileSync(resolve(__dirname, "../app/admin/assets/[id]/page.tsx"), "utf8");
  const portalPage = readFileSync(
    resolve(__dirname, "../app/portal/privado/inmueble/[slug]/page.tsx"),
    "utf8",
  );
  const migration = readFileSync(
    resolve(__dirname, "../../supabase-migration-documentos-bucket.sql"),
    "utf8",
  );

  it("admin, agente y portal comprador abren el archivo con getDocumentUrl", () => {
    expect(adminPage).toContain("getDocumentUrl(doc.storage_path)");
    expect(adminPage).toContain("Descargar");
    expect(portalPage).toContain("getDocumentUrl(doc.storage_path)");
    expect(portalPage).toContain("Descargar");
    expect(adminPage).not.toContain("getPublicUrl");
    expect(portalPage).not.toContain("getPublicUrl");
  });

  it("ningún módulo de src llama a la URL pública del storage", () => {
    const publicUrlCall = ".getPublic" + "Url(";
    const offenders = listTypeScriptFiles(srcRoot).filter((file) =>
      readFileSync(file, "utf8").includes(publicUrlCall),
    );
    expect(offenders).toEqual([]);
  });

  it("la migración deja el bucket privado y usa comprador_assets", () => {
    expect(migration).toContain("public = false");
    expect(migration).toContain("join public.comprador_assets");
    expect(migration).not.toMatch(/join\s+public\.comprador_acceso/);
  });
});

