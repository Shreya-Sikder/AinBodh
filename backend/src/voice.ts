/* =========================================================
   VOICE — read-aloud (text-to-speech) and voice input (speech-to-text)

   READ-ALOUD  POST /api/voice/tts  { text, language: "bn" | "en" } -> audio/mpeg
     Browsers often have no Bangla voice (Chrome on Windows/macOS has none),
     so the frontend falls back to this endpoint for Bangla. Providers, in order:
       TTS_PROVIDER=azure   AZURE_SPEECH_KEY + AZURE_SPEECH_REGION  (official; bn-BD-NabanitaNeural)
       TTS_PROVIDER=google  GOOGLE_TTS_API_KEY                      (official; bn-IN voices)
       TTS_PROVIDER=edge    no key — Microsoft Edge's read-aloud voices via the
                            `msedge-tts` package. Unofficial and may stop working
                            without notice; fine for development and demos.
       TTS_PROVIDER=auto (default): azure if configured, else google, else edge
                            (set TTS_ALLOW_EDGE=false to disable it).
       TTS_PROVIDER=off     disables server read-aloud.

   VOICE INPUT  POST /api/voice/transcribe  multipart "audio" (+ language)
     For browsers without built-in speech recognition (Firefox, some Safari/
     Android builds), or when it fails. Uses Groq Whisper with the existing
     GROQ_API_KEY. Understands Bangla, English and mixed speech; Bangla is
     returned in Bengali script.
========================================================= */

import crypto from "node:crypto";
import type { Express, Request, Response } from "express";
import multer from "multer";
import type Groq from "groq-sdk";
import { toFile } from "groq-sdk";

type Language = "bn" | "en";

const MAX_TTS_CHARS = 1800;
const TTS_TIMEOUT_MS = Number(process.env.TTS_TIMEOUT_MS || 20000);

/* ---------------------------------------------------------
   Text preparation
--------------------------------------------------------- */

