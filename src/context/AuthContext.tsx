import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { api } from "../lib/api";
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from "../lib/tokenStore";
import type { LoginResponse, User } from "../lib/types";
import { AuthContext } from "./auth-context";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getAccessToken()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time auth bootstrap on mount
      setLoading(false);
      return;
    }
    let cancelled = false;
    api
      .get<User>("/api/v1/auth/me")
      .then((me) => {
        if (!cancelled) setUser(me);
      })
      .catch(() => {
        clearTokens();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<LoginResponse>("/api/v1/auth/login", { email, password });
    setTokens(res.access_token, res.refresh_token);
    setUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = getRefreshToken();
    try {
      if (refreshToken) {
        await api.post("/api/v1/auth/logout", { refresh_token: refreshToken });
      }
    } catch {
      // best-effort
    }
    clearTokens();
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const me = await api.get<User>("/api/v1/auth/me");
    setUser(me);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}
