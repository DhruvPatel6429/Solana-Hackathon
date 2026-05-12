"use client";

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type SignInInput = {
  email: string;
  password: string;
};

type SignUpInput = SignInInput & {
  metadata?: Record<string, unknown>;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  accessToken: string | null;
  loading: boolean;
  isAuthenticated: boolean;
  refresh: () => Promise<string | null>;
  signIn: (input: SignInInput) => Promise<Session | null>;
  signUp: (input: SignUpInput) => Promise<Session | null>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function isExpiringSoon(session: Session): boolean {
  const expiresAt = session.expires_at;
  if (!expiresAt) {
    return false;
  }

  return expiresAt <= Math.floor(Date.now() / 1000) + 60;
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return atob(padded);
}

export function decodeJwtPayload(token: string): Record<string, unknown> {
  const [, encodedPayload] = token.split(".");
  if (!encodedPayload) {
    return {};
  }

  try {
    return JSON.parse(decodeBase64Url(encodedPayload)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function getMetadataString(
  claims: Record<string, unknown>,
  key: string,
): string | undefined {
  const appMetadata = claims.app_metadata;
  const userMetadata = claims.user_metadata;

  for (const source of [appMetadata, userMetadata]) {
    if (source && typeof source === "object" && key in source) {
      const value = (source as Record<string, unknown>)[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
  }

  return undefined;
}

async function getSession(refreshIfExpiring = true): Promise<Session | null> {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) {
    return null;
  }

  if (refreshIfExpiring && isExpiringSoon(data.session)) {
    const refreshed = await supabase.auth.refreshSession();
    return refreshed.data.session ?? data.session;
  }

  return data.session;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setSession(null);
      setLoading(false);
      return;
    }

    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) {
        return;
      }
      setSession(data.session ?? null);
      setLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const refresh = useCallback(async () => {
    const token = await refreshAccessToken();
    const nextSession = await getSession(false);
    setSession(nextSession);
    return token;
  }, []);

  const signIn = useCallback(async ({ email, password }: SignInInput) => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      throw new Error("Supabase browser auth is not configured.");
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      throw error;
    }

    setSession(data.session ?? null);
    return data.session ?? null;
  }, []);

  const signUp = useCallback(async ({ email, password, metadata }: SignUpInput) => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      throw new Error("Supabase browser auth is not configured.");
    }

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: metadata,
      },
    });

    if (error) {
      throw error;
    }

    setSession(data.session ?? null);
    return data.session ?? null;
  }, []);

  const signOut = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      return;
    }

    await supabase.auth.signOut();
    setSession(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      accessToken: session?.access_token ?? null,
      loading,
      isAuthenticated: Boolean(session?.access_token),
      refresh,
      signIn,
      signUp,
      signOut,
    }),
    [loading, refresh, session, signIn, signOut, signUp],
  );

  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuthSession(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuthSession must be used inside AuthProvider.");
  }
  return context;
}

export async function getAccessToken(): Promise<string | null> {
  const session = await getSession();
  return session?.access_token ?? null;
}

export async function refreshAccessToken(): Promise<string | null> {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.auth.refreshSession();
  if (error) {
    return null;
  }

  return data.session?.access_token ?? null;
}

export async function getRequiredAccessToken(): Promise<string> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error("Sign in is required to use this workspace.");
  }
  return token;
}

export async function getAuthHeaders(): Promise<HeadersInit> {
  const token = await getAccessToken();
  if (!token) {
    return {};
  }

  return {
    Authorization: `Bearer ${token}`,
  };
}

export async function getRequiredAuthHeaders(): Promise<HeadersInit> {
  const token = await getRequiredAccessToken();
  return {
    Authorization: `Bearer ${token}`,
  };
}