/** Remove markdown, citation markers, links and symbols that shouldn't be read aloud. */
export function speakableText(text: string): string {
  return text
    .replace(/\[C\d+\]/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\*\*|__|`|#{1,6}\s?/g, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/[<>]/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/* ---------------------------------------------------------
   Providers
--------------------------------------------------------- */

const VOICES = {
  azure: {
    bn: process.env.AZURE_TTS_VOICE_BN || "bn-BD-NabanitaNeural",
    en: process.env.AZURE_TTS_VOICE_EN || "en-US-JennyNeural",
  },
  google: {
    bn: process.env.GOOGLE_TTS_VOICE_BN || "bn-IN-Wavenet-A",
    en: process.env.GOOGLE_TTS_VOICE_EN || "en-US-Neural2-F",
  },
  edge: {
    bn: process.env.EDGE_TTS_VOICE_BN || "bn-BD-NabanitaNeural",
    en: process.env.EDGE_TTS_VOICE_EN || "en-US-JennyNeural",
  },
};

type Provider = "azure" | "google" | "edge";

export function ttsProvider(): Provider | null {
  const chosen = (process.env.TTS_PROVIDER || "auto").toLowerCase();
  if (chosen === "off") return null;
  if (chosen === "azure") return process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION ? "azure" : null;
  if (chosen === "google") return process.env.GOOGLE_TTS_API_KEY ? "google" : null;
  if (chosen === "edge") return "edge";
  if (process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION) return "azure";
  if (process.env.GOOGLE_TTS_API_KEY) return "google";
  return process.env.TTS_ALLOW_EDGE === "false" ? null : "edge";
}

async function withTimeout<T>(task: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      task,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("speech service timed out")), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function azureSpeech(text: string, language: Language): Promise<Buffer> {
  const voice = VOICES.azure[language];
  const locale = voice.split("-").slice(0, 2).join("-");
  const ssml = `<speak version="1.0" xml:lang="${locale}"><voice name="${voice}"><prosody rate="-5%">${escapeXml(text)}</prosody></voice></speak>`;
  const response = await fetch(`https://${process.env.AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": process.env.AZURE_SPEECH_KEY as string,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
      "User-Agent": "AinBodh",
    },
    body: ssml,
    signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Azure speech HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function googleSpeech(text: string, language: Language): Promise<Buffer> {
  const name = VOICES.google[language];
  const response = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(process.env.GOOGLE_TTS_API_KEY as string)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: name.split("-").slice(0, 2).join("-"), name },
      audioConfig: { audioEncoding: "MP3", speakingRate: 0.95 },
    }),
    signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Google speech HTTP ${response.status}`);
  const data = (await response.json()) as { audioContent?: string };
  if (!data.audioContent) throw new Error("Google speech returned no audio");
  return Buffer.from(data.audioContent, "base64");
}

async function edgeSpeech(text: string, language: Language): Promise<Buffer> {
  // Loaded only when needed, so a missing optional package never stops the server.
  let edge: typeof import("msedge-tts");
  try {
    edge = await import("msedge-tts");
  } catch {
    throw Object.assign(new Error("msedge-tts is not installed (run npm install in backend)"), { status: 501 });
  }
  const tts = new edge.MsEdgeTTS();
  try {
    await tts.setMetadata(VOICES.edge[language], edge.OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(escapeXml(text), { rate: "-5%" });
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      audioStream.on("data", (chunk: Buffer) => chunks.push(chunk));
      audioStream.on("end", () => resolve());
      audioStream.on("close", () => resolve());
      audioStream.on("error", reject);
    });
    const audio = Buffer.concat(chunks);
    if (audio.length === 0) throw new Error("Edge speech returned no audio");
    return audio;
  } finally {
    tts.close();
  }
}

/* ---------------------------------------------------------
   Cache (same sentence is often replayed)
--------------------------------------------------------- */

const cache = new Map<string, Buffer>();
let cacheBytes = 0;
const CACHE_LIMIT = 40 * 1024 * 1024;

function remember(key: string, audio: Buffer) {
  cache.set(key, audio);
  cacheBytes += audio.length;
  for (const [oldKey, oldAudio] of cache) {
    if (cacheBytes <= CACHE_LIMIT) break;
    cache.delete(oldKey);
    cacheBytes -= oldAudio.length;
  }
}

export async function synthesize(text: string, language: Language): Promise<Buffer> {
  const provider = ttsProvider();
  if (!provider) throw Object.assign(new Error("read-aloud is not configured"), { status: 501 });

  const key = crypto.createHash("sha1").update(`${provider}:${language}:${text}`).digest("hex");
  const cached = cache.get(key);
  if (cached) {
    cache.delete(key);
    cache.set(key, cached);
    return cached;
  }

  const run = provider === "azure" ? azureSpeech : provider === "google" ? googleSpeech : edgeSpeech;
  const audio = await withTimeout(run(text, language), TTS_TIMEOUT_MS);
  remember(key, audio);
  return audio;
}

/* ---------------------------------------------------------
   Routes
--------------------------------------------------------- */

const AUDIO_TYPES = /^(audio\/(webm|ogg|mpeg|mp3|mp4|m4a|x-m4a|wav|x-wav|aac|flac)|video\/webm)(;.*)?$/i;

const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
});

export function registerVoiceRoutes(app: Express, groq: Groq) {
  app.post("/api/voice/tts", async (req: Request, res: Response) => {
    const language: Language = req.body?.language === "en" ? "en" : "bn";
    const text = speakableText(typeof req.body?.text === "string" ? req.body.text : "");

    if (!text) return res.status(400).json({ ok: false, error: "Text is required." });
    if (text.length > MAX_TTS_CHARS) {
      return res.status(413).json({ ok: false, error: `Send at most ${MAX_TTS_CHARS} characters at a time.` });
    }

    try {
      const audio = await synthesize(text, language);
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Content-Length", String(audio.length));
      res.setHeader("Cache-Control", "private, max-age=86400");
      return res.end(audio);
    } catch (error) {
      const status = (error as { status?: number }).status === 501 ? 501 : 502;
      console.error("Read-aloud failed:", (error as Error).message);
      return res.status(status).json({
        ok: false,
        error:
          status === 501
            ? "Read-aloud in Bangla is not set up on this server."
            : "The read-aloud service is not available right now. Please try again.",
      });
    }
  });

  app.get("/api/voice/status", (_req, res) => {
    res.json({ ok: true, tts: ttsProvider() !== null, ttsProvider: ttsProvider(), transcribe: true });
  });

  app.post("/api/voice/transcribe", audioUpload.single("audio"), async (req: Request, res: Response) => {
    const file = req.file;
    if (!file || file.size === 0) return res.status(400).json({ ok: false, error: "No audio was received." });
    if (!AUDIO_TYPES.test(file.mimetype)) return res.status(415).json({ ok: false, error: "Unsupported audio format." });

    // "banglish" is spoken Bangla; transcribing as Bangla gives Bengali script.
    const requested = String(req.body?.language || "");
    const language = requested === "en" ? "en" : requested === "bn" || requested === "banglish" ? "bn" : undefined;
    const extension = file.mimetype.includes("ogg") ? "ogg" : file.mimetype.includes("mp4") || file.mimetype.includes("m4a") ? "m4a" : file.mimetype.includes("wav") ? "wav" : file.mimetype.includes("mpeg") || file.mimetype.includes("mp3") ? "mp3" : "webm";

    try {
      const result = await groq.audio.transcriptions.create({
        file: await toFile(file.buffer, `speech.${extension}`, { type: file.mimetype }),
        model: process.env.GROQ_STT_MODEL || "whisper-large-v3",
        language,
        temperature: 0,
        response_format: "json",
        // A short hint keeps Bangla in Bengali script and legal words spelled correctly.
        prompt:
          language === "en"
            ? "A person describing a legal problem in Bangladesh."
            : "একজন মানুষ বাংলাদেশের একটি আইনি সমস্যার কথা বলছেন। বাড়ি ভাড়া, চুক্তি, মামলা, থানা, আদালত।",
      });
      return res.json({ ok: true, text: (result.text || "").trim() });
    } catch (error) {
      console.error("Transcription failed:", (error as Error).message);
      const busy = (error as { status?: number }).status === 429;
      return res.status(busy ? 503 : 502).json({
        ok: false,
        error: busy ? "Voice input is busy right now. Please try again in a minute." : "The recording could not be transcribed. Please try again.",
      });
    }
  });
}
