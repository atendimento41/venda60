/**
 * Importa CSVs exportados do Google Sheets para PostgreSQL.
 *
 * Uso:
 *   npm run db:import
 *   npm run db:import -- --dir=./import-data
 *   npm run db:import -- --clear
 *   npm run db:import -- --clear-vendas --vendas-file=../Controle\ de\ Vendas\ -\ 60MINUTOS\ -\ Vendas.csv --only=vendas
 */
import path from "path";
import fs from "fs";
import { client } from "./index";
import { loadEnvLocal } from "../lib/load-env";

loadEnvLocal();
import {
  findFile,
  getNivelPrime,
  loadCsvFile,
  parseBool,
  parseDataHoraPlanilha,
  parseDataPlanilha,
  parseIntSafe,
  parsePreco,
  pick,
} from "../lib/csv";
import { normalizarDataVendaISO } from "../lib/utils";

const FILE_ALIASES = {
  vendedores: ["vendedores.csv", "Vendedores.csv"],
  itens: ["itens.csv", "Itens.csv"],
  estoque: ["estoque.csv", "Estoque.csv"],
  vendas: ["vendas.csv", "Vendas.csv"],
  prime: ["prime-venda.csv", "PRIME VENDA.csv", "prime_venda.csv"],
  log: ["log-operacoes.csv", "Log Operacoes.csv", "log_operacoes.csv"],
  unik: ["entrega-unik.csv", "entrega UNIK.csv", "entrega_unik.csv"],
};

type Stats = Record<string, number>;

function argFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function argValue(name: string, fallback: string): string {
  const pref = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(pref));
  return hit ? hit.slice(pref.length) : fallback;
}

async function exec(sql: string, args: unknown[] = []) {
  await client.execute({ sql, args: args as (string | number | null)[] });
}

async function clearTables() {
  console.log("Limpando tabelas...");
  await exec("SET session_replication_role = replica");
  const tables = [
    "movimentos_estoque",
    "estoque_snapshots",
    "log_operacoes",
    "entrega_unik",
    "prime_vendas",
    "vendas",
    "estoque",
    "itens",
    "vendedores",
  ];
  for (const t of tables) {
    await exec(`DELETE FROM ${t}`);
  }
  await exec("SET session_replication_role = DEFAULT");
}

async function importVendedores(dir: string, stats: Stats) {
  const file = findFile(dir, FILE_ALIASES.vendedores);
  if (!file) {
    console.log("  vendedores: arquivo não encontrado (opcional)");
    return;
  }
  const rows = loadCsvFile(file);
  for (const row of rows) {
    const id = pick(row, ["id", "id_vendedor", "codigo"]) || `V${stats.vendedores + 1}`;
    const nome = pick(row, ["nome", "vendedor", "name"]);
    if (!nome) continue;
    const ativo = parseBool(pick(row, ["ativo", "active", "status"])) ? 1 : 0;
    await exec(
      `INSERT INTO vendedores (id, nome, ativo) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET nome=excluded.nome, ativo=excluded.ativo`,
      [id, nome, ativo || 1]
    );
    stats.vendedores++;
  }
  console.log(`  vendedores: ${stats.vendedores} linhas`);
}

async function importItens(dir: string, stats: Stats) {
  const file = findFile(dir, FILE_ALIASES.itens);
  if (!file) throw new Error("itens.csv não encontrado — exporte a aba Itens.");
  const rows = loadCsvFile(file);

  for (const row of rows) {
    const sku = pick(row, ["sku", "codigo", "cod"]);
    if (!sku) continue;
    const descricao =
      pick(row, ["descricao", "descrição", "item", "nome"]) || sku;
    const ativoRaw = pick(row, ["ativo", "active"]);
    const ativo = ativoRaw === "" ? 1 : parseBool(ativoRaw) ? 1 : 0;

    await exec(
      `INSERT INTO itens (sku, categoria_dash, subcategoria_meep, descricao, preco, ativo, custo, foto_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(sku) DO UPDATE SET
         categoria_dash=excluded.categoria_dash,
         subcategoria_meep=excluded.subcategoria_meep,
         descricao=excluded.descricao,
         preco=excluded.preco,
         ativo=excluded.ativo,
         custo=excluded.custo,
         foto_url=excluded.foto_url`,
      [
        sku,
        pick(row, ["categoria_dash", "categoria_-_dash", "categoria", "categoria_dash"]),
        pick(row, ["subcategoria_meep", "meep", "subcategoria", "subcategory", "categoria_meep"]),
        descricao,
        parsePreco(pick(row, ["preco", "preço", "preco_cadastro", "preco_unitario"])),
        ativo,
        parsePreco(pick(row, ["custo"])),
        pick(row, ["foto_url", "foto", "url_foto", "h_foto_url"]),
      ]
    );
    stats.itens++;
  }
  console.log(`  itens: ${stats.itens} linhas`);
}

