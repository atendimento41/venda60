import { db, getClient } from "@/db";
import {
  vendas,
  estoque,
  itens,
  movimentosEstoque,
} from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import {
  agoraISO,
  normalizarDataVendaISO,
  dataYmd,
  formatDataHoraBR,
  hojeISO,
  isVendaCancelada,
  normalizeText,
  normalizeUpper,
  parseMesFiltro,
  subtrairDiasYmd,
  sqlMargemDiaApp,
  valorLinhaVenda,
} from "@/lib/utils";
import { LOG_TIPO, registrarLog, registrarLogConsulta } from "@/lib/log";
import { operadorAtual } from "@/lib/log";
import {
  montarPaginaResult,
  normalizarPagina,
  normalizarPageSize,
  type PaginaResult,
} from "@/lib/paginacao";
import { refreshVendasMensalMV } from "@/lib/materialized-views";
import { fotoUrlParaListagem } from "@/lib/foto";
import {
  assertUnidadeDoUsuario,
  assertUnidadeDoVendedor,
  itemPodeVenderNaUnidade,
  obterVendedorPorIdOuNome,
  parseUnidadesJson,
} from "@/services/vendedores";
import { campoEhUnik3d } from "@/services/unik";

export { listarVendedoresAtivos } from "@/services/vendedores";

export async function listarItensPorUnidade(unidade: string) {
  const unidadeBusca = normalizeText(unidade);
  if (!unidadeBusca) return [];

  const client = getClient();
  const result = await client.execute({
    sql: `SELECT i.sku, i.descricao, i.categoria_dash, i.subcategoria_meep, i.preco,
                 i.ilimitado, i.foto_url, i.unidades,
                 COALESCE(e.quantidade, 0) AS qtd_unidade,
                 COALESCE(g.quantidade, 0) AS qtd_geral
          FROM itens i
          LEFT JOIN estoque e
            ON e.sku = i.sku AND upper(trim(e.unidade)) = upper(trim(?))
          LEFT JOIN estoque g
            ON g.sku = i.sku AND upper(trim(g.unidade)) = 'GERAL'
          WHERE i.ativo = true
            AND (
              i.ilimitado = true
              OR COALESCE(e.quantidade, 0) > 0
              OR (
                COALESCE(g.quantidade, 0) > 0
                AND (
                  (upper(coalesce(i.subcategoria_meep,'')) LIKE '%UNIK%'
                   AND (upper(coalesce(i.subcategoria_meep,'')) LIKE '%3D%'
                        OR upper(coalesce(i.subcategoria_meep,'')) LIKE '%3 D%'))
                  OR (upper(coalesce(i.categoria_dash,'')) LIKE '%UNIK%'
                      AND (upper(coalesce(i.categoria_dash,'')) LIKE '%3D%'
                           OR upper(coalesce(i.categoria_dash,'')) LIKE '%3 D%'))
                )
              )
            )
          ORDER BY lower(i.descricao)`,
    args: [unidadeBusca],
  });

  return result.rows
    .map((row) => {
      const ilimitado = Boolean(row.ilimitado);
      const sku = String(row.sku || "");
      const subcategoria = String(row.subcategoria_meep || "");
      const categoria = String(row.categoria_dash || "");
      const qtdUnidade = Number(row.qtd_unidade) || 0;
      const qtdGeral = Number(row.qtd_geral) || 0;
      const unik = campoEhUnik3d(subcategoria) || campoEhUnik3d(categoria);
      const estoque = ilimitado ? null : qtdUnidade > 0 ? qtdUnidade : unik ? qtdGeral : 0;
      const fotoUrl = fotoUrlParaListagem(String(row.foto_url || ""), { sku });
      return {
        sku,
        nome: String(row.descricao || ""),
        descricao: String(row.descricao || ""),
        categoria,
        subcategoria,
        preco: Number(row.preco) || 0,
        estoque,
        ilimitado,
        fotoUrl,
        fotoImgSrc: fotoUrl,
        unidades: parseUnidadesJson(row.unidades),
      };
    })
    .filter((row) => itemPodeVenderNaUnidade(row.unidades, unidadeBusca))
    .filter((row) => row.ilimitado || (Number(row.estoque) || 0) > 0);
}

export type FiltroUltimasVendas = {
  dias?: number;
  data?: string;
  mes?: string;
  unidade?: string;
  vendedor?: string;
  limit?: number;
  page?: number;
  pageSize?: number;
};

