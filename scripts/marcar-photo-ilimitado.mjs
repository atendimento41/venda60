import pg from "pg";
import { loadEnvLocal } from "../src/lib/load-env.js";

loadEnvLocal();

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 15_000,
  ssl: process.env.DATABASE_SSL === "1" ? { rejectUnauthorized: false } : undefined,
});

let last;
for (let i = 0; i < 20; i++) {
  try {
    await client.connect();
    last = null;
    break;
  } catch (err) {
    last = err;
    if (err?.code !== "53300") throw err;
    process.stderr.write(`Aguardando conexão (${i + 1}/20)...\n`);
    await sleep(2500);
  }
}
if (last) throw last;

try {
  const r = await client.query(`
    UPDATE itens
    SET ilimitado = TRUE
    WHERE upper(trim(coalesce(categoria_dash,''))) = 'PHOTO'
       OR upper(trim(coalesce(subcategoria_meep,''))) = 'PHOTO'
       OR upper(trim(coalesce(categoria_dash,''))) LIKE 'PHOTO %'
       OR upper(trim(coalesce(subcategoria_meep,''))) LIKE 'PHOTO %'
    RETURNING sku, descricao, categoria_dash, subcategoria_meep
  `);
  console.log(`Itens PHOTO marcados como ilimitado: ${r.rowCount}`);
  for (const row of r.rows) {
    console.log(`  ${row.sku} — ${row.descricao} (${row.categoria_dash} / ${row.subcategoria_meep})`);
  }
} finally {
  await client.end().catch(() => {});
}
