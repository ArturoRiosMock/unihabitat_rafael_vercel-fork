"use client";

import { Suspense, useState, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn, signUp } from "./actions";
import { LogIn, UserPlus, AlertCircle, ChevronDown, Phone } from "lucide-react";
import COUNTRY_CODES from "@/lib/country-codes";
import { formatPhoneNumber } from "@/lib/phone-utils";

function PhoneInput({ name }: { name: string }) {
  const [selected, setSelected] = useState(COUNTRY_CODES[0]);
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (open && searchRef.current) searchRef.current.focus();
    if (!open) setSearch("");
  }, [open]);

  const maxDigits = selected.format.replace(/[^X]/g, "").length;

  function handlePhoneChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\D/g, "").slice(0, maxDigits);
    setPhone(formatPhoneNumber(raw, selected.format));
  }

  const filtered = search
    ? COUNTRY_CODES.filter(
        (c) =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          c.code.includes(search) ||
          c.country.toLowerCase().includes(search.toLowerCase())
      )
    : COUNTRY_CODES;

  const fullValue = phone ? `${selected.code} ${phone}` : "";

  return (
    <div className="mb-4">
      <label className="mb-1.5 block text-xs font-medium text-white/60">
        <span className="flex items-center gap-1"><Phone size={12} /> Teléfono</span>
      </label>
      <input type="hidden" name={name} value={fullValue} />
      <div className="flex gap-2">
        {/* Country selector */}
        <div ref={ref} className="relative">
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="flex h-[42px] items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.06] px-2.5 text-sm text-white transition-colors hover:border-white/20 focus:border-gold/50 focus:outline-none focus:ring-1 focus:ring-gold/30"
          >
            <span className="text-base">{selected.flag}</span>
            <span className="text-white/70">{selected.code}</span>
            <ChevronDown size={12} className={`text-white/40 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>

          {open && (
            <div className="absolute left-0 top-full z-50 mt-1 max-h-56 w-64 overflow-hidden rounded-lg border border-white/10 bg-[#1a2332] shadow-xl">
              <div className="border-b border-white/10 p-2">
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar país..."
                  className="w-full rounded-md border border-white/10 bg-white/[0.06] px-2.5 py-1.5 text-xs text-white placeholder:text-white/30 focus:border-gold/50 focus:outline-none"
                />
              </div>
              <div className="max-h-44 overflow-y-auto">
                {filtered.map((c) => (
                  <button
                    key={c.code + c.country}
                    type="button"
                    onClick={() => { setSelected(c); setOpen(false); setPhone(""); }}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-white/[0.08] ${selected.code === c.code && selected.country === c.country ? "bg-white/[0.06] text-gold" : "text-white/80"}`}
                  >
                    <span className="text-base">{c.flag}</span>
                    <span className="flex-1 truncate">{c.name}</span>
                    <span className="text-xs text-white/40">{c.code}</span>
                  </button>
                ))}
                {filtered.length === 0 && (
                  <p className="px-3 py-2 text-xs text-white/30">Sin resultados</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Phone number input */}
        <input
          type="tel"
          value={phone}
          onChange={handlePhoneChange}
          placeholder={selected.format.replace(/X/g, "0")}
          className="flex-1 rounded-lg border border-white/10 bg-white/[0.06] px-3.5 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-gold/50 focus:outline-none focus:ring-1 focus:ring-gold/30"
        />
      </div>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}

