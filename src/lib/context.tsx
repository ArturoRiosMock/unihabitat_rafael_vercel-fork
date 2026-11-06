"use client";

import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { Asset, Comprador, Vendedor, Tarea } from "./types";
import type { VendorPermission, UserSession } from "./permissions";
import { defaultVendorPermissions } from "./permissions";
// `assets` y `compradores` de mock-data ya NO se usan como semilla inicial;
// los datos llegan de Supabase. Vendedores y tareas conservan su semilla
// mientras no estén dentro del alcance de esta corrección.
import { tareasData } from "./mock-data";
import { fetchAssets, fetchPropiedades } from "@/app/actions/assets";
import { fetchCompradores } from "@/app/actions/compradores";
import { fetchVendedores } from "@/app/actions/vendedores";
import { attachPropiedades } from "@/lib/supabase/db";
import { getDevAuthFromDocument } from "@/lib/auth-helpers";
import { fetchCurrentSession } from "@/app/actions/session";
import { fetchVendorPermissions, fetchVendorAssignedAssetIds, fetchVendorAssignedCompradorIds } from "@/app/actions/permissions";

interface AppState {
  assets: Asset[];
  compradores: Comprador[];
  vendedores: Vendedor[];
  tareas: Tarea[];
  assetsLoading: boolean;
  assetsError: string | null;
  compradoresLoading: boolean;
  compradoresError: string | null;
  vendedoresLoading: boolean;
  vendedoresError: string | null;
}

interface AppContextType extends AppState {
  session: UserSession | null;
  sessionResolved: boolean;
  permissions: VendorPermission[];
  assignedAssetIds: string[];
  assignedCompradorIds: string[];
  togglePub: (id: string) => void;
  toggleFav: (id: string) => void;
  toggleChk: (id: string) => void;
  toggleChkAll: (ids: string[]) => void;
  toggleTaskDone: (id: string) => void;
  addAssets: (assets: Asset[]) => void;
  removeAssetsByIds: (ids: string[]) => void;
  getAsset: (id: string) => Asset | undefined;
  getComprador: (id: string) => Comprador | undefined;
  getVendedor: (id: string) => Vendedor | undefined;
  refreshAssignments: () => Promise<void>;
  /** Recarga activos desde Supabase y aplica geocodificación en lotes (tras import / evento). */
  refreshAssets: () => Promise<void>;
  /** Recarga compradores desde Supabase. Útil tras crear/editar un comprador. */
  refreshCompradores: () => Promise<void>;
  /** Recarga vendedores/agentes desde Supabase. */
  refreshVendedores: () => Promise<void>;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  // Inicializamos `assets` y `compradores` vacíos para que la lista nunca
  // arranque con los mocks de `mock-data.ts`. Los datos reales llegan de
  // Supabase y se exponen `*Loading` / `*Error` para que la UI distinga
  // "cargando" de "error" en lugar de mostrar mocks engañosos. Vendedores y
  // tareas conservan su semilla mientras no estén dentro del alcance de esta
  // corrección.
  const [state, setState] = useState<AppState>({
    assets: [],
    compradores: [],
    vendedores: [],
    tareas: tareasData,
    assetsLoading: true,
    assetsError: null,
    compradoresLoading: true,
    compradoresError: null,
    vendedoresLoading: true,
    vendedoresError: null,
  });

  const [session, setSession] = useState<UserSession | null>(null);
  const [sessionResolved, setSessionResolved] = useState(false);
  const [permissions, setPermissions] = useState<VendorPermission[]>([]);
  const [assignedAssetIds, setAssignedAssetIds] = useState<string[]>([]);
  const [assignedCompradorIds, setAssignedCompradorIds] = useState<string[]>([]);
  const pathname = usePathname();

  const assetsLoadTokenRef = useRef(0);
  const compradoresLoadTokenRef = useRef(0);
  const vendedoresLoadTokenRef = useRef(0);

  const loadAssetsFromServer = useCallback(async () => {
    const token = ++assetsLoadTokenRef.current;
    setState((prev) => ({ ...prev, assetsLoading: true, assetsError: null }));
    try {
      const [inmuebles, propiedades] = await Promise.all([
        fetchAssets(),
        fetchPropiedades(),
      ]);
      if (token !== assetsLoadTokenRef.current) return;

      const rows = attachPropiedades(inmuebles, propiedades);
      setState((prev) => ({ ...prev, assets: rows, assetsLoading: false, assetsError: null }));
    } catch (err) {
      console.error("[loadAssetsFromServer] falló:", err);
      if (token === assetsLoadTokenRef.current) {
        const msg = err instanceof Error ? err.message : "No se pudieron cargar los activos";
        setState((prev) => ({ ...prev, assets: [], assetsLoading: false, assetsError: msg }));
      }
    }
  }, []);

