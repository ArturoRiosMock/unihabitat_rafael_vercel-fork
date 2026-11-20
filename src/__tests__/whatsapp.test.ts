import { describe, expect, it, vi } from "vitest";
import {
  enviarWhatsappOportunidades,
  extraerMensajesWhatsapp,
  telefonoWhatsapp,
  telefonosEquivalentes,
  verificarWebhookWhatsapp,
  whatsappEnDryRun,
  whatsappHabilitado,
} from "@/lib/whatsapp";

const oportunidad = { titulo: "Piso", lugar: "Getafe", precioLabel: "120.000 €" };

describe("adaptador de WhatsApp", () => {
  it("está apagado salvo WHATSAPP_ENABLED=true y el dry-run es el defecto", () => {
    expect(whatsappHabilitado({})).toBe(false);
    expect(whatsappHabilitado({ WHATSAPP_ENABLED: "false" })).toBe(false);
    expect(whatsappHabilitado({ WHATSAPP_ENABLED: "true" })).toBe(true);
    expect(whatsappEnDryRun({})).toBe(true);
    expect(whatsappEnDryRun({ WHATSAPP_DRY_RUN: "false" })).toBe(false);
  });

  it("normaliza un móvil español y lo casa con el del comprador", () => {
    expect(telefonoWhatsapp("600 111 222")).toBe("34600111222");
    expect(telefonoWhatsapp("+34 600 111 222")).toBe("34600111222");
    expect(telefonosEquivalentes("600111222", "34600111222")).toBe(true);
    expect(telefonosEquivalentes("600111222", "611222333")).toBe(false);
  });

  it("verifica el GET del webhook y rechaza un token distinto", () => {
    expect(verificarWebhookWhatsapp({
      mode: "subscribe",
      token: "secreto",
      challenge: "123",
    }, "secreto")).toEqual({ ok: true, challenge: "123" });
    expect(verificarWebhookWhatsapp({
      mode: "subscribe",
      token: "otro",
      challenge: "123",
    }, "secreto").ok).toBe(false);
  });

  it("saca el texto de un mensaje entrante", () => {
    expect(extraerMensajesWhatsapp({
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: "34600111222",
              id: "wamid.1",
              type: "text",
              text: { body: "Me interesa" },
            }],
          },
        }],
      }],
    })).toEqual([{
      telefono: "34600111222",
      wamid: "wamid.1",
      cuerpo: "Me interesa",
      tipo: "text",
    }]);
  });

  it("en dry-run no llama a la API y desactivado no envía", async () => {
    const fetchImpl = vi.fn();
    const omitido = await enviarWhatsappOportunidades({
      telefono: "600111222",
      nombre: "Ana",
      oportunidades: [oportunidad],
    }, { WHATSAPP_ENABLED: "false" }, fetchImpl);
    expect(omitido).toBe("omitido");
    expect(fetchImpl).not.toHaveBeenCalled();

    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const enviado = await enviarWhatsappOportunidades({
      telefono: "600111222",
      nombre: "Ana",
      oportunidades: [oportunidad],
    }, {
      WHATSAPP_ENABLED: "true",
      WHATSAPP_DRY_RUN: "true",
      WHATSAPP_PHONE_NUMBER_ID: "123",
      WHATSAPP_TEMPLATE_OPORTUNIDADES: "oportunidades",
      WHATSAPP_ACCESS_TOKEN: "no-loguear",
    }, fetchImpl);
    expect(enviado).toBe("enviado");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(log.mock.calls.some((call) => JSON.stringify(call).includes("no-loguear"))).toBe(false);
    log.mockRestore();
  });
});
