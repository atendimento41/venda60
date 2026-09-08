/**
 * Analisa e migra o CSV de estoque (aba Estoque) para o PostgreSQL.
 * Colunas: sku, estoque(=unidade), Quantidade, NOME, categoria
 *
 * Preserva o depósito UNIK (unidade GERAL). 99999 vira item ilimitado.
 *
 * Uso:
 *   npx tsx scripts/migrar-estoque-csv.mjs --dry-run
 *   npx tsx scripts/migrar-estoque-csv.mjs
 */
import fs from "fs";
import path from "path";
import pg from "pg";
import { loadEnvLocal } from "../src/lib/load-env.js";
import { loadCsvFile, parseIntSafe, pick } from "../src/lib/csv.js";

loadEnvLocal();

const apply = !process.argv.includes("--dry-run");
const ILIMITADO = 99999;
const UNIDADES_OK = new Set(["PKS", "SSU", "TGS", "PIER 21"]);

function argValue(name, fallback) {
  const pref = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(pref));
  return hit ? hit.slice(pref.length) : fallback;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function conectarComRetry(url, tentativas = 40) {
  let ultimo;
  for (let i = 0; i < tentativas; i++) {
    const client = new pg.Client({
      connectionString: url,
      connectionTimeoutMillis: 10_000,
      ssl: process.env.DATABASE_SSL === "1" ? { rejectUnauthorized: false } : undefined,
    });
    try {
      await client.connect();
      return client;
    } catch (err) {
      ultimo = err;
      await client.end().catch(() => {});
      if (err?.code !== "53300") throw err;
      process.stderr.write(`Aguardando conexão (${i + 1}/${tentativas})...\n`);
      await sleep(3000);
    }
  }
  throw ultimo;
}

const defaultFile = path.resolve(
  process.cwd(),
  "..",
  "Controle de Vendas - 60MINUTOS - Estoque.csv"
);
const file = path.resolve(argValue("file", defaultFile));
if (!fs.existsSync(file)) {
  console.error("Arquivo não encontrado:", file);
  process.exit(1);
}

const rows = loadCsvFile(file);
console.log("CSV:", file);
console.log("Linhas:", rows.length);

const prepared = [];
const pulados = { semSku: 0, semUnidade: 0, unidadeInvalida: 0 };
const unidadesCsv = {};
const ilimitados = new Set();

for (const row of rows) {
  const sku = pick(row, ["sku"]);
  const unidade = pick(row, ["estoque", "unidade", "loja", "filial"]);
  if (!sku) {
    pulados.semSku++;
    continue;
  }
  if (!unidade) {
    pulados.semUnidade++;
    continue;
  }
  const uni = String(unidade).trim();
  const uniUp = uni.toUpperCase();
  if (uniUp === "GERAL") {
    pulados.unidadeInvalida++;
    continue;
  }
  if (uniUp === "PHOTO") {
    ilimitados.add(sku);
    pulados.unidadeInvalida++;
    continue;
  }
  if (!UNIDADES_OK.has(uni.toUpperCase()) && !UNIDADES_OK.has(uni)) {
    const canon = [...UNIDADES_OK].find((u) => u.toUpperCase() === uni.toUpperCase());
    if (!canon) {
      pulados.unidadeInvalida++;
      console.log("  unidade ignorada:", JSON.stringify(uni));
      continue;
    }
    prepared.push({
      sku,
      unidade: canon,
      quantidade: parseIntSafe(pick(row, ["quantidade", "qtd", "qt"]), 0),
      nome: pick(row, ["nome", "descricao", "item"]) || null,
    });
    unidadesCsv[canon] = (unidadesCsv[canon] || 0) + 1;
    continue;
  }
  const canon = [...UNIDADES_OK].find((u) => u.toUpperCase() === uni.toUpperCase()) || uni;
  let qtd = parseIntSafe(pick(row, ["quantidade", "qtd", "qt"]), 0);
  if (qtd >= ILIMITADO) {
    ilimitados.add(sku);
    qtd = 0;
  }
  prepared.push({ sku, unidade: canon, quantidade: qtd, nome: pick(row, ["nome", "descricao", "item"]) || null });
  unidadesCsv[canon] = (unidadesCsv[canon] || 0) + 1;
}

