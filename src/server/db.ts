// Minimal Postgres access: Neon over HTTP in production (DATABASE_URL), embedded
// PGlite locally and in tests, so the app runs with zero setup. Both speak the
// same SQL, so queries are written once.

type Row = Record<string, unknown>;
export type Db = { query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<T[]> };

const SCHEMA = `
create table if not exists users (
  id text primary key,
  email text unique,
  apple_sub text unique,
  google_sub text unique,
  name text,
  plan text not null default 'free',
  trial_ends_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists email_codes (
  email text primary key,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  sent_at timestamptz not null default now()
);
create table if not exists usage (
  user_id text not null references users(id) on delete cascade,
  period text not null,
  ai_minutes int not null default 0,
  audio_seconds int not null default 0,
  primary key (user_id, period)
);
`;

let ready: Promise<Db> | null = null;

async function open(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(url);
    const db: Db = { query: async (q, p) => (await sql.query(q, p ?? [])) as never };
    for (const stmt of SCHEMA.split(";").map((s) => s.trim()).filter(Boolean)) await db.query(stmt);
    return db;
  }
  if (process.env.VERCEL) throw new Error("DATABASE_URL is required in production.");
  const { PGlite } = await import("@electric-sql/pglite");
  // NOTESTAKER_DB=memory for tests; otherwise persist under .data/ for local dev.
  const dir = process.env.NOTESTAKER_DB === "memory" ? undefined : process.env.NOTESTAKER_DB || ".data/pglite";
  const pg = new PGlite(dir);
  await pg.exec(SCHEMA);
  return { query: async (q, p) => (await pg.query(q, p ?? [])).rows as never };
}

export function db(): Promise<Db> {
  ready ??= open().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}
