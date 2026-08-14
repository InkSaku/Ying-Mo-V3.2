import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  api,
  clearLocalAccess,
  logoutRequest,
  refreshAccessToken,
  setAccessToken,
  subscribeAuthInvalidated,
} from "../lib/api";
import { revokeAllProtectedMedia } from "../lib/protectedMedia";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [status, setStatus] = useState("loading");
  const [user, setUser] = useState(null);

  useEffect(() => {
    let active = true;
    const endLocalSession = () => {
      if (!active) return;
      revokeAllProtectedMedia();
      setUser(null);
      setStatus("anonymous");
    };
    const unsubscribe = subscribeAuthInvalidated(endLocalSession);

    async function bootstrap() {
      try {
        const refreshed = await refreshAccessToken();
        if (!active) return;
        if (refreshed?.user) {
          setUser(refreshed.user);
          setStatus("authenticated");
        } else {
          setUser(null);
          setStatus("anonymous");
        }
      } catch {
        if (!active) return;
        clearLocalAccess("BOOTSTRAP_ANONYMOUS");
        setUser(null);
        setStatus("anonymous");
      }
    }
    bootstrap();
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const login = async ({ identifier, password }) => {
    const result = await api.authPost("/auth/login", { identifier, password });
    setAccessToken(result.data.access_token);
    setUser(result.data.user);
    setStatus("authenticated");
    return result.data.user;
  };

  const register = async (payload) => {
    const result = await api.authPost("/auth/register", payload);
    setAccessToken(result.data.access_token);
    setUser(result.data.user);
    setStatus("authenticated");
    return result.data.user;
  };

  const logout = async () => {
    await logoutRequest();
    revokeAllProtectedMedia();
    setUser(null);
    setStatus("anonymous");
  };

  const logoutAll = async () => {
    const result = await api.post("/auth/logout-all", {});
    clearLocalAccess("LOGOUT_ALL");
    revokeAllProtectedMedia();
    setUser(null);
    setStatus("anonymous");
    return result.data;
  };

  const endLocalSession = () => {
    clearLocalAccess("SESSION_REVOKED");
    revokeAllProtectedMedia();
    setUser(null);
    setStatus("anonymous");
  };

  const refreshMe = async () => {
    const result = await api.get("/auth/me");
    setUser(result.data);
    return result.data;
  };

  const value = useMemo(
    () => ({ status, user, login, register, logout, logoutAll, endLocalSession, refreshMe }),
    [status, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth 必须在 AuthProvider 中使用");
  return value;
}
