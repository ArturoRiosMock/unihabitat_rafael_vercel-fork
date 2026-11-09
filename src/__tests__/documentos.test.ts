import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getServerSession = vi.fn();

vi.mock("@/lib/auth-server", () => ({
  getServerSession: () => getServerSession(),
}));

const adminSession = { role: "admin" as const, nombre: "Ana", email: "admin@test", userId: "user-admin" };
const agenteSession = {
  role: "vendedor" as const,
  nombre: "Agente 1",
  email: "agente1@test",
  vendedorId: "vend-1",
};
const compradorSession = {
  role: "cliente" as const,
  nombre: "Cliente",
  email: "cliente@test",
  compradorId: "comp-1",
};

function query(result: { data: unknown; error: { message: string } | null }) {
  const q: Record<string, unknown> = {};
  const pass = () => q;
  q.select = vi.fn(pass);
  q.eq = vi.fn(pass);
  q.or = vi.fn(pass);
  q.ilike = vi.fn(pass);
  q.limit = vi.fn(pass);
  q.in = vi.fn(async () => result);
  q.order = vi.fn(async () => result);
  q.maybeSingle = vi.fn(async () => result);
  q.insert = vi.fn(async () => ({ error: result.error }));
  q.delete = vi.fn(() => ({ eq: vi.fn(async () => ({ error: result.error })) }));
  return q;
}

function storage(opts: {
  signedUrl?: string | null;
  signedError?: Error | null;
}) {
  const createSignedUrl = vi.fn(async () => ({
    data: opts.signedUrl ? { signedUrl: opts.signedUrl } : null,
    error: opts.signedError ?? null,
  }));
  const upload = vi.fn(async () => ({ error: null }));
  const remove = vi.fn(async () => ({ error: null }));
  return {
    from: vi.fn(() => ({ createSignedUrl, upload, remove })),
    createSignedUrl,
  };
}