  const refreshAssets = useCallback(() => loadAssetsFromServer(), [loadAssetsFromServer]);

  const loadCompradoresFromServer = useCallback(async () => {
    const token = ++compradoresLoadTokenRef.current;
    setState((prev) => ({ ...prev, compradoresLoading: true, compradoresError: null }));
    try {
      const rows = await fetchCompradores();
      if (token !== compradoresLoadTokenRef.current) return;
      setState((prev) => ({
        ...prev,
        compradores: rows,
        compradoresLoading: false,
        compradoresError: null,
      }));
    } catch (err) {
      console.error("[loadCompradoresFromServer] fetchCompradores falló:", err);
      if (token === compradoresLoadTokenRef.current) {
        const msg = err instanceof Error ? err.message : "No se pudieron cargar los compradores";
        setState((prev) => ({
          ...prev,
          compradores: [],
          compradoresLoading: false,
          compradoresError: msg,
        }));
      }
    }
  }, []);

  const refreshCompradores = useCallback(
    () => loadCompradoresFromServer(),
    [loadCompradoresFromServer],
  );

  const loadVendedoresFromServer = useCallback(async () => {
    const token = ++vendedoresLoadTokenRef.current;
    setState((prev) => ({ ...prev, vendedoresLoading: true, vendedoresError: null }));
    try {
      const rows = await fetchVendedores();
      if (token !== vendedoresLoadTokenRef.current) return;
      setState((prev) => ({
        ...prev,
        vendedores: rows,
        vendedoresLoading: false,
        vendedoresError: null,
      }));
    } catch (err) {
      console.error("[loadVendedoresFromServer] fetchVendedores falló:", err);
      if (token === vendedoresLoadTokenRef.current) {
        const msg = err instanceof Error ? err.message : "No se pudieron cargar los agentes";
        setState((prev) => ({
          ...prev,
          vendedores: [],
          vendedoresLoading: false,
          vendedoresError: msg,
        }));
      }
    }
  }, []);

  const refreshVendedores = useCallback(
    () => loadVendedoresFromServer(),
    [loadVendedoresFromServer],
  );

