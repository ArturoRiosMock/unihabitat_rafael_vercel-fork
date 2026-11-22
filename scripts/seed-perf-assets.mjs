/**
 * Inserta o borra activos de prueba PERF- para medir el listado.
 * No forma parte del build. No toca filas que no empiecen por PERF-.
 *
 *   node scripts/seed-perf-assets.mjs
 *   node scripts/seed-perf-assets.mjs --count 200
 *   node scripts/seed-perf-assets.mjs --delete
 *
 * Lee SUPABASE_URL o NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY
 * del entorno o de .env.local / .env. No imprime secretos.
 */
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const PREFIX = "PERF-";

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const PLACES = [
  { prov: "Madrid", pob: "Madrid", cp: "28013", lat: 40.4168, lng: -3.7038 },
  { prov: "Barcelona", pob: "Barcelona", cp: "08002", lat: 41.3874, lng: 2.1686 },
  { prov: "Valencia", pob: "Valencia", cp: "46001", lat: 39.4699, lng: -0.3763 },
  { prov: "Sevilla", pob: "Sevilla", cp: "41001", lat: 37.3891, lng: -5.9845 },
  { prov: "Alicante", pob: "Alicante", cp: "03001", lat: 38.3452, lng: -0.481 },
  { prov: "Málaga", pob: "Málaga", cp: "29001", lat: 36.7213, lng: -4.4214 },
  { prov: "Murcia", pob: "Murcia", cp: "30001", lat: 37.9922, lng: -1.1307 },
  { prov: "Zaragoza", pob: "Zaragoza", cp: "50001", lat: 41.6488, lng: -0.8891 },
  { prov: "Vizcaya", pob: "Bilbao", cp: "48001", lat: 43.263, lng: -2.935 },
  { prov: "A Coruña", pob: "A Coruña", cp: "15001", lat: 43.3623, lng: -8.4115 },
  { prov: "Baleares", pob: "Palma", cp: "07001", lat: 39.5696, lng: 2.6502 },
  { prov: "Las Palmas", pob: "Las Palmas de Gran Canaria", cp: "35001", lat: 28.1235, lng: -15.4366 },
  { prov: "Asturias", pob: "Oviedo", cp: "33001", lat: 43.3614, lng: -5.8493 },
  { prov: "Granada", pob: "Granada", cp: "18001", lat: 37.1773, lng: -3.5986 },
  { prov: "Córdoba", pob: "Córdoba", cp: "14001", lat: 37.8882, lng: -4.7794 },
  { prov: "Valladolid", pob: "Valladolid", cp: "47001", lat: 41.6523, lng: -4.7245 },
  { prov: "Toledo", pob: "Toledo", cp: "45001", lat: 39.8628, lng: -4.0273 },
  { prov: "Cádiz", pob: "Cádiz", cp: "11001", lat: 36.5271, lng: -6.2886 },
];

const TIPS = [
  { tip: "PISO", tipC: "tp-piso", tvia: "CALLE" },
  { tip: "CASA", tipC: "tp-casa", tvia: "CALLE" },
  { tip: "LOCAL", tipC: "tp-local", tvia: "AVENIDA" },
  { tip: "NAVE", tipC: "tp-nave", tvia: "POLIGONO" },
  { tip: "TERRENO", tipC: "tp-terreno", tvia: "CAMINO" },
  { tip: "GARAJE", tipC: "tp-garaje", tvia: "CALLE" },
];

function pad(n) {
  return String(n).padStart(5, "0");
}

function assetId(n) {
  return `${PREFIX}${pad(n)}`;
}

function buildRows(count) {
  const assets = [];
  const propiedades = [];
  for (let n = 1; n <= count; n++) {
    const place = PLACES[n % PLACES.length];
    const tipo = TIPS[n % TIPS.length];
    const id = assetId(n);
    const jitter = ((n % 17) - 8) * 0.01;
    const categoria = n % 3 === 0 ? "NPL" : "CDR";
    const precio = categoria === "CDR" ? 45000 + (n % 80) * 5500 : null;
    const deuda = categoria === "NPL" ? 20000 + (n % 90) * 3200 : null;
    const sqm = 40 + (n % 50) * 4;
    const activoId = n % 5 === 0 ? assetId(n - 1) : id;
    assets.push({
      id,
      referencia: id,
      public_slug: `perf-${pad(n)}`,
      prov: place.prov,
      pob: place.pob,
      cp: place.cp,
      addr: `${tipo.tvia} Prueba ${n}`,
      tip: tipo.tip,
      tip_c: tipo.tipC,
      precio,
      fav: false,
      sqm,
      tvia: tipo.tvia,
      nvia: `Prueba ${n}`,
      num: String((n % 40) + 1),
      map: "",
      clase: "URBANO",
      uso: "Residencial",
      bien: tipo.tip,
      ccaa: place.prov,
      full_addr: `${tipo.tvia} Prueba ${n}, ${place.cp} ${place.pob}`,
      descr: "Activo de prueba de rendimiento. No publicar en el portal real.",
      pub: true,
      lat: Number((place.lat + jitter).toFixed(5)),
      lng: Number((place.lng + jitter / 2).toFixed(5)),
    });
    propiedades.push({
      id: `${PREFIX}P-${pad(n)}`,
      inmueble_id: id,
      activo_id: activoId,
      categoria,
      propietario: "—",
      contacto: "—",
      telefono: "—",
      mail: "—",
      fase_interna: "Publicado",
      fase_c: "fp-pub",
      proceso: "—",
      deuda,
      precio_publicacion: precio,
      portfolio: "PERF",
      tipologia: tipo.tip,
    });
  }
  return { assets, propiedades };
}

async function batched(supabase, table, rows, onConflict) {
  const size = 400;
  for (let i = 0; i < rows.length; i += size) {
    const slice = rows.slice(i, i + size);
    const { error } = await supabase.from(table).upsert(slice, { onConflict });
    if (error) throw new Error(`${table}: ${error.message}`);
    process.stdout.write(`\r${table} ${Math.min(i + size, rows.length)}/${rows.length}`);
  }
  process.stdout.write("\n");
}

async function removePerf(supabase) {
  const { error: propErr, count: propCount } = await supabase
    .from("propiedades")
    .delete({ count: "exact" })
    .like("id", `${PREFIX}%`);
  if (propErr) throw new Error(propErr.message);
  const { error: assetErr, count: assetCount } = await supabase
    .from("assets")
    .delete({ count: "exact" })
    .like("id", `${PREFIX}%`);
  if (assetErr) throw new Error(assetErr.message);
  console.log(`Borrados ${assetCount ?? 0} activos y ${propCount ?? 0} propiedades ${PREFIX}*`);
}

async function main() {
  const args = process.argv.slice(2);
  const remove = args.includes("--delete");
  const countFlag = args.indexOf("--count");
  const count = countFlag >= 0 ? Number(args[countFlag + 1]) : 4600;
  if (!remove && (!Number.isInteger(count) || count < 1 || count > 20000)) {
    throw new Error("--count debe ser un entero entre 1 y 20000");
  }

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Faltan SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL) y SUPABASE_SERVICE_ROLE_KEY");
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (remove) {
    await removePerf(supabase);
    return;
  }

  const { assets, propiedades } = buildRows(count);
  console.log(`Insertando ${count} activos ${PREFIX}00001… (pub=true)`);
  await batched(supabase, "assets", assets, "id");
  await batched(supabase, "propiedades", propiedades, "id");
  console.log("Listo. Para borrarlos: node scripts/seed-perf-assets.mjs --delete");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
