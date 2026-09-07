/**
 * @file client.ts
 * @description API client module for managing HTTP requests to the FastAPI backend,
 * handling session tokens via SecureStore/AsyncStorage, and dynamically resolving
 * the backend API base URL so network IP changes do not cause connectivity failures.
 */

import { storage } from "@/src/utils/storage";
import Constants from "expo-constants";

const TOKEN_KEY = "lf_session_token";

/**
 * Dynamically resolves the backend base URL.
 * Checks EXPO_PUBLIC_BACKEND_URL first, and if running via Expo Go / Metro,
 * automatically syncs with Metro's active host IP (e.g. 10.238.9.177) so local
 * Wi-Fi / IP changes don't result in "Network request failed" errors.
 * 
 * @returns {string} The formatted base URL (e.g., "http://10.238.9.177:8000")
 */
export function getBackendUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_BACKEND_URL;

  // Extract host IP address from Metro bundler if available
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as any).manifest2?.extra?.expoGo?.debuggerHost ||
    (Constants as any).manifest?.debuggerHost;

  const metroHostIp = hostUri ? hostUri.split(":")[0] : null;

  if (envUrl) {
    // If envUrl is explicitly a remote/production domain (not localhost / raw IP), use it as-is
    if (!envUrl.includes("localhost") && !envUrl.match(/http:\/\/\d+\.\d+\.\d+\.\d+/)) {
      return envUrl.replace(/\/+$/, "");
    }

    // Extract configured backend port (defaults to 8000)
    const portMatch = envUrl.match(/:(\d+)/);
    const port = portMatch ? portMatch[1] : "8000";

    // If running in Expo Metro and host IP is detected, construct active local URL
    if (metroHostIp) {
      return `http://${metroHostIp}:${port}`;
    }

    return envUrl.replace(/\/+$/, "");
  }

  if (metroHostIp) {
    return `http://${metroHostIp}:8000`;
  }

  return "http://localhost:8000";
}

/**
 * Retrieves the stored user authentication token from secure storage.
 * @returns {Promise<string | null>} The session token or null if not found.
 */
export async function getToken(): Promise<string | null> {
  return await storage.secureGet<string>(TOKEN_KEY, "");
}

/**
 * Saves the user authentication token into secure storage.
 * @param {string} token - The session token string to save.
 */
export async function setToken(token: string): Promise<void> {
  await storage.secureSet<string>(TOKEN_KEY, token);
}

/**
 * Removes the saved user authentication token from secure storage.
 */
export async function clearToken(): Promise<void> {
  await storage.secureRemove(TOKEN_KEY);
}

/**
 * Core HTTP fetch wrapper for performing authenticated and unauthenticated API requests.
 * 
 * @template T - Expected JSON response shape.
 * @param {string} path - Endpoint relative path starting with '/' (e.g. '/auth/me').
 * @param {RequestInit} [init={}] - Fetch configuration options (headers, method, body, etc.).
 * @param {boolean} [auth=true] - Whether to attach the Bearer token in request headers.
 * @returns {Promise<T>} Parsed response object.
 */
async function request<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (auth) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const baseUrl = getBackendUrl();
  const res = await fetch(`${baseUrl}/api${path}`, { ...init, headers });
  const text = await res.text();
  let data: any;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { detail: text }; }
  if (!res.ok) {
    const message = (data && (data.detail || data.message)) || `Request failed (${res.status})`;
    throw new Error(typeof message === "string" ? message : JSON.stringify(message));
  }
  return data as T;
}

/**
 * API service object encapsulating all backend endpoints.
 */