describe("getDocumentUrl", () => {
  beforeEach(() => {
    vi.resetModules();
    getServerSession.mockReset();
  });

  it("el admin recibe una URL firmada del bucket documentos", async () => {
    getServerSession.mockResolvedValue(adminSession);
    const docs = query({
      data: { asset_id: "TEST-DOC-001", comprador_id: null, storage_path: "assets/TEST-DOC-001/nota-simple.pdf" },
      error: null,
    });
    const bucket = storage({ signedUrl: "https://example.com/signed?token=abc" });
    vi.doMock("@/lib/supabase/server", () => ({
      createServiceClient: vi.fn(async () => ({
        from: (table: string) => {
          if (table !== "documentos") throw new Error(table);
          return docs;
        },
        storage: bucket,
      })),
    }));

    const { getDocumentUrl } = await import("@/app/actions/documentos");
    const url = await getDocumentUrl("assets/TEST-DOC-001/nota-simple.pdf");

    expect(url).toBe("https://example.com/signed?token=abc");
    expect(bucket.from).toHaveBeenCalledWith("documentos");
    expect(bucket.createSignedUrl).toHaveBeenCalledWith("assets/TEST-DOC-001/nota-simple.pdf", 3600);
  });

  it("propaga Bucket not found si la firma falla", async () => {
    getServerSession.mockResolvedValue(adminSession);
    const docs = query({
      data: { asset_id: "TEST-DOC-001", comprador_id: null, storage_path: "assets/TEST-DOC-001/memoria-test.pdf" },
      error: null,
    });
    const bucket = storage({ signedError: new Error("Bucket not found") });
    vi.doMock("@/lib/supabase/server", () => ({
      createServiceClient: vi.fn(async () => ({
        from: () => docs,
        storage: bucket,
      })),
    }));

    const { getDocumentUrl } = await import("@/app/actions/documentos");
    await expect(getDocumentUrl("assets/TEST-DOC-001/memoria-test.pdf")).rejects.toThrow("Bucket not found");
  });

  it("el agente asignado firma su PDF y el no asignado no", async () => {
    getServerSession.mockResolvedValue(agenteSession);
    const docs = query({
      data: { asset_id: "TEST-DOC-001", comprador_id: null, storage_path: "assets/TEST-DOC-001/nota-simple.pdf" },
      error: null,
    });
    const assigned = query({ data: [{ asset_id: "TEST-DOC-001" }], error: null });
    const bucket = storage({ signedUrl: "https://example.com/agente" });
    vi.doMock("@/lib/supabase/server", () => ({
      createServiceClient: vi.fn(async () => ({
        from: (table: string) => (table === "vendedor_assets" ? assigned : docs),
        storage: bucket,
      })),
    }));

    const { getDocumentUrl } = await import("@/app/actions/documentos");
    await expect(getDocumentUrl("assets/TEST-DOC-001/nota-simple.pdf")).resolves.toBe("https://example.com/agente");
    expect(bucket.createSignedUrl).toHaveBeenCalledTimes(1);

    vi.resetModules();
    getServerSession.mockResolvedValue(agenteSession);
    const ajeno = query({
      data: { asset_id: "OTRO-ACTIVO", comprador_id: null, storage_path: "assets/OTRO-ACTIVO/secreto.pdf" },
      error: null,
    });
    const none = query({ data: [], error: null });
    const blocked = storage({ signedUrl: "https://example.com/no" });
    vi.doMock("@/lib/supabase/server", () => ({
      createServiceClient: vi.fn(async () => ({
        from: (table: string) => (table === "vendedor_assets" ? none : ajeno),
        storage: blocked,
      })),
    }));
    const denied = await import("@/app/actions/documentos");
    await expect(denied.getDocumentUrl("assets/OTRO-ACTIVO/secreto.pdf")).rejects.toThrow("Acceso denegado");
    expect(blocked.createSignedUrl).not.toHaveBeenCalled();
  });

  it("el comprador firma su fila y no la de otro comprador ni un PDF sin comprador", async () => {
    getServerSession.mockResolvedValue(compradorSession);
    const propio = query({
      data: { asset_id: "TEST-DOC-001", comprador_id: "comp-1", storage_path: "assets/TEST-DOC-001/nota-simple.pdf" },
      error: null,
    });
    const bucket = storage({ signedUrl: "https://example.com/comprador" });
    vi.doMock("@/lib/supabase/server", () => ({
      createServiceClient: vi.fn(async () => ({
        from: () => propio,
        storage: bucket,
      })),
    }));
    const { getDocumentUrl } = await import("@/app/actions/documentos");
    await expect(getDocumentUrl("assets/TEST-DOC-001/nota-simple.pdf")).resolves.toBe("https://example.com/comprador");

    vi.resetModules();
    getServerSession.mockResolvedValue(compradorSession);
    const ajeno = query({
      data: { asset_id: "TEST-DOC-001", comprador_id: null, storage_path: "assets/TEST-DOC-001/memoria-test.pdf" },
      error: null,
    });
    const blocked = storage({ signedUrl: "https://example.com/no" });
    vi.doMock("@/lib/supabase/server", () => ({
      createServiceClient: vi.fn(async () => ({
        from: () => ajeno,
        storage: blocked,
      })),
    }));
    const denied = await import("@/app/actions/documentos");
    await expect(denied.getDocumentUrl("assets/TEST-DOC-001/memoria-test.pdf")).rejects.toThrow("Acceso denegado");
    expect(blocked.createSignedUrl).not.toHaveBeenCalled();
  });

  it("no firma una ruta que no está en la tabla", async () => {
    getServerSession.mockResolvedValue(adminSession);
    const docs = query({ data: null, error: null });
    const bucket = storage({ signedUrl: "https://example.com/no" });
    vi.doMock("@/lib/supabase/server", () => ({
      createServiceClient: vi.fn(async () => ({
        from: () => docs,
        storage: bucket,
      })),
    }));
    const { getDocumentUrl } = await import("@/app/actions/documentos");
    await expect(getDocumentUrl("assets/fantasma/secreto.pdf")).rejects.toThrow("Acceso denegado");
    expect(bucket.createSignedUrl).not.toHaveBeenCalled();
  });
});