async function importEstoque(dir: string, stats: Stats) {
  const file = findFile(dir, FILE_ALIASES.estoque);
  if (!file) {
    console.log("  estoque: arquivo não encontrado (opcional)");
    return;
  }
  const rows = loadCsvFile(file);

  for (const row of rows) {
    const sku = pick(row, ["sku"]);
    const unidade = pick(row, ["estoque", "unidade", "loja", "filial"]);
    if (!sku || !unidade) continue;

    const qtd = parseIntSafe(pick(row, ["quantidade", "qtd", "qt", "estoque"]), 0);
    const nome = pick(row, ["nome", "descricao", "item"]);

    await exec(
      `INSERT INTO estoque (sku, unidade, quantidade, nome) VALUES (?, ?, ?, ?)
       ON CONFLICT(sku, unidade) DO UPDATE SET quantidade=excluded.quantidade, nome=excluded.nome`,
      [sku, unidade, qtd, nome || null]
    );
    stats.estoque++;
  }
  console.log(`  estoque: ${stats.estoque} linhas`);
}

function pickUnidade(row: Record<string, string>): string {
  const u = pick(row, ["unidade", "loja", "filial"]);
  if (u) return u;
  return row[""] || "";
}

async function importVendas(dir: string, stats: Stats, vendasFile?: string) {
  const file =
    vendasFile && fs.existsSync(vendasFile)
      ? path.resolve(vendasFile)
      : findFile(dir, FILE_ALIASES.vendas);
  if (!file) throw new Error("vendas.csv não encontrado — exporte a aba Vendas.");
  console.log(`  vendas: lendo ${file}`);
  const rows = loadCsvFile(file);

  const custoPorSku: Record<string, number> = {};

  for (const row of rows) {
    const sku = pick(row, ["sku"]);
    const unidade = pickUnidade(row);
    const dataRaw = pick(row, ["data", "data_venda", "date"]);
    const dataParsed = /\d{1,2}:\d{2}/.test(dataRaw)
      ? parseDataHoraPlanilha(dataRaw)
      : parseDataPlanilha(dataRaw);
    if (!sku || !unidade || !dataParsed) continue;
    const data = normalizarDataVendaISO(dataParsed);

    const status = pick(row, ["status", "o_status"]).toUpperCase();
    const canceladoPor = pick(row, ["cancelado_por", "t_cancelado_por"]);
    const qtd = parseIntSafe(pick(row, ["quantidade", "qtd", "j_qtd"]), 1) || 1;
    const meep = pick(row, [
      "subcategoria_-_meep",
      "subcategoria_meep",
      "meep",
      "subcategoria",
      "categoria_meep",
    ]);
    const dash = pick(row, ["categoria_-_dash", "categoria_dash", "categoria", "subcategory"]);
    const custoLinha = parsePreco(pick(row, ["custo", "custo_unik"]));
    if (custoLinha > 0) custoPorSku[sku] = Number((custoLinha / qtd).toFixed(2));

    await exec(
      `INSERT INTO vendas (
        data, id_vendedor, vendedor, unidade, categoria, subcategoria, sku, descricao,
        preco_unitario, quantidade, subtotal_bruto, desconto, valor_recebido, status, cancelado_por
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data,
        pick(row, ["id_vendedor", "id"]),
        pick(row, ["vendedor", "nome_vendedor"]),
        unidade,
        dash || meep,
        meep || dash,
        sku,
        pick(row, ["item", "descricao", "descrição", "h_descricao"]),
        parsePreco(pick(row, ["preco_unitario", "preco_unita", "preco", "i_preco"])),
        qtd,
        parsePreco(pick(row, ["subtotal_bruto", "subtotal", "k_subtotal_bruto"])),
        parsePreco(pick(row, ["desconto", "l_desconto"])),
        parsePreco(pick(row, ["valor_recebido", "valor", "m_valor_recebido"])),
        status,
        canceladoPor || null,
      ]
    );
    stats.vendas++;
  }

  for (const [sku, custo] of Object.entries(custoPorSku)) {
    await exec("UPDATE itens SET custo = ? WHERE sku = ?", [custo, sku]);
  }
  stats.custos = Object.keys(custoPorSku).length;
  console.log(`  vendas: ${stats.vendas} linhas inseridas | custos atualizados: ${stats.custos}`);
}

async function importPrime(dir: string, stats: Stats) {
  const file = findFile(dir, FILE_ALIASES.prime);
  if (!file) {
    console.log("  prime: arquivo não encontrado (opcional)");
    return;
  }
  const rows = loadCsvFile(file);

  for (const row of rows) {
    const item = pick(row, ["item", "b_item", "produto"]);
    if (!item) continue;
    const data = parseDataPlanilha(pick(row, ["data", "date", "a_data"])) || parseDataPlanilha(new Date().toISOString());

    const qt = parseIntSafe(pick(row, ["qt", "quantidade", "e_qt", "qtd"]), 1);
    let valor = parsePreco(pick(row, ["valor", "j_valor", "valor_prime"]));
    if (valor <= 0) valor = qt;

    await exec(
      `INSERT INTO prime_vendas (data, id_vendedor, vendedor, unidade, item, quantidade, valor, nivel)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data,
        pick(row, ["id_vendedor"]),
        pick(row, ["vendedor", "g_vendedor"]),
        pick(row, ["unidade", "i_unidade"]),
        item,
        qt,
        valor,
        getNivelPrime(item),
      ]
    );
    stats.prime++;
  }
  console.log(`  prime: ${stats.prime} linhas`);
}

