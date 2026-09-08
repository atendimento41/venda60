/**
 * Sincronização completa entre Hetzner e Supabase (substitui o destino).
 *
 * Uso (pasta vercel_superbase):
 *   npx tsx scripts/sync-bancos.mjs --dir=hetzner-to-supabase   # antigo → novo (agora)
 *   npx tsx scripts/sync-bancos.mjs --dir=supabase-to-hetzner   # novo → antigo (depois do cutover)
 *   npx tsx scripts/sync-bancos.mjs --dir=hetzner-to-supabase --dry-run
 *
 * Lê URLs de .env.local:
 *   HETZNER_DATABASE_URL  (ou SOURCE_DATABASE_URL / fallback hardcoded legado)
 *   ADMIN_DATABASE_URL    (Supabase session :5432)
 */
import pg from "pg";
import { pipeline } from "node:stream/promises";
import { from as copyFrom, to as copyTo } from "pg-copy-streams";
import fs from "fs";
import path from "path";

function loadEnvForce(file) {
  if (!fs.existsSync(file)) return;
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

const HETZNER_URL =
  process.env.HETZNER_DATABASE_URL ||
  process.env.SOURCE_DATABASE_URL ||
  "postgresql://cv_vendas_app:6om1nut0%24_v3nd1%24@95.216.252.42:5432/60minutos_vendas";

const SUPABASE_URL =
  process.env.ADMIN_DATABASE_URL ||
  process.env.SUPABASE_DATABASE_URL ||
  "";

const dirArg =
  process.argv.find((a) => a.startsWith("--dir="))?.slice(6) ||
  "hetzner-to-supabase";
const dryRun = process.argv.includes("--dry-run");

if (!["hetzner-to-supabase", "supabase-to-hetzner"].includes(dirArg)) {
  console.error("Use --dir=hetzner-to-supabase ou --dir=supabase-to-hetzner");
  process.exit(1);
}

if (!SUPABASE_URL) {
  console.error("Defina ADMIN_DATABASE_URL (Supabase session :5432) no .env.local");
  process.exit(1);
}

const SOURCE_URL = dirArg === "hetzner-to-supabase" ? HETZNER_URL : SUPABASE_URL;
const DEST_URL = dirArg === "hetzner-to-supabase" ? SUPABASE_URL : HETZNER_URL;

/** Pais antes dos filhos (FK). */
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

function isSupabase(url) {
  return /supabase|pooler\.supabase/i.test(url);
}

function clientOpts(url) {
  return {
    connectionString: url,
    connectionTimeoutMillis: 30_000,
    ssl: isSupabase(url) ? { rejectUnauthorized: false } : undefined,
  };
}

async function count(client, table) {
  const r = await client.query(`SELECT count(*)::bigint AS n FROM ${table}`);
  return Number(r.rows[0].n);
}

async function tableExists(client, table) {
  const r = await client.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema='public' AND table_name=$1`,
    [table]
  );
  return r.rows.length > 0;
}

async function cols(client, table) {
  const r = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1
     ORDER BY ordinal_position`,
    [table]
  );
  return r.rows.map((x) => x.column_name);
}

async function ensureDestColumns(src, dest, table) {
  const a = await cols(src, table);
  const b = await cols(dest, table);
  const missing = a.filter((c) => !b.includes(c));
  if (!missing.length) return a.filter((c) => b.includes(c));

  // Colunas conhecidas que podemos criar no destino
  const ddl = {
    "itens.preco_final_salvo":
      "ALTER TABLE itens ADD COLUMN IF NOT EXISTS preco_final_salvo BOOLEAN NOT NULL DEFAULT FALSE",
    "usuarios.sessao_ver":
      "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS sessao_ver INTEGER NOT NULL DEFAULT 1",
  };
  for (const col of missing) {
    const key = `${table}.${col}`;
    if (ddl[key]) {
      console.log(`  + coluna ${key}`);
      await dest.query(ddl[key]);
    } else {
      console.warn(`  ! coluna só na origem (ignorada no COPY): ${key}`);
    }
  }
  const b2 = await cols(dest, table);
  return a.filter((c) => b2.includes(c));
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

async function refreshMv(client) {
  await client.query(`DROP MATERIALIZED VIEW IF EXISTS mv_vendas_mensal`);
  await client.query(`
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
    await client.query(`
      CREATE UNIQUE INDEX mv_vendas_mensal_uq
      ON mv_vendas_mensal (mes, unidade, vendedor, categoria, subcategoria)
    `);
  } catch {
    /* ok */
  }
}

console.log(`Direção: ${dirArg}`);
console.log(`SOURCE  ${mask(SOURCE_URL)}`);
console.log(`DEST    ${mask(DEST_URL)}`);
if (dryRun) console.log("(dry-run — só contagens)");

const src = new pg.Client(clientOpts(SOURCE_URL));
const dest = new pg.Client(clientOpts(DEST_URL));
await src.connect();
await dest.connect();

try {
  console.log("\nContagens:");
  const counts = {};
  for (const t of TABLES) {
    const okSrc = await tableExists(src, t);
    const okDest = await tableExists(dest, t);
    if (!okSrc) {
      console.log(`  ${t}: ausente na origem — skip`);
      counts[t] = -1;
      continue;
    }
    counts[t] = await count(src, t);
    const destN = okDest ? await count(dest, t) : -1;
    console.log(`  ${t}: origem=${counts[t]}  destino=${destN}`);
  }

  if (dryRun) {
    console.log("\nDry-run ok. Nada alterado.");
    process.exit(0);
  }

  console.log("\nAlinhando colunas no destino...");
  const copyCols = {};
  for (const t of TABLES) {
    if (counts[t] < 0) continue;
    if (!(await tableExists(dest, t))) {
      throw new Error(`Tabela ${t} não existe no destino. Rode migrate antes.`);
    }
    copyCols[t] = await ensureDestColumns(src, dest, t);
  }

  console.log("\nLimpando destino (TRUNCATE CASCADE)...");
  const present = TABLES.filter((t) => counts[t] >= 0);
  await dest.query(`TRUNCATE TABLE ${present.join(", ")} RESTART IDENTITY CASCADE`);
  await dest.query(`DROP MATERIALIZED VIEW IF EXISTS mv_vendas_mensal`);

  for (const table of TABLES) {
    if (counts[table] < 0) continue;
    if (counts[table] === 0) {
      console.log(`OK ${table} (vazia)`);
      continue;
    }

    const colList = copyCols[table].map((c) => `"${c}"`).join(", ");
    process.stdout.write(`COPY ${table} (${counts[table]})... `);
    const started = Date.now();

    const readStream = src.query(
      copyTo(`COPY ${table} (${colList}) TO STDOUT`)
    );
    const writeStream = dest.query(
      copyFrom(`COPY ${table} (${colList}) FROM STDIN`)
    );
    await pipeline(readStream, writeStream);

    const nDest = await count(dest, table);
    if (nDest !== counts[table]) {
      throw new Error(`${table}: origem ${counts[table]} ≠ destino ${nDest}`);
    }
    await resetIdentity(dest, table).catch(() => {});
    console.log(`OK ${nDest} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  }

  console.log("\nRecriando mv_vendas_mensal no destino...");
  await refreshMv(dest);

  console.log("\nConferido:");
  for (const t of TABLES) {
    if (counts[t] < 0) continue;
    const n = await count(dest, t);
    console.log(`  ${n === counts[t] ? "✓" : "✗"} ${t}: ${n}`);
  }
  console.log("\nSync concluído.");
} finally {
  await src.end().catch(() => {});
  await dest.end().catch(() => {});
}
