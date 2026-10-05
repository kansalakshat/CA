-- CA Firm CRM schema for Supabase (Postgres). Multi-firm: every row belongs to one firm.
-- Run: `npm run db:setup`, or paste this file into Supabase > SQL Editor > Run.
-- Safe to run again: it only creates what is missing, and upgrades a single-firm database in place.
--
-- Dates are stored as text ('YYYY-MM-DD' and 'YYYY-MM-DD HH:MM:SS', India time) so the app
-- shows exactly what was saved, whatever timezone the server runs in.

CREATE TABLE IF NOT EXISTS firms (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  api_key TEXT NOT NULL UNIQUE,                     -- n8n sends this to identify the firm
  n8n_base_url TEXT NOT NULL DEFAULT '',
  invoice_seq INTEGER NOT NULL DEFAULT 0,           -- per-firm invoice numbering
  created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  firm_id INTEGER REFERENCES firms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,                       -- always stored lowercase; one person, one firm
  password_hash TEXT,                               -- NULL for people who only use Google sign-in
  google_sub TEXT UNIQUE,                           -- Google account id, once linked
  email_verified_at TEXT,                           -- NULL until the email link is clicked
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('partner', 'staff')),
  created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);

-- One-time links sent by email (purpose 'verify'). Only the hash is stored.
CREATE TABLE IF NOT EXISTS email_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

