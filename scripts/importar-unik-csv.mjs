/**
 * Importa entregas UNIK de "Sem título 1.csv".
 * Insere só o que não existe; duplicados são ignorados.
 *
 *   npx tsx scripts/importar-unik-csv.mjs
 *   npx tsx scripts/importar-unik-csv.mjs --apply
 */
import fs from "fs";
import path from "path";
import pg from "pg";

function loadEnvForce(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
}
loadEnvForce(path.join(process.cwd(), ".env.local"));

const CSV_PATH =
  process.argv.find((a) => a.startsWith("--file="))?.slice(7) ||
  path.resolve(process.cwd(), "..", "Sem título 1.csv");

const apply = process.argv.includes("--apply");

const HETZNER =
  process.env.HETZNER_DATABASE_URL ||
  "postgresql://cv_vendas_app:6om1nut0%24_v3nd1%24@95.216.252.42:5432/60minutos_vendas";

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let inQ = false;
  const pushCell = () => {
    row.push(cur);
    cur = "";
  };
  const pushRow = () => {
    if (row.length === 1 && row[0].trim() === "") {
      row = [];
      return;
    }
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += ch;
      continue;
    }
    if (ch === '"') {
      inQ = true;
      continue;
    }
    if (ch === ",") {
      pushCell();
      continue;
    }
    if (ch === "\n") {
      pushCell();
      pushRow();
      continue;
    }
    if (ch === "\r") continue;
    cur += ch;
  }
  if (cur.length || row.length) {
    pushCell();
    pushRow();
  }
  return rows;
}

function parsePreco(v) {
  const s = String(v ?? "").trim();
  if (!s) return 0;
  // "149,9" / "1.234,56" / "75"
  if (s.includes(",") && s.includes(".")) {
    return Number(s.replace(/\./g, "").replace(",", ".")) || 0;
  }
  if (s.includes(",")) return Number(s.replace(",", ".")) || 0;
  return Number(s) || 0;
}

function parseData(v) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  // 2025-12-01 00:00:00 ou 2026/04/03
  let m = /^(\d{4})[-\/](\d{2})[-\/](\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // 15/07/26 ou 15/07/2026
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s);
  if (m) {
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    return `${y}-${String(m[2]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`;
  }
  return "";
}

