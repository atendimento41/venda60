import { getClient } from "@/db";
import { normalizeUpper } from "./utils";

let pronto = false;

export async function ensureVendasMensalMV() {
  if (pronto) return;
  const client = getClient();
  await client.execute(`
    CREATE MATERIALIZED VIEW IF NOT EXISTS mv_vendas_mensal AS
    SELECT
      substring(data from 1 for 7) AS mes,
      upper(trim(unidade)) AS unidade,
      trim(vendedor) AS vendedor,
      coalesce(categoria, '') AS categoria,
      coalesce(subcategoria, '') AS subcategoria,
      count(*)::int AS qtd_linhas,
      sum(quantidade)::int AS quantidade,
      sum(valor_recebido)::double precision AS valor_recebido
    FROM vendas
    WHERE coalesce(upper(status), '') != 'CANCELADO'
    GROUP BY 1, 2, 3, 4, 5
  `);
  try {
    await client.execute(`
      CREATE UNIQUE INDEX IF NOT EXISTS mv_vendas_mensal_uq
      ON mv_vendas_mensal (mes, unidade, vendedor, categoria, subcategoria)
    `);
  } catch {
    /* view recém-criada ou índice já existe */
  }
  pronto = true;
}

export async function refreshVendasMensalMV() {
  await ensureVendasMensalMV();
  try {
    await getClient().execute("REFRESH MATERIALIZED VIEW CONCURRENTLY mv_vendas_mensal");
  } catch {
    await getClient().execute("REFRESH MATERIALIZED VIEW mv_vendas_mensal");
  }
}

export type LinhaVendasMensalMV = {
  mes: string;
  unidade: string;
  vendedor: string;
  categoria: string;
  subcategoria: string;
  qtdLinhas: number;
  quantidade: number;
  valorRecebido: number;
};

export async function consultarVendasMensalMV(filtros: {
  mes: string;
  unidade?: string;
}): Promise<LinhaVendasMensalMV[]> {
  await ensureVendasMensalMV();
  const args: unknown[] = [filtros.mes];
  let sql = `SELECT mes, unidade, vendedor, categoria, subcategoria,
                    qtd_linhas, quantidade, valor_recebido
             FROM mv_vendas_mensal WHERE mes = ?`;
  if (filtros.unidade) {
    sql += ` AND unidade = ?`;
    args.push(normalizeUpper(filtros.unidade));
  }
  const rs = await getClient().execute({ sql, args });
  return rs.rows.map((r) => ({
    mes: String(r.mes),
    unidade: String(r.unidade),
    vendedor: String(r.vendedor || "—"),
    categoria: String(r.categoria || ""),
    subcategoria: String(r.subcategoria || ""),
    qtdLinhas: Number(r.qtd_linhas) || 0,
    quantidade: Number(r.quantidade) || 0,
    valorRecebido: Number(r.valor_recebido) || 0,
  }));
}
