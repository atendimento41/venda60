/**
 * Lista itens onde custo cadastro diverge dos lançamentos (diagnóstico do bug).
 */
import pg from "pg";
import { loadEnvLocal } from "../src/lib/load-env.js";
import { custoUnitarioLancamento } from "../src/lib/unik-calculo.js";
import { normalizeUpper } from "../src/lib/utils.js";

loadEnvLocal();

function chaveNomeItem(s) {
  return normalizeUpper(s).replace(/\s+/g, " ").trim();
}

function campoEhUnik3d(v) {
  const t = normalizeUpper(v);
  return t.includes("UNIK") && t.includes("3D");
}

function encomenda(status, tipo) {
  const t = chaveNomeItem(`${status || ""} ${tipo || ""}`);
  return t.includes("ENCOMENDA") && !t.includes("ENTREG") && !t.includes("RETIR");
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "1" ? { rejectUnauthorized: false } : undefined,
});
await client.connect();

const vinc = await client.query(`SELECT nome_chave, sku FROM unik_vinculos`);
const skuPorChave = Object.fromEntries(vinc.rows.map((r) => [r.nome_chave, r.sku]));
const ent = await client.query(
  `SELECT sku, nome, custo, quantidade, status, tipo FROM entrega_unik WHERE custo > 0`
);
const itens = await client.query(
  `SELECT sku, descricao, subcategoria_meep, custo FROM itens WHERE custo > 0`
);

const maxPorSku = {};
for (const row of ent.rows) {
  if (encomenda(row.status, row.tipo)) continue;
  const unit = custoUnitarioLancamento(Number(row.custo), Number(row.quantidade) || 1, false);
  const skus = new Set();
  if (row.sku) skus.add(normalizeUpper(row.sku));
  const ch = chaveNomeItem(row.nome);
  if (ch && skuPorChave[ch]) skus.add(normalizeUpper(skuPorChave[ch]));
  for (const s of skus) {
    maxPorSku[s] = Math.max(maxPorSku[s] || 0, unit);
  }
}

const divergentes = [];
for (const item of itens.rows) {
  if (!campoEhUnik3d(item.subcategoria_meep)) continue;
  const sku = normalizeUpper(item.sku);
  const esperado = maxPorSku[sku];
  if (!esperado) continue;
  const atual = Number(item.custo) || 0;
  if (Math.abs(atual - esperado) > 0.02) {
    divergentes.push({
      sku: item.sku,
      descricao: item.descricao,
      atual,
      esperado,
      ratio: atual > 0 ? (esperado / atual).toFixed(2) : "—",
    });
  }
}

console.log(`Itens UNIK com custo > 0: ${itens.rows.filter((i) => campoEhUnik3d(i.subcategoria_meep)).length}`);
console.log(`Divergentes (cadastro ≠ maior lançamento): ${divergentes.length}\n`);
for (const d of divergentes.sort((a, b) => b.esperado - a.esperado)) {
  console.log(`${d.sku} ${d.descricao}: R$ ${d.atual.toFixed(2)} → deveria R$ ${d.esperado.toFixed(2)} (×${d.ratio})`);
}

await client.end();
