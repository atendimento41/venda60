import path from "path";
import { fileURLToPath } from "url";
import { loadEnvLocal } from "../src/lib/load-env.ts";
import { getClient } from "../src/db/index.ts";
import { loadCsvFile, pick, parseDataHoraPlanilha } from "../src/lib/csv.ts";

loadEnvLocal();

const root = path.dirname(fileURLToPath(import.meta.url));
const file = path.resolve(root, "..", "..", "Controle de Vendas - 60MINUTOS - Vendas.csv");

function pickUnidade(row) {
  const u = pick(row, ["unidade", "loja", "filial"]);
  return u || row[""] || "";
}

const rows = loadCsvFile(file);
console.log("Arquivo:", file);
console.log("CSV linhas de dados:", rows.length);

let skip = 0;
const keys = new Set();
let dupes = 0;
for (const row of rows) {
  const sku = pick(row, ["sku"]);
  const unidade = pickUnidade(row);
  const dataRaw = pick(row, ["data"]);
  const data = parseDataHoraPlanilha(dataRaw);
  if (!sku || !unidade || !data) {
    skip++;
    continue;
  }
  const k = [
    data,
    sku,
    unidade,
    pick(row, ["vendedor"]),
    pick(row, ["quantidade"]),
    pick(row, ["valor_recebido"]),
  ].join("|");
  if (keys.has(k)) dupes++;
  keys.add(k);
}

console.log("Importáveis (únicas):", keys.size);
console.log("Ignoradas (faltando campo):", skip);
console.log("Duplicatas exatas no CSV:", dupes);

const db = getClient();
const cur = await db.execute("SELECT COUNT(*) AS c FROM vendas");
const cancel = await db.execute(
  "SELECT COUNT(*) AS c FROM vendas WHERE upper(coalesce(status, '')) LIKE '%CANCEL%'"
);
const periodo = await db.execute("SELECT MIN(data) AS min_data, MAX(data) AS max_data FROM vendas");
const soma = await db.execute("SELECT ROUND(SUM(valor_recebido)::numeric, 2) AS total FROM vendas WHERE upper(coalesce(status, '')) NOT LIKE '%CANCEL%'");
console.log("DB vendas atual:", cur.rows[0]?.c);
console.log("DB canceladas:", cancel.rows[0]?.c);
console.log("Período:", periodo.rows[0]);
console.log("Total vendido (ativas):", soma.rows[0]?.total);