  useEffect(() => {
    let cancelled = false;

    const devSession = getDevAuthFromDocument();
    if (devSession) {
      setSession(devSession);
      setSessionResolved(true);
      return;
    }

    setSessionResolved(false);
    fetchCurrentSession()
      .then((s) => {
        if (!cancelled) setSession(s);
      })
      .catch(() => {
        if (!cancelled) setSession(null);
      })
      .finally(() => {
        if (!cancelled) setSessionResolved(true);
      });

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => {
    void loadAssetsFromServer();
    void loadCompradoresFromServer();
    void loadVendedoresFromServer();
  }, [loadAssetsFromServer, loadCompradoresFromServer, loadVendedoresFromServer]);

  useEffect(() => {
    const onAssetsUpdated = () => {
      void loadAssetsFromServer();
    };
    const onCompradoresUpdated = () => {
      void loadCompradoresFromServer();
    };
    const onVendedoresUpdated = () => {
      void loadVendedoresFromServer();
    };
    window.addEventListener("propcrm-assets-updated", onAssetsUpdated);
    window.addEventListener("propcrm-compradores-updated", onCompradoresUpdated);
    window.addEventListener("propcrm-vendedores-updated", onVendedoresUpdated);
    return () => {
      window.removeEventListener("propcrm-assets-updated", onAssetsUpdated);
      window.removeEventListener("propcrm-compradores-updated", onCompradoresUpdated);
      window.removeEventListener("propcrm-vendedores-updated", onVendedoresUpdated);
    };
  }, [loadAssetsFromServer, loadCompradoresFromServer, loadVendedoresFromServer]);


  useEffect(() => {
    if (!session) {
      setPermissions([]);
      return;
    }
    if (session.role !== "vendedor") {
      setPermissions([]);
      return;
    }
    if (!session.vendedorId) {
      setPermissions(defaultVendorPermissions());
      return;
    }
    let cancelled = false;
    const vid = session.vendedorId;
    fetchVendorPermissions(vid).then((p) => !cancelled && setPermissions(p)).catch(() => {
      if (!cancelled) setPermissions(defaultVendorPermissions());
    });
    fetchVendorAssignedAssetIds(vid).then((ids) => !cancelled && setAssignedAssetIds(ids)).catch(() => {});
    fetchVendorAssignedCompradorIds(vid).then((ids) => !cancelled && setAssignedCompradorIds(ids)).catch(() => {});
    return () => { cancelled = true; };
  }, [session]);

  const refreshAssignments = useCallback(async () => {
    if (session?.role === "vendedor" && session.vendedorId) {
      const [aIds, cIds] = await Promise.all([
        fetchVendorAssignedAssetIds(session.vendedorId),
        fetchVendorAssignedCompradorIds(session.vendedorId),
      ]);
      setAssignedAssetIds(aIds);
      setAssignedCompradorIds(cIds);
    }
  }, [session]);

  // Vendedor and admin see the same asset list. Per-vendedor restriction was
  // dropped intentionally — the only role-based hiding for vendedores happens
  // at the asset-detail tab level (Agentes / Clientes / Administrador).
  const filteredAssets = state.assets;

  const filteredCompradores = session?.role === "vendedor" && assignedCompradorIds.length > 0
    ? state.compradores.filter((c) => assignedCompradorIds.includes(c.id))
    : session?.role === "vendedor"
      ? []
      : state.compradores;

  const filteredTareas = session?.role === "vendedor"
    ? state.tareas.filter((t) => t.agente === session.nombre)
    : state.tareas;

  const togglePub = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      assets: prev.assets.map(a => a.id === id ? { ...a, pub: !a.pub } : a),
    }));
  }, []);

  const toggleFav = useCallback((id: string) => {
    setState(prev => ({ ...prev, assets: prev.assets.map(a => a.id === id ? { ...a, fav: !a.fav } : a) }));
  }, []);

  const toggleChk = useCallback((id: string) => {
    setState(prev => ({ ...prev, assets: prev.assets.map(a => a.id === id ? { ...a, chk: !a.chk } : a) }));
  }, []);

  const toggleChkAll = useCallback((ids: string[]) => {
    setState(prev => {
      const allChecked = ids.every(id => prev.assets.find(a => a.id === id)?.chk);
      return { ...prev, assets: prev.assets.map(a => ids.includes(a.id) ? { ...a, chk: !allChecked } : a) };
    });
  }, []);

  const toggleTaskDone = useCallback((id: string) => {
    setState(prev => ({ ...prev, tareas: prev.tareas.map(t => t.id === id ? { ...t, done: !t.done } : t) }));
  }, []);

  const addAssets = useCallback((assets: Asset[]) => {
    if (assets.length === 0) return;
    setState(prev => {
      const indexById = new Map(prev.assets.map((a, i) => [a.id, i]));
      const next = [...prev.assets];
      for (const a of assets) {
        const i = indexById.get(a.id);
        if (i !== undefined) next[i] = a;
        else { next.push(a); indexById.set(a.id, next.length - 1); }
      }
      return { ...prev, assets: next };
    });
  }, []);

  const removeAssetsByIds = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const drop = new Set(ids);
    setState(prev => ({ ...prev, assets: prev.assets.filter(a => !drop.has(a.id)) }));
  }, []);

  const getAsset = useCallback((id: string) => state.assets.find(a => a.id === id), [state.assets]);
  const getComprador = useCallback((id: string) => state.compradores.find(c => c.id === id), [state.compradores]);
  const getVendedor = useCallback((id: string) => state.vendedores.find(v => v.id === id), [state.vendedores]);

  return (
    <AppContext.Provider value={{
      assets: filteredAssets,
      compradores: filteredCompradores,
      vendedores: state.vendedores,
      tareas: filteredTareas,
      assetsLoading: state.assetsLoading,
      assetsError: state.assetsError,
      compradoresLoading: state.compradoresLoading,
      compradoresError: state.compradoresError,
      vendedoresLoading: state.vendedoresLoading,
      vendedoresError: state.vendedoresError,
      session,
      sessionResolved,
      permissions,
      assignedAssetIds,
      assignedCompradorIds,
      togglePub, toggleFav, toggleChk, toggleChkAll, toggleTaskDone,
      addAssets, removeAssetsByIds, getAsset, getComprador, getVendedor,
      refreshAssignments, refreshAssets, refreshCompradores, refreshVendedores,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
