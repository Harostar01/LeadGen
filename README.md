# LeadPulse AI - Zero-Cost Social Listening & Lead Intent CRM

Full-stack, zero-cost lead scoring and social listening web application built with **Next.js 14 (App Router)**, **Tailwind CSS**, **Supabase (PostgreSQL)**, **Prisma ORM**, **Groq AI (Llama-3.1-8b-instant)**, **Upstash Redis**, and a **Manifest V3 Chrome Extension**.

---

## ⚡ Architecture & Tech Stack

- **Framework:** Next.js 14+ (App Router, Server Actions, API Routes, CORS enabled)
- **Styling:** Tailwind CSS (Dark-mode first with radiant neon glows & glassmorphic cards)
- **Database:** Supabase (PostgreSQL) via Prisma ORM
- **AI Engine:** Groq Cloud SDK (`llama-3.1-8b-instant` with strict JSON mode)
- **Caching & Deduplication:** Upstash Redis (Serverless KV store & rate limiting)
- **Cron Jobs:** Scheduled RSS ingestion for Reddit & forums (`/api/cron/fetch-rss`)
- **Chrome Extension:** Manifest V3 (Vanilla JS, quick lead capture, and Reddit/LinkedIn AI reply injection)

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Fill in your free service credentials:
- `DATABASE_URL`: Supabase Postgres connection string (from [supabase.com](https://supabase.com))
- `GROQ_API_KEY`: Groq API key (from [console.groq.com](https://console.groq.com/keys))
- `UPSTASH_REDIS_REST_URL` & `UPSTASH_REDIS_REST_TOKEN`: Upstash Redis REST credentials (from [console.upstash.com](https://console.upstash.com/redis))

> **Note:** The app includes a zero-config fallback mode. If database or Groq keys are not yet provided, it seamlessly runs with an in-memory repository and intelligent heuristic analyzer, allowing immediate end-to-end testing without crashing.

### 3. Initialize Prisma Database
Push schema to your Supabase PostgreSQL database:
```bash
npx prisma db push
```

To view or manage leads in Prisma Studio:
```bash
npx prisma studio
```

### 4. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the LeadPulse AI Dashboard.

---

## 🧩 Chrome Extension (Manifest V3)

The `/extension` folder contains a ready-to-load Manifest V3 Chrome Extension.

### Features
1. **Quick-Capture Popup (`popup.html` / `popup.js`):**
   - Automatically detects active tab URL, page title, and selected text.
   - 1-click capture sending to `/api/ingest`.
   - Displays real-time Intent Score, Groq reasoning, and copyable suggested pitch directly in popup!
2. **Reddit & LinkedIn Inline Script (`content.js`):**
   - Injects a floating **"✨ Insert AI Reply"** badge next to comment inputs on Reddit and LinkedIn threads.
   - Automatically analyzes thread context, inserts high-converting suggested pitches into the comment box, and copies to clipboard.

### Installation
1. Open Google Chrome and go to `chrome://extensions`
2. Enable **"Developer mode"** in the top-right corner.
3. Click **"Load unpacked"** and select the `/extension` directory in this repository.
4. Pin the **LeadPulse AI** extension to your browser toolbar!

---

## 📡 API Endpoints Reference

### 1. Ingestion Webhook (`POST /api/ingest`)
Receives social posts and triggers Groq AI scoring. Deduplicates by URL.
```json
// POST /api/ingest
{
  "source": "Reddit", // "Reddit" | "LinkedIn" | "Twitter" | "ChromeExtension" | "RSS" | "F5Bot"
  "title": "Looking for Next.js developer to build MVP ($5k budget)",
  "content": "Need an experienced dev to build customer portal. Figma ready.",
  "url": "https://reddit.com/r/forhire/comments/xyz123",
  "author": "u/founder_99"
}
```
**Response (201 Created):**
```json
{
  "success": true,
  "lead": {
    "id": "uuid",
    "intentScore": 94,
    "reasoning": "Urgent commercial hiring intent with explicit budget ($5k) and clear tech stack.",
    "suggestedReply": "Hey! We specialize in Next.js builds...",
    "status": "NEW"
  }
}
```

### 2. RSS Cron Reader (`GET /api/cron/fetch-rss`)
Fetches subreddits (`r/forhire`, `r/freelance_forhire`, `r/SaaS`), parses posts, matches monitored keywords, and automatically scores and ingests them.
- Protected by optional `?secret=...` or `Authorization: Bearer <CRON_SECRET>`.

### 3. Leads List & Filter (`GET /api/leads`)
Query parameters:
- `status`: `ALL`, `NEW`, `REPLIED`, `ARCHIVED`
- `minScore`: e.g. `70` for high-intent leads only
- `search`: keyword search across title, content, author, and reasoning
- `source`: filter by `Reddit`, `LinkedIn`, etc.

### 4. Lead Updates (`PATCH /api/leads/[id]`)
Update status (`REPLIED`, `ARCHIVED`, `NEW`) or edit the suggested reply.
```json
{
  "status": "REPLIED",
  "suggestedReply": "Customized pitch..."
}
```

### 5. Monitored Keywords (`GET, POST, DELETE /api/keywords`)
Manage keywords monitored during RSS scans.