export async function getUltimasVendas(
  filtros: FiltroUltimasVendas | number = {}
): Promise<
  | PaginaResult<{
      id: number;
      dataHora: string;
      unidade: string;
      vendedor: string;
      sku: string;
      item: string;
      quantidade: number;
      precoUnitario: number;
      desconto: number;
      valor: number;
    }>
  | Array<{
      id: number;
      dataHora: string;
      unidade: string;
      vendedor: string;
      sku: string;
      item: string;
      quantidade: number;
      precoUnitario: number;
      desconto: number;
      valor: number;
    }>
> {
  const f: FiltroUltimasVendas = typeof filtros === "number" ? { limit: filtros } : filtros || {};
  const paginado = f.page != null || f.pageSize != null;
  const page = normalizarPagina(f.page);
  const pageSize = paginado
    ? normalizarPageSize(f.pageSize, 50, 100)
    : Math.min(Math.max(Number(f.limit) || 200, 1), 500);
  const limit = paginado ? pageSize : pageSize;

  let inicio = "";
  let fim = "";
  const mes = normalizeText(f.mes);
  const dia = normalizeText(f.data);
  if (mes) {
    const p = parseMesFiltro(mes);
    inicio = p.inicio;
    fim = p.fim;
  } else if (dia) {
    inicio = dia;
    fim = dia;
  } else {
    const dias = Math.min(Math.max(Number(f.dias) || 3, 1), 90);
    fim = hojeISO();
    inicio = subtrairDiasYmd(fim, dias - 1);
  }

  const client = getClient();
  const margem = sqlMargemDiaApp(inicio, fim);
  const where: string[] = [
    "data >= ?",
    "data <= ?",
    "coalesce(upper(status), '') != 'CANCELADO'",
  ];
  const args: (string | number)[] = [margem.sqlInicio, margem.sqlFim];

  if (f.unidade) {
    where.push("UPPER(TRIM(unidade)) = UPPER(TRIM(?))");
    args.push(f.unidade);
  }
  if (f.vendedor) {
    where.push("TRIM(vendedor) = TRIM(?)");
    args.push(f.vendedor);
  }

  const whereSql = where.join(" AND ");

  let total = 0;
  if (paginado) {
    const countRs = await client.execute({
      sql: `SELECT count(*)::int AS c FROM vendas WHERE ${whereSql}`,
      args,
    });
    total = Number(countRs.rows[0]?.c) || 0;
  }

  const offset = paginado ? (page - 1) * pageSize : 0;
  const sqlLimit = paginado ? pageSize : Math.min(limit * 4, 800);

  const result = await client.execute({
    sql: `SELECT id, data, vendedor, unidade, sku, descricao, quantidade,
                 preco_unitario, subtotal_bruto, desconto, valor_recebido, status
          FROM vendas
          WHERE ${whereSql}
          ORDER BY id DESC
          LIMIT ? OFFSET ?`,
    args: [...args, sqlLimit, offset],
  });

  const out = [];
  for (const row of result.rows) {
    if (!paginado && isVendaCancelada(row.status)) continue;
    const ymd = dataYmd(row.data);
    if (inicio && ymd < inicio) continue;
    if (fim && ymd > fim) continue;
    const desconto = Number(row.desconto) || 0;
    out.push({
      id: Number(row.id),
      dataHora: formatDataHoraBR(row.data),
      unidade: String(row.unidade || ""),
      vendedor: String(row.vendedor || "—"),
      sku: String(row.sku || ""),
      item: String(row.descricao || row.sku || ""),
      quantidade: Number(row.quantidade) || 0,
      precoUnitario: Number(row.preco_unitario) || 0,
      desconto,
      valor: valorLinhaVenda(row),
    });
    if (out.length >= limit) break;
  }

  registrarLogConsulta(
    LOG_TIPO.CONSULTA_VENDAS,
    { inicio, fim, unidade: f.unidade || "", vendedor: f.vendedor || "", n: out.length, page },
    "Consulta últimos lançamentos"
  );

  if (paginado) {
    return montarPaginaResult(out, total, page, pageSize);
  }
  return out;
}

type ItemVendaInput = {
  sku: string;
  descricao?: string;
  categoria?: string;
  subcategoria?: string;
  preco: number;
  quantidade: number;
};

type RegistrarVendaInput = {
  id_vendedor?: string;
  vendedor?: string;
  unidade: string;
  desconto?: number;
  data?: string;
  itens: ItemVendaInput[];
};

