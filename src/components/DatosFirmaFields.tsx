"use client";

import {
  camposFaltantesFirma,
  etiquetaCampoFirma,
  etiquetaDatosFirma,
  type DatosFirma,
  type TipoPersona,
} from "@/lib/comprador-oferta";

const inputClass =
  "rounded-md border border-border bg-cream2 px-2.5 py-2 text-sm outline-none focus:border-navy focus:bg-white disabled:opacity-70";

export function DatosOfertaEstado({ datos }: { datos: DatosFirma }) {
  const texto = etiquetaDatosFirma(datos);
  const completos = texto === "Datos completos";
  return (
    <p
      data-testid="datos-oferta-estado"
      className={`text-xs font-medium ${completos ? "text-green" : "text-orange"}`}
    >
      {texto}
    </p>
  );
}

export function DatosFirmaFields({
  datos,
  onChange,
  disabled = false,
  emailReadOnly = false,
  idPrefix = "firma",
}: {
  datos: DatosFirma;
  onChange: (next: DatosFirma) => void;
  disabled?: boolean;
  emailReadOnly?: boolean;
  idPrefix?: string;
}) {
  const faltan = new Set(camposFaltantesFirma(datos).map((campo) => campo.key));
  const juridica = datos.tipoPersona === "juridica";

  function set<K extends keyof DatosFirma>(key: K, value: DatosFirma[K]) {
    onChange({ ...datos, [key]: value });
  }

  return (
    <div className="grid grid-cols-2 gap-3" data-testid="datos-firma-fields">
      <div className="col-span-2 flex flex-col gap-1">
        <label htmlFor={`${idPrefix}-tipo`} className="text-[10px] font-semibold uppercase tracking-wider text-muted">
          Tipo de persona
        </label>
        <select
          id={`${idPrefix}-tipo`}
          value={datos.tipoPersona}
          disabled={disabled}
          onChange={(event) => set("tipoPersona", event.target.value as TipoPersona)}
          className={inputClass}
        >
          <option value="fisica">Persona física</option>
          <option value="juridica">Persona jurídica</option>
        </select>
      </div>
      {juridica ? (
        <Field
          id={`${idPrefix}-razon`}
          className="col-span-2"
          label={etiquetaCampoFirma(datos, "razonSocial")}
          value={datos.razonSocial}
          missing={faltan.has("razonSocial")}
          disabled={disabled}
          onChange={(value) => set("razonSocial", value)}
        />
      ) : null}
      <Field
        id={`${idPrefix}-nombre`}
        label={etiquetaCampoFirma(datos, "nombre")}
        value={datos.nombre}
        missing={faltan.has("nombre")}
        disabled={disabled}
        autoComplete="given-name"
        onChange={(value) => set("nombre", value)}
      />
      <Field
        id={`${idPrefix}-apellidos`}
        label={etiquetaCampoFirma(datos, "apellidos")}
        value={datos.apellidos}
        missing={faltan.has("apellidos")}
        disabled={disabled}
        autoComplete="family-name"
        onChange={(value) => set("apellidos", value)}
      />
      <Field
        id={`${idPrefix}-documento`}
        label={etiquetaCampoFirma(datos, "documento")}
        value={datos.documento}
        missing={faltan.has("documento")}
        disabled={disabled}
        onChange={(value) => set("documento", value)}
      />
      <Field
        id={`${idPrefix}-tel`}
        label={etiquetaCampoFirma(datos, "tel")}
        value={datos.tel}
        missing={faltan.has("tel")}
        disabled={disabled}
        autoComplete="tel"
        onChange={(value) => set("tel", value)}
      />
      <Field
        id={`${idPrefix}-email`}
        className="col-span-2"
        label={etiquetaCampoFirma(datos, "email")}
        value={datos.email}
        missing={faltan.has("email")}
        disabled={disabled || emailReadOnly}
        type="email"
        autoComplete="email"
        onChange={(value) => set("email", value)}
      />
      <Field
        id={`${idPrefix}-direccion`}
        className="col-span-2"
        label={etiquetaCampoFirma(datos, "direccion")}
        value={datos.direccion}
        missing={faltan.has("direccion")}
        disabled={disabled}
        autoComplete="street-address"
        onChange={(value) => set("direccion", value)}
      />
      <Field
        id={`${idPrefix}-cp`}
        label={etiquetaCampoFirma(datos, "cp")}
        value={datos.cp}
        missing={faltan.has("cp")}
        disabled={disabled}
        autoComplete="postal-code"
        onChange={(value) => set("cp", value)}
      />
      <Field
        id={`${idPrefix}-poblacion`}
        label={etiquetaCampoFirma(datos, "poblacion")}
        value={datos.poblacion}
        missing={faltan.has("poblacion")}
        disabled={disabled}
        onChange={(value) => set("poblacion", value)}
      />
      <Field
        id={`${idPrefix}-provincia`}
        label={etiquetaCampoFirma(datos, "provincia")}
        value={datos.provincia}
        missing={faltan.has("provincia")}
        disabled={disabled}
        onChange={(value) => set("provincia", value)}
      />
      <Field
        id={`${idPrefix}-pais`}
        label={etiquetaCampoFirma(datos, "pais")}
        value={datos.pais}
        missing={faltan.has("pais")}
        disabled={disabled}
        onChange={(value) => set("pais", value)}
      />
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  missing,
  disabled,
  type = "text",
  className = "",
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  missing: boolean;
  disabled: boolean;
  type?: string;
  className?: string;
  autoComplete?: string;
}) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={id} className="text-[10px] font-semibold uppercase tracking-wider text-muted">
        {label}
        {missing ? <span className="text-orange"> *</span> : null}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        disabled={disabled}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        className={`${inputClass} ${missing && !disabled ? "border-orange" : ""}`}
      />
    </div>
  );
}

export function ResumenDatosFirma({ datos }: { datos: DatosFirma }) {
  const filas: { label: string; value: string }[] = [
    { label: "Tipo de persona", value: datos.tipoPersona === "juridica" ? "Persona jurídica" : "Persona física" },
  ];
  if (datos.tipoPersona === "juridica") {
    filas.push({ label: "Razón social", value: datos.razonSocial });
  }
  filas.push(
    { label: etiquetaCampoFirma(datos, "nombre"), value: datos.nombre },
    { label: etiquetaCampoFirma(datos, "apellidos"), value: datos.apellidos },
    { label: "DNI/NIE/CIF", value: datos.documento },
    { label: "Teléfono", value: datos.tel },
    { label: "Email", value: datos.email },
    { label: "Dirección", value: datos.direccion },
    { label: "Código postal", value: datos.cp },
    { label: "Población", value: datos.poblacion },
    { label: "Provincia", value: datos.provincia },
    { label: "País", value: datos.pais },
  );

  return (
    <dl className="grid grid-cols-2 gap-2" data-testid="resumen-datos-firma">
      {filas.map((fila) => (
        <div key={fila.label} className="rounded-md bg-cream2 px-3 py-2">
          <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted">{fila.label}</dt>
          <dd className="text-sm text-text">{fila.value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
