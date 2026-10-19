import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, refreshSession, setAccessToken } from "./api";

export interface User { id: string; email: string; name: string; role: string; mfaEnabled: boolean; responderStatus: string | null }
interface Ctx {
  user: User | null; loading: boolean;
  login: (email: string, password: string) => Promise<{ mfaToken?: string }>;
  loginMfa: (mfaToken: string, code: string) => Promise<void>;
  register: (b: { email: string; password: string; name: string }) => Promise<void>;
  registerResponder: (b: any) => Promise<void>;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
}
const AuthCtx = createContext<Ctx>(null as any);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    refreshSession().then((j) => { if (j) setUser(j.user); }).finally(() => setLoading(false));
  }, []);

  const finish = (j: { accessToken: string; user: User }) => { setAccessToken(j.accessToken); setUser(j.user); };
  const value = useMemo<Ctx>(() => ({
    user, loading,
    login: async (email, password) => {
      const j = await api("/auth/login", { body: { email, password }, auth: false });
      if (j.mfaRequired) return { mfaToken: j.mfaToken };
      finish(j); return {};
    },
    loginMfa: async (mfaToken, code) => finish(await api("/auth/mfa/login", { body: { mfaToken, code }, auth: false })),
    register: async (b) => finish(await api("/auth/register", { body: b, auth: false })),
    registerResponder: async (b) => finish(await api("/auth/register-responder", { body: b, auth: false })),
    logout: async () => {
      try { await fetch("/api/v1/auth/logout", { method: "POST", credentials: "include", headers: { "X-Requested-With": "veap" } }); } catch { /* ignore */ }
      setAccessToken(null); setUser(null);
    },
    reload: async () => { const j = await api("/auth/me"); setUser(j.user); },
  }), [user, loading]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function homeFor(u: User | null) { return !u ? "/login" : u.role === "admin" ? "/admin" : u.role === "patient" ? "/dashboard" : "/responder"; }
export { useCallback };