function normNome(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normUnidade(u) {
  const t = String(u || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (!t) return "";
  if (t === "PIER" || t === "PIER21") return "PIER 21";
  if (t === "PKS" || t === "SSU" || t === "TGS") return t;
  return String(u || "").trim().toUpperCase();
}

const STATUS_TOKENS = new Set([
  "ENCOMENDA",
  "ENCOMENDAS",
  "RETIRADO",
  "RETIRADA",
  "RETIRADOS",
  "PEDIDO",
  "PEDIDOS",
  "ENTREGUE",
  "ENTREGA",
]);

function mapStatus(raw) {
  const t = normNome(raw).toUpperCase().replace(/\s+/g, " ");
  if (!t) return { status: "", tipo: "" };
  if (t.includes("ENCOMENDA") || t === "PEDIDO" || t === "PEDIDOS") {
    return { status: "Encomenda", tipo: "Encomenda" };
  }
  if (t.includes("RETIR")) return { status: "Retirado", tipo: "Retirado" };
  if (t.includes("ENTREG")) return { status: "Entregue", tipo: "" };
  if (t.includes("LEVANTAMENTO")) return { status: "Entregue", tipo: "" };
  return { status: "", tipo: "" };
}

function isStatusToken(s) {
  const t = String(s || "")
    .trim()
    .toUpperCase();
  return STATUS_TOKENS.has(t);
}

function statusClass(status, tipo) {
  const t = normNome(`${status || ""} ${tipo || ""}`);
  if (!t) return "ENTREGUE";
  if (t.includes("encomenda") || t === "pedido" || t === "pedidos") return "ENCOMENDA";
  if (t.includes("retir")) return "RETIRADA";
  return "ENTREGUE";
}

function dupKey(row) {
  // Sem SKU/status literal: no banco antigo muitas linhas têm sku vazio e status ''.
  return [
    String(row.data || "").slice(0, 10),
    normNome(row.nome),
    String(Number(row.quantidade) || 0),
    normUnidade(row.unidade),
    statusClass(row.status, row.tipo),
  ].join("|");
}

const raw = fs.readFileSync(CSV_PATH, "utf8");
if (raw.charCodeAt(0) === 0xfeff) {
  /* bom */
}
const table = parseCsv(raw.replace(/^\uFEFF/, ""));
if (table.length < 2) {
  console.error("CSV vazio:", CSV_PATH);
  process.exit(1);
}

const header = table[0].map((h) => String(h || "").trim().toLowerCase());
// col0 = data (header vazio)
const idx = {
  data: 0,
  qt: header.findIndex((h) => h === "qt" || h === "quantidade" || h === "qtd"),
  sku: header.findIndex((h) => h === "sku"),
  aba: header.findIndex((h) => h.includes("nome aba") || h.includes("aba item")),
  nome: header.findIndex((h) => h === "nome"),
  sugestao: header.findIndex((h) => h.includes("sugestao") || h.includes("sugestão")),
  unidade: header.findIndex((h) => h.includes("onde entregue") || h === "unidade"),
  obsUnik: header.findIndex((h) => h.includes("obs (unik)") || h === "obs unik"),
  obs60: header.findIndex((h) => h.includes("obs (60") || h.includes("60 minutos")),
};

const parsed = [];
for (const cells of table.slice(1)) {
  const get = (i) => (i >= 0 ? String(cells[i] ?? "").trim() : "");
  const data = parseData(get(idx.data));
  const qtd = parsePreco(get(idx.qt));
  let sku = get(idx.sku);
  let aba = get(idx.aba);
  let nome = get(idx.nome);
  const sugestao = parsePreco(get(idx.sugestao));
  const unidade = normUnidade(get(idx.unidade));
  const obsUnik = get(idx.obsUnik);
  const obs60 = get(idx.obs60);

  if (!nome && !aba && !sku) continue;
  if (!data || qtd <= 0) continue;

  if (sku === "-" || sku === "—") sku = "";

  let statusInfo = { status: "", tipo: "" };
  // Status às vezes vem na coluna SKU (ex.: PEDIDO) ou em "Nome Aba ITEM"
  if (isStatusToken(sku)) {
    statusInfo = mapStatus(sku);
    sku = "";
  } else if (isStatusToken(aba)) {
    statusInfo = mapStatus(aba);
    aba = "";
  } else if (isStatusToken(obsUnik)) {
    statusInfo = mapStatus(obsUnik);
  } else if (obsUnik && /levantamento/i.test(obsUnik)) {
    // Levantamento = entrega; status vazio bate com o histórico já importado
    statusInfo = { status: "", tipo: "" };
  }

  if (!nome) nome = aba || sku;
  // Preferir nome curto da coluna Nome; se vazio usou aba acima

  let recebidoPor = "";
  if (obsUnik && !isStatusToken(obsUnik) && !/levantamento/i.test(obsUnik)) {
    recebidoPor = obsUnik;
  } else if (obs60) {
    recebidoPor = obs60;
  }

  parsed.push({
    data,
    sku,
    nome,
    quantidade: qtd,
    sugestao_venda: sugestao,
    unidade,
    status: statusInfo.status,
    tipo: statusInfo.tipo,
    recebido_por: recebidoPor,
  });
}

console.log("Arquivo:", CSV_PATH);
console.log("Linhas CSV parseadas:", parsed.length);
console.log("Modo:", apply ? "APPLY" : "dry-run");

const c = new pg.Client({ connectionString: HETZNER, connectionTimeoutMillis: 25000 });
await c.connect();

try {
  const existing = await c.query(
    `SELECT id, data, nome, sku, quantidade, unidade, status, tipo FROM entrega_unik`
  );
  const keys = new Map();
  for (const r of existing.rows) {
    const k = dupKey({
      data: String(r.data || "").slice(0, 10),
      nome: r.nome,
      sku: r.sku || "",
      quantidade: r.quantidade,
      unidade: r.unidade,
      status: r.status,
      tipo: r.tipo,
    });
    if (!keys.has(k)) keys.set(k, []);
    keys.get(k).push(r.id);
  }

  let skip = 0;
  let insert = 0;
  const toInsert = [];

  for (const row of parsed) {
    const k = dupKey(row);
    const ids = keys.get(k);
    if (ids && ids.length > 0) {
      ids.shift();
      if (!ids.length) keys.delete(k);
      else keys.set(k, ids);
      skip++;
      continue;
    }
    toInsert.push(row);
    // reserva a chave para não inserir 2x a mesma linha do CSV se já “ocupou”
    keys.set(k, []);
    insert++;
  }

  console.log(`Já existem (ignorados): ${skip}`);
  console.log(`Novos a inserir: ${insert}`);

  const byDate = {};
  for (const r of toInsert) {
    byDate[r.data] = (byDate[r.data] || 0) + 1;
  }
  console.log("Novos por data:", byDate);

  for (const r of toInsert.slice(0, 25)) {
    console.log(
      `  + ${r.data} | ${r.unidade || "—"} | qtd=${r.quantidade} | ${r.status || "Entregue?"} | ${r.sku || "—"} | ${r.nome} | sug=${r.sugestao_venda}`
    );
  }
  if (toInsert.length > 25) console.log(`  ... e mais ${toInsert.length - 25}`);

  if (!apply) {
    console.log("\nDry-run ok. Rode com --apply para gravar.");
    process.exit(0);
  }

  for (const r of toInsert) {
    await c.query(
      `INSERT INTO entrega_unik
        (data, tipo, nome, sku, quantidade, status, unidade, estoque_aplicado,
         foto_url, custo, sugestao_venda, recebido_por, estoque_unidade)
       VALUES ($1,$2,$3,$4,$5,$6,$7,FALSE,'',0,$8,$9,NULL)`,
      [
        r.data,
        r.tipo || "",
        r.nome,
        r.sku || "",
        r.quantidade,
        r.status || "",
        r.unidade || "",
        r.sugestao_venda || 0,
        r.recebido_por || "",
      ]
    );
  }
  console.log(`\nInseridos: ${toInsert.length}`);
  const tot = await c.query(`SELECT count(*)::int n FROM entrega_unik`);
  console.log("Total entrega_unik agora:", tot.rows[0].n);
} finally {
  await c.end();
}