function LoginForm() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") ?? "";
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const fd = new FormData(e.currentTarget);
    fd.set("redirect", redirectTo);

    if (mode === "register") {
      const pass = fd.get("password") as string;
      const confirm = fd.get("confirmPassword") as string;
      if (pass !== confirm) {
        setError("Las contraseñas no coinciden");
        setLoading(false);
        return;
      }
    }

    try {
      const result = mode === "login" ? await signIn(fd) : await signUp(fd);
      if (result?.error) setError(result.error);
    } catch {
      // signIn/signUp llaman a redirect() en éxito; la excepción NEXT_REDIRECT
      // es manejada por el framework para navegar el cliente.
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-navy via-navy2 to-navy3 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex justify-center">
            {/* BrandMark: * negro sobre fondo oscuro */}
            <span className="inline-flex items-center gap-2.5">
              <img src="/LogoAzul.svg" alt="" className="h-12 w-auto" />
              <h1 className="text-2xl font-bold text-white">
                Unihabitat<span className="text-black">*</span>
              </h1>
            </span>
          </div>
          <p className="mt-1 text-sm text-white/50">Gestión de activos inmobiliarios</p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-2xl border border-white/10 bg-white/[0.06] p-8 backdrop-blur-md">
          <div className="mb-6 flex rounded-lg bg-white/[0.06] p-1">
            <button
              type="button"
              onClick={() => { setMode("login"); setError(""); }}
              className={`flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-all ${mode === "login" ? "bg-white/10 text-white shadow" : "text-white/40 hover:text-white/60"}`}
            >
              <LogIn size={14} /> Iniciar sesión
            </button>
            <button
              type="button"
              onClick={() => { setMode("register"); setError(""); }}
              className={`flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-all ${mode === "register" ? "bg-white/10 text-white shadow" : "text-white/40 hover:text-white/60"}`}
            >
              <UserPlus size={14} /> Registrarse
            </button>
          </div>

          {mode === "register" && (
            <>
              <div className="mb-4 grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-white/60">Nombre</label>
                  <input
                    name="nombre"
                    type="text"
                    required
                    autoComplete="given-name"
                    className="w-full rounded-lg border border-white/10 bg-white/[0.06] px-3.5 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-gold/50 focus:outline-none focus:ring-1 focus:ring-gold/30"
                    placeholder="Nombre"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-white/60">Apellidos</label>
                  <input
                    name="apellidos"
                    type="text"
                    required
                    autoComplete="family-name"
                    className="w-full rounded-lg border border-white/10 bg-white/[0.06] px-3.5 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-gold/50 focus:outline-none focus:ring-1 focus:ring-gold/30"
                    placeholder="Apellidos"
                  />
                </div>
              </div>
              <PhoneInput name="tel" />
            </>
          )}

          <div className="mb-4">
            <label className="mb-1.5 block text-xs font-medium text-white/60">Email</label>
            <input
              name="email"
              type="email"
              required
              className="w-full rounded-lg border border-white/10 bg-white/[0.06] px-3.5 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-gold/50 focus:outline-none focus:ring-1 focus:ring-gold/30"
              placeholder="tu@email.com"
            />
          </div>

          <div className={mode === "register" ? "mb-4" : "mb-2"}>
            <label className="mb-1.5 block text-xs font-medium text-white/60">Contraseña</label>
            <input
              name="password"
              type="password"
              required
              minLength={6}
              className="w-full rounded-lg border border-white/10 bg-white/[0.06] px-3.5 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-gold/50 focus:outline-none focus:ring-1 focus:ring-gold/30"
              placeholder="Mínimo 6 caracteres"
            />
          </div>

          {mode === "login" && (
            <div className="mb-6 text-right">
              <Link
                href="/login/reset"
                className="text-xs text-white/50 hover:text-gold transition-colors"
              >
                ¿Olvidaste tu contraseña?
              </Link>
            </div>
          )}

          {mode === "register" && (
            <div className="mb-6">
              <label className="mb-1.5 block text-xs font-medium text-white/60">Confirmar contraseña</label>
              <input
                name="confirmPassword"
                type="password"
                required
                minLength={6}
                className="w-full rounded-lg border border-white/10 bg-white/[0.06] px-3.5 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-gold/50 focus:outline-none focus:ring-1 focus:ring-gold/30"
                placeholder="Repite la contraseña"
              />
            </div>
          )}

          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">
              <AlertCircle size={14} /> {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-gradient-to-r from-gold to-gold3 py-2.5 text-sm font-semibold text-navy shadow-md transition-all hover:shadow-lg disabled:opacity-50"
          >
            {loading ? "Procesando..." : mode === "login" ? "Entrar" : "Crear cuenta"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-white/30">
          Unihabitat v2.0 — Panel de gestión inmobiliaria
        </p>
      </div>
    </div>
  );
}
