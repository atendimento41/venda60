/**
 * Encerra conexões ociosas do role da app (libera "too many connections").
 *
 * Uso:
 *   npx tsx scripts/liberar-conexoes-db.mjs
 *   npx tsx scripts/liberar-conexoes-db.mjs --todas
 *
 * Se o role estiver no limite, defina ADMIN_DATABASE_URL (postgres superuser).
 */
import pg from "pg";
import { loadEnvLocal } from "../src/lib/load-env.js";

loadEnvLocal();

const todas = process.argv.includes("--todas");
const role = process.env.DB_APP_ROLE || "cv_vendas_app";

function poolFor(url) {
  return new pg.Pool({
    connectionString: url,
    max: 1,
    connectionTimeoutMillis: 8_000,
    ssl: process.env.DATABASE_SSL === "1" ? { rejectUnauthorized: false } : undefined,
  });
}

async function connectWithRetry(url, tentativas = 12) {
  let ultimo;
  for (let i = 0; i < tentativas; i++) {
    const pool = poolFor(url);
    try {
      const client = await pool.connect();
      return { pool, client };
    } catch (err) {
      ultimo = err;
      await pool.end().catch(() => {});
      await new Promise((r) => setTimeout(r, 2500));
    }
  }
  throw ultimo;
}

const adminUrl = process.env.ADMIN_DATABASE_URL;
const appUrl = process.env.DATABASE_URL;
if (!adminUrl && !appUrl) {
  console.error("Defina DATABASE_URL ou ADMIN_DATABASE_URL no .env.local");
  process.exit(1);
}

const url = adminUrl || appUrl;
const { pool, client } = await connectWithRetry(url);

try {
  const antes = await client.query(
    adminUrl
      ? `SELECT count(*)::int AS n FROM pg_stat_activity WHERE usename = $1`
      : `SELECT count(*)::int AS n FROM pg_stat_activity WHERE usename = current_user`,
    adminUrl ? [role] : []
  );
  console.log(`Conexões ativas (${role}):`, antes.rows[0].n);

  const cond = todas
    ? `usename = $1 AND pid <> pg_backend_pid()`
    : `usename = $1 AND pid <> pg_backend_pid() AND state = 'idle'`;

  const alvo = await client.query(
    `SELECT pid, state, application_name, client_addr::text, state_change
     FROM pg_stat_activity
     WHERE ${cond}
     ORDER BY state_change`,
    [role]
  );

  if (!alvo.rows.length) {
    console.log("Nenhuma conexão para encerrar.");
    process.exit(0);
  }

  console.log(`Encerrando ${alvo.rows.length} conexão(ões)...`);
  for (const row of alvo.rows) {
    await client.query(`SELECT pg_terminate_backend($1)`, [row.pid]);
    console.log(`  pid ${row.pid} (${row.state})`);
  }

  const depois = await client.query(
    adminUrl
      ? `SELECT count(*)::int AS n FROM pg_stat_activity WHERE usename = $1`
      : `SELECT count(*)::int AS n FROM pg_stat_activity WHERE usename = current_user`,
    adminUrl ? [role] : []
  );
  console.log("Conexões restantes:", depois.rows[0].n);
} finally {
  client.release();
  await pool.end();
}
