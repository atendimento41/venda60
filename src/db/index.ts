import { Pool, type QueryResultRow } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __cvPgPool: Pool | undefined;
}

function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  if (process.env.VERCEL) {
    throw new Error(
      "DATABASE_URL não configurada. Use uma URL PostgreSQL (postgresql://user:pass@host:5432/db)."
    );
  }

  throw new Error(
    "DATABASE_URL não configurada. Defina no .env.local uma URL PostgreSQL."
  );
}

function resolvePoolMax(): number {
  const raw = Number(process.env.DB_POOL_MAX);
  if (Number.isFinite(raw) && raw > 0) return Math.floor(raw);
  // Serverless: cada instância abre seu pool — manter baixo evita estourar CONNECTION LIMIT do role.
  return process.env.VERCEL ? 1 : 5;
}

/** Converte placeholders `?` (legado) para `$1, $2...` (PostgreSQL). */
export function toPgPlaceholders(sql: string): string {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
}

export type SqlExecuteResult = { rows: QueryResultRow[] };

export type SqlClient = {
  execute: (
    stmt: string | { sql: string; args?: unknown[] }
  ) => Promise<SqlExecuteResult>;
};

let _db: NodePgDatabase<typeof schema> | null = null;

function getPool(): Pool {
  if (!global.__cvPgPool) {
    const url = resolveDatabaseUrl();
    const isServerless = Boolean(process.env.VERCEL);
    global.__cvPgPool = new Pool({
      connectionString: url,
      max: resolvePoolMax(),
      idleTimeoutMillis: isServerless ? 5_000 : 30_000,
      connectionTimeoutMillis: 10_000,
      allowExitOnIdle: isServerless,
      ssl: process.env.DATABASE_SSL === "1" ? { rejectUnauthorized: false } : undefined,
    });
  }
  return global.__cvPgPool;
}

function getDbInternal(): NodePgDatabase<typeof schema> {
  if (!_db) {
    _db = drizzle(getPool(), { schema });
  }
  return _db;
}

export function getClient(): SqlClient {
  return {
    async execute(stmt) {
      const pool = getPool();
      if (typeof stmt === "string") {
        const r = await pool.query(stmt);
        return { rows: r.rows };
      }
      const text = toPgPlaceholders(stmt.sql);
      const r = await pool.query(text, stmt.args ?? []);
      return { rows: r.rows };
    },
  };
}

/** Proxy lazy: só conecta ao banco na 1ª query em runtime. */
export const db = new Proxy({} as NodePgDatabase<typeof schema>, {
  get(_target, prop, receiver) {
    const real = getDbInternal();
    const value = Reflect.get(real, prop, receiver);
    if (typeof value === "function") {
      return (value as (...args: unknown[]) => unknown).bind(real);
    }
    return value;
  },
});

export { schema };

/** Compatibilidade com scripts de migração/import. */
export const client = {
  execute: (stmt: Parameters<SqlClient["execute"]>[0]) => getClient().execute(stmt),
};