describe("fetchDocumentos", () => {
  beforeEach(() => {
    vi.resetModules();
    getServerSession.mockReset();
  });

  it("el agente asignado lista los PDF del activo", async () => {
    getServerSession.mockResolvedValue(agenteSession);
    const rows = [
      {
        id: "1",
        asset_id: "TEST-DOC-001",
        comprador_id: null,
        name: "nota-simple.pdf",
        storage_path: "assets/TEST-DOC-001/nota-simple.pdf",
        icon_type: "pdf",
        size_bytes: 10,
        uploaded_by: "Admin",
        created_at: "2026-03-01T00:00:00.000Z",
      },
      {
        id: "2",
        asset_id: "TEST-DOC-001",
        comprador_id: null,
        name: "memoria-test.pdf",
        storage_path: "assets/TEST-DOC-001/memoria-test.pdf",
        icon_type: "pdf",
        size_bytes: 20,
        uploaded_by: "Admin",
        created_at: "2026-03-02T00:00:00.000Z",
      },
    ];
    const docs = query({ data: rows, error: null });
    const assigned = query({ data: [{ asset_id: "TEST-DOC-001" }], error: null });
    vi.doMock("@/lib/supabase/server", () => ({
      createServiceClient: vi.fn(async () => ({
        from: (table: string) => (table === "vendedor_assets" ? assigned : docs),
        storage: storage({}),
      })),
    }));
    const { fetchDocumentos } = await import("@/app/actions/documentos");
    const list = await fetchDocumentos({ assetId: "TEST-DOC-001" });
    expect(list.map((doc) => doc.name)).toEqual(["nota-simple.pdf", "memoria-test.pdf"]);
  });

  it("el agente sin asignación no lista documentos ajenos", async () => {
    getServerSession.mockResolvedValue(agenteSession);
    const docs = query({ data: [{ name: "secreto.pdf", asset_id: "OTRO", comprador_id: null }], error: null });
    const none = query({ data: [], error: null });
    vi.doMock("@/lib/supabase/server", () => ({
      createServiceClient: vi.fn(async () => ({
        from: (table: string) => (table === "vendedor_assets" ? none : docs),
        storage: storage({}),
      })),
    }));
    const { fetchDocumentos } = await import("@/app/actions/documentos");
    await expect(fetchDocumentos({ assetId: "OTRO" })).rejects.toThrow("Acceso denegado");
    expect(docs.order).not.toHaveBeenCalled();
  });
});

describe("uploadDocumento", () => {
  beforeEach(() => {
    vi.resetModules();
    getServerSession.mockReset();
  });

  it("exige archivo cuando el admin sube", async () => {
    getServerSession.mockResolvedValue(adminSession);
    vi.doMock("@/lib/supabase/server", () => ({
      createServiceClient: vi.fn(async () => ({ from: () => query({ data: null, error: null }), storage: storage({}) })),
    }));
    const { uploadDocumento } = await import("@/app/actions/documentos");
    const formData = new FormData();
    formData.append("asset_id", "TEST-DOC-001");
    await expect(uploadDocumento(formData)).rejects.toThrow("No se adjuntó archivo");
  });

  it("un agente no asignado no sube al activo ajeno", async () => {
    getServerSession.mockResolvedValue(agenteSession);
    const none = query({ data: [], error: null });
    const upload = vi.fn();
    vi.doMock("@/lib/supabase/server", () => ({
      createServiceClient: vi.fn(async () => ({
        from: () => none,
        storage: { from: () => ({ upload }) },
      })),
    }));
    const { uploadDocumento } = await import("@/app/actions/documentos");
    const formData = new FormData();
    formData.append("asset_id", "OTRO");
    formData.append("file", new File(["pdf"], "nota-simple.pdf", { type: "application/pdf" }));
    await expect(uploadDocumento(formData)).rejects.toThrow("Acceso denegado");
    expect(upload).not.toHaveBeenCalled();
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
  const action = readFileSync(resolve(__dirname, "../app/actions/documentos.ts"), "utf8");

  it("admin, agente y portal comprador abren el archivo con getDocumentUrl", () => {
    expect(adminPage).toContain("getDocumentUrl(doc.storage_path)");
    expect(adminPage).toContain("Descargar");
    expect(portalPage).toContain("getDocumentUrl(doc.storage_path)");
    expect(portalPage).toContain("Descargar");
    expect(adminPage).not.toContain("getPublicUrl");
    expect(portalPage).not.toContain("getPublicUrl");
    expect(action).toContain("createSignedUrl");
    expect(action).not.toContain("getPublicUrl");
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
