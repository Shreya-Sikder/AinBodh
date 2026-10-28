/* =========================================================
   HTTP GUARDS — CORS, security headers, rate limiting

   CORS_ORIGINS            comma-separated allowed origins, or "*"
                           (default: local Vite dev/preview origins)
   RATE_LIMIT_PER_MINUTE   requests per IP per minute on /api/legal/* (default 30)
   VOICE_RATE_LIMIT_PER_MINUTE / TTS_RATE_LIMIT_PER_MINUTE  voice input (20) / read-aloud (120)
   TRUST_PROXY             "true" when running behind a reverse proxy
   REQUIRE_AUTH            "true": every POST /api/* needs a signed-in user
                           (Supabase Auth access token in "Authorization: Bearer …")
========================================================= */

import type { Express, NextFunction, Request, Response } from "express";
import cors from "cors";
import { supabase } from "./supabase";

const DEFAULT_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
];

export function applyHttpGuards(app: Express) {
  if (process.env.TRUST_PROXY === "true") app.set("trust proxy", 1);
  app.disable("x-powered-by");

  const configured = (process.env.CORS_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean);
  const allowAll = configured.includes("*");
  const origins = new Set(configured.length ? configured : DEFAULT_ORIGINS);

  app.use(
    cors({
      origin: (origin, callback) => {
        // Same-origin and non-browser requests have no Origin header.
        if (!origin || allowAll || origins.has(origin)) return callback(null, true);
        return callback(null, false);
      },
      methods: ["GET", "POST"],
      allowedHeaders: ["Content-Type", "Authorization", "Accept"],
    }),
  );

  if (process.env.REQUIRE_AUTH === "true") requireSignedIn(app);

  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  // Per-IP limits. Read-aloud sends one request per sentence, so it gets more room.
  rateLimit(app, "/api/legal", Number(process.env.RATE_LIMIT_PER_MINUTE || 30));
  rateLimit(app, "/api/voice/transcribe", Number(process.env.VOICE_RATE_LIMIT_PER_MINUTE || 20));
  rateLimit(app, "/api/voice/tts", Number(process.env.TTS_RATE_LIMIT_PER_MINUTE || 120));
}

function rateLimit(app: Express, prefix: string, limit: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  app.use(prefix, (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "POST" || limit <= 0) return next();

    const key = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const entry = hits.get(key);

    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + 60_000 });
    } else if (entry.count >= limit) {
      res.setHeader("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({
        ok: false,
        error: "Too many requests. Please wait a minute and try again.",
      });
    } else {
      entry.count += 1;
    }

    if (hits.size > 10_000) {
      for (const [ip, value] of hits) if (value.resetAt <= now) hits.delete(ip);
    }

    next();
  });
}

/* ---------------------------------------------------------
   Signed-in users only (optional)
--------------------------------------------------------- */

const verified = new Map<string, { userId: string; until: number }>();

function requireSignedIn(app: Express) {
  app.use("/api", async (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "POST") return next();

    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return res.status(401).json({ ok: false, error: "Please log in to use AinBodh." });
    }

    const cached = verified.get(token);
    if (cached && cached.until > Date.now()) return next();

    try {
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data?.user) {
        return res.status(401).json({ ok: false, error: "Your session has expired. Please log in again." });
      }
      verified.set(token, { userId: data.user.id, until: Date.now() + 5 * 60_000 });
      if (verified.size > 5000) {
        for (const [key, value] of verified) if (value.until <= Date.now()) verified.delete(key);
      }
      return next();
    } catch {
      return res.status(503).json({ ok: false, error: "Sign-in could not be checked right now. Please try again." });
    }
  });
}

/** Final error handler: never leak stack traces or internals to the client. */
export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  const status =
    typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : 500;
  const message =
    (error as { code?: string })?.code === "LIMIT_FILE_SIZE"
      ? "The file is larger than 15 MB."
      : (error as { type?: string })?.type === "entity.too.large"
        ? "The request is too large."
        : status < 500 && error instanceof Error
          ? error.message
          : "Something went wrong on the server. Please try again.";

  if (status >= 500) console.error("Unhandled error:", error instanceof Error ? error.message : error);
  res.status((error as { code?: string })?.code === "LIMIT_FILE_SIZE" ? 413 : status).json({ ok: false, error: message });
}
