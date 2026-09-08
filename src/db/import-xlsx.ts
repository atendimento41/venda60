/**
 * Importa o Excel da planilha Google para o PostgreSQL.
 *
 *   npx tsx src/db/import-xlsx.ts
 *   npx tsx src/db/import-xlsx.ts --file="C:\caminho\arquivo.xlsx"
 */
import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";
import { loadEnvLocal } from "../lib/load-env";

loadEnvLocal();

import { getClient } from "./index";
import {
  getNivelPrime,
  normalizeHeader,
  parseBool,
  parseIntSafe,
  parsePreco,
} from "../lib/csv";

const DEFAULT_FILE = path.resolve(process.cwd(), "import-data", "planilha.xlsx");

function argValue(name: string, fallback: string): string {
  const pref = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(pref));
  return hit ? hit.slice(pref.length) : fallback;
}

function excelSerialToDate(n: number): Date {
  return new Date(Math.round((n - 25569) * 86400 * 1000));
}

function toYmd(val: unknown): string {
  if (val instanceof Date && !isNaN(val.getTime())) {
    return val.toISOString().slice(0, 10);
  }
  if (typeof val === "number" && val > 20000 && val < 80000) {
    return excelSerialToDate(val).toISOString().slice(0, 10);
  }
  const s = String(val || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const n = Number(s.replace(",", "."));
  if (isFinite(n) && n > 20000 && n < 80000) {
    return excelSerialToDate(n).toISOString().slice(0, 10);
  }
  return "";
}

function toIsoDateTime(val: unknown): string {
  if (val instanceof Date && !isNaN(val.getTime())) return val.toISOString();
  if (typeof val === "number" && val > 20000 && val < 80000) {
    return excelSerialToDate(val).toISOString();
  }
  const s = String(val || "").trim();
  if (!s) return new Date().toISOString();
  const n = Number(s.replace(",", "."));
  if (isFinite(n) && n > 20000 && n < 80000) {
    return excelSerialToDate(n).toISOString();
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function cell(val: unknown): string {
  if (val == null) return "";
  if (val instanceof Date) return val.toISOString();
  return String(val).trim();
}

function sheetObjects(wb: XLSX.WorkBook, names: string[]): Record<string, string>[] {
  const name = wb.SheetNames.find((n) =>
    names.some((q) => n.trim().toLowerCase() === q.toLowerCase())
  );
  if (!name) return [];
  const matrix = XLSX.utils.sheet_to_json(wb.Sheets[name], {
    header: 1,
    defval: "",
    raw: true,
  }) as unknown[][];
  if (matrix.length < 2) return [];
  const headers = matrix[0].map((h, idx) => {
    const n = normalizeHeader(String(h || ""));
    return n || `__col${idx}`;
  });
  const out: Record<string, string>[] = [];
  for (let i = 1; i < matrix.length; i++) {
    const row = matrix[i] || [];
    if (row.every((c) => cell(c) === "")) continue;
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = cell(row[idx]);
      obj[`__raw${idx}`] = cell(row[idx]);
    });
    out.push(obj);
  }
  return out;
}

function pick(row: Record<string, string>, keys: string[]): string {
  for (const k of keys) {
    const nk = normalizeHeader(k);
    if (row[nk]) return row[nk];
  }
  return "";
}

async function exec(sql: string, args: unknown[] = []) {
  await getClient().execute({ sql, args: args as (string | number | null)[] });
}

async function batchInsert(sql: string, rows: unknown[][], size = 40) {
  const client = getClient();
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    await client.batch(
      chunk.map((args) => ({ sql, args: args as (string | number | null)[] })),
      "write"
    );
    if ((i + size) % 400 === 0 || i + size >= rows.length) {
      process.stdout.write(`    ${Math.min(i + size, rows.length)}/${rows.length}\n`);
    }
  }
}

async function clearOperacionais() {
  console.log("Limpando dados operacionais (usuários mantidos)...");
  await exec("SET session_replication_role = replica");
  for (const t of [
    "movimentos_estoque",
    "estoque_snapshots",
    "log_operacoes",
    "entrega_unik",
    "prime_vendas",
    "vendas",
    "estoque",
    "itens",
    "vendedores",
  ]) {
    await exec(`DELETE FROM ${t}`);
  }
}