-- Someone who signed in with Google but has no account yet; they still need to name their firm.
CREATE TABLE IF NOT EXISTS pending_signups (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  google_sub TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

-- Rate limits (failed logins, signups) per IP. In the database so they work across serverless instances.
CREATE TABLE IF NOT EXISTS login_attempts (
  ip TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  until TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS clients (
  id SERIAL PRIMARY KEY,
  firm_id INTEGER REFERENCES firms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT,
  pan TEXT,
  gstin TEXT,
  phone TEXT NOT NULL,
  email TEXT,
  services TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS invoices (
  id SERIAL PRIMARY KEY,
  firm_id INTEGER REFERENCES firms(id) ON DELETE CASCADE,
  number TEXT,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  service TEXT,
  amount DOUBLE PRECISION NOT NULL,
  gst_rate DOUBLE PRECISION NOT NULL,
  gst_amount DOUBLE PRECISION NOT NULL,
  total DOUBLE PRECISION NOT NULL,
  issue_date TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD'),
  due_date TEXT NOT NULL,
  paid_at TEXT,
  approval TEXT NOT NULL DEFAULT 'not_needed' CHECK (approval IN ('not_needed', 'pending', 'approved')),
  approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS documents (
  id SERIAL PRIMARY KEY,
  firm_id INTEGER REFERENCES firms(id) ON DELETE CASCADE,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'missing' CHECK (status IN ('missing', 'pending', 'received')),
  reminder_count INTEGER NOT NULL DEFAULT 0,
  requested_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD')
);

CREATE TABLE IF NOT EXISTS filings (
  id SERIAL PRIMARY KEY,
  firm_id INTEGER REFERENCES firms(id) ON DELETE CASCADE,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  return_type TEXT NOT NULL,
  period TEXT NOT NULL,
  due_date TEXT NOT NULL,
  data_received INTEGER NOT NULL DEFAULT 0,
  output_tax DOUBLE PRECISION NOT NULL DEFAULT 0,
  input_tax_credit DOUBLE PRECISION NOT NULL DEFAULT 0,
  filed_at TEXT
);

CREATE TABLE IF NOT EXISTS leads (
  id SERIAL PRIMARY KEY,
  firm_id INTEGER REFERENCES firms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  service TEXT,
  source TEXT,
  value DOUBLE PRECISION NOT NULL DEFAULT 0,
  score INTEGER NOT NULL DEFAULT 0,
  stage TEXT NOT NULL DEFAULT 'new' CHECK (stage IN ('new', 'qualifying', 'proposal', 'won')),
  created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  firm_id INTEGER REFERENCES firms(id) ON DELETE CASCADE,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  role TEXT NOT NULL CHECK (role IN ('client', 'ai')),
  text TEXT NOT NULL,
  escalated INTEGER NOT NULL DEFAULT 0,
  response_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  firm_id INTEGER REFERENCES firms(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  client_id INTEGER REFERENCES clients(id),
  assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  due_date TEXT,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  source TEXT NOT NULL DEFAULT 'manual',
  done_at TEXT,
  created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS')
);

-- ── Upgrade from the single-firm version ──
-- Adds firm_id where missing, puts all existing rows into one firm (named from the old settings), then drops the old settings table.
ALTER TABLE users ADD COLUMN IF NOT EXISTS firm_id INTEGER REFERENCES firms(id) ON DELETE CASCADE;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS firm_id INTEGER REFERENCES firms(id) ON DELETE CASCADE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS firm_id INTEGER REFERENCES firms(id) ON DELETE CASCADE;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS firm_id INTEGER REFERENCES firms(id) ON DELETE CASCADE;
ALTER TABLE filings ADD COLUMN IF NOT EXISTS firm_id INTEGER REFERENCES firms(id) ON DELETE CASCADE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS firm_id INTEGER REFERENCES firms(id) ON DELETE CASCADE;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS firm_id INTEGER REFERENCES firms(id) ON DELETE CASCADE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS firm_id INTEGER REFERENCES firms(id) ON DELETE CASCADE;
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_number_key;   -- numbers are now unique per firm, not globally

DO $$
DECLARE
  fid INTEGER;
  old_name TEXT := 'My Firm';
  old_key TEXT := '';
  old_n8n TEXT := '';
BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE firm_id IS NULL) OR EXISTS (SELECT 1 FROM clients WHERE firm_id IS NULL) THEN
    IF to_regclass('public.settings') IS NOT NULL THEN
      EXECUTE $q$SELECT coalesce((SELECT value FROM settings WHERE key = 'firm_name'), 'My Firm')$q$ INTO old_name;
      EXECUTE $q$SELECT coalesce((SELECT value FROM settings WHERE key = 'api_key'), '')$q$ INTO old_key;
      EXECUTE $q$SELECT coalesce((SELECT value FROM settings WHERE key = 'n8n_base_url'), '')$q$ INTO old_n8n;
    END IF;
    IF old_key = '' THEN old_key := md5(random()::text || clock_timestamp()::text) || md5(random()::text); END IF;
    INSERT INTO firms (name, api_key, n8n_base_url, invoice_seq)
    VALUES (old_name, old_key, old_n8n, (SELECT count(*) FROM invoices))
    RETURNING id INTO fid;
    UPDATE users SET firm_id = fid WHERE firm_id IS NULL;
    UPDATE clients SET firm_id = fid WHERE firm_id IS NULL;
    UPDATE invoices SET firm_id = fid WHERE firm_id IS NULL;
    UPDATE documents SET firm_id = fid WHERE firm_id IS NULL;
    UPDATE filings SET firm_id = fid WHERE firm_id IS NULL;
    UPDATE leads SET firm_id = fid WHERE firm_id IS NULL;
    UPDATE messages SET firm_id = fid WHERE firm_id IS NULL;
    UPDATE tasks SET firm_id = fid WHERE firm_id IS NULL;
  END IF;
END $$;

DROP TABLE IF EXISTS settings;

-- ── Upgrade: email verification + Google sign-in ──
-- People who signed up before verification existed count as verified (only done once, when the column is added).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'email_verified_at') THEN
    ALTER TABLE users ADD COLUMN email_verified_at TEXT;
    UPDATE users SET email_verified_at = created_at;
  END IF;
END $$;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub TEXT UNIQUE;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- ── Upgrade: firm contact details, asked once on the "Set up your firm" screen ──
ALTER TABLE firms ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT '';
ALTER TABLE firms ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '';
ALTER TABLE firms ADD COLUMN IF NOT EXISTS setup_done BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE users ALTER COLUMN firm_id SET NOT NULL;
ALTER TABLE clients ALTER COLUMN firm_id SET NOT NULL;
ALTER TABLE invoices ALTER COLUMN firm_id SET NOT NULL;
ALTER TABLE documents ALTER COLUMN firm_id SET NOT NULL;
ALTER TABLE filings ALTER COLUMN firm_id SET NOT NULL;
ALTER TABLE leads ALTER COLUMN firm_id SET NOT NULL;
ALTER TABLE messages ALTER COLUMN firm_id SET NOT NULL;
ALTER TABLE tasks ALTER COLUMN firm_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS invoices_firm_number_idx ON invoices (firm_id, number);
CREATE INDEX IF NOT EXISTS users_firm_idx ON users (firm_id);
CREATE INDEX IF NOT EXISTS clients_firm_idx ON clients (firm_id);
CREATE INDEX IF NOT EXISTS invoices_firm_idx ON invoices (firm_id);
CREATE INDEX IF NOT EXISTS documents_firm_idx ON documents (firm_id);
CREATE INDEX IF NOT EXISTS filings_firm_idx ON filings (firm_id);
CREATE INDEX IF NOT EXISTS leads_firm_idx ON leads (firm_id);
CREATE INDEX IF NOT EXISTS messages_firm_client_idx ON messages (firm_id, client_id);
CREATE INDEX IF NOT EXISTS tasks_firm_idx ON tasks (firm_id);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
DROP INDEX IF EXISTS invoices_client_idx;
DROP INDEX IF EXISTS documents_client_idx;
DROP INDEX IF EXISTS filings_client_idx;
DROP INDEX IF EXISTS messages_client_idx;

-- Supabase exposes tables in "public" through its REST API. Row Level Security with no policies
-- blocks that API completely; the CRM server connects directly as the database owner, which is not affected.
ALTER TABLE firms ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_signups ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE filings ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
