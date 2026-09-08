/**
 * Copia todas as tabelas do banco Hetzner → Supabase.
 *
 * Uso (na pasta vercel_superbase):
 *   npx tsx scripts/copiar-hetzner-para-supabase.mjs
 */
import pg from "pg";
import { pipeline } from "node:stream/promises";
import { from as copyFrom, to as copyTo } from "pg-copy-streams";
import fs from "fs";
import path from "path";

function loadEnvForce(file) {
  const text = fs.readFileSync(file, "utf8");
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
}

loadEnvForce(path.join(process.cwd(), ".env.local"));

const SOURCE_URL =
  process.env.SOURCE_DATABASE_URL ||
  "postgresql://cv_vendas_app:6om1nut0%24_v3nd1%24@95.216.252.42:5432/60minutos_vendas";

// Session pooler (DDL/COPY mais estável que transaction 6543)
const DEST_URL =
  process.env.ADMIN_DATABASE_URL ||
  process.env.DATABASE_URL ||
  "";

if (!DEST_URL.includes("supabase") && !DEST_URL.includes("pooler")) {
  console.error("DEST parece não ser Supabase. Abortando.");
  process.exit(1);
}

/** Ordem: pais antes dos filhos (FK). */
const TABLES = [
  "vendedores",
  "itens",
  "estoque",
  "vendas",
  "prime_vendas",
  "log_operacoes",
  "entrega_unik",
  "unik_vinculos",
  "unik_loja_status",
  "movimentos_estoque",
  "estoque_snapshots",
  "usuarios",
];

function mask(url) {
  return String(url).replace(/:[^:@]+@/, ":***@");
}

async function count(client, table) {
  const r = await client.query(`SELECT count(*)::bigint AS n FROM ${table}`);
  return Number(r.rows[0].n);
}

async function resetIdentity(client, table) {
  const r = await client.query(
    `SELECT pg_get_serial_sequence($1, 'id') AS seq`,
    [table]
  );
  const seq = r.rows[0]?.seq;
  if (!seq) return;
  await client.query(
    `SELECT setval($1::regclass, COALESCE((SELECT MAX(id) FROM ${table}), 1), true)`,
    [seq]
  );
}

const src = new pg.Client({
  connectionString: SOURCE_URL,
  connectionTimeoutMillis: 30_000,
  // Hetzner app user: sem SSL
});

const dest = new pg.Client({
  connectionString: DEST_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 30_000,
});

console.log("SOURCE", mask(SOURCE_URL));
console.log("DEST  ", mask(DEST_URL));

await src.connect();
await dest.connect();

try {
  console.log("\nContagens origem:");
  const counts = {};
  for (const t of TABLES) {
    try {
      counts[t] = await count(src, t);
      console.log(`  ${t}: ${counts[t]}`);
    } catch (e) {
      console.log(`  ${t}: (ausente) ${e.message}`);
      counts[t] = -1;
    }
  }

  console.log("\nLimpando destino (TRUNCATE CASCADE)...");
  await dest.query(
    `TRUNCATE TABLE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`
  );

  // DROP MV se existir (será recriada depois)
  await dest.query(`DROP MATERIALIZED VIEW IF EXISTS mv_vendas_mensal`);

  for (const table of TABLES) {
    if (counts[table] < 0) {
      console.log(`SKIP ${table}`);
      continue;
    }
    if (counts[table] === 0) {
      console.log(`OK ${table} (vazia)`);
      continue;
    }

    process.stdout.write(`COPY ${table} (${counts[table]} rows)... `);
    const started = Date.now();

    const readStream = src.query(copyTo(`COPY ${table} TO STDOUT`));
    const writeStream = dest.query(copyFrom(`COPY ${table} FROM STDIN`));
    await pipeline(readStream, writeStream);

    const nDest = await count(dest, table);
    if (nDest !== counts[table]) {
      throw new Error(`${table}: origem ${counts[table]} ≠ destino ${nDest}`);
    }
    await resetIdentity(dest, table).catch(() => {});
    console.log(`OK ${nDest} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  }

  console.log("\nRecriando mv_vendas_mensal...");
  await dest.query(`
    CREATE MATERIALIZED VIEW mv_vendas_mensal AS
    SELECT
      substring(data from 1 for 7) AS mes,
      upper(trim(unidade)) AS unidade,
      trim(vendedor) AS vendedor,
      coalesce(categoria, '') AS categoria,
      coalesce(subcategoria, '') AS subcategoria,
      count(*)::int AS qtd_linhas,
      sum(quantidade)::int AS quantidade,
      sum(valor_recebido)::double precision AS valor_recebido
    FROM vendas
    WHERE coalesce(upper(status), '') != 'CANCELADO'
    GROUP BY 1, 2, 3, 4, 5
  `);
  try {
    await dest.query(`
      CREATE UNIQUE INDEX mv_vendas_mensal_uq
      ON mv_vendas_mensal (mes, unidade, vendedor, categoria, subcategoria)
    `);
  } catch {
    /* ok */
  }

  console.log("\nConferido destino:");
  for (const t of TABLES) {
    if (counts[t] < 0) continue;
    const n = await count(dest, t);
    const mark = n === counts[t] ? "✓" : "✗";
    console.log(`  ${mark} ${t}: ${n}`);
  }

  console.log("\nCópia concluída.");
} finally {
  await src.end().catch(() => {});
  await dest.end().catch(() => {});
}
