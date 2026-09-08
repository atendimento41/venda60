import { getClient } from "@/db";
import { isVendaCancelada, normalizeUpper, dataYmd, sqlMargemDiaApp } from "@/lib/utils";

export type VendaRow = {
  id: number;
  data: string;
  idVendedor: string | null;
  vendedor: string | null;
  unidade: string;
  categoria: string | null;
  subcategoria: string | null;
  sku: string;
  descricao: string | null;
  precoUnitario: number;
  quantidade: number;
  subtotalBruto: number;
  desconto: number;
  valorRecebido: number;
  status: string | null;
  canceladoPor: string | null;
  canceladoEm: string | null;
  motivoCancelamento: string | null;
};

function mapVendaRow(r: Record<string, unknown>): VendaRow {
  return {
    id: Number(r.id),
    data: String(r.data || ""),
    idVendedor: r.id_vendedor != null ? String(r.id_vendedor) : null,
    vendedor: r.vendedor != null ? String(r.vendedor) : null,
    unidade: String(r.unidade || ""),
    categoria: r.categoria != null ? String(r.categoria) : null,
    subcategoria: r.subcategoria != null ? String(r.subcategoria) : null,
    sku: String(r.sku || ""),
    descricao: r.descricao != null ? String(r.descricao) : null,
    precoUnitario: Number(r.preco_unitario) || 0,
    quantidade: Number(r.quantidade) || 1,
    subtotalBruto: Number(r.subtotal_bruto) || 0,
    desconto: Number(r.desconto) || 0,
    valorRecebido: Number(r.valor_recebido) || 0,
    status: r.status != null ? String(r.status) : null,
    canceladoPor: r.cancelado_por != null ? String(r.cancelado_por) : null,
    canceladoEm: r.cancelado_em != null ? String(r.cancelado_em) : null,
    motivoCancelamento: r.motivo_cancelamento != null ? String(r.motivo_cancelamento) : null,
  };
}

/** Vendas em intervalo de datas (ISO text). Exclui canceladas. */
export async function listarVendasNoPeriodo(filtros: {
  inicio: string;
  fim: string;
  unidade?: string;
}): Promise<VendaRow[]> {
  const client = getClient();
  const args: unknown[] = [filtros.inicio, `${filtros.fim}T23:59:59.999Z`];
  let sql = `SELECT * FROM vendas WHERE data >= ? AND data <= ?`;
  if (filtros.unidade) {
    sql += ` AND upper(unidade) = ?`;
    args.push(normalizeUpper(filtros.unidade));
  }
  sql += ` ORDER BY id DESC`;
  const result = await client.execute({ sql, args });
  return result.rows
    .map((r) => mapVendaRow(r as Record<string, unknown>))
    .filter((r) => !isVendaCancelada(r.status));
}

/** Vendas de um dia (YYYY-MM-DD). */
export async function listarVendasDoDiaSql(filtros: {
  data: string;
  unidade?: string;
  categoria?: string;
  subcategoria?: string;
}): Promise<VendaRow[]> {
  const client = getClient();
  const dia = String(filtros.data).slice(0, 10);
  const margem = sqlMargemDiaApp(dia, dia);
  const args: unknown[] = [margem.sqlInicio, margem.sqlFim];
  let sql = `SELECT * FROM vendas WHERE data >= ? AND data <= ?`;
  if (filtros.unidade) {
    sql += ` AND upper(unidade) = ?`;
    args.push(normalizeUpper(filtros.unidade));
  }
  sql += ` ORDER BY id`;
  const result = await client.execute({ sql, args });
  return result.rows
    .map((r) => mapVendaRow(r as Record<string, unknown>))
    .filter((r) => {
      if (dataYmd(r.data) !== dia) return false;
      if (isVendaCancelada(r.status)) return false;
      if (filtros.categoria && normalizeUpper(r.categoria) !== normalizeUpper(filtros.categoria))
        return false;
      if (
        filtros.subcategoria &&
        normalizeUpper(r.subcategoria) !== normalizeUpper(filtros.subcategoria)
      )
        return false;
      return true;
    });
}

/** Relatório detalhado / intervalo arbitrário. */
export async function listarVendasIntervalo(filtros: {
  dataInicio?: string;
  dataFim?: string;
  unidade?: string;
}): Promise<VendaRow[]> {
  const client = getClient();
  const args: unknown[] = [];
  let sql = `SELECT * FROM vendas WHERE 1=1`;
  if (filtros.dataInicio) {
    sql += ` AND data >= ?`;
    args.push(filtros.dataInicio);
  }
  if (filtros.dataFim) {
    sql += ` AND data <= ?`;
    args.push(`${filtros.dataFim}T23:59:59.999Z`);
  }
  if (filtros.unidade) {
    sql += ` AND upper(unidade) = ?`;
    args.push(normalizeUpper(filtros.unidade));
  }
  sql += ` ORDER BY id`;
  const result = await client.execute({ sql, args });
  return result.rows
    .map((r) => mapVendaRow(r as Record<string, unknown>))
    .filter((r) => !isVendaCancelada(r.status));
}

/** Soma de quantidade vendida por SKU+unidade (todo o histórico). */
export async function agregarVendasPorSkuUnidade(): Promise<Record<string, number>> {
  const client = getClient();
  const result = await client.execute({
    sql: `SELECT upper(sku) AS sku_up, upper(unidade) AS uni, sum(quantidade)::int AS qtd
          FROM vendas
          WHERE coalesce(upper(status), '') != 'CANCELADO'
          GROUP BY 1, 2`,
    args: [],
  });
  const out: Record<string, number> = {};
  for (const row of result.rows) {
    const key = `${String(row.sku_up)}|${String(row.uni)}`;
    out[key] = Number(row.qtd) || 0;
  }
  return out;
}

export type GrupoDuplicataVenda = {
  chave: string;
  quantidade: number;
  ids: number[];
  datas: string[];
};

function fingerprintVenda(r: VendaRow): string {
  const data = dataYmd(r.data);
  return [
    data,
    normalizeUpper(r.sku),
    normalizeUpper(r.unidade),
    normalizeUpper(r.vendedor || ""),
    String(r.quantidade),
    String(r.valorRecebido),
    normalizeUpper(r.status || ""),
  ].join("|");
}

/** Duplicatas prováveis a partir de uma data (legado anterior pode repetir). */
export async function listarDuplicatasVendas(aPartirDe: string): Promise<GrupoDuplicataVenda[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(aPartirDe)) {
    throw new Error("Data inválida. Use YYYY-MM-DD.");
  }
  const rows = await listarVendasNoPeriodo({
    inicio: aPartirDe,
    fim: "2099-12-31",
  });
  const grupos: Record<string, { ids: number[]; datas: string[] }> = {};
  for (const r of rows) {
    const fp = fingerprintVenda(r);
    if (!grupos[fp]) grupos[fp] = { ids: [], datas: [] };
    grupos[fp].ids.push(r.id);
    grupos[fp].datas.push(dataYmd(r.data));
  }
  return Object.entries(grupos)
    .filter(([, g]) => g.ids.length > 1)
    .map(([chave, g]) => ({
      chave,
      quantidade: g.ids.length,
      ids: g.ids,
      datas: [...new Set(g.datas)].sort(),
    }))
    .sort((a, b) => b.quantidade - a.quantidade || a.chave.localeCompare(b.chave));
}

export function vendasDedupeAPartirDe(): string {
  return (process.env.VENDAS_DEDUPE_A_PARTIR_DE || "2026-09-01").trim();
}
