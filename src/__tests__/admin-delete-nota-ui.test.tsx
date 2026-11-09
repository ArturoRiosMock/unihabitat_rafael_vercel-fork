import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AssetNoteCard, DELETE_NOTA_CONFIRM } from "@/components/AssetNoteCard";
import type { NotaRow } from "@/app/actions/notas";

const note: NotaRow = {
  id: "11111111-1111-1111-1111-111111111111",
  asset_id: "REF-1",
  comprador_id: null,
  author: "Ana Admin",
  text: "Hipoteca no reflejada en el sistema",
  created_at: "2026-03-01T10:00:00.000Z",
};

describe("AssetNoteCard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("el agente no ve el botón de borrar", () => {
    render(<AssetNoteCard note={note} />);

    expect(screen.getByText("Hipoteca no reflejada en el sistema")).toBeVisible();
    expect(screen.getByText("Ana Admin")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Borrar nota" })).not.toBeInTheDocument();
  });

  it("el admin cancela la confirmación y la nota sigue", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn(async () => undefined);
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<AssetNoteCard note={note} onDelete={onDelete} />);

    await user.click(screen.getByRole("button", { name: "Borrar nota" }));

    expect(window.confirm).toHaveBeenCalledWith(DELETE_NOTA_CONFIRM);
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByText("Hipoteca no reflejada en el sistema")).toBeVisible();
  });

  it("el admin confirma y borra solo esa nota", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn(async () => undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<AssetNoteCard note={note} onDelete={onDelete} />);

    await user.click(screen.getByRole("button", { name: "Borrar nota" }));

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith(note.id);
  });
});

describe("borrado de notas en la ficha de admin", () => {
  const assetPage = readFileSync(resolve(__dirname, "../app/admin/assets/[id]/page.tsx"), "utf8");
  const portalPage = readFileSync(
    resolve(__dirname, "../app/portal/privado/inmueble/[slug]/page.tsx"),
    "utf8",
  );

  it("muestra Borrar solo al admin en las cuatro listas de notas de la ficha", () => {
    expect(assetPage).toContain("deleteNota");
    expect(assetPage).toContain("canDeleteNotes={userIsAdmin}");
    expect(assetPage.match(/onDelete=\{canDeleteNotes \?/g)).toHaveLength(4);
    expect(assetPage).toContain('title="Notas del activo"');
    expect(assetPage).toContain("Notas y aclaraciones");
    expect(assetPage).toContain("Notas del agente");
    expect(assetPage).toContain('title="Notas privadas"');
  });

  it("el portal del comprador no ofrece borrar notas", () => {
    expect(portalPage).not.toContain("deleteNota");
    expect(portalPage).not.toContain("Borrar nota");
    expect(portalPage).toContain("Mis notas");
  });
});