async function main() {
  const file = path.resolve(argValue("file", DEFAULT_FILE));
  if (!fs.existsSync(file)) {
    throw new Error("Arquivo não encontrado: " + file);
  }
  console.log("Lendo:", file);
  const wb = XLSX.readFile(file, { cellDates: false });
  console.log("Abas:", wb.SheetNames.join(", "));

  await clearOperacionais();

  const stats = {
    vendedores: 0,
    itens: 0,
    estoque: 0,
    vendas: 0,
    prime: 0,
    log: 0,
    unik: 0,
  };

  const vendedores = sheetObjects(wb, ["Vendedores"]);
  const vendRows = vendedores
    .map((row) => {
      const id = pick(row, ["id_vendedor", "id"]) || "";
      const nome = pick(row, ["nome", "vendedor"]);
      if (!nome) return null;
      return [id || `V${nome}`, nome, parseBool(pick(row, ["ativo"])) ? 1 : 0];
    })
    .filter(Boolean) as unknown[][];
  await batchInsert(
    "INSERT OR REPLACE INTO vendedores (id, nome, ativo) VALUES (?, ?, ?)",
    vendRows
  );
  stats.vendedores = vendRows.length;
  console.log("  vendedores:", stats.vendedores);

  const itens = sheetObjects(wb, ["Itens"]);
  const itemRows = itens
    .map((row) => {
      const sku = pick(row, ["a", "sku", "codigo"]);
      if (!sku) return null;
      const descricao = pick(row, ["descricao", "descrição", "item", "nome"]) || sku;
      const ativoRaw = pick(row, ["ativo"]);
      return [
        sku,
        pick(row, ["categoria_-_dash", "categoria_dash", "categoria"]),
        pick(row, ["categoria_-_meep", "subcategoria_meep", "meep"]),
        descricao,
        parsePreco(pick(row, ["preco", "preço"])),
        ativoRaw === "" ? 1 : parseBool(ativoRaw) ? 1 : 0,
        parsePreco(
          pick(row, ["custo", "custo_unik", "custo unik"]) || row.__col6 || row.__raw6
        ),
        pick(row, ["link_imagem", "foto_url", "foto"]),
      ];
    })
    .filter(Boolean) as unknown[][];
  await batchInsert(
    `INSERT OR REPLACE INTO itens (sku, categoria_dash, subcategoria_meep, descricao, preco, ativo, custo, foto_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    itemRows
  );
  stats.itens = itemRows.length;
  console.log("  itens:", stats.itens);

  const estoque = sheetObjects(wb, ["Estoque"]);
  const estRows = estoque
    .map((row) => {
      const sku = pick(row, ["sku"]);
      const unidade = pick(row, ["estoque", "unidade", "loja"]) || row.__raw1;
      if (!sku || !unidade) return null;
      return [
        sku,
        unidade,
        parseIntSafe(pick(row, ["quantidade", "qtd", "qt"]) || row.__raw2, 0),
        pick(row, ["nome", "descricao"]) || row.__raw3 || sku,
      ];
    })
    .filter(Boolean) as unknown[][];
  await batchInsert(
    "INSERT OR REPLACE INTO estoque (sku, unidade, quantidade, nome) VALUES (?, ?, ?, ?)",
    estRows
  );
  stats.estoque = estRows.length;
  console.log("  estoque:", stats.estoque);

  const vendas = sheetObjects(wb, ["Vendas"]);
  const vendaRows = vendas
    .map((row) => {
      const sku = pick(row, ["sku"]);
      const unidade = pick(row, ["unidade", "loja"]) || row.__raw3;
      const data = toYmd(row.data || row.__raw0);
      if (!sku || !unidade || !data) return null;
      const status = pick(row, ["status"]).toUpperCase();
      return [
        data,
        pick(row, ["id_vendedor", "id"]),
        pick(row, ["vendedor"]),
        unidade,
        pick(row, ["subcategoria_-_meep", "subcategoria_meep", "meep"]) || row.__raw4,
        pick(row, ["categoria_-_dash", "categoria_dash"]) || row.__raw5,
        sku,
        pick(row, ["item", "descricao"]),
        parsePreco(pick(row, ["preco_unitario", "preco_unita", "preco"])),
        parseIntSafe(pick(row, ["quantidade", "qtd"]), 1),
        parsePreco(pick(row, ["subtotal_bruto", "subtotal"])),
        parsePreco(pick(row, ["desconto"])),
        parsePreco(pick(row, ["valor_recebido", "valor"])),
        status,
        null,
      ];
    })
    .filter(Boolean) as unknown[][];

  // GAS: col E (índice 4) entra em categoria, col F (5) em subcategoria — para comissão.
  const vendaSql = `INSERT INTO vendas (
    data, id_vendedor, vendedor, unidade, categoria, subcategoria, sku, descricao,
    preco_unitario, quantidade, subtotal_bruto, desconto, valor_recebido, status, cancelado_por
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  await batchInsert(vendaSql, vendaRows);
  stats.vendas = vendaRows.length;
  console.log("  vendas:", stats.vendas);

  await exec(`
    INSERT OR IGNORE INTO itens (sku, descricao, preco, ativo)
    SELECT DISTINCT sku, COALESCE(NULLIF(descricao,''), sku), COALESCE(preco_unitario, 0), 1
    FROM vendas WHERE sku IS NOT NULL AND sku != ''
  `);

  const prime = sheetObjects(wb, ["PRIME VENDA", "PRIME VENDA"]);
  const primeRows = prime
    .map((row) => {
      const item =
        pick(row, ["item", "sku", "produto"]) || row.__raw2 || row.__raw1;
      if (!item) return null;
      const data = toYmd(row.data || row.__raw0);
      if (!data) return null;
      const qt = parseIntSafe(pick(row, ["qt", "quantidade"]) || row.__raw4, 1);
      let valor = parsePreco(pick(row, ["valor"]) || row.__raw9);
      if (valor <= 0) valor = qt;
      return [
        data,
        "",
        pick(row, ["vendedor"]) || row.__raw6,
        pick(row, ["unidade"]) || row.__raw8,
        item,
        qt,
        valor,
        getNivelPrime(item),
      ];
    })
    .filter(Boolean) as unknown[][];
  await batchInsert(
    `INSERT INTO prime_vendas (data, id_vendedor, vendedor, unidade, item, quantidade, valor, nivel)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    primeRows
  );
  stats.prime = primeRows.length;
  console.log("  prime:", stats.prime);

  const logs = sheetObjects(wb, ["Log Operacoes", "Log Operacoes"]);
  const logRows = logs
    .map((row) => {
      const tipo = pick(row, ["tipo_operacao", "tipo"]);
      if (!tipo) return null;
      const ok = pick(row, ["sucesso"]).toUpperCase();
      return [
        toIsoDateTime(row["data/hora"] || row.data_hora || row.__raw0),
        pick(row, ["operador"]),
        tipo,
        ["SIM", "TRUE", "1", "S"].includes(ok) ? 1 : 0,
        pick(row, ["dados_operacao", "dados"]),
        pick(row, ["mensagem"]),
      ];
    })
    .filter(Boolean) as unknown[][];
  await batchInsert(
    `INSERT INTO log_operacoes (data_hora, operador, tipo, sucesso, dados, mensagem)
     VALUES (?, ?, ?, ?, ?, ?)`,
    logRows
  );
  stats.log = logRows.length;
  console.log("  log:", stats.log);

  const unik = sheetObjects(wb, ["Entrega UNIK", "entrega UNIK"]);
  const unikRows = unik
    .map((row) => {
      const nome = pick(row, ["nome", "nome_aba_item"]) || row.__raw4 || row.__raw3;
      if (!nome) return null;
      return [
        toYmd(row.__raw0 || row.data) || null,
        pick(row, ["tipo"]),
        nome,
        pick(row, ["sku"]) || row.__raw2,
        parsePreco(pick(row, ["qt", "quantidade"]) || row.__raw1),
        pick(row, ["status"]),
        pick(row, ["onde_entregue", "unidade"]) || row.__raw6,
      ];
    })
    .filter(Boolean) as unknown[][];
  await batchInsert(
    `INSERT INTO entrega_unik (data, tipo, nome, sku, quantidade, status, unidade)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    unikRows
  );
  stats.unik = unikRows.length;
  console.log("  unik:", stats.unik);

  await exec("SET session_replication_role = DEFAULT");
  console.log("\nImportação concluída:");
  console.log(JSON.stringify(stats, null, 2));
}

main().catch((e) => {
  console.error("ERRO:", e.message || e);
  process.exit(1);
});