async function registrarMovimentoEstoque(
  sku: string,
  unidade: string,
  delta: number,
  tipo: string,
  referencia?: string
) {
  const [linha] = await db
    .select()
    .from(estoque)
    .where(and(eq(estoque.sku, sku), eq(estoque.unidade, unidade)));

  const qtdAtual = linha?.quantidade ?? 0;
  const qtdNova = qtdAtual + delta;

  if (linha) {
    await db
      .update(estoque)
      .set({ quantidade: qtdNova })
      .where(eq(estoque.id, linha.id));
  } else if (delta > 0) {
    const [item] = await db.select().from(itens).where(eq(itens.sku, sku));
    await db.insert(estoque).values({
      sku,
      unidade,
      quantidade: qtdNova,
      nome: item?.descricao || sku,
    });
  }

  await db.insert(movimentosEstoque).values({
    dataHora: agoraISO(),
    sku,
    unidade,
    delta,
    quantidadeApos: qtdNova,
    tipo,
    operador: await operadorAtual(),
    referencia,
  });
}

export async function registrarVenda(
  dados: RegistrarVendaInput,
  opts?: { unidadesUsuario?: string[]; nomeUsuario?: string }
) {
  const unidade = normalizeText(dados.unidade);
  if (!unidade) throw new Error("Unidade não informada.");
  const itensVenda = Array.isArray(dados.itens) ? dados.itens : [];
  if (!itensVenda.length) throw new Error("Nenhum item informado.");

  assertUnidadeDoUsuario(opts?.unidadesUsuario, unidade, opts?.nomeUsuario || "Usuário");

  const vendedor = await obterVendedorPorIdOuNome(dados.id_vendedor, dados.vendedor);
  if (!vendedor) throw new Error("Selecione um vendedor cadastrado.");
  if (!vendedor.ativo) throw new Error("Vendedor inativo.");
  assertUnidadeDoVendedor(vendedor, unidade);

  const dataVenda = normalizarDataVendaISO(dados.data);
  let subtotalBrutoTotal = 0;
  const consumo: Record<string, number> = {};

  for (const item of itensVenda) {
    const sku = normalizeText(item.sku);
    const qtd = Number(item.quantidade) || 1;
    const preco = Number(item.preco) || 0;
    if (!sku) throw new Error("Item sem SKU.");

    const [itemCad] = await db.select().from(itens).where(eq(itens.sku, sku));
    if (itemCad && !itemPodeVenderNaUnidade(parseUnidadesJson(itemCad.unidades), unidade)) {
      throw new Error(`Item ${sku} não está alocado à unidade ${unidade}.`);
    }
    if (itemCad?.ilimitado) {
      subtotalBrutoTotal += preco * qtd;
      continue;
    }

    const unik = campoEhUnik3d(itemCad?.subcategoriaMeep) || campoEhUnik3d(itemCad?.categoriaDash);
    const [estUnidade] = await db
      .select()
      .from(estoque)
      .where(and(eq(estoque.sku, sku), eq(estoque.unidade, unidade)));
    const origem =
      estUnidade && estUnidade.quantidade > 0
        ? unidade
        : unik
          ? "GERAL"
          : "";
    if (!origem) throw new Error(`SKU ${sku} não encontrado na unidade ${unidade}.`);

    const [est] = origem === unidade
      ? [estUnidade]
      : await db
          .select()
          .from(estoque)
          .where(and(eq(estoque.sku, sku), eq(estoque.unidade, "GERAL")));
    if (!est) throw new Error(`SKU ${sku} não encontrado na unidade ${unidade}.`);

    consumo[`${sku}|${origem}`] = (consumo[`${sku}|${origem}`] || 0) + qtd;
    if (consumo[`${sku}|${origem}`] > est.quantidade) {
      throw new Error(
        `Estoque insuficiente para ${sku}. Disponível: ${est.quantidade}`
      );
    }
    subtotalBrutoTotal += preco * qtd;
  }

  const descontoTotal = Number(dados.desconto) || 0;
  const valorRecebidoTotal = subtotalBrutoTotal - descontoTotal;
  const n = itensVenda.length;

  for (const item of itensVenda) {
    const sku = normalizeText(item.sku);
    const qtd = Number(item.quantidade) || 1;
    const preco = Number(item.preco) || 0;
    const subtotal = preco * qtd;
    const descontoLinha = descontoTotal / n;
    const valorLinha = Math.max(0, subtotal - descontoLinha);

    await db.insert(vendas).values({
      data: dataVenda,
      idVendedor: vendedor.id,
      vendedor: vendedor.nome,
      unidade,
      categoria: item.categoria || "",
      subcategoria: item.subcategoria || "",
      sku,
      descricao: item.descricao || "",
      precoUnitario: preco,
      quantidade: qtd,
      subtotalBruto: subtotal,
      desconto: descontoLinha,
      valorRecebido: valorLinha,
      status: "",
    });
  }

  for (const [chave, qtd] of Object.entries(consumo)) {
    const [sku, uni] = chave.split("|");
    await registrarMovimentoEstoque(sku, uni, -qtd, "VENDA");
  }

  await registrarLog(
    LOG_TIPO.LANCAMENTO_VENDA,
    { unidade, qtdItens: n },
    true,
    `Venda registrada (${n} item(s))`
  );

  void refreshVendasMensalMV().catch(() => {});

  return {
    message: `Venda registrada (${n} item(s))! Desconto: R$ ${descontoTotal.toFixed(2)}`,
    total: valorRecebidoTotal.toFixed(2),
  };
}

