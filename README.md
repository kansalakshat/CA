# CA Firm CRM

React frontend + small Node.js backend + Supabase (Postgres) database.

## First-time setup

Needs Node.js 22.13 or newer (`node -v` to check).

1. **Create a Supabase project** at https://supabase.com (free plan is fine; pick the Mumbai region for India).
2. **Get the connection string:** in Supabase, click **Connect** (top bar) → **Transaction pooler** → copy the URI. Replace `[YOUR-PASSWORD]` with the database password you chose.
3. **Create `.env`:** copy `.env.example` to `.env` and paste the connection string as `DATABASE_URL`.
4. Run:
   ```
   npm install
   npm run db:setup
   npm run build
   npm start
   ```
5. Open http://localhost:3000. The first visit asks you to create the **partner (admin) account**. Add staff later in **Settings**.

`npm run db:setup` creates the tables (safe to run again). Instead of running it, you can paste `db/schema.sql` into Supabase → **SQL Editor** → **Run**.

## Everyday commands

| Command | What it does |
|---|---|
| `npm start` | Runs the CRM at http://localhost:3000 |
| `npm run build` | Rebuilds the React app after you change files in `client/` |
| `npm run dev` | For editing the UI: live reload at http://localhost:5173 (keep `npm start` running in another window) |
| `npm test` | Tests the whole API on a throwaway in-memory Postgres (Supabase is not touched) |

## Deploying to Vercel

Everything runs on Vercel: the React app as static files, the backend as a serverless function (`api/index.js`). Data lives in Supabase.

1. Push the project to GitHub (`.env` is ignored, so your password is not uploaded).
2. In Vercel: **Add New → Project** → import the repo. The settings come from `vercel.json`, so leave them as they are.
3. Under **Environment Variables**, add `DATABASE_URL` (the same Transaction pooler string as in `.env`).
4. Click **Deploy**. Open the site and create the partner account.

## Files

| Path | What it is |
|---|---|
| `server.js` | Backend: login, API, database queries; serves the React app locally |
| `api/index.js` | Vercel entry point (uses `server.js`) |
| `db/schema.sql` | Database tables (run once with `npm run db:setup`) |
| `client/src/App.jsx` | App shell: sidebar, top bar, search, notifications |
| `client/src/views/` | One file per screen (Dashboard, Invoices, Tasks, ...) |
| `client/src/styles.css` | Styles (taken from the original HTML design) |
| `vercel.json` | Vercel config: builds the frontend, routes `/api` to the backend function |
| `.env.example` | Template for `.env` (your database connection string) |
| `n8n/n8n-workflow.json` | Your n8n workflow, connected to this CRM |
| `n8n/template.json` | Original n8n template from Notion (input for `n8n/make-workflow.js`) |

## Who can do what

- **Partner**: everything, plus approving invoices over ₹50,000, adding/removing users, and changing settings.
- **Staff**: everything else (clients, invoices, documents, filings, leads, tasks, chat).

## Security notes

- Tables have Row Level Security switched on with no policies. Supabase's public REST API therefore can't read them; only the CRM server (which connects with the database password) can.
- Keep `DATABASE_URL` secret. Anyone with it has full access to the data.
- Backups: Supabase backs up daily on paid plans. On the free plan, export regularly (Supabase → Database → Backups, or `pg_dump`).

## Connecting n8n

1. In n8n: **Import from file** → `n8n/n8n-workflow.json`.
2. In the CRM: **Settings** → copy the API key. In n8n, replace every `YOUR_CRM_API_KEY` with it (5 nodes whose names start with "CRM:").
3. The workflow points at `http://localhost:3000`. If the CRM is on Vercel, regenerate it with your site address:
   `node n8n/make-workflow.js https://your-crm.vercel.app`
4. In the CRM: **Settings** → set the n8n webhook URL (e.g. `https://your-n8n.example.com/webhook`).
5. Fill in the Gmail, WhatsApp, Sarvam and OpenAI credentials in n8n, as the workflow's sticky notes describe.

What changed compared with the Notion template:
- The 3 "Mock" data nodes now read real data from the CRM. The reminder-count step writes back to the CRM.
- The AI agent's "Check Invoice Status" tool asks the CRM.
- Invoices keep the CRM's invoice number.
- Invoices over ₹50,000 wait for the partner to click **Approve** in the CRM, then n8n sends them.

## Settings (environment variables)

| Name | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | required | Supabase connection string (Transaction pooler) |
| `PORT` | `3000` | Local port |
| `HOST` | `127.0.0.1` | Only this computer can open it. Use `0.0.0.0` to allow the office network. |
| `TRUST_PROXY` | off (on automatically on Vercel) | Set to `1` behind Render or Nginx, so the real visitor IP (login lockout) and HTTPS (secure cookie) are detected |
