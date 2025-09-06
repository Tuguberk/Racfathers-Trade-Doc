# Rac'fella

WhatsApp-based psychological trading support agent. Calm, supportive guidance synthesized from user chat history, live Binance portfolio data, and a vectorized knowledge base.

# Cloudflared

```
cloudflared tunnel --url http://localhost:3000
```

## Features

- Secure onboarding via unique, single-use URL (5-minute TTL in Redis)
- AES-256-GCM encryption for Binance API Key/Secret (stored in Postgres)
- **🎤 Voice Message Support** - Send voice messages via WhatsApp, automatically transcribed using ElevenLabs Speech-to-Text
- LangGraph agent pipeline for analysis and response generation
- CCXT-powered live balance fetch from Binance
- pgvector similarity search on curated knowledge articles
- Twilio WhatsApp webhook responses + outbound confirmation after onboarding

## Tech Stack

- Node.js + TypeScript, Express
- Prisma ORM (PostgreSQL + pgvector)
- Redis (token TTL)
- CCXT (Binance)
- Twilio (WhatsApp)
- **ElevenLabs** (Speech-to-Text for voice messages)
- OpenRouter (LLM, embeddings)
- LangGraph.js

## Quick Start (Local)

1. Prerequisites

- Node.js 20+
- Docker (for Postgres + pgvector + Redis)
- OpenRouter API key

2. Clone & install

```bash
npm install
```

3. Environment

Copy `.env.example` to `.env` and fill values. Generate a 32-byte AES key (hex):

```bash
openssl rand -hex 32
```

Set `OPENROUTER_API_KEY`, `ELEVENLABS_API_KEY`, `AES_ENCRYPTION_KEY`, and Twilio env vars if you want outbound confirmation messages.

**Voice Message Support**: To enable voice message transcription, you'll need an ElevenLabs API key. Get one from [ElevenLabs](https://elevenlabs.io/) and add it to your `.env` file.

4. Start Postgres (pgvector) and Redis

```bash
docker compose up -d db redis
```

5. Initialize Prisma

```bash
npx prisma generate
npx prisma migrate dev --name init
```

Ensure pgvector is enabled in the DB:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

6. Seed Knowledge Base

```bash
npm run seed
```

7. Run the server

```bash
npm run dev
```

Health check: `GET /health`

## WhatsApp Webhook

Set your Twilio WhatsApp Sandbox or number to POST to:

```
{APP_BASE_URL}/api/whatsapp/webhook
```

Incoming params used: `From` (e.g., `whatsapp:+15551234567`), `Body` (message text), `MediaUrl0`, `MediaContentType0`, `NumMedia` (for voice messages).

## Voice Messages 🎤

Users can send voice messages directly in WhatsApp! The system:

1. **Receives** voice messages via Twilio's media webhook parameters
2. **Downloads** the audio file using Twilio's media URL with authentication
3. **Transcribes** the audio using ElevenLabs Speech-to-Text API
4. **Processes** the transcribed text exactly like a regular text message
5. **Responds** through the normal agent pipeline

### Supported Audio Formats

- MP3 (audio/mpeg, audio/mp3)
- WAV (audio/wav, audio/wave, audio/x-wav)
- OGG (audio/ogg)
- WebM (audio/webm)
- MP4 (audio/mp4)
- M4A (audio/m4a)
- AAC (audio/aac)
- FLAC (audio/flac)

### Requirements

- ElevenLabs API key in environment variables (`ELEVENLABS_API_KEY`)
- Twilio WhatsApp webhook configured to include media URLs

## Onboarding Flow

1. First user message → agent detects no user → responds with single-use link (`/onboard/:token`) valid for 5 minutes.
2. User opens link, enters Binance API Key/Secret.
3. Backend immediately encrypts with AES-256-GCM and stores in Postgres.
4. Token is invalidated. (If Twilio env vars are set, a WhatsApp confirmation is sent.)
5. User resumes chat in WhatsApp; the agent now has access to live data.

## Agent Pipeline (LangGraph)

Fixed linear graph:

START → retrieve_user_and_history → fetch_and_analyze_portfolio → analyze_psychological_state → search_knowledge_base → generate_final_response → END

State: `src/agent/state.ts`
Graph: `src/agent/mainAgent.ts`

## Folder Structure

- `src/index.ts` — Express app entry
- `src/routes/onboarding.ts` — Onboarding endpoints + page
- `src/routes/whatsapp.ts` — Twilio WhatsApp webhook
- `src/services/cryptoService.ts` — AES-256-GCM encrypt/decrypt
- `src/services/redisService.ts` — Redis TTL token helpers
- `src/services/binanceService.ts` — CCXT portfolio fetching
- `src/services/speechService.ts` — ElevenLabs Speech-to-Text for voice messages
- `src/services/llmService.ts` — OpenRouter wrappers (chat + embeddings)
- `src/agent/*` — LangGraph agent & state
- `src/db/prisma.ts` — Prisma client
- `prisma/schema.prisma` — Database schema (embedding uses `Unsupported("vector(1536)")`)
- `data/knowledge.json` — Seed data for knowledge base
- `src/scripts/seed.ts` — Vectorization + insert for knowledge base

## Docker

Build + run all services:

```bash
docker compose up --build
```

The app container runs `prisma migrate deploy` on start. Ensure migrations exist (run `prisma migrate dev` locally and commit the generated migration files) prior to production deploy.

## Notes

- Prisma cannot natively set pgvector values; seeding updates the embedding with a raw SQL statement using pgvector's string cast.
- P/L analysis is an empathetic, qualitative summary (not exact realized P/L). The CCXT-based valuation estimates USDT value across holdings for context.
- If embedding model dims differ, update `vector(1536)` in the schema accordingly and re-migrate.
