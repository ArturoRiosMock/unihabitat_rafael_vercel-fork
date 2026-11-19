import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OfertaDatosComprador } from "@/components/OfertaDatosComprador";
import { datosFirmaVacios, type DatosFirma } from "@/lib/comprador-oferta";

const completa: DatosFirma = {
  ...datosFirmaVacios(),
  nombre: "Ana",
  apellidos: "García",
  documento: "12345678Z",
  direccion: "Calle Mayor 1",
  cp: "28001",
  poblacion: "Madrid",
  provincia: "Madrid",
  pais: "España",
  tel: "600111222",
  email: "ana@example.com",
};

describe("formulario de oferta con la ficha del comprador", () => {
  it("muestra los datos completos solo para revisar", () => {
    render(<OfertaDatosComprador datos={completa} onChange={() => undefined} />);
    expect(screen.getByTestId("datos-oferta-estado")).toHaveTextContent("Datos completos");
    expect(screen.getByText("Revisa los datos. La oferta queda lista para firmar.")).toBeInTheDocument();
    expect(screen.getByTestId("resumen-datos-firma")).toHaveTextContent("Ana");
    expect(screen.getByTestId("resumen-datos-firma")).toHaveTextContent("García");
    expect(screen.queryByTestId("datos-firma-fields")).not.toBeInTheDocument();
  });

  it("pide los campos que faltan y deja corregir una ficha ya completa", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <OfertaDatosComprador datos={datosFirmaVacios()} onChange={() => undefined} />,
    );
    expect(screen.getByTestId("datos-oferta-estado").textContent).toMatch(/^Faltan: Nombre, Apellidos/);
    expect(screen.getByLabelText(/Nombre/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Apellidos/)).toBeInTheDocument();

    rerender(<OfertaDatosComprador datos={completa} onChange={() => undefined} />);
    await user.click(screen.getByRole("button", { name: "Corregir datos" }));
    expect(screen.getByTestId("datos-firma-fields")).toBeInTheDocument();
    expect(screen.getByLabelText("Nombre")).toHaveValue("Ana");
    expect(screen.getByLabelText("Apellidos")).toHaveValue("García");
  });
});
