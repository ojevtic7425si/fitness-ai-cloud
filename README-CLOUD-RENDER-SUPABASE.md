# Fitness AI v2.7 — Render Free + Supabase Cloud setup

This version is made for using the app from **phone + computer anywhere**, not only on the same Wi‑Fi.

Architecture:

```text
PWA frontend -> Render backend -> Supabase PostgreSQL + Supabase Storage
                       |
                       -> Groq/Gemini/OpenAI AI API, with mock fallback
```

## 1. Supabase setup

1. Create a free Supabase project.
2. Open **SQL Editor**.
3. Paste and run `supabase/schema.sql` from this project.
4. Open **Storage**.
5. Create a private bucket named:

```text
progress-photos
```

6. Go to **Project Settings -> API** and copy:
   - Project URL
   - `service_role` key

Do not put the service role key in frontend/client env. It goes only in Render backend env.

## 2. Render backend setup

Create a new Render **Web Service** from this project/repo.

Settings:

```text
Root Directory: server
Build Command: npm install
Start Command: npm start
Plan: Free
```

Environment variables:

```env
NODE_VERSION=22.22.0
PORT=10000
CLIENT_URL=https://YOUR-FRONTEND-URL.onrender.com
CORS_ALLOW_ALL=true

SYNC_KEY=make-a-long-random-secret-key

DATABASE_PROVIDER=supabase
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
SUPABASE_STORAGE_BUCKET=progress-photos

AI_PROVIDER=groq
AI_FALLBACK_PROVIDER=mock
GROQ_API_KEY=gsk_YOUR_GROQ_KEY
GROQ_BASE_URL=https://api.groq.com/openai/v1
GROQ_TEXT_MODEL=llama-3.1-8b-instant
GROQ_VISION_MODEL=meta-llama/llama-4-scout-17b-16e-instruct

GEMINI_API_KEY=
OPENAI_API_KEY=
```

After deploy, test:

```text
https://YOUR-BACKEND.onrender.com/api/health
```

Expected:

```json
{"ok":true,"database":"supabase"}
```

## 3. Frontend/PWA setup

You can deploy the `client` folder as a Render Static Site or Vercel project.

Build settings:

```text
Root Directory: client
Build Command: npm install && npm run build
Publish Directory: dist
```

Frontend env:

```env
VITE_API_URL=https://YOUR-BACKEND.onrender.com/api
```

Then open the frontend URL on phone and computer.

## 4. Sync key without login

Because there is no login, the private `SYNC_KEY` acts as your access key.

Open the app first time with:

```text
https://YOUR-FRONTEND.onrender.com?syncKey=YOUR_SYNC_KEY
```

The app stores it in browser localStorage. Use the same link on iPhone and PC.

## 5. Free plan warning

Render Free web services can sleep after inactivity. First request after sleep may take 30-60 seconds. If the app says it cannot load the database, wait and refresh.

## 6. Local test with cloud DB

You can test locally against Supabase:

Server:

```bash
cd server
npm install
npm run dev
```

Client:

```bash
cd client
npm install
npm run dev -- --host 0.0.0.0 --port 5173
```

Use `server/.env` with Supabase values and `client/.env.local`:

```env
VITE_API_URL=http://localhost:3001/api
```
