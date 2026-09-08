/**
 * Insere vendas a partir de linhas da planilha.
 *
 *   npx tsx scripts/inserir-vendas-planilha.mjs           # dry-run
 *   npx tsx scripts/inserir-vendas-planilha.mjs --apply   # grava no Hetzner
 *
 * Evita duplicar: se já existir N vendas iguais no dia, só completa até
 * o número de linhas iguais na planilha.
 */
import pg from "pg";
import fs from "fs";
import path from "path";

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

function parsePreco(v) {
  if (typeof v === "number") return v;
  const s = String(v || "0").trim().replace(/\./g, "").replace(",", ".");
  return Number(s) || 0;
}

function parseDataBR(d) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(d).trim());
  if (!m) throw new Error(`Data inválida: ${d}`);
  return `${m[3]}-${m[2]}-${m[1]}T12:00:00.000`;
}

const LINHAS = [
  {
    data: "01/09/2026",
    id_vendedor: "47",
    vendedor: "Adilson Bezerra dos santos",
    unidade: "PKS",
    subcategoria: "60' STORE",
    categoria: "PRODUTOS",
    sku: "A728",
    item: "Funko POP",
    preco_unitario: "89,90",
    quantidade: 1,
    subtotal_bruto: "89,90",
    desconto: "0,00",
    valor_recebido: "89,90",
  },
  {
    data: "01/09/2026",
    id_vendedor: "78",
    vendedor: "Géssica Daleth",
    unidade: "TGS",
    subcategoria: "UNIK 3D",
    categoria: "PRODUTOS",
    sku: "A403",
    item: "Chaveiros Injetáveis",
    preco_unitario: "29,90",
    quantidade: 1,
    subtotal_bruto: "29,90",
    desconto: "0,00",
    valor_recebido: "29,90",
  },
  {
    data: "01/09/2026",
    id_vendedor: "47",
    vendedor: "Adilson Bezerra dos santos",
    unidade: "PKS",
    subcategoria: "60' STORE",
    categoria: "PRODUTOS",
    sku: "A728",
    item: "Funko POP",
    preco_unitario: "89,90",
    quantidade: 1,
    subtotal_bruto: "89,90",
    desconto: "0,00",
    valor_recebido: "89,90",
  },
];

const url =
  process.env.HETZNER_DATABASE_URL ||
  process.env.SOURCE_DATABASE_URL ||
  "postgresql://cv_vendas_app:6om1nut0%24_v3nd1%24@95.216.252.42:5432/60minutos_vendas";

const apply = process.argv.includes("--apply");

function rowKey(dataYmd, unidade, vendedorNome, sku, qtd, valor) {
  return `${dataYmd}|${unidade}|${vendedorNome}|${sku}|${qtd}|${valor.toFixed(2)}`;
}

const c = new pg.Client({ connectionString: url, connectionTimeoutMillis: 20000 });
await c.connect();

/** Quantas linhas iguais já “consumidas” (existentes + inseridas nesta rodada). */
const consumed = new Map();

try {
  console.log("Banco:", url.replace(/:[^:@]+@/, ":***@"));
  console.log("Modo:", apply ? "APPLY" : "dry-run (passe --apply para gravar)");

  for (const [i, row] of LINHAS.entries()) {
    const dataIso = parseDataBR(row.data);
    const dataYmd = dataIso.slice(0, 10);
    const preco = parsePreco(row.preco_unitario);
    const qtd = Number(row.quantidade) || 1;
    const sub = parsePreco(row.subtotal_bruto) || preco * qtd;
    const desc = parsePreco(row.desconto);
    const valor = parsePreco(row.valor_recebido) || Math.max(0, sub - desc);

    const vend = await c.query(
      `SELECT id, nome FROM vendedores
       WHERE id = $1 OR id = $2 OR lower(trim(nome)) = lower(trim($3))
       ORDER BY CASE WHEN id = $1 THEN 0 WHEN id = $2 THEN 1 ELSE 2 END
       LIMIT 1`,
      [row.id_vendedor, `V${String(row.id_vendedor).padStart(3, "0")}`, row.vendedor]
    );
    const v = vend.rows[0];
    if (!v) {
      console.log(`#${i + 1} ERRO: vendedor não encontrado (${row.id_vendedor} / ${row.vendedor})`);
      continue;
    }

    const item = await c.query(`SELECT sku, descricao FROM itens WHERE sku = $1`, [row.sku]);

    const key = rowKey(dataYmd, row.unidade, v.nome, row.sku, qtd, valor);
    const dup = await c.query(
      `SELECT id FROM vendas
       WHERE substring(data from 1 for 10) = $1
         AND sku = $2
         AND unidade = $3
         AND trim(vendedor) = trim($4)
         AND quantidade = $5
         AND abs(valor_recebido - $6) < 0.01
         AND coalesce(upper(status),'') != 'CANCELADO'
       ORDER BY id`,
      [dataYmd, row.sku, row.unidade, v.nome, qtd, valor]
    );

    const used = consumed.get(key) || 0;
    console.log(
      `\n#${i + 1} ${dataYmd} ${row.unidade} ${v.nome} (${v.id}) ${row.sku} ${row.item} R$ ${valor.toFixed(2)}`
    );

    if (used < dup.rows.length) {
      console.log(`  SKIP — já no banco id=${dup.rows[used].id}`);
      consumed.set(key, used + 1);
      continue;
    }

    if (!apply) {
      console.log("  (dry-run) inseriria");
      consumed.set(key, used + 1);
      continue;
    }

    const ins = await c.query(
      `INSERT INTO vendas (
         data, id_vendedor, vendedor, unidade, categoria, subcategoria,
         sku, descricao, preco_unitario, quantidade, subtotal_bruto, desconto, valor_recebido, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'')
       RETURNING id`,
      [
        dataIso,
        v.id,
        v.nome,
        row.unidade,
        row.categoria,
        row.subcategoria,
        row.sku,
        row.item || item.rows[0]?.descricao || row.sku,
        preco,
        qtd,
        sub,
        desc,
        valor,
      ]
    );
    consumed.set(key, used + 1);
    console.log(`  INSERIDO id=${ins.rows[0].id}`);
  }
} finally {
  await c.end();
}
