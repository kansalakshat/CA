-- CA Firm CRM schema for Supabase (Postgres).
-- Run once: `npm run db:setup`, or paste this file into Supabase > SQL Editor > Run.
-- Safe to run again: it only creates what is missing.
--
-- Dates are stored as text ('YYYY-MM-DD' and 'YYYY-MM-DD HH:MM:SS', India time) so the app
-- shows exactly what was saved, whatever timezone the server runs in.

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,                       -- always stored lowercase
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('partner', 'staff')),
  created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);

-- Failed logins per IP, for the 15-minute lockout. In the database so it works across serverless instances.
CREATE TABLE IF NOT EXISTS login_attempts (
  ip TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  until TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS clients (
  id SERIAL PRIMARY KEY,
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
  number TEXT UNIQUE,
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
  client_id INTEGER NOT NULL REFERENCES clients(id),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'missing' CHECK (status IN ('missing', 'pending', 'received')),
  reminder_count INTEGER NOT NULL DEFAULT 0,
  requested_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD')
);

CREATE TABLE IF NOT EXISTS filings (
  id SERIAL PRIMARY KEY,
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
  client_id INTEGER NOT NULL REFERENCES clients(id),
  role TEXT NOT NULL CHECK (role IN ('client', 'ai')),
  text TEXT NOT NULL,
  escalated INTEGER NOT NULL DEFAULT 0,
  response_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  client_id INTEGER REFERENCES clients(id),
  assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  due_date TEXT,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  source TEXT NOT NULL DEFAULT 'manual',
  done_at TEXT,
  created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS')
);

CREATE INDEX IF NOT EXISTS invoices_client_idx ON invoices (client_id);
CREATE INDEX IF NOT EXISTS documents_client_idx ON documents (client_id);
CREATE INDEX IF NOT EXISTS filings_client_idx ON filings (client_id);
CREATE INDEX IF NOT EXISTS messages_client_idx ON messages (client_id);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);

-- Supabase exposes tables in "public" through its REST API. Row Level Security with no policies
-- blocks that API completely; the CRM server connects directly as the database owner, which is not affected.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE filings ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
