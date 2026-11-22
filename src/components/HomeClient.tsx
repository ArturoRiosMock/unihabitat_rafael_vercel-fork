"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Search, X, ChevronDown } from "lucide-react";
import { SiteFooter } from "@/components/SiteFooter";
import { BrandMark } from "@/components/BrandMark";
import { fetchPortalFilterOptions } from "@/app/actions/portal";
import type { PortalFilterOptions } from "@/lib/portal-listing";

const STATS = [
  { value: "500+", label: "Activos publicados" },
  { value: "60%", label: "Rentabilidad máxima" },
  { value: "1ª", label: "Plataforma en España" },
];

const HERO_IMAGE = "https://images.unsplash.com/photo-1497366216548-37526070297c?w=700&q=80";

export function HomeClient({ initialOptions }: { initialOptions: PortalFilterOptions }) {
  const router = useRouter();
  const [cat, setCat] = useState("");
  const [prov, setProv] = useState("");
  const [pob, setPob] = useState("");
  const [tipo, setTipo] = useState("");
  const [options, setOptions] = useState(initialOptions);

  useEffect(() => {
    if (!cat && !prov && !pob && !tipo) {
      setOptions(initialOptions);
      return;
    }
    let cancelled = false;
    fetchPortalFilterOptions({ cat, prov, pob, tipo }).then((result) => {
      if (!cancelled && result.ok) setOptions(result.options);
    }).catch(() => { /* se mantienen las opciones anteriores */ });
    return () => { cancelled = true; };
  }, [cat, prov, pob, tipo, initialOptions]);

  function handleCatChange(value: string) {
    setCat(value);
    setProv("");
    setPob("");
  }

  function handleProvChange(value: string) {
    setProv(value);
    if (pob) setPob("");
  }

  function handleSearch() {
    const params = new URLSearchParams();
    if (cat) params.set("cat", cat);
    if (prov) params.set("prov", prov);
    if (pob) params.set("pob", pob);
    if (tipo) params.set("tipo", tipo);
    const qs = params.toString();
    router.push(`/portal${qs ? `?${qs}` : ""}`);
  }

  function handleReset() {
    setCat("");
    setProv("");
    setPob("");
    setTipo("");
  }

  const { cat: catOptions, prov: provOptions, pob: pobOptions, tip: tipOptions } = options;

  return (
    <div className="min-h-screen bg-white font-sans">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-black/5 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <Link href="/" className="flex items-center">
            <BrandMark size={28} textClassName="text-lg text-navy" />
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-medium text-navy/70 md:flex">
            <Link href="/portal" className="transition-colors hover:text-navy">Propiedades</Link>
            <Link href="/portal" className="transition-colors hover:text-navy">Inversores</Link>
            <Link href="/portal?cat=NPL" className="transition-colors hover:text-navy">Carteras NPL</Link>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login" className="hidden rounded-lg border border-navy/20 px-4 py-1.5 text-sm font-medium text-navy transition-all hover:border-navy/50 md:block">
              Acceder
            </Link>
            <Link href="/portal" className="rounded-lg bg-navy px-4 py-1.5 text-sm font-medium text-white transition-all hover:bg-navy3">
              Ver propiedades
            </Link>
          </div>
        </div>
      </header>

      <section className="relative min-h-screen overflow-hidden bg-white pt-16">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -right-32 top-0 h-[70vh] w-[55vw] rounded-bl-[80px] bg-cream" />
          <div className="absolute bottom-0 left-0 h-40 w-full bg-gradient-to-t from-white/80 to-transparent" />
        </div>

        <div className="relative mx-auto flex max-w-7xl flex-col items-start gap-16 px-6 py-20 lg:flex-row lg:items-center lg:py-32">
          <div className="flex-1 lg:max-w-[48%]">
            <span className="mb-4 inline-block rounded-full border border-gold/30 bg-gold/10 px-4 py-1 text-xs font-semibold uppercase tracking-widest text-gold">
              Especial Inversores
            </span>
            <h1 className="text-4xl font-black leading-[1.1] text-navy lg:text-5xl xl:text-6xl">
              La plataforma n.º&nbsp;1 en compra de activos&nbsp;<span className="relative whitespace-nowrap">
                inmobiliarios
                <svg className="absolute -bottom-2 left-0 w-full" viewBox="0 0 300 12" fill="none">
                  <path d="M0 10 Q150 0 300 10" stroke="#b8933a" strokeWidth="3" strokeLinecap="round" />
                </svg>
              </span>.
            </h1>
            <p className="mt-8 max-w-md text-base leading-relaxed text-navy/60">
              Adelántate en activos judicializados y consigue rentabilidades de hasta un <strong className="text-navy">60%</strong> en el mercado inmobiliario.
            </p>

            <div className="mt-10 flex gap-8">
              {STATS.map((s) => (
                <div key={s.label}>
                  <div className="text-2xl font-black text-navy">{s.value}</div>
                  <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wider text-navy/40">{s.label}</div>
                </div>
              ))}
            </div>

            <div className="relative mt-12 h-52 overflow-hidden rounded-2xl shadow-2xl shadow-navy/10">
              <Image
                src={HERO_IMAGE}
                alt="Activos inmobiliarios"
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 480px"
                className="object-cover"
              />
            </div>
          </div>

          <div className="w-full lg:w-[380px] xl:w-[420px]">
            <div className="rounded-2xl border border-border bg-white shadow-2xl shadow-navy/10">
              <div className="border-b border-border px-6 py-5">
                <h2 className="text-xl font-bold text-navy">
                  Encuentra el tuyo<span className="text-gold">_</span>
                </h2>
              </div>

              <div className="space-y-4 p-6">
                <Filter label="Categoría" value={cat} onChange={handleCatChange} options={catOptions} />
                <Filter label="Provincia" value={prov} onChange={handleProvChange} options={provOptions} />
                <Filter label="Población" value={pob} onChange={setPob} options={pobOptions} />
                <Filter label="Tipología" value={tipo} onChange={setTipo} options={tipOptions} />

                <button
                  onClick={handleSearch}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-navy py-3.5 text-sm font-bold uppercase tracking-widest text-white transition-all hover:bg-navy3 active:scale-[0.98]"
                >
                  <Search size={16} />
                  Búsqueda
                </button>

                <button
                  onClick={handleReset}
                  className="flex w-full items-center justify-center gap-1.5 py-1 text-xs font-medium text-navy/40 transition-colors hover:text-navy/70"
                >
                  <X size={12} />
                  Reiniciar
                </button>
              </div>
            </div>

            <p className="mt-4 text-center text-[11px] text-navy/30">
              Accede a <strong className="text-navy/50">+500 activos judicializados</strong> en toda España
            </p>
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-cream py-16">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            {[
              { title: "Cesión de Remate", desc: "Adquiere activos inmobiliarios con grandes descuentos sobre el valor de tasación.", href: "/portal?cat=CDR" },
              { title: "Carteras NPL", desc: "Accede a carteras completas de préstamos hipotecarios con potencial de máxima rentabilidad.", href: "/portal?cat=NPL" },
              { title: "Catálogo completo", desc: "Explora todos los activos publicados (CDR, NPL y resto de categorías).", href: "/portal" },
            ].map((f) => (
              <div key={f.title} className="rounded-xl border border-border bg-white p-6 shadow-sm">
                <h3 className="text-base font-bold text-navy">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-navy/50">{f.desc}</p>
                <button
                  type="button"
                  onClick={() => router.push(f.href)}
                  className="mt-4 text-xs font-semibold text-gold underline underline-offset-2 hover:text-gold2"
                >
                  Ver propiedades →
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

function Filter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-navy/50">
        {label}
      </label>
      <div className="relative">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full appearance-none rounded-lg border border-border bg-cream/50 px-4 py-3 pr-10 text-sm text-navy focus:border-navy/40 focus:outline-none focus:ring-2 focus:ring-navy/10"
        >
          <option value="">Todas</option>
          {options.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
        <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-navy/40" />
      </div>
    </div>
  );
}
