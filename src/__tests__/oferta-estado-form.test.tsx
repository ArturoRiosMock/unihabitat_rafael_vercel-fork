import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OfertaEstadoForm } from "@/components/OfertaEstadoForm";

describe("formulario de cambio de estado", () => {
  it("pide la fecha de firma y no guarda hasta que está", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => undefined);
    render(
      <OfertaEstadoForm estado="pbc_solicitada" importeActual={1000} onSubmit={onSubmit} />,
    );

    await user.selectOptions(screen.getByRole("combobox", { name: "Cambiar estado" }), "firmada");
    expect(screen.getByLabelText("Fecha de firma")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Guardar estado" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("La fecha de firma es obligatoria");

    await user.type(screen.getByLabelText("Fecha de firma"), "2026-11-19");
    await user.click(screen.getByRole("button", { name: "Guardar estado" }));
    expect(onSubmit).toHaveBeenCalledWith({
      estado: "firmada",
      importe: undefined,
      nota: undefined,
      fechaFirma: "2026-11-19",
    });
  });

  it("en una oferta realizada no ofrece saltar a la firma", () => {
    render(
      <OfertaEstadoForm estado="realizada" importeActual={1000} onSubmit={async () => undefined} />,
    );
    const select = screen.getByRole("combobox", { name: "Cambiar estado" });
    expect(select).toHaveTextContent("Contraofertada");
    expect(select).toHaveTextContent("Rechazada");
    expect(select).toHaveTextContent("Aceptada");
    expect(select).not.toHaveTextContent("Fecha de firma");
  });
});
