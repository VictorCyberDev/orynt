import { OryntClient, OryntApiError, type MeT } from "@orynt/sdk";
import { createContext, useContext, useEffect, useState, useCallback, type DependencyList } from "react";

let csrf = "";
export const setCsrf = (t: string | undefined) => { csrf = t ?? ""; };
export const api = new OryntClient({ baseUrl: window.location.origin, credentials: "include", headers: (): Record<string, string> => (csrf ? { "x-csrf-token": csrf } : {}) });
export { OryntApiError };

/** Plain-language message for any error, with the stable code available for logic. */
export function errorText(e: unknown): string {
  if (e instanceof OryntApiError) return e.message;
  if (e instanceof TypeError) return "Can't reach Orynt right now. Check your connection and try again. Nothing was changed.";
  return (e as Error)?.message ?? "Something went wrong.";
}

export interface Session { me: MeT | null; loading: boolean; refresh: () => Promise<MeT | null>; setMe: (m: MeT | null) => void }
export const SessionCtx = createContext<Session>({ me: null, loading: true, refresh: async () => null, setMe: () => {} });
export const useSession = () => useContext(SessionCtx);

export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList = []): { data: T | null; error: string | null; loading: boolean; reload: () => void } {
  const [state, set] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    set((s) => ({ ...s, loading: true, error: null }));
    fn().then((data) => live && set({ data, error: null, loading: false }), (e) => live && set({ data: null, error: errorText(e), loading: false }));
    return () => { live = false; };
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { ...state, reload };
}

export function usePolling(fn: () => void, ms: number, enabled = true) {
  useEffect(() => { if (!enabled) return; const t = setInterval(fn, ms); return () => clearInterval(t); }, [fn, ms, enabled]);
}
