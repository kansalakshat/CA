# CA Firm CRM

Multi-firm CRM for CA firms: each firm signs up, gets a private workspace, and adds its own team.
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
5. Open http://localhost:3000 and click **Sign up your firm**. You become that firm's partner (admin). Add your team in **Settings**.

`npm run db:setup` creates the tables, or upgrades an older single-firm database in place (safe to run again). Instead of running it, you can paste `db/schema.sql` into Supabase → **SQL Editor** → **Run**.

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
3. Under **Environment Variables**, add `DATABASE_URL` (the same Transaction pooler string as in `.env`), the `SMTP_*` email settings, and optionally `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`. Without email settings, new sign-ups are paused on Vercel (existing users can still log in).
4. Click **Deploy**. Open the site and sign up your firm (or log in).

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

## Sign-up email (confirmation links)

New firms that sign up with email + password get a confirmation link and must click it before they can log in.

- **Gmail (simplest):** turn on 2-Step Verification for the Google account, then create an **App password** (Google Account → Security → App passwords). Set `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER` = the Gmail address, `SMTP_PASSWORD` = the 16-character app password, `SMTP_FROM` = the same Gmail address. Gmail allows about 500 emails a day.
- **Any other SMTP service** (Resend, Brevo, Zoho, your domain's mail) works the same way with its host, port, user and password.
- **Locally without SMTP**, emails are printed in the terminal running `npm start`, so you can click the link there.

## Google sign-in

Optional; the "Continue with Google" button appears once both settings are present.

1. Google Cloud Console → **APIs & Services → OAuth consent screen**: app name, support email, scopes `email`, `profile`, `openid`. Publish it ("In production") so anyone can sign in.
2. **Credentials → Create credentials → OAuth client ID → Web application**. Authorised redirect URIs:
   - `https://ca-0s.vercel.app/api/auth/google/callback`
   - `http://localhost:3000/api/auth/google/callback` (for local testing)
3. Put the client ID and secret in `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (in `.env` and in Vercel).

How it behaves: a Google email that already has an account logs straight into it. A new email is asked for a firm name, then the firm is created. People who only use Google can set a password later in Settings.

## Firms and users

- **New CA firm**: clicks **Sign up your firm** on the login page. That creates the firm and makes the person its partner.
- **Joining an existing firm**: the firm's partner adds them in **Settings → Team Users**. People cannot join a firm on their own. Their email counts as verified because the partner vouches for it.
- **Data is per firm**: every client, invoice, document, filing, lead, chat and task belongs to one firm. Every query is filtered by the logged-in user's firm, so one firm never sees another's data (`npm test` checks this).
- **Partner**: everything, plus approving invoices over ₹50,000, adding/removing users, and changing firm settings.
- **Staff**: everything else (clients, invoices, documents, filings, leads, tasks, chat).
- Sign-ups are limited to 10 attempts per hour per network, to stop spam firms.

## Security notes

- Tables have Row Level Security switched on with no policies. Supabase's public REST API therefore can't read them; only the CRM server (which connects with the database password) can.
- Keep `DATABASE_URL` secret. Anyone with it has full access to the data.
- Backups: Supabase backs up daily on paid plans. On the free plan, export regularly (Supabase → Database → Backups, or `pg_dump`).

## Connecting n8n

1. In n8n: **Import from file** → `n8n/n8n-workflow.json`.
2. In the CRM: **Settings** → copy your firm's API key. In n8n, replace every `YOUR_CRM_API_KEY` with it (5 nodes whose names start with "CRM:"). The key tells the CRM which firm n8n is working for, so each firm uses its own copy of the workflow with its own key.
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
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | empty | Email for confirmation links (see above). Required on Vercel for new sign-ups |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | empty | Google sign-in (see above) |
| `APP_URL` | detected on Vercel, else `http://localhost:3000` | Site address used in email links and the Google redirect |
| `PORT` | `3000` | Local port |
| `HOST` | `127.0.0.1` | Only this computer can open it. Use `0.0.0.0` to allow the office network. |
| `TRUST_PROXY` | off (on automatically on Vercel) | Set to `1` behind Render or Nginx, so the real visitor IP (login lockout) and HTTPS (secure cookie) are detected |
