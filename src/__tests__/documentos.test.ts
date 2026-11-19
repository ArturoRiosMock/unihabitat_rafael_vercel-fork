import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NDA_NOT_ACCEPTED } from "@/lib/nda";

const getServerSession = vi.fn();

vi.mock("@/lib/auth-server", () => ({
  getServerSession: () => getServerSession(),
}));

const adminSession = { role: "admin" as const, nombre: "Ana", email: "admin@test", userId: "user-admin" };
const agenteSession = {
  role: "vendedor" as const,
  nombre: "Agente 1",
  email: "agente1@propcrm.com",
  vendedorId: "vend-1",
  userId: "user-agente",
};
const compradorSession = {
  role: "cliente" as const,
  nombre: "Cliente",
  email: "cliente@test",
  compradorId: "comp-1",
  userId: "user-comp",
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

/** Filas de `vendedor_assets` o de aceptaciones NDA, filtradas por el `.in()`. */
function idListQuery(assetIds: string[]) {
  const q = query({ data: [], error: null });
  q.in = vi.fn(async (_column: string, ids: string[]) => ({
    data: ids.filter((id) => assetIds.includes(id)).map((asset_id) => ({ asset_id })),
    error: null,
  }));
  return q;
}

function docsTable(rows: Array<{ asset_id: string | null; storage_path: string }>) {
  const q = query({ data: null, error: null });
  let path = "";
  let assetId = "";
  q.eq = vi.fn((col: string, val: string) => {
    if (col === "storage_path") path = val;
    if (col === "asset_id") assetId = val;
    return q;
  });
  q.maybeSingle = vi.fn(async () => ({
    data: rows.find((row) => row.storage_path === path) ?? null,
    error: null,
  }));
  q.order = vi.fn(async () => ({
    data: rows.filter((row) => row.asset_id === assetId),
    error: null,
  }));
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
    const bucket = storage({ signedUrl: "https://example.com/agente" });
    vi.doMock("@/lib/supabase/server", () => ({
      createServiceClient: vi.fn(async () => ({
        from: (table: string) => {
          if (table === "vendedor_assets") return idListQuery(["TEST-DOC-001"]);
          if (table === "asset_nda_aceptaciones") return idListQuery(["TEST-DOC-001"]);
          return docs;
        },
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
    const blocked = storage({ signedUrl: "https://example.com/no" });
    vi.doMock("@/lib/supabase/server", () => ({
      createServiceClient: vi.fn(async () => ({
        from: (table: string) => {
          if (table === "vendedor_assets") return idListQuery([]);
          if (table === "asset_nda_aceptaciones") return idListQuery(["OTRO-ACTIVO"]);
          return ajeno;
        },
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
        from: (table: string) => {
          if (table === "asset_nda_aceptaciones") return idListQuery(["TEST-DOC-001"]);
          if (table === "comprador_assets") return idListQuery(["TEST-DOC-001"]);
          return propio;
        },
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
        from: (table: string) => {
          if (table === "asset_nda_aceptaciones") return idListQuery(["TEST-DOC-001"]);
          if (table === "comprador_assets") return idListQuery(["TEST-DOC-001"]);
          return ajeno;
        },
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
    vi.doMock("@/lib/supabase/server", () => ({
      createServiceClient: vi.fn(async () => ({
        from: (table: string) => {
          if (table === "vendedor_assets") return idListQuery(["TEST-DOC-001"]);
          if (table === "asset_nda_aceptaciones") return idListQuery(["TEST-DOC-001"]);
          return docs;
        },
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
    vi.doMock("@/lib/supabase/server", () => ({
      createServiceClient: vi.fn(async () => ({
        from: (table: string) => {
          if (table === "vendedor_assets") return idListQuery([]);
          if (table === "asset_nda_aceptaciones") return idListQuery(["OTRO"]);
          return docs;
        },
        storage: storage({}),
      })),
    }));
    const { fetchDocumentos } = await import("@/app/actions/documentos");
    await expect(fetchDocumentos({ assetId: "OTRO" })).rejects.toThrow("Acceso denegado");
    expect(docs.order).not.toHaveBeenCalled();
  });
});

describe("NDA del activo en servidor", () => {
  const notaA = {
    id: "a",
    asset_id: "TEST-DOC-001",
    comprador_id: null as string | null,
    name: "nota-a.pdf",
    storage_path: "assets/TEST-DOC-001/nota-a.pdf",
    icon_type: "pdf",
    size_bytes: 10,
    uploaded_by: "Admin",
    created_at: "2026-03-01T00:00:00.000Z",
  };
  const notaB = {
    ...notaA,
    id: "b",
    asset_id: "ACTIVO-B",
    name: "nota-b.pdf",
    storage_path: "assets/ACTIVO-B/nota-b.pdf",
  };

  beforeEach(() => {
    vi.resetModules();
    getServerSession.mockReset();
  });

  function mockAgente(assigned: string[], nda: string[]) {
    const docs = docsTable([notaA, notaB]);
    const bucket = storage({ signedUrl: "https://example.com/signed" });
    vi.doMock("@/lib/supabase/server", () => ({
      createServiceClient: vi.fn(async () => ({
        from: (table: string) => {
          if (table === "vendedor_assets") return idListQuery(assigned);
          if (table === "asset_nda_aceptaciones") return idListQuery(nda);
          if (table === "documentos") return docs;
          throw new Error(table);
        },
        storage: bucket,
      })),
    }));
    return { docs, bucket };
  }

  it("sin NDA rechaza el listado y la URL firmada", async () => {
    getServerSession.mockResolvedValue(agenteSession);
    const { docs, bucket } = mockAgente(["TEST-DOC-001", "ACTIVO-B"], []);
    const { fetchDocumentos, getDocumentUrl } = await import("@/app/actions/documentos");

    await expect(fetchDocumentos({ assetId: "TEST-DOC-001" })).rejects.toThrow(NDA_NOT_ACCEPTED);
    expect(docs.order).not.toHaveBeenCalled();
    await expect(getDocumentUrl(notaA.storage_path)).rejects.toThrow(NDA_NOT_ACCEPTED);
    expect(bucket.createSignedUrl).not.toHaveBeenCalled();
  });

  it("con el NDA del activo A abre A y no B", async () => {
    getServerSession.mockResolvedValue(agenteSession);
    const { bucket } = mockAgente(["TEST-DOC-001", "ACTIVO-B"], ["TEST-DOC-001"]);
    const { fetchDocumentos, getDocumentUrl } = await import("@/app/actions/documentos");

    const listA = await fetchDocumentos({ assetId: "TEST-DOC-001" });
    expect(listA.map((doc) => doc.name)).toEqual(["nota-a.pdf"]);
    await expect(getDocumentUrl(notaA.storage_path)).resolves.toBe("https://example.com/signed");
    expect(bucket.createSignedUrl).toHaveBeenCalledWith(notaA.storage_path, 3600);

    await expect(fetchDocumentos({ assetId: "ACTIVO-B" })).rejects.toThrow(NDA_NOT_ACCEPTED);
    await expect(getDocumentUrl(notaB.storage_path)).rejects.toThrow(NDA_NOT_ACCEPTED);
    expect(bucket.createSignedUrl).toHaveBeenCalledTimes(1);
  });

  it("el admin lista y firma sin haber aceptado el NDA", async () => {
    getServerSession.mockResolvedValue(adminSession);
    const docs = query({
      data: { asset_id: "ACTIVO-B", comprador_id: null, storage_path: notaB.storage_path },
      error: null,
    });
    docs.order = vi.fn(async () => ({ data: [notaB], error: null }));
    const bucket = storage({ signedUrl: "https://example.com/admin" });
    vi.doMock("@/lib/supabase/server", () => ({
      createServiceClient: vi.fn(async () => ({
        from: (table: string) => {
          if (table === "asset_nda_aceptaciones" || table === "vendedor_assets") {
            throw new Error(`el admin no consulta ${table}`);
          }
          return docs;
        },
        storage: bucket,
      })),
    }));
    const { fetchDocumentos, getDocumentUrl } = await import("@/app/actions/documentos");

    const list = await fetchDocumentos({ assetId: "ACTIVO-B" });
    expect(list.map((doc) => doc.name)).toEqual(["nota-b.pdf"]);
    await expect(getDocumentUrl(notaB.storage_path)).resolves.toBe("https://example.com/admin");
    expect(bucket.createSignedUrl).toHaveBeenCalledWith(notaB.storage_path, 3600);
  });
});

describe("NDA del activo para un comprador", () => {
  beforeEach(() => {
    vi.resetModules();
    getServerSession.mockReset();
  });

  function mockComprador(invited: string[]) {
    vi.doMock("@/lib/supabase/server", () => ({
      createServiceClient: vi.fn(async () => ({
        from: (table: string) => {
          if (table === "comprador_assets") return idListQuery(invited);
          if (table === "asset_nda_aceptaciones") return idListQuery([]);
          if (table === "assets") {
            return query({
              data: { id: "test-pub-002", referencia: "PUB-002", pob: "Madrid", addr: "Calle 2" },
              error: null,
            });
          }
          throw new Error(table);
        },
        storage: storage({}),
      })),
    }));
  }

  it("sin invitación devuelve acceso denegado y no el formulario", async () => {
    getServerSession.mockResolvedValue(compradorSession);
    mockComprador([]);
    const { getAssetDocumentosGate } = await import("@/app/actions/documentos");
    await expect(getAssetDocumentosGate("test-pub-002")).resolves.toEqual({ state: "denied" });
  });

  it("invitado sin NDA sigue recibiendo el formulario de ese activo", async () => {
    getServerSession.mockResolvedValue(compradorSession);
    mockComprador(["test-pub-002"]);
    const { getAssetDocumentosGate } = await import("@/app/actions/documentos");
    const gate = await getAssetDocumentosGate("test-pub-002");
    expect(gate.state).toBe("nda");
    if (gate.state === "nda") {
      expect(gate.text).toContain("PUB-002");
    }
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
