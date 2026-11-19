"use client";

import { useState, useEffect } from "react";
import { fetchPublicAssets, fetchAssetsByIds } from "@/app/actions/assets";
import { backfillMissingMaps } from "@/app/actions/maps";
import { fetchInvitedAssetIds } from "@/app/actions/invitations";
import { ensureCompradorForEmail } from "@/app/actions/compradores";
import { signOut } from "@/app/login/actions";
import { createClient } from "@/lib/supabase/client";
import type { Asset } from "@/lib/types";
import { fmtM, getPortalPriceDisplay, shortAddr } from "@/lib/utils";
import { assetPrivateHref } from "@/lib/public-slug";
import { shouldBackfillMapFromAddress } from "@/lib/map-default";
import { useFavoritos } from "@/hooks/useFavoritos";
import Link from "next/link";
import { Building, MapPin, LogIn, LogOut, FileText, Star, User } from "lucide-react";
import { InteractiveMap } from "@/components/InteractiveMap";

export default function PortalPrivadoPage() {
  const [publicAssets, setPublicAssets] = useState<Asset[]>([]);
  const [invitedAssets, setInvitedAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userNombre, setUserNombre] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>("cliente");
  const [compradorId, setCompradorId] = useState<string | null>(null);

  const showClientInfo = userRole !== "admin" && userRole !== "vendedor";
  const { isFavorito, toggleFavorito, favoritos } = useFavoritos(compradorId);

  async function handleLogout() {
    await signOut();
  }

  useEffect(() => {
    let cancelled = false;

    // Resolución de usuario: dev-auth (cuentas demo) → Supabase (cuentas reales).
    // Hasta que sepamos quién es el usuario y/o tengamos su compradorId, no
    // podemos cargar invitaciones, así que el resto del effect espera al
    // resultado de resolveUser().
    const resolveUser = async (): Promise<string | null> => {
      const devCookie = document.cookie
        .split("; ")
        .find((c) => c.startsWith("dev-auth="));
      if (devCookie) {
        try {
          const dev = JSON.parse(
            decodeURIComponent(devCookie.split("=").slice(1).join("=")),
          );
          if (cancelled) return null;
          setUserEmail(dev.email ?? null);
          setUserNombre(dev.nombre ?? dev.email ?? null);
          setUserRole(dev.role ?? "cliente");
          const cid = dev.compradorId ?? dev.comprador_id ?? null;
          setCompradorId(cid);
          return cid;
        } catch {
          /* fallthrough — probamos con Supabase */
        }
      }

      try {
        const sb = createClient();
        const { data: { user } } = await sb.auth.getUser();
        if (cancelled || !user?.email) return null;
        setUserEmail(user.email);
        const nombre =
          (user.user_metadata?.nombre as string | undefined) || user.email;
        setUserNombre(nombre);
        setUserRole((user.user_metadata?.role as string | undefined) || "cliente");
        try {
          const cid = await ensureCompradorForEmail(user.email, nombre);
          if (cancelled) return null;
          setCompradorId(cid);
          return cid;
        } catch {
          return null;
        }
      } catch {
        return null;
      }
    };

    const loadPublic = (async () => {
      const data = await fetchPublicAssets();
      const needMap = data.filter((a) => shouldBackfillMapFromAddress(a));
      let next = data;
      if (needMap.length > 0) {
        const stubs = needMap.map((a) => ({
          id: a.id,
          addr: a.addr,
          pob: a.pob,
          prov: a.prov,
          cp: a.cp,
        }));
        try {
          const { hits } = await backfillMissingMaps(stubs);
          next = data.map((a) => {
            const h = hits[a.id];
            if (!h) return a;
            return { ...a, map: h.map, lat: h.lat, lng: h.lng };
          });
        } catch {
          /* mantener data inicial */
        }
      }
      setPublicAssets(next);
    })();

    const loadInvited = resolveUser().then(async (cid) => {
      if (!cid) return;
      const ids = await fetchInvitedAssetIds(cid);
      if (cancelled || ids.length === 0) return;
      const assets = await fetchAssetsByIds(ids);
      if (cancelled) return;
      setInvitedAssets(assets);
    });

    Promise.all([loadPublic, loadInvited])
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-gold border-t-transparent" /></div>;

  if (!userEmail) return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
      <div className="rounded-xl border border-border bg-white p-8 text-center shadow-sm">
        <h2 className="mb-2 text-lg font-semibold text-navy">Acceso requerido</h2>
        <p className="mb-6 text-sm text-muted">Inicia sesion para acceder a la zona privada</p>
        <div className="flex items-center justify-center gap-3">
          <Link href="/login?redirect=/portal/privado" className="flex items-center gap-2 rounded-lg bg-navy px-4 py-2.5 text-sm font-medium text-white hover:bg-navy3">
            <LogIn size={14} /> Iniciar sesion
          </Link>
          <button onClick={handleLogout} className="flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-navy hover:bg-cream">
            <LogOut size={14} /> Cerrar sesion actual
          </button>
        </div>
      </div>
    </div>
  );

  const allPublicIds = new Set(publicAssets.map(a => a.id));
  const exclusiveInvited = invitedAssets.filter(a => !allPublicIds.has(a.id));
  const allKnownAssets = [...publicAssets, ...exclusiveInvited];
  const favoriteAssets = allKnownAssets.filter(a => favoritos.has(a.id));
  const misActivos = favoriteAssets.length + exclusiveInvited.length;

  const FavoriteToggle = ({ assetId }: { assetId: string }) => {
    if (!compradorId) return null;
    const fav = isFavorito(assetId);
    return (
      <button
        type="button"
        aria-label={fav ? "Quitar de favoritos" : "Marcar como favorito"}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFavorito(assetId); }}
        className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow-sm backdrop-blur transition-all hover:bg-white"
      >
        <Star size={16} className={fav ? "fill-gold text-gold" : "text-muted hover:text-gold"} />
      </button>
    );
  };

  const AssetCard = ({ a, badge }: { a: Asset; badge?: string }) => (
    <Link href={assetPrivateHref(a)} className="group overflow-hidden rounded-xl border border-border bg-white shadow-sm transition-all hover:shadow-md">
      <div className="relative">
        <InteractiveMap
          key={`map-${a.id}-${a.lat ?? "x"}-${a.lng ?? "x"}`}
          lat={a.lat}
          lng={a.lng}
          mapImageUrl={a.map}
          label={a.pob && a.pob !== "—" ? a.pob : undefined}
          className="h-[160px] w-full transition-transform group-hover:scale-[1.02]"
        />
        {badge && (
          <span className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-gold/90 px-2 py-0.5 text-[10px] font-semibold text-white">
            <Star size={10} /> {badge}
          </span>
        )}
        <FavoriteToggle assetId={a.id} />
      </div>
      <div className="p-4">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="rounded-md bg-navy/5 px-2 py-0.5 text-[10px] font-semibold text-navy">{a.tip}</span>
          <span className="flex items-center gap-1 text-[11px] text-muted"><MapPin size={10} /> {a.cp}</span>
        </div>
        <h3 className="text-base font-semibold text-navy">{a.pob}, {a.prov}</h3>
        <p className="mt-0.5 truncate text-xs text-muted">{shortAddr(a)}</p>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-lg font-bold text-navy">{getPortalPriceDisplay(a).value}</span>
          {a.sqm && <span className="text-xs text-muted">{fmtM(a.sqm)}</span>}
        </div>
      </div>
    </Link>
  );

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-8 rounded-xl bg-gradient-to-br from-navy to-navy3 p-8">
        <div className="flex items-center justify-between gap-4">
          {showClientInfo ? (
            <div className="flex items-center gap-4">
              <div
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-base font-bold text-white shadow-lg ring-2 ring-white/20"
                style={{ background: "linear-gradient(135deg,#0d2a4a,#b8933a)" }}
              >
                {(userNombre || userEmail || "?")
                  .split(/\s+/)
                  .filter(Boolean)
                  .map((w) => w[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2) || "??"}
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-bold text-white">
                  {userNombre || userEmail || "Mi Zona Privada"}
                </h1>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {userEmail && userNombre !== userEmail && (
                    <span className="truncate text-xs text-white/60">{userEmail}</span>
                  )}
                  <span className="rounded bg-gold/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gold">
                    Cliente
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <h1 className="text-2xl font-bold text-white">Mi Zona Privada</h1>
              <p className="mt-1 text-sm text-white/40">Tus favoritos y activos compartidos contigo</p>
            </div>
          )}
          <button onClick={handleLogout} className="flex shrink-0 items-center gap-2 rounded-lg border border-white/20 px-4 py-2 text-sm font-medium text-white hover:bg-white/10">
            <LogOut size={14} /> Salir
          </button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gold/10 text-gold"><Building size={20} /></div>
            <div>
              <div className="text-2xl font-bold text-navy">{misActivos}</div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">Mis activos</div>
            </div>
          </div>
        </div>
        {exclusiveInvited.length > 0 && (
          <div className="rounded-lg border border-gold/30 bg-gold/5 p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gold/10 text-gold"><Star size={20} /></div>
              <div>
                <div className="text-2xl font-bold text-gold">{exclusiveInvited.length}</div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">Compartidos contigo</div>
              </div>
            </div>
          </div>
        )}
        <Link href="/portal/privado/datos" className="rounded-lg border border-border bg-white p-5 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gold/10 text-gold"><User size={20} /></div>
            <div>
              <div className="text-sm font-semibold text-navy">Mis datos</div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">Para firmar ofertas</div>
            </div>
          </div>
        </Link>
        <Link href="/portal/privado/ofertas" className="rounded-lg border border-border bg-white p-5 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-navy/10 text-navy"><FileText size={20} /></div>
            <div>
              <div className="text-sm font-semibold text-navy">Mis Ofertas</div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">Ver y gestionar</div>
            </div>
          </div>
        </Link>
      </div>

      {favoriteAssets.length > 0 && (
        <>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gold">
            <Star size={14} className="fill-gold" /> Mis favoritos
          </h2>
          <div className="mb-8 grid grid-cols-3 gap-5">
            {favoriteAssets.map(a => <AssetCard key={a.id} a={a} />)}
          </div>
        </>
      )}

      {exclusiveInvited.length > 0 && (
        <>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gold">
            <Star size={14} /> Activos compartidos contigo
          </h2>
          <div className="mb-8 grid grid-cols-3 gap-5">
            {exclusiveInvited.map(a => <AssetCard key={a.id} a={a} badge="Para ti" />)}
          </div>
        </>
      )}

      {misActivos === 0 && (
        <div className="py-16 text-center">
          <Building size={40} className="mx-auto mb-3 text-border" />
          <p className="mb-1 text-sm font-medium text-navy">Aún no tienes activos guardados</p>
          <p className="mb-4 text-xs text-muted">Marca como favorito desde el listado público para verlos aquí</p>
          <Link href="/portal" className="inline-flex items-center gap-1.5 rounded-lg bg-navy px-4 py-2 text-xs font-medium text-white hover:bg-navy3">
            <Building size={13} /> Explorar propiedades
          </Link>
        </div>
      )}
    </div>
  );
}
