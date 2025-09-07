import dotenv from "dotenv";
import crypto from "crypto";

dotenv.config();

function parseAesKey(): Buffer {
  const key = process.env.AES_ENCRYPTION_KEY || "";
  if (!key) throw new Error("AES_ENCRYPTION_KEY is required");
  // Try hex
  if (/^[0-9a-fA-F]+$/.test(key) && key.length === 64) {
    return Buffer.from(key, "hex");
  }
  // Try base64
  try {
    const buf = Buffer.from(key, "base64");
    if (buf.length === 32) return buf;
  } catch {}
  throw new Error("AES_ENCRYPTION_KEY must be 32 bytes (hex(64) or base64)");
}

export const config = {
  port: Number(process.env.PORT || 3000),
  appBaseUrl:
    process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`,
  dbUrl: process.env.DATABASE_URL || "",
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  openRouterKey: process.env.OPENROUTER_API_KEY || "",
  openaiKey: process.env.OPENAI_API_KEY || "",
  moralisApiKey: process.env.MORALIS_API_KEY || "",
  elevenlabs: {
    apiKey: process.env.ELEVENLABS_API_KEY || "",
  },
  models: {
    advanced: process.env.ADVANCED_MODEL || "anthropic/claude-3-opus-20240229",
    utility: process.env.UTILITY_MODEL || "google/gemini-1.5-flash",
    embedding: process.env.EMBEDDING_MODEL || "openai/text-embedding-3-small",
  },
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || "",
    authToken: process.env.TWILIO_AUTH_TOKEN || "",
    from: process.env.TWILIO_WHATSAPP_FROM || "",
  },
  aesKey: parseAesKey(),
};

export function generateToken(): string {
  return crypto.randomUUID();
}

export const JOURNAL_FEATURE_ENABLED =
  process.env.JOURNAL_FEATURE_ENABLED !== "false";
export const JOURNAL_REMINDERS_ENABLED =
  process.env.JOURNAL_REMINDERS_ENABLED === "true";
export const ADMIN_WHATSAPP_NUMBER = process.env.ADMIN_WHATSAPP_NUMBER || "";
