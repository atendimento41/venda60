/**
 * Corrige custo/sugestão no cadastro dos itens UNIK (bug custo ÷ quantidade).
 * Usa 1 conexão só — evita "too many connections".
 *
 * Uso:
 *   npx tsx scripts/corrigir-custo-bug-unik.mjs
 *   npx tsx scripts/corrigir-custo-bug-unik.mjs --dry-run
 */
import pg from "pg";
import { loadEnvLocal } from "../src/lib/load-env.js";
import {
  custoUnitarioLancamento,
  maxCustoSugestaoDeLancamentos,
} from "../src/lib/unik-calculo.js";
import { normalizeUpper } from "../src/lib/utils.js";

loadEnvLocal();

const dryRun = process.argv.includes("--dry-run");

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

function chaveNomeItem(s) {
  return normalizeUpper(s).replace(/\s+/g, " ").trim();
}

function campoEhUnik3d(valor) {
  const t = normalizeUpper(valor);
  return t.includes("UNIK") && t.includes("3D");
}

function classificarEncomenda(status, tipo) {
  const t = chaveNomeItem(`${status || ""} ${tipo || ""}`);
  return (
    t.includes("ENCOMENDA") &&
    !t.includes("ENTREG") &&
    !t.includes("RETIR") &&
    !t.includes("LEVANTAMENTO")
  );
}

const client = await conectarComRetry(process.env.DATABASE_URL);

try {
  const [vincRes, entRes, itensRes] = await Promise.all([
    client.query(`SELECT nome_chave, sku, nome_original FROM unik_vinculos`),
    client.query(`SELECT id, sku, nome, custo, quantidade, sugestao_venda, status, tipo FROM entrega_unik`),
    client.query(`SELECT sku, descricao, subcategoria_meep, custo, sugestao_venda FROM itens`),
  ]);

  const skuPorChave = Object.fromEntries(
    vincRes.rows.map((v) => [String(v.nome_chave), String(v.sku || "")])
  );

  const linhas = entRes.rows.map((row) => ({
    sku: row.sku,
    nome: row.nome,
    custo: Number(row.custo) || 0,
    quantidade: Number(row.quantidade) || 1,
    sugestaoVenda: Number(row.sugestao_venda) || 0,
    status: row.status,
    tipo: row.tipo,
    encomenda: classificarEncomenda(row.status, row.tipo),
  }));

  const skus = new Set();
  for (const v of vincRes.rows) {
    const s = String(v.sku || "").trim();
    if (s) skus.add(s);
  }
  for (const row of entRes.rows) {
    if (classificarEncomenda(row.status, row.tipo)) continue;
    const skuRow = String(row.sku || "").trim();
    if (skuRow) skus.add(skuRow);
    const nome = String(row.nome || "").trim();
    if (nome) {
      const skuV = String(skuPorChave[chaveNomeItem(nome)] || "").trim();
      if (skuV) skus.add(skuV);
    }
  }

  const alterados = [];

  for (const sku of [...skus].sort()) {
    const item = itensRes.rows.find((i) => normalizeUpper(i.sku) === normalizeUpper(sku));
    if (!item || !campoEhUnik3d(item.subcategoria_meep)) continue;

    const { custo, sugestaoVenda } = maxCustoSugestaoDeLancamentos(sku, linhas, skuPorChave);
    const patch = {};
    if (custo > 0) patch.custo = custo;
    if (sugestaoVenda > 0) patch.sugestaoVenda = sugestaoVenda;
    if (!Object.keys(patch).length) continue;

    const custoAntes = Number(item.custo) || 0;
    const sugestaoAntes = Number(item.sugestao_venda) || 0;
    const custoDepois = patch.custo ?? custoAntes;
    const sugestaoDepois = patch.sugestaoVenda ?? sugestaoAntes;

    if (custoDepois === custoAntes && sugestaoDepois === sugestaoAntes) continue;

    alterados.push({
      sku,
      descricao: item.descricao,
      custoAntes,
      custoDepois,
      sugestaoAntes,
      sugestaoDepois,
      patch,
    });
  }

  console.log(`Modo: ${dryRun ? "dry-run" : "APLICAR"}`);
  console.log(`SKUs analisados: ${skus.size}`);
  console.log(`Correções: ${alterados.length}\n`);

  for (const a of alterados) {
    console.log(`${a.sku} — ${a.descricao}`);
    if (a.custoAntes !== a.custoDepois) {
      console.log(`  custo: R$ ${a.custoAntes.toFixed(2)} → R$ ${a.custoDepois.toFixed(2)}`);
    }
    if (a.sugestaoAntes !== a.sugestaoDepois) {
      console.log(`  sugestão: R$ ${a.sugestaoAntes.toFixed(2)} → R$ ${a.sugestaoDepois.toFixed(2)}`);
    }
  }

  if (!dryRun && alterados.length) {
    await client.query("BEGIN");
    for (const a of alterados) {
      const sets = [];
      const args = [];
      let n = 1;
      if (a.patch.custo != null) {
        sets.push(`custo = $${n++}`);
        args.push(a.patch.custo);
      }
      if (a.patch.sugestaoVenda != null) {
        sets.push(`sugestao_venda = $${n++}`);
        args.push(a.patch.sugestaoVenda);
      }
      args.push(a.sku);
      await client.query(`UPDATE itens SET ${sets.join(", ")} WHERE sku = $${n}`, args);
    }
    await client.query("COMMIT");
    console.log(`\n${alterados.length} item(ns) corrigido(s) no banco.`);
  } else if (!alterados.length) {
    console.log("\nNenhuma correção necessária.");
  }
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  throw err;
} finally {
  await client.end().catch(() => {});
}
