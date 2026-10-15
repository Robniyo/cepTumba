import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { Role } from "@/lib/roles";
import { isPushNotificationsPreferenceEnabled, registerPushSubscription } from "@/lib/pushNotifications";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

type AuthApiResponse = {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  user: AuthUser;
};

const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

const parseApiError = async (response: Response, fallback: string) => {
  try {
    const payload = (await response.json()) as { message?: string | string[] };
    if (Array.isArray(payload.message)) return payload.message.join(", ");
    if (typeof payload.message === "string" && payload.message.trim().length > 0) return payload.message;
  } catch {
    // Ignore parsing errors and fallback to default message.
  }
  return fallback;
};

type AuthContextValue = {
  user: AuthUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isReady: boolean;
  refreshSession: () => Promise<{ ok: true } | { ok: false; error: string }>;
  login: (email: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  updateProfile: (input: {
    name: string;
    email: string;
  }) => Promise<{ ok: true; user: AuthUser } | { ok: false; error: string }>;
  changePassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  const applyAuthPayload = useCallback((payload: AuthApiResponse) => {
    setUser(payload.user);
    setAccessToken(payload.accessToken);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const restoreSession = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: "POST",
          credentials: "include",
        });

        if (!response.ok) {
          if (!cancelled) {
            setUser(null);
            setAccessToken(null);
          }
          return;
        }

        const payload = (await response.json()) as AuthApiResponse;
        if (!cancelled) {
          applyAuthPayload(payload);
        }
      } catch {
        if (!cancelled) {
          setUser(null);
          setAccessToken(null);
        }
      } finally {
        if (!cancelled) setIsReady(true);
      }
    };

    void restoreSession();
    return () => {
      cancelled = true;
    };
  }, [applyAuthPayload]);

  useEffect(() => {
    if (!accessToken || !user || !isPushNotificationsPreferenceEnabled()) {
      return;
    }

    void registerPushSubscription(accessToken, API_BASE_URL).catch(() => {
      // Ignore push registration failures to avoid blocking auth/session flows.
    });
  }, [accessToken, user]);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const error = await parseApiError(response, "Invalid email or password.");
        return { ok: false as const, error };
      }

      const payload = (await response.json()) as AuthApiResponse;
      applyAuthPayload(payload);
      return { ok: true as const };
    } catch {
      return { ok: false as const, error: "Unable to reach the server." };
    }
  }, [applyAuthPayload]);

  const refreshSession = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        const error = await parseApiError(response, "Session expired. Please sign in again.");
        setUser(null);
        setAccessToken(null);
        return { ok: false as const, error };
      }

      const payload = (await response.json()) as AuthApiResponse;
      applyAuthPayload(payload);
      return { ok: true as const };
    } catch {
      return { ok: false as const, error: "Unable to reach the server." };
    }
  }, [applyAuthPayload]);

  const updateProfile = useCallback(async (input: { name: string; email: string }) => {
    if (!accessToken) {
      return { ok: false as const, error: "Session expired. Please sign in again." };
    }

    try {
      const response = await fetch(`${API_BASE_URL}/auth/me`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const error = await parseApiError(response, "Failed to update profile.");
        return { ok: false as const, error };
      }

      const payload = (await response.json()) as { user: AuthUser };
      setUser(payload.user);
      return { ok: true as const, user: payload.user };
    } catch {
      return { ok: false as const, error: "Unable to reach the server." };
    }
  }, [accessToken]);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    if (!accessToken) {
      return { ok: false as const, error: "Session expired. Please sign in again." };
    }

    try {
      const response = await fetch(`${API_BASE_URL}/auth/me/password`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      if (!response.ok) {
        const error = await parseApiError(response, "Failed to change password.");
        return { ok: false as const, error };
      }

      const payload = (await response.json()) as AuthApiResponse;
      applyAuthPayload(payload);
      return { ok: true as const };
    } catch {
      return { ok: false as const, error: "Unable to reach the server." };
    }
  }, [accessToken, applyAuthPayload]);

  const logout = useCallback(async () => {
    try {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: "POST",
        credentials: "include",
        headers: accessToken
          ? {
              Authorization: `Bearer ${accessToken}`,
            }
          : undefined,
      });
    } finally {
      setUser(null);
      setAccessToken(null);
    }
  }, [accessToken]);

  const value = useMemo(
    () => ({
      user,
      accessToken,
      isAuthenticated: Boolean(user),
      isReady,
      refreshSession,
      login,
      updateProfile,
      changePassword,
      logout,
    }),
    [user, accessToken, isReady, refreshSession, login, updateProfile, changePassword, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
};
