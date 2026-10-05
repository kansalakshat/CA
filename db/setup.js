// Creates the tables in your Supabase database. Run once: npm run db:setup  (safe to run again)
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env and paste your Supabase connection string.');
  process.exit(1);
}

(async () => {
  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL);
  const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: isLocal ? false : { rejectUnauthorized: false } });
  await db.connect();
  await db.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  await db.end();
  console.log('Database tables are ready.');
})().catch(e => { console.error('Setup failed:', e.message); process.exit(1); });