export const api = {
  /** Exchanges a web session ID for a session token and user profile */
  createSession: (session_id: string) => request<any>("/auth/session", { method: "POST", body: JSON.stringify({ session_id }) }, false),
  /** Sends an OTP to the given phone number */
  sendPhoneOtp: (phone: string) => request<any>("/auth/phone/send-otp", { method: "POST", body: JSON.stringify({ phone }) }, false),
  /** Verifies phone OTP code and authenticates the user */
  verifyPhoneOtp: (phone: string, code: string, name?: string, referral_code?: string) => request<any>("/auth/phone/verify-otp", { method: "POST", body: JSON.stringify({ phone, code, name, referral_code }) }, false),
  /** Links a phone number to existing authenticated user account */
  linkPhone: (phone: string, code: string) => request<any>("/auth/phone/link", { method: "POST", body: JSON.stringify({ phone, code }) }),
  /** Fetches current authenticated user profile */
  me: () => request<any>("/auth/me"),
  /** Logs out the current user session on server */
  logout: () => request<any>("/auth/logout", { method: "POST" }),
  /** Fetches referral program details for current user */
  getReferral: () => request<any>("/referral"),
  /** Applies a referral code to current user account */
  applyReferral: (referral_code: string) => request<any>("/referral/apply", { method: "POST", body: JSON.stringify({ referral_code }) }),
  /** Updates current user profile details */
  updateProfile: (payload: any) => request<any>("/profile", { method: "PUT", body: JSON.stringify(payload) }),
  /** Adds XP points for completing learning activities */
  addXp: (amount: number, reason: string, minutes = 0) => request<any>("/xp", { method: "POST", body: JSON.stringify({ amount, reason, minutes }) }),
  /** Fetches home dashboard metrics and state */
  home: () => request<any>("/home"),
  /** Fetches all available lesson categories */
  lessonCategories: () => request<any>("/lessons/categories"),
  /** Fetches lessons filterable by category ID */
  lessons: (categoryId?: string) => request<any>(`/lessons${categoryId ? `?category_id=${categoryId}` : ""}`),
  /** Fetches details for a specific lesson by ID */
  lesson: (id: string) => request<any>(`/lessons/${id}`),
  /** Marks a lesson as completed */
  completeLesson: (lesson_id: string) => request<any>("/lessons/complete", { method: "POST", body: JSON.stringify({ lesson_id }) }),
  /** Fetches overall lesson progress data */
  lessonProgress: () => request<any>("/lessons/progress/all"),
  /** Fetches vocabulary word list */
  vocab: () => request<any>("/vocab"),
  /** Fetches the featured word of the day */
  wordOfTheDay: () => request<any>("/vocab/word-of-the-day"),
  /** Saves a vocabulary word to user's saved list */
  saveWord: (word_id: string) => request<any>("/vocab/save", { method: "POST", body: JSON.stringify({ word_id }) }),
  /** Removes a word from user's saved vocabulary list */
  unsaveWord: (word_id: string) => request<any>("/vocab/unsave", { method: "POST", body: JSON.stringify({ word_id }) }),
  /** Fetches daily/weekly challenges */
  challenges: () => request<any>("/challenges"),
  /** Completes a challenge by ID */
  completeChallenge: (id: string) => request<any>(`/challenges/${id}/complete`, { method: "POST" }),
  /** Fetches quiz questions */
  quiz: () => request<any>("/quiz"),
  /** Submits speaking test results */
  speakingTest: (payload: any) => request<any>("/speaking-test", { method: "POST", body: JSON.stringify(payload) }),
  /** Fetches speaking test evaluation history */
  testHistory: () => request<any>("/speaking-test/history"),
  /** Triggers partner matching for practice calls */
  match: (gender: string) => request<any>(`/match?gender=${gender}`, { method: "POST" }),
  /** Logs call metadata after practice call completion */
  logCall: (payload: any) => request<any>("/calls", { method: "POST", body: JSON.stringify(payload) }),
  /** Fetches user call history logs */
  callHistory: () => request<any>("/calls"),
  /** Sends a friend request to target user */
  sendFriendRequest: (to_name: string, to_avatar: string) => request<any>("/friends/request", { method: "POST", body: JSON.stringify({ to_name, to_avatar }) }),
  /** Fetches pending incoming friend requests */
  friendRequests: () => request<any>("/friends/requests"),
  /** Submits user report against target user */
  report: (target_name: string, reason: string) => request<any>("/reports", { method: "POST", body: JSON.stringify({ target_name, reason }) }),
  /** Blocks target user from further interactions */
  block: (target_name: string) => request<any>("/block", { method: "POST", body: JSON.stringify({ target_name, reason: "blocked" }) }),
  /** Fetches active voice practice rooms */
  rooms: () => request<any>("/rooms"),
  /** Creates a new voice room */
  createRoom: (payload: any) => request<any>("/rooms", { method: "POST", body: JSON.stringify(payload) }),
  /** Joins an existing voice room */
  joinRoom: (room_id: string) => request<any>("/rooms/join", { method: "POST", body: JSON.stringify({ room_id }) }),
  /** Fetches global leaderboard rankings */
  leaderboard: () => request<any>("/leaderboard"),
  /** Fetches weekly leaderboard rankings */
  weeklyLeaderboard: () => request<any>("/leaderboard"),
  /** Fetches user achievements list */
  achievements: () => request<any>("/achievements"),
  /** Fetches subscription pricing plans */
  subscriptionPlans: () => request<any>("/subscription/plans"),
  /** Initiates Stripe checkout for subscription upgrade */
  createCheckout: (plan: string, origin_url: string) => request<any>("/subscription/checkout", { method: "POST", body: JSON.stringify({ plan, origin_url }) }),
  /** Polls subscription checkout session payment status */
  pollCheckout: (session_id: string) => request<any>(`/subscription/status/${session_id}`),
  /** Cancels active user subscription */
  cancelSubscription: () => request<any>("/subscription/cancel", { method: "POST" }),
  /** Fetches ZegoCloud RTC authentication token for voice call room */
  getZegoToken: (room_id: string) => request<any>("/zego/token", { method: "POST", body: JSON.stringify({ room_id }) }),
};