export async function listarVendasParaCancelamento(filtros: {
  nome?: string;
  unidade?: string;
  vendedor?: string;
  dataInicio?: string;
  dataFim?: string;
  incluirCanceladas?: boolean;
}) {
  const rows = await db.select().from(vendas).orderBy(desc(vendas.id)).limit(2000);
  const somenteAbertas = !filtros.incluirCanceladas;

  return rows
    .filter((row) => {
      if (somenteAbertas && isVendaCancelada(row.status)) return false;
      if (filtros.unidade && normalizeUpper(row.unidade) !== normalizeUpper(filtros.unidade))
        return false;
      if (filtros.vendedor && normalizeText(row.vendedor) !== normalizeText(filtros.vendedor))
        return false;
      const ymd = dataYmd(row.data);
      if (filtros.dataInicio && ymd < filtros.dataInicio) return false;
      if (filtros.dataFim && ymd > filtros.dataFim) return false;
      if (filtros.nome) {
        const n = normalizeUpper(filtros.nome);
        const item = normalizeUpper(row.descricao || row.sku);
        if (!item.includes(n) && !normalizeUpper(row.sku).includes(n)) return false;
      }
      return true;
    })
    .slice(0, 400)
    .map((row) => ({
      sheetRow: row.id,
      dataHora: formatDataHoraBR(row.data),
      vendedor: row.vendedor || "—",
      unidade: row.unidade,
      sku: row.sku,
      item: row.descricao || row.sku,
      quantidade: row.quantidade,
      valorRecebido: row.valorRecebido,
      status: row.status || "",
      canceladoPor: row.canceladoPor || "",
      canceladoEm: row.canceladoEm ? formatDataHoraBR(row.canceladoEm) : "",
      motivo: row.motivoCancelamento || "",
      cancelada: isVendaCancelada(row.status),
    }));
}

export async function cancelarVenda(id: number, motivo: string, operador?: string) {
  const razao = normalizeText(motivo);
  if (razao.length < 10) throw new Error("Informe a descrição do cancelamento (mínimo 10 caracteres).");

  const [row] = await db.select().from(vendas).where(eq(vendas.id, id));
  if (!row) throw new Error("Venda não encontrada.");
  if (isVendaCancelada(row.status)) throw new Error("Venda já cancelada.");

  const quem = normalizeText(operador) || (await operadorAtual());

  await db
    .update(vendas)
    .set({
      status: "CANCELADO",
      canceladoPor: quem,
      canceladoEm: agoraISO(),
      motivoCancelamento: razao,
    })
    .where(eq(vendas.id, id));

  const [itemCad] = await db.select().from(itens).where(eq(itens.sku, row.sku));
  if (!itemCad?.ilimitado) {
    await registrarMovimentoEstoque(
      row.sku,
      row.unidade,
      row.quantidade,
      "CANCELAMENTO_VENDA",
      String(id)
    );
  }

  await registrarLog(
    LOG_TIPO.CANCELAMENTO_VENDA,
    { id, motivo: razao },
    true,
    `Venda cancelada: ${razao}`
  );
  void refreshVendasMensalMV().catch(() => {});
  return { ok: true, message: "Venda cancelada e estoque devolvido." };
}
