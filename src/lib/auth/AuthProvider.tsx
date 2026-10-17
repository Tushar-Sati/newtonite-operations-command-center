import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, clearAccessToken, currentUser, loginRequest, readAccessToken, saveAccessToken } from "@/lib/api/client";
import type { User } from "@/lib/api/types";

type AuthState = {
  ready: boolean;
  user: User | null;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  retry: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const token = readAccessToken();
    if (!token) {
      setReady(true);
      return () => { active = false; };
    }
    currentUser(token).then((me) => {
      if (active) { setUser(me); setError(null); setReady(true); }
    }).catch((reason: unknown) => {
      if (!active) return;
      if (reason instanceof ApiError && reason.status === 401) clearAccessToken();
      if (!(reason instanceof ApiError && reason.status === 401)) setError(reason instanceof Error ? reason.message : "Could not verify your session");
      setUser(null);
      setReady(true);
    });
    return () => { active = false; };
  }, [attempt]);

  useEffect(() => {
    const expired = () => {
      clearAccessToken();
      setUser(null);
      setReady(true);
      queryClient.clear();
    };
    window.addEventListener("newtonite:unauthorized", expired);
    return () => window.removeEventListener("newtonite:unauthorized", expired);
  }, [queryClient]);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      const token = await loginRequest(email, password);
      saveAccessToken(token.access_token);
      const me = await currentUser(token.access_token);
      setUser(me);
      setReady(true);
    } catch (reason) {
      clearAccessToken();
      setUser(null);
      setReady(true);
      throw reason;
    }
  }, []);

  const logout = useCallback(() => {
    clearAccessToken();
    setUser(null);
    setError(null);
    queryClient.clear();
  }, [queryClient]);

  const retry = useCallback(() => {
    setReady(false);
    setError(null);
    setAttempt((value) => value + 1);
  }, []);

  const value = useMemo(() => ({ ready, user, error, login, logout, retry }), [ready, user, error, login, logout, retry]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth must be rendered inside AuthProvider");
  return auth;
}
