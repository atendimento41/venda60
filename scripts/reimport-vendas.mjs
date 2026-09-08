/**
 * Reimportação rápida da aba Vendas (limpa + COPY em lote).
 *
 * Uso:
 *   npx tsx scripts/reimport-vendas.mjs
 *   npx tsx scripts/reimport-vendas.mjs --file="..\Controle de Vendas - 60MINUTOS - Vendas.csv"
 */
import fs from "fs";
import path from "path";
import pg from "pg";
import { loadEnvLocal } from "../src/lib/load-env";
import {
  loadCsvFile,
  parseDataHoraPlanilha,
  parseDataPlanilha,
  parseIntSafe,
  parsePreco,
  pick,
} from "../src/lib/csv";

loadEnvLocal();

function argValue(name, fallback) {
  const pref = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(pref));
  return hit ? hit.slice(pref.length) : fallback;
}

function pickUnidade(row) {
  const u = pick(row, ["unidade", "loja", "filial"]);
  if (u) return u;
  return row[""] || "";
}

const defaultFile = path.resolve(
  process.cwd(),
  "..",
  "Controle de Vendas - 60MINUTOS - Vendas.csv"
);
const file = path.resolve(argValue("file", defaultFile));

if (!fs.existsSync(file)) {
  console.error("Arquivo não encontrado:", file);
  process.exit(1);
}

console.log("Lendo CSV:", file);
const rows = loadCsvFile(file);
console.log("Linhas no CSV:", rows.length);

const prepared = [];
let skipped = 0;

for (const row of rows) {
  const sku = pick(row, ["sku"]);
  const unidade = pickUnidade(row);
  const dataRaw = pick(row, ["data", "data_venda", "date"]);
  const data = /\d{1,2}:\d{2}/.test(dataRaw)
    ? parseDataHoraPlanilha(dataRaw)
    : parseDataPlanilha(dataRaw);
  if (!sku || !unidade || !data) {
    skipped++;
    continue;
  }

  const meep = pick(row, [
    "subcategoria_-_meep",
    "subcategoria_meep",
    "meep",
    "subcategoria",
    "categoria_meep",
  ]);
  const dash = pick(row, ["categoria_-_dash", "categoria_dash", "categoria", "subcategory"]);

  prepared.push([
    data,
    pick(row, ["id_vendedor", "id"]) || null,
    pick(row, ["vendedor", "nome_vendedor"]) || null,
    unidade,
    dash || meep || null,
    meep || dash || null,
    sku,
    pick(row, ["item", "descricao", "descrição", "h_descricao"]) || null,
    parsePreco(pick(row, ["preco_unitario", "preco_unita", "preco", "i_preco"])),
    parseIntSafe(pick(row, ["quantidade", "qtd", "j_qtd"]), 1) || 1,
    parsePreco(pick(row, ["subtotal_bruto", "subtotal", "k_subtotal_bruto"])),
    parsePreco(pick(row, ["desconto", "l_desconto"])),
    parsePreco(pick(row, ["valor_recebido", "valor", "m_valor_recebido"])),
    pick(row, ["status", "o_status"]).toUpperCase() || null,
    pick(row, ["cancelado_por", "t_cancelado_por"]) || null,
  ]);
}

console.log("Prontas para inserir:", prepared.length, "| ignoradas:", skipped);

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();

try {
  await client.query("BEGIN");
  const before = await client.query("SELECT COUNT(*)::int AS n FROM vendas");
  console.log("Registros antes:", before.rows[0].n);

  await client.query("DELETE FROM vendas");
  console.log("Tabela vendas limpa.");

  const BATCH = 200;
  const sql = `INSERT INTO vendas (
    data, id_vendedor, vendedor, unidade, categoria, subcategoria, sku, descricao,
    preco_unitario, quantidade, subtotal_bruto, desconto, valor_recebido, status, cancelado_por
  ) VALUES `;

  for (let i = 0; i < prepared.length; i += BATCH) {
    const chunk = prepared.slice(i, i + BATCH);
    const values = [];
    const params = [];
    let p = 1;
    for (const row of chunk) {
      values.push(
        `($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`
      );
      params.push(...row);
    }
    await client.query(sql + values.join(","), params);
    process.stdout.write(`\rInseridas: ${Math.min(i + BATCH, prepared.length)}/${prepared.length}`);
  }
  console.log("");

  await client.query(`
    INSERT INTO itens (sku, descricao, preco, ativo)
    SELECT DISTINCT sku,
      COALESCE(NULLIF(descricao,''), sku),
      COALESCE(preco_unitario, 0),
      true
    FROM vendas
    WHERE sku IS NOT NULL AND sku != ''
    ON CONFLICT (sku) DO NOTHING
  `);

  await client.query("COMMIT");

  const after = await client.query("SELECT COUNT(*)::int AS n FROM vendas");
  const total = await client.query(`
    SELECT ROUND(SUM(valor_recebido)::numeric, 2) AS total
    FROM vendas
    WHERE COALESCE(UPPER(TRIM(status)), '') <> 'CANCELADO'
  `);
  const top3jul = await client.query(`
    SELECT TRIM(vendedor) AS vendedor,
           ROUND(SUM(valor_recebido)::numeric, 2) AS valor,
           SUM(quantidade)::int AS qtd
    FROM vendas
    WHERE data >= '2026-07-01' AND data <= '2026-07-31T23:59:59.999Z'
      AND COALESCE(UPPER(TRIM(status)), '') <> 'CANCELADO'
    GROUP BY TRIM(vendedor)
    ORDER BY valor DESC
    LIMIT 3
  `);

  console.log("\n=== Concluído ===");
  console.log("Registros importados:", after.rows[0].n);
  console.log("Total valor (ativas):", total.rows[0].total);
  console.log("Top 3 jul/2026:");
  console.table(top3jul.rows);
} catch (e) {
  await client.query("ROLLBACK");
  console.error("ERRO:", e.message || e);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