console.log("Preparadas:", prepared.length);
console.log("Por unidade CSV:", unidadesCsv);
console.log("Pulados:", pulados);
console.log("SKUs ilimitados (qtd 99999):", [...ilimitados].sort().join(", ") || "nenhum");

const client = await conectarComRetry(process.env.DATABASE_URL);

try {
  const itensRes = await client.query("SELECT sku FROM itens");
  const skusDb = new Set(itensRes.rows.map((r) => String(r.sku)));

  const estRes = await client.query(
    "SELECT sku, unidade, quantidade FROM estoque"
  );

  const atual = new Map();
  const porUnidadeDb = {};
  for (const r of estRes.rows) {
    const k = `${r.sku}|${r.unidade}`;
    atual.set(k, Number(r.quantidade) || 0);
    porUnidadeDb[r.unidade] = (porUnidadeDb[r.unidade] || 0) + 1;
  }
  console.log("Linhas estoque no banco:", estRes.rows.length);
  console.log("Por unidade banco:", porUnidadeDb);

  const semItem = [];
  const upserts = [];
  let iguais = 0;
  let novos = 0;
  let mudados = 0;

  for (const p of prepared) {
    if (ilimitados.has(p.sku)) p.quantidade = 0;
    if (!skusDb.has(p.sku)) {
      semItem.push(p);
      continue;
    }
    const k = `${p.sku}|${p.unidade}`;
    const qtdAntes = atual.has(k) ? atual.get(k) : null;
    if (qtdAntes === p.quantidade) {
      iguais++;
      continue;
    }
    if (qtdAntes == null) novos++;
    else mudados++;
    upserts.push({ ...p, qtdAntes });
  }

  console.log("CSV sem cadastro de item:", semItem.length);
  if (semItem.length) {
    const skus = [...new Set(semItem.map((s) => s.sku))];
    console.log("  SKUs:", skus.slice(0, 30).join(", ") + (skus.length > 30 ? "…" : ""));
  }
  console.log("Iguais ao banco:", iguais);
  console.log("Novos:", novos);
  console.log("Quantidade diferente:", mudados);
  console.log("Upserts:", upserts.length);

  const amostra = upserts.filter((u) => u.quantidade > 0 || (u.qtdAntes || 0) > 0).slice(0, 15);
  for (const a of amostra) {
    console.log(
      `  ${a.sku} @ ${a.unidade}: ${a.qtdAntes ?? "—"} → ${a.quantidade}`
    );
  }
  if (upserts.length > amostra.length) {
    console.log(`  ... e mais ${upserts.length - amostra.length} alterações (inclui zeros)`);
  }

  if (!apply) {
    console.log("\nDry-run. Use sem --dry-run para gravar.");
    process.exit(0);
  }

  await client.query("BEGIN");

  for (const sku of ilimitados) {
    if (!skusDb.has(sku)) continue;
    await client.query("UPDATE itens SET ilimitado = TRUE WHERE sku = $1", [sku]);
  }

  for (const p of upserts) {
    await client.query(
      `INSERT INTO estoque (sku, unidade, quantidade, nome)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (sku, unidade)
       DO UPDATE SET quantidade = EXCLUDED.quantidade, nome = COALESCE(EXCLUDED.nome, estoque.nome)`,
      [p.sku, p.unidade, p.quantidade, p.nome]
    );
  }

  await client.query("COMMIT");
  console.log(
    `\nMigrado: ${upserts.length} linhas de estoque, ${ilimitados.size} item(ns) ilimitado(s). GERAL não foi alterado.`
  );
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  throw err;
} finally {
  await client.end().catch(() => {});
}
