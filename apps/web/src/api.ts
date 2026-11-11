import { OryntClient, OryntApiError, type MeT } from "@orynt/sdk";
import { askMfa } from "./components/MfaPrompt";
import { createContext, useContext, useEffect, useState, useCallback, type DependencyList } from "react";

let csrf = "";
export const setCsrf = (t: string | undefined) => { csrf = t ?? ""; };
let stepUpCode = "";
export const api = new OryntClient({ baseUrl: window.location.origin, credentials: "include", headers: (): Record<string, string> => ({ ...(csrf ? { "x-csrf-token": csrf } : {}), ...(stepUpCode ? { "x-orynt-mfa-code": stepUpCode } : {}) }) });
/**
 * Step-up: when the server says a sensitive action needs a fresh authenticator code (`mfa_required`), ask for it and retry the SAME request
 * (same arguments, so the same Idempotency-Key). Sign-in, invitation and approval collect the code in their own forms.
 */
const baseRequest = api.request.bind(api) as typeof api.request;
api.request = (async (method: string, path: string, opts?: Parameters<typeof api.request>[2]) => {
  try { return await baseRequest(method, path, opts); } catch (e) {
    const needs = e instanceof OryntApiError && (e.problem as { mfa_required?: boolean }).mfa_required && e.httpStatus === 401;
    if (!needs || path.startsWith("/v1/auth/") || path.endsWith("/approve")) throw e;
    const code = await askMfa();
    if (!code) throw e;
    stepUpCode = code;
    try { return await baseRequest(method, path, opts); } finally { stepUpCode = ""; }
  }
}) as typeof api.request;
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
