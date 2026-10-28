/*
 * Accounts.
 *
 * Production: Supabase Auth (email + password), when VITE_SUPABASE_URL and
 * VITE_SUPABASE_ANON_KEY are set in the root .env. The anon key is designed
 * to be public; the service-role key must never be put in the frontend.
 * Passwords go only to Supabase; AinBodh stores the session tokens in this
 * browser and sends the access token to the AinBodh backend.
 *
 * Development (variables not set): the previous local prototype login.
 */

const SUPABASE_URL = ((import.meta.env.VITE_SUPABASE_URL as string | undefined) || "").trim().replace(/\/+$/, "");
const ANON_KEY = ((import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || "").trim();
const SESSION_KEY = "AinBodh-session";

export const realAuthEnabled = Boolean(SUPABASE_URL && ANON_KEY);

type Session = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // ms
  user: { name: string; email: string };
};

type AuthResult = { ok: true; user: { name: string; email: string }; needsConfirmation?: boolean };

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function writeSession(session: Session | null) {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // Storage blocked: the session lasts for this page only.
  }
}

async function gotrue(path: string, body: unknown, token?: string): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
      method: "POST",
      headers: {
        apikey: ANON_KEY,
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Could not reach the sign-in service. Check your internet connection and try again.");
  }

  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const raw = String(data.error_description || data.msg || data.message || data.error || "");
    if (/invalid login credentials/i.test(raw)) throw new Error("The email or password is incorrect.");
    if (/email not confirmed/i.test(raw)) throw new Error("Please confirm your email first — check your inbox for the link.");
    if (/already registered|already exists/i.test(raw)) throw new Error("An account with this email already exists. Please log in.");
    if (/password/i.test(raw) && /(short|least|weak)/i.test(raw)) throw new Error("Please choose a stronger password (at least 8 characters).");
    if (response.status === 429) throw new Error("Too many attempts. Please wait a few minutes and try again.");
    throw new Error("The request could not be completed. Please try again.");
  }
  return data;
}

function sessionFrom(data: Record<string, unknown>): Session | null {
  const accessToken = typeof data.access_token === "string" ? data.access_token : "";
  if (!accessToken) return null;
  const user = (data.user ?? {}) as { email?: string; user_metadata?: { name?: string } };
  const email = (user.email || "").toLowerCase();
  return {
    accessToken,
    refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : "",
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
    user: { email, name: user.user_metadata?.name || email.split("@")[0] || "User" },
  };
}

export async function realSignup(name: string, email: string, password: string): Promise<AuthResult> {
  const data = await gotrue("signup", { email, password, data: { name } });
  const session = sessionFrom(data);
  if (session) writeSession(session);
  // With email confirmation on (Supabase default), there is no session until the link is clicked.
  return { ok: true, user: { name, email }, needsConfirmation: !session };
}

export async function realLogin(email: string, password: string): Promise<AuthResult> {
  const session = sessionFrom(await gotrue("token?grant_type=password", { email, password }));
  if (!session) throw new Error("The sign-in service returned no session. Please try again.");
  writeSession(session);
  return { ok: true, user: session.user };
}

export async function realPasswordReset(email: string): Promise<void> {
  await gotrue("recover", { email });
}

export async function realLogout(): Promise<void> {
  const session = readSession();
  writeSession(null);
  if (session && realAuthEnabled) await gotrue("logout", {}, session.accessToken).catch(() => undefined);
}

let refreshing: Promise<string | null> | null = null;

/** A valid access token for API calls (refreshed when close to expiry), or null. */
export async function getAccessToken(): Promise<string | null> {
  if (!realAuthEnabled) return null;
  const session = readSession();
  if (!session) return null;
  if (session.expiresAt - Date.now() > 60_000) return session.accessToken;
  if (!session.refreshToken) return null;

  refreshing ??= gotrue("token?grant_type=refresh_token", { refresh_token: session.refreshToken })
    .then((data) => {
      const next = sessionFrom(data);
      writeSession(next);
      return next?.accessToken ?? null;
    })
    .catch(() => {
      writeSession(null);
      return null;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/** True when a real account session exists (or when real auth is not configured). */
export function hasValidSession(): boolean {
  if (!realAuthEnabled) return true;
  return Boolean(readSession());
}