async function importLog(dir: string, stats: Stats) {
  const file = findFile(dir, FILE_ALIASES.log);
  if (!file) {
    console.log("  log: arquivo não encontrado (opcional)");
    return;
  }
  const rows = loadCsvFile(file);

  for (const row of rows) {
    const tipo = pick(row, ["tipo_operacao", "tipo", "tipo operacao"]);
    if (!tipo) continue;
    const sucessoRaw = pick(row, ["sucesso", "ok"]);
    const sucesso =
      sucessoRaw === "" ? 1 : ["sim", "true", "1", "s"].includes(sucessoRaw.toLowerCase()) ? 1 : 0;

    await exec(
      `INSERT INTO log_operacoes (data_hora, operador, tipo, sucesso, dados, mensagem)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        parseDataHoraPlanilha(pick(row, ["data_hora", "data/hora", "data"])),
        pick(row, ["operador", "usuario"]),
        tipo,
        sucesso,
        pick(row, ["dados_operacao", "dados", "dados operacao"]) || null,
        pick(row, ["mensagem", "msg"]) || null,
      ]
    );
    stats.log++;
  }
  console.log(`  log: ${stats.log} linhas`);
}

async function importUnik(dir: string, stats: Stats) {
  const file = findFile(dir, FILE_ALIASES.unik);
  if (!file) {
    console.log("  unik: arquivo não encontrado (opcional)");
    return;
  }
  const rows = loadCsvFile(file);

  for (const row of rows) {
    const nome = pick(row, ["nome", "item", "descricao"]);
    if (!nome) continue;

    await exec(
      `INSERT INTO entrega_unik (data, tipo, nome, sku, quantidade, status, unidade)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        parseDataPlanilha(pick(row, ["data", "date"])) || null,
        pick(row, ["tipo", "type"]),
        nome,
        pick(row, ["sku"]),
        parsePreco(pick(row, ["quantidade", "qtd", "qt"])),
        pick(row, ["status", "g_status"]),
        pick(row, ["unidade"]),
      ]
    );
    stats.unik++;
  }
  console.log(`  unik: ${stats.unik} linhas`);
}

async function ensureItensFromVendas() {
  await exec(`
    INSERT INTO itens (sku, descricao, preco, ativo)
    SELECT DISTINCT sku,
      COALESCE(NULLIF(descricao,''), sku),
      COALESCE(preco_unitario, 0),
      true
    FROM vendas
    WHERE sku IS NOT NULL AND sku != ''
    ON CONFLICT (sku) DO NOTHING
  `);
}

async function clearVendasTable() {
  console.log("Limpando tabela vendas...");
  await exec("DELETE FROM vendas");
}

async function main() {
  const dir = path.resolve(argValue("dir", path.join(process.cwd(), "import-data")));
  const clear = argFlag("clear");
  const clearVendas = argFlag("clear-vendas");
  const only = argValue("only", "");
  const vendasFile = argValue("vendas-file", "");

  if (!only && !fs.existsSync(dir)) {
    throw new Error(`Pasta não encontrada: ${dir}\nCrie import-data/ e coloque os CSVs exportados.`);
  }

  const stats: Stats = {
    vendedores: 0,
    itens: 0,
    estoque: 0,
    vendas: 0,
    prime: 0,
    log: 0,
    unik: 0,
  };

  if (clear) await clearTables();
  if (clearVendas) await clearVendasTable();

  console.log(only === "vendas" ? "Importando somente vendas..." : `Importando de: ${dir}`);

  if (!only || only === "vendedores") await importVendedores(dir, stats);
  if (!only || only === "itens") await importItens(dir, stats);
  if (!only || only === "estoque") await importEstoque(dir, stats);
  if (!only || only === "vendas") {
    await importVendas(dir, stats, vendasFile || undefined);
    await ensureItensFromVendas();
  }
  if (!only || only === "prime") await importPrime(dir, stats);
  if (!only || only === "log") await importLog(dir, stats);
  if (!only || only === "unik") await importUnik(dir, stats);

  console.log("\nImportação concluída:");
  console.log(JSON.stringify(stats, null, 2));
}

main().catch((e) => {
  console.error("ERRO:", e.message || e);
  process.exit(1);
});
