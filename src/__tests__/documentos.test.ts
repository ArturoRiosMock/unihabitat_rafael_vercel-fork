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

