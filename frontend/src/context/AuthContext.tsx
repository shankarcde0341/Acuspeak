/**
 * @file AuthContext.tsx
 * @description React Context module providing global authentication state, session initialisation (bootstrap),
 * sign-in/sign-out procedures, user profile caching, and refresh mechanisms across the app.
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, getToken, setToken, clearToken } from "@/src/api/client";
import { registerForPushNotificationsAsync } from "@/src/utils/notifications";

/** User profile model shape returned by the backend */
type User = {
  user_id: string;
  email: string;
  name: string;
  picture?: string | null;
  english_level: string;
  xp: number;
  streak: number;
  daily_goal_minutes: number;
  daily_goal_completed_minutes: number;
  is_premium: boolean;
  premium_plan?: string | null;
  premium_until?: string | null;
  saved_words: string[];
  friends: string[];
  blocked: string[];
  achievements: string[];
  certificates: any[];
  phone?: string | null;
  referral_code?: string | null;
  referred_by?: string | null;
  referral_count: number;
  referral_discount_active: boolean;
  push_token?: string | null;
};

/** Context value contract exposed by useAuth() hook */
type AuthState = {
  user: User | null;
  loading: boolean;
  signInWithSessionId: (session_id: string) => Promise<void>;
  signInWithPhoneToken: (session_token: string, user: User) => Promise<void>;
  refresh: () => Promise<void>;
  updateUser: (u: User) => void;
  signOut: () => Promise<void>;
};

const AuthCtx = createContext<AuthState | null>(null);

/**
 * AuthProvider Component
 * Encloses app components and provides authentication state management and user bootstrap on mount.
 * 
 * @param {object} props
 * @param {React.ReactNode} props.children - Child components requiring auth context access.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const syncPushToken = useCallback(async (currentUser: User) => {
    try {
      const pushToken = await registerForPushNotificationsAsync();
      if (pushToken && pushToken !== currentUser.push_token) {
        console.log("[Auth] Registering push token to backend via /profile:", pushToken);
        const updated = await api.updateProfile({ push_token: pushToken });
        if (updated) {
          setUser(updated);
        }
      }
    } catch (err) {
      console.warn("[Auth] Push token sync error:", err);
    }
  }, []);

  /**
   * Initializes (bootstraps) user authentication session on app start.
   * Checks for stored token and verifies it with backend `/auth/me`.
   * Preserves session token during transient network failures ("Network request failed")
   * to avoid accidentally logging out the user when offline or when backend is starting up.
   */
  const bootstrap = useCallback(async () => {
    try {
      const token = await getToken();
      console.log("[Auth] bootstrap — token present?", !!token);
      if (!token) { setUser(null); return; }
      const me = await api.me();
      console.log("[Auth] bootstrap — /me returned user:", me?.user_id);
      setUser(me);
      if (me) {
        syncPushToken(me);
      }
    } catch (e: any) {
      const errMsg = e?.message || String(e);
      console.warn("[Auth] bootstrap failed:", errMsg);
      // Only clear token if failure is an explicit auth failure (401/403), not a temporary network error
      const isNetworkError = errMsg.includes("Network request failed") || errMsg.includes("Failed to fetch");
      if (!isNetworkError) {
        console.warn("[Auth] Clearing invalid session token");
        await clearToken();
      }
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [syncPushToken]);

  useEffect(() => { bootstrap(); }, [bootstrap]);

  /**
   * Signs in user using web OAuth session ID by exchanging it for a session token.
   * @param {string} session_id - The OAuth web session ID.
   */
  const signInWithSessionId = useCallback(async (session_id: string) => {
    console.log("[Auth] signInWithSessionId — exchanging session_id");
    const res = await api.createSession(session_id);
    if (!res?.session_token || !res?.user) {
      throw new Error("Malformed auth response from server");
    }
    await setToken(res.session_token);
    console.log("[Auth] token saved; setting user", res.user.user_id);
    setUser(res.user);
    syncPushToken(res.user);
  }, [syncPushToken]);

  /**
   * Signs in user using phone OTP session token and pre-verified user object.
   * @param {string} session_token - The verified session token string.
   * @param {User} freshUser - The authenticated user profile.
   */
  const signInWithPhoneToken = useCallback(async (session_token: string, freshUser: User) => {
    console.log("[Auth] signInWithPhoneToken — token saved");
    await setToken(session_token);
    setUser(freshUser);
    syncPushToken(freshUser);
  }, [syncPushToken]);

  /**
   * Refreshes current user profile state from backend `/auth/me`.
   */
  const refresh = useCallback(async () => {
    try {
      const me = await api.me();
      setUser(me);
    } catch { /* ignore transient errors during manual refresh */ }
  }, []);

  /**
   * Directly updates in-memory user object state.
   * @param {User} u - Updated user object.
   */
  const updateUser = useCallback((u: User) => setUser(u), []);

  /**
   * Signs out the current user session on server and clears local stored token.
   */
  const signOut = useCallback(async () => {
    try { await api.logout(); } catch { /* ignore server logout failure on network disconnect */ }
    await clearToken();
    setUser(null);
  }, []);

  return (
    <AuthCtx.Provider value={{ user, loading, signInWithSessionId, signInWithPhoneToken, refresh, updateUser, signOut }}>
      {children}
    </AuthCtx.Provider>
  );
}

/**
 * Custom React hook to access authentication context state and actions.
 * @returns {AuthState} Authentication state and methods.
 * @throws {Error} If called outside of an AuthProvider.
 */
export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
