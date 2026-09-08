import { db, getClient } from "@/db";
import { vendas, primeVendas, estoque, itens } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  classifyComissaoBucket,
  dataYmd,
  formatDataHoraBR,
  hojeISO,
  isVendaCancelada,
  mesAtualISO,
  mesAnteriorDe,
  normalizeText,
  normalizeUpper,
  parseMesFiltro,
  dataNoIntervalo,
  UNIDADES_PADRAO,
  sqlMargemDiaApp,
  valorLinhaVenda,
} from "@/lib/utils";
import { LOG_TIPO, registrarLogConsulta } from "@/lib/log";
import {
  listarVendasDoDiaSql,
  listarVendasIntervalo,
  listarVendasNoPeriodo,
} from "@/lib/vendas-db";
import { consultarVendasMensalMV, ensureVendasMensalMV } from "@/lib/materialized-views";

const CATEGORIA_PRIME = "PRIME";

function ensureMensalVendedor(
  mensal: Record<
    string,
    {
      valorTotal: number;
      comissaoPhoto: number;
      comissaoTempoExtra: number;
      comissaoEscape: number;
      comissao3d: number;
      comissaoProdutos: number;
      comissaoPrime: number;
    }
  >,
  vendedor: string
) {
  if (!mensal[vendedor]) {
    mensal[vendedor] = {
      valorTotal: 0,
      comissaoPhoto: 0,
      comissaoTempoExtra: 0,
      comissaoEscape: 0,
      comissao3d: 0,
      comissaoProdutos: 0,
      comissaoPrime: 0,
    };
  }
  return mensal[vendedor];
}

export async function getRelatorioVendasPorVendedor(filtros?: { unidade?: string }) {
  const hoje = hojeISO();
  const periodo = parseMesFiltro(mesAtualISO());
  const unidadeF = normalizeUpper(filtros?.unidade || "");
  const client = getClient();

  await ensureVendasMensalMV();

  const vendasHojeMargem = sqlMargemDiaApp(hoje, hoje);
  const vendasHoje = await client.execute({
    sql: `SELECT data, vendedor, unidade, valor_recebido, status
          FROM vendas
          WHERE data >= ? AND data <= ?
            AND coalesce(upper(status), '') != 'CANCELADO'`,
    args: [vendasHojeMargem.sqlInicio, vendasHojeMargem.sqlFim],
  });
  const primeMes = await client.execute({
    sql: `SELECT data, vendedor, unidade, quantidade FROM prime_vendas
          WHERE data >= ? AND data <= ?
            AND coalesce(upper(status), '') != 'CANCELADO'`,
    args: [periodo.inicio, `${periodo.fim}T23:59:59.999Z`],
  });
  const linhasMV = await consultarVendasMensalMV({
    mes: mesAtualISO(),
    unidade: unidadeF || undefined,
  });

  const diaria: Record<string, number> = {};
  const mensal: Record<
    string,
    {
      valorTotal: number;
      comissaoPhoto: number;
      comissaoTempoExtra: number;
      comissaoEscape: number;
      comissao3d: number;
      comissaoProdutos: number;
      comissaoPrime: number;
    }
  > = {};
  const totaisUnidades: Record<string, number> = {
    PKS: 0,
    "PIER 21": 0,
    TGS: 0,
    SSU: 0,
  };

  let totalDiaria = 0;
  let totalMensal = 0;

  for (const row of vendasHoje.rows) {
    if (dataYmd(row.data) !== hoje) continue;
    if (unidadeF && normalizeUpper(row.unidade) !== unidadeF) continue;
    const valor = Number(row.valor_recebido) || 0;
    if (valor <= 0) continue;
    const vendedor = String(row.vendedor || "—");
    diaria[vendedor] = (diaria[vendedor] || 0) + valor;
    totalDiaria += valor;
  }

  for (const row of linhasMV) {
    const valor = row.valorRecebido;
    if (valor <= 0) continue;
    const vendedor = row.vendedor || "—";
    const m = ensureMensalVendedor(mensal, vendedor);
    m.valorTotal += valor;
    totalMensal += valor;

    const bucket = classifyComissaoBucket(row.categoria, row.subcategoria);
    const com = valor * 0.05;
    if (bucket === "PHOTO") m.comissaoPhoto += com;
    else if (bucket === "TEMPO_EXTRA") m.comissaoTempoExtra += com;
    else if (bucket === "ESCAPE") m.comissaoEscape += com;
    else if (bucket === "TRES_D") m.comissao3d += com;
    else if (bucket === "PRODUTOS") m.comissaoProdutos += com;

    const uni = row.unidade || "";
    const uniLabel =
      UNIDADES_PADRAO.find((u) => normalizeUpper(u) === normalizeUpper(uni)) || uni;
    if (totaisUnidades[uniLabel] != null) totaisUnidades[uniLabel] += valor;
  }

  for (const row of primeMes.rows) {
    const ymd = dataYmd(row.data);
    if (unidadeF && normalizeUpper(row.unidade) !== unidadeF) continue;
    const qt = Number(row.quantidade) || 0;
    if (qt <= 0) continue;
    const comPrime = qt * 1.0;
    const vendedor = String(row.vendedor || "—");

    if (ymd === hoje) {
      diaria[vendedor] = (diaria[vendedor] || 0) + comPrime;
      totalDiaria += comPrime;
    }

    if (dataNoIntervalo(ymd, periodo.inicio, periodo.fim)) {
      ensureMensalVendedor(mensal, vendedor).comissaoPrime += comPrime;
    }
  }

  const diariaSorted = Object.entries(diaria)
    .map(([vendedor, valor]) => ({ vendedor, valor: Number(valor.toFixed(2)) }))
    .sort((a, b) => b.valor - a.valor);

  const mensalSorted = Object.entries(mensal)
    .map(([v, obj]) => ({
      vendedor: v,
      valor: Number(obj.valorTotal.toFixed(2)),
      comissaoPhoto: Number(obj.comissaoPhoto.toFixed(2)),
      comissaoTempoExtra: Number(obj.comissaoTempoExtra.toFixed(2)),
      comissaoEscape: Number(obj.comissaoEscape.toFixed(2)),
      comissao3d: Number(obj.comissao3d.toFixed(2)),
      comissaoProdutos: Number(obj.comissaoProdutos.toFixed(2)),
      comissaoPrime: Number(obj.comissaoPrime.toFixed(2)),
      comissaoTotal: Number(
        (
          obj.comissaoPhoto +
          obj.comissaoTempoExtra +
          obj.comissaoEscape +
          obj.comissao3d +
          obj.comissaoProdutos +
          obj.comissaoPrime
        ).toFixed(2)
      ),
    }))
    .sort((a, b) => b.valor - a.valor);

  registrarLogConsulta(LOG_TIPO.CONSULTA_RELATORIO, { unidade: unidadeF || null }, "Relatorio index");
  return {
    diaria: diariaSorted,
    mensal: mensalSorted,
    totalDiaria: Number(totalDiaria.toFixed(2)),
    totalMensal: Number(totalMensal.toFixed(2)),
    totaisUnidades,
    unidadeFiltro: unidadeF || null,
  };
}

export async function getRelatorioFiltrado(filtros: {
  dataInicio?: string;
  dataFim?: string;
  unidade?: string;
  vendedor?: string;
  categoria?: string;
  subcategoria?: string;
}) {
  const isPrime = normalizeUpper(filtros.categoria) === CATEGORIA_PRIME;

  if (isPrime) {
    const primeRows = await db.select().from(primeVendas);
    const filtradasPrime = primeRows.filter((row) => {
      if (isVendaCancelada(row.status)) return false;
      const ymd = dataYmd(row.data);
      if (filtros.dataInicio && ymd < filtros.dataInicio) return false;
      if (filtros.dataFim && ymd > filtros.dataFim) return false;
      if (filtros.unidade && normalizeUpper(row.unidade) !== normalizeUpper(filtros.unidade))
        return false;
      if (filtros.vendedor && normalizeText(row.vendedor) !== normalizeText(filtros.vendedor))
        return false;
      return true;
    });
    const porVendedor: Record<string, { vendedor: string; qtd: number; valorPrime: number; comissaoPrime: number }> = {};
    for (const row of filtradasPrime) {
      const v = row.vendedor || "—";
      if (!porVendedor[v]) porVendedor[v] = { vendedor: v, qtd: 0, valorPrime: 0, comissaoPrime: 0 };
      porVendedor[v].qtd += row.quantidade;
      porVendedor[v].valorPrime += row.valor;
      porVendedor[v].comissaoPrime += row.quantidade;
    }
    return {
      linhas: Object.values(porVendedor),
      totalValorPrime: filtradasPrime.reduce((s, r) => s + r.valor, 0),
      modo: "PRIME",
    };
  }

  const rows = await listarVendasIntervalo({
    dataInicio: filtros.dataInicio,
    dataFim: filtros.dataFim,
    unidade: filtros.unidade,
  });

  const filtradas = rows.filter((row) => {
    if (filtros.vendedor && normalizeText(row.vendedor) !== normalizeText(filtros.vendedor))
      return false;
    if (filtros.categoria && normalizeUpper(row.subcategoria) !== normalizeUpper(filtros.categoria))
      return false;
    if (filtros.subcategoria && normalizeUpper(row.categoria) !== normalizeUpper(filtros.subcategoria))
      return false;
    return true;
  });

  const porVendedor: Record<
    string,
    {
      vendedor: string;
      valor: number;
      comissaoPhoto: number;
      comissaoTempoExtra: number;
      comissaoEscape: number;
      comissao3d: number;
      comissaoProdutos: number;
      comissaoPrime: number;
      valorPrime: number;
    }
  > = {};

  for (const row of filtradas) {
    const v = row.vendedor || "—";
    if (!porVendedor[v]) {
      porVendedor[v] = {
        vendedor: v,
        valor: 0,
        comissaoPhoto: 0,
        comissaoTempoExtra: 0,
        comissaoEscape: 0,
        comissao3d: 0,
        comissaoProdutos: 0,
        comissaoPrime: 0,
        valorPrime: 0,
      };
    }
    const val = row.valorRecebido;
    porVendedor[v].valor += val;
    const bucket = classifyComissaoBucket(row.categoria || "", row.subcategoria || "");
    const com = val * 0.05;
    if (bucket === "PHOTO") porVendedor[v].comissaoPhoto += com;
    else if (bucket === "TEMPO_EXTRA") porVendedor[v].comissaoTempoExtra += com;
    else if (bucket === "ESCAPE") porVendedor[v].comissaoEscape += com;
    else if (bucket === "TRES_D") porVendedor[v].comissao3d += com;
    else if (bucket === "PRODUTOS") porVendedor[v].comissaoProdutos += com;
  }

  const vendasLinhas = filtradas
    .slice()
    .sort((a, b) => String(b.data).localeCompare(String(a.data)))
    .map((row) => ({
      dataHora: formatDataHoraBR(row.data),
      vendedor: row.vendedor || "—",
      unidade: row.unidade,
      item: row.descricao || row.sku,
      sku: row.sku,
      quantidade: row.quantidade,
      valor: row.valorRecebido,
      categoria: row.categoria || "",
      subcategoria: row.subcategoria || "",
    }));

  return {
    linhas: Object.values(porVendedor).sort((a, b) => b.valor - a.valor),
    vendas: vendasLinhas,
    modo: "VENDAS",
  };
}

export async function getVendasDoDia(filtros: {
  data?: string;
  unidade?: string;
  categoria?: string;
  subcategoria?: string;
}) {
  const dataF = filtros.data || hojeISO();
  const rows = await listarVendasDoDiaSql({
    data: dataF,
    unidade: filtros.unidade,
    categoria: filtros.categoria,
    subcategoria: filtros.subcategoria,
  });

  return rows.map((row) => ({
      dataHora: formatDataHoraBR(row.data),
      vendedor: row.vendedor || "—",
      unidade: row.unidade,
      item: row.descricao || row.sku,
      categoria: row.categoria || row.subcategoria || "",
      quantidade: row.quantidade,
      valor: row.valorRecebido,
    }));
}

export async function listarCategoriasRelatorio() {
  const allItens = await db.select().from(itens).where(eq(itens.ativo, true));
  const map: Record<string, Set<string>> = {};
  for (const item of allItens) {
    const cat = normalizeText(item.categoriaDash);
    const sub = normalizeText(item.subcategoriaMeep);
    if (!cat) continue;
    if (!map[cat]) map[cat] = new Set();
    if (sub) map[cat].add(sub);
  }
  map[CATEGORIA_PRIME] = new Set(["ELITE", "PLATINA", "OURO"]);
  const out: Record<string, string[]> = {};
  Object.keys(map).forEach((k) => {
    out[k] = [...map[k]].sort();
  });
  return out;
}

export async function getRelatorioSaidasMensal(filtros: {
  mes: string;
  unidade?: string | null;
  categoria?: string | null;
  subcategoria?: string | null;
  somenteComSaida?: boolean | string | number;
}) {
  const periodo = parseMesFiltro(filtros.mes);
  const unidadeF = normalizeUpper(filtros.unidade || "");
  const catF = normalizeUpper(filtros.categoria || "");
  const subF = normalizeUpper(filtros.subcategoria || "");
  const somenteComSaida =
    filtros.somenteComSaida === true ||
    filtros.somenteComSaida === "true" ||
    filtros.somenteComSaida === "1" ||
    filtros.somenteComSaida === 1;

  const allItens = await db.select().from(itens);
  const itensMap = Object.fromEntries(allItens.map((i) => [i.sku, i]));

  const vendasMes = await listarVendasNoPeriodo({
    inicio: periodo.inicio,
    fim: periodo.fim,
    unidade: unidadeF || undefined,
  });
  const client = getClient();
  const vendasApos = await client.execute({
    sql: `SELECT sku, unidade, quantidade, status FROM vendas WHERE data > ?`,
    args: [`${periodo.fim}T23:59:59.999Z`],
  });

  const saidasMes: Record<string, number> = {};
  const saidasApos: Record<string, number> = {};
  const rotulos: Record<string, { sku: string; unidade: string }> = {};

  for (const row of vendasMes) {
    if (unidadeF && normalizeUpper(row.unidade) !== unidadeF) continue;
    const meta = itensMap[row.sku];
    if (catF && normalizeUpper(meta?.categoriaDash) !== catF) continue;
    if (subF && normalizeUpper(meta?.subcategoriaMeep) !== subF) continue;

    const key = `${normalizeUpper(row.sku)}||${normalizeUpper(row.unidade)}`;
    rotulos[key] = { sku: row.sku, unidade: row.unidade };
    saidasMes[key] = (saidasMes[key] || 0) + row.quantidade;
  }

  for (const row of vendasApos.rows) {
    if (isVendaCancelada(row.status)) continue;
    if (unidadeF && normalizeUpper(row.unidade) !== unidadeF) continue;
    const meta = itensMap[String(row.sku)];
    if (catF && normalizeUpper(meta?.categoriaDash) !== catF) continue;
    if (subF && normalizeUpper(meta?.subcategoriaMeep) !== subF) continue;

    const key = `${normalizeUpper(row.sku)}||${normalizeUpper(row.unidade)}`;
    rotulos[key] = { sku: String(row.sku), unidade: String(row.unidade) };
    saidasApos[key] = (saidasApos[key] || 0) + (Number(row.quantidade) || 0);
  }

  const estoqueRows = await db.select().from(estoque);
  const estoqueAtual: Record<string, number> = {};
  for (const row of estoqueRows) {
    if (unidadeF && normalizeUpper(row.unidade) !== unidadeF) continue;
    const meta = itensMap[row.sku];
    if (catF && normalizeUpper(meta?.categoriaDash) !== catF) continue;
    if (subF && normalizeUpper(meta?.subcategoriaMeep) !== subF) continue;
    const key = `${normalizeUpper(row.sku)}||${normalizeUpper(row.unidade)}`;
    estoqueAtual[key] = row.quantidade;
    rotulos[key] = { sku: row.sku, unidade: row.unidade };
  }

  const chaves = new Set<string>(Object.keys(saidasMes));
  if (!somenteComSaida) Object.keys(estoqueAtual).forEach((k) => chaves.add(k));

  const linhas = [];
  let totalSaidas = 0;
  let totalInicio = 0;
  let totalFinal = 0;

  for (const key of chaves) {
    const saidas = saidasMes[key] || 0;
    const atual = estoqueAtual[key] || 0;
    const estoqueFinal = periodo.mesCorrente ? atual : atual + (saidasApos[key] || 0);
    const estoqueInicio = estoqueFinal + saidas;

    if (somenteComSaida && saidas <= 0) continue;
    if (!somenteComSaida && saidas <= 0 && estoqueFinal <= 0) continue;

    const rot = rotulos[key];
    const meta = itensMap[rot.sku];
    linhas.push({
      sku: rot.sku,
      unidade: rot.unidade,
      item: meta?.descricao || rot.sku,
      categoria: meta?.categoriaDash || "",
      subcategoria: meta?.subcategoriaMeep || "",
      estoqueInicio,
      saidas,
      estoqueFinal,
    });
    totalSaidas += saidas;
    totalInicio += estoqueInicio;
    totalFinal += estoqueFinal;
  }

  linhas.sort((a, b) => {
    const u = normalizeUpper(a.unidade).localeCompare(normalizeUpper(b.unidade), "pt-BR");
    if (u) return u;
    return normalizeUpper(a.item).localeCompare(normalizeUpper(b.item), "pt-BR");
  });

  registrarLogConsulta(LOG_TIPO.CONSULTA_SAIDAS_MENSAL, filtros, "Saidas mensal");
  return {
    mes: filtros.mes,
    mesRotulo: periodo.rotulo,
    mesCorrente: periodo.mesCorrente,
    linhas,
    totalLinhas: linhas.length,
    totalSaidas,
    totalEstoqueInicio: totalInicio,
    totalEstoqueFinal: totalFinal,
  };
}

export async function listarVendedoresNomes() {
  const client = getClient();
  const result = await client.execute(
    `SELECT DISTINCT vendedor FROM vendas WHERE vendedor IS NOT NULL AND vendedor != '' ORDER BY vendedor`
  );
  return result.rows.map((r) => String(r.vendedor)).filter(Boolean);
}

export type RankingVendedor = {
  posicao: number;
  vendedor: string;
  valor: number;
  quantidade: number;
};

function rankVendedoresMaluca(
  map: Record<string, { valor: number; quantidade: number }>,
  por: "valor" | "quantidade"
): RankingVendedor[] {
  return Object.entries(map)
    .map(([vendedor, v]) => ({
      posicao: 0,
      vendedor,
      valor: Number(v.valor.toFixed(2)),
      quantidade: v.quantidade,
    }))
    .sort((a, b) => {
      const prim = por === "valor" ? b.valor - a.valor : b.quantidade - a.quantidade;
      if (prim !== 0) return prim;
      return b.valor - a.valor || b.quantidade - a.quantidade;
    })
    .map((r, i) => ({ ...r, posicao: i + 1 }));
}

async function rankingsMalucaDoMes(mesYm: string, unidade?: string) {
  const periodo = parseMesFiltro(mesYm);
  const unidadeF = normalizeUpper(unidade || "");
  const client = getClient();

  const vendasMes = await client.execute({
    sql: `SELECT vendedor, subtotal_bruto, desconto, valor_recebido, quantidade, status, categoria, subcategoria, unidade, data
          FROM vendas
          WHERE data >= ? AND data <= ?`,
    args: [periodo.inicio, `${periodo.fim}T23:59:59.999Z`],
  });

  const primeMes = await client.execute({
    sql: `SELECT vendedor, valor, quantidade, unidade, data
          FROM prime_vendas
          WHERE data >= ? AND data <= ?
            AND coalesce(upper(status), '') != 'CANCELADO'`,
    args: [periodo.inicio, `${periodo.fim}T23:59:59.999Z`],
  });

  const produtosMap: Record<string, { valor: number; quantidade: number }> = {};
  const photoMap: Record<string, { valor: number; quantidade: number }> = {};
  const constanciaMap: Record<string, { dias: Set<string>; valor: number }> = {};

  function bumpMap(
    map: Record<string, { valor: number; quantidade: number }>,
    vendedor: string,
    valor: number,
    qtd: number
  ) {
    if (!map[vendedor]) map[vendedor] = { valor: 0, quantidade: 0 };
    map[vendedor].valor += valor;
    map[vendedor].quantidade += qtd;
  }

  function bumpConstancia(vendedor: string, ymd: string, valor: number) {
    if (!constanciaMap[vendedor]) constanciaMap[vendedor] = { dias: new Set(), valor: 0 };
    if (ymd) constanciaMap[vendedor].dias.add(ymd);
    constanciaMap[vendedor].valor += valor;
  }

  for (const row of vendasMes.rows) {
    if (isVendaCancelada(row.status)) continue;
    if (unidadeF && normalizeUpper(row.unidade) !== unidadeF) continue;
    const nome = normalizeText(row.vendedor) || "—";
    const valor = valorLinhaVenda(row);
    const qtd = Number(row.quantidade) || 0;
    const ymd = dataYmd(row.data);
    const bucket = classifyComissaoBucket(
      String(row.categoria || ""),
      String(row.subcategoria || "")
    );

    bumpConstancia(nome, ymd, valor);
    if (bucket === "PRODUTOS") bumpMap(produtosMap, nome, valor, qtd);
    if (bucket === "PHOTO") bumpMap(photoMap, nome, valor, qtd);
  }

  const primeMap: Record<string, { valor: number; quantidade: number }> = {};
  for (const row of primeMes.rows) {
    if (unidadeF && normalizeUpper(row.unidade) !== unidadeF) continue;
    const nome = normalizeText(row.vendedor) || "—";
    const valor = Number(row.valor) || 0;
    const qtd = Number(row.quantidade) || 0;
    const ymd = dataYmd(row.data);
    bumpMap(primeMap, nome, valor, qtd);
    bumpConstancia(nome, ymd, valor);
  }

  return {
    periodo,
    rankingProdutos: rankVendedoresMaluca(produtosMap, "valor"),
    rankingPhotos: rankVendedoresMaluca(photoMap, "valor"),
    rankingPrime: rankVendedoresMaluca(primeMap, "quantidade"),
    rankingConstancia: rankConstanciaMaluca(constanciaMap),
  };
}

function rankConstanciaMaluca(
  map: Record<string, { dias: Set<string>; valor: number }>
): RankingVendedor[] {
  return Object.entries(map)
    .map(([vendedor, v]) => ({
      posicao: 0,
      vendedor,
      valor: Number(v.valor.toFixed(2)),
      quantidade: v.dias.size,
    }))
    .sort((a, b) => b.quantidade - a.quantidade || b.valor - a.valor)
    .map((r, i) => ({ ...r, posicao: i + 1 }));
}

export type LinhaComissao = {
  vendedor: string;
  valorVendas: number;
  valorPhoto: number;
  comissaoPhoto: number;
  valorTempoExtra: number;
  comissaoTempoExtra: number;
  valorEscape: number;
  comissaoEscape: number;
  valor3d: number;
  comissao3d: number;
  valorProdutos: number;
  comissaoProdutos: number;
  qtdPrime: number;
  valorPrime: number;
  comissaoPrime: number;
  comissaoTotal: number;
};

type AccComissao = {
  valorTotal: number;
  valorPhoto: number;
  comissaoPhoto: number;
  valorTempoExtra: number;
  comissaoTempoExtra: number;
  valorEscape: number;
  comissaoEscape: number;
  valor3d: number;
  comissao3d: number;
  valorProdutos: number;
  comissaoProdutos: number;
  comissaoPrime: number;
  qtdPrime: number;
  valorPrime: number;
};

function emptyAccComissao(): AccComissao {
  return {
    valorTotal: 0,
    valorPhoto: 0,
    comissaoPhoto: 0,
    valorTempoExtra: 0,
    comissaoTempoExtra: 0,
    valorEscape: 0,
    comissaoEscape: 0,
    valor3d: 0,
    comissao3d: 0,
    valorProdutos: 0,
    comissaoProdutos: 0,
    comissaoPrime: 0,
    qtdPrime: 0,
    valorPrime: 0,
  };
}

function mapLinhaComissao(vendedor: string, obj: AccComissao): LinhaComissao {
  return {
    vendedor,
    valorVendas: Number(obj.valorTotal.toFixed(2)),
    valorPhoto: Number(obj.valorPhoto.toFixed(2)),
    comissaoPhoto: Number(obj.comissaoPhoto.toFixed(2)),
    valorTempoExtra: Number(obj.valorTempoExtra.toFixed(2)),
    comissaoTempoExtra: Number(obj.comissaoTempoExtra.toFixed(2)),
    valorEscape: Number(obj.valorEscape.toFixed(2)),
    comissaoEscape: Number(obj.comissaoEscape.toFixed(2)),
    valor3d: Number(obj.valor3d.toFixed(2)),
    comissao3d: Number(obj.comissao3d.toFixed(2)),
    valorProdutos: Number(obj.valorProdutos.toFixed(2)),
    comissaoProdutos: Number(obj.comissaoProdutos.toFixed(2)),
    qtdPrime: obj.qtdPrime,
    valorPrime: Number(obj.valorPrime.toFixed(2)),
    comissaoPrime: Number(obj.comissaoPrime.toFixed(2)),
    comissaoTotal: Number(
      (
        obj.comissaoPhoto +
        obj.comissaoTempoExtra +
        obj.comissaoEscape +
        obj.comissao3d +
        obj.comissaoProdutos +
        obj.comissaoPrime
      ).toFixed(2)
    ),
  };
}

/** Comissões por vendedor no mês (5% vendas + R$ 1/ingresso PRIME). */
export async function getRelatorioComissao(filtros: {
  mes?: string;
  unidade?: string;
  vendedor?: string;
}) {
  const mesYm = filtros.mes?.trim() || mesAtualISO();
  const periodo = parseMesFiltro(mesYm);
  const unidadeF = normalizeUpper(filtros.unidade || "");
  const vendedorF = normalizeText(filtros.vendedor || "");
  const client = getClient();

  const vendasArgs: (string | number)[] = [periodo.inicio, `${periodo.fim}T23:59:59.999Z`];
  let sqlVendas = `SELECT data, vendedor, unidade, categoria, subcategoria,
                          subtotal_bruto, desconto, valor_recebido, status
                   FROM vendas
                   WHERE data >= ? AND data <= ?`;
  if (unidadeF) {
    sqlVendas += ` AND UPPER(TRIM(unidade)) = ?`;
    vendasArgs.push(unidadeF);
  }
  if (vendedorF) {
    sqlVendas += ` AND TRIM(vendedor) = ?`;
    vendasArgs.push(vendedorF);
  }

  const primeArgs: (string | number)[] = [periodo.inicio, `${periodo.fim}T23:59:59.999Z`];
  let sqlPrime = `SELECT data, vendedor, unidade, quantidade, valor
                  FROM prime_vendas
                  WHERE data >= ? AND data <= ?
                    AND coalesce(upper(status), '') != 'CANCELADO'`;
  if (unidadeF) {
    sqlPrime += ` AND UPPER(TRIM(unidade)) = ?`;
    primeArgs.push(unidadeF);
  }
  if (vendedorF) {
    sqlPrime += ` AND TRIM(vendedor) = ?`;
    primeArgs.push(vendedorF);
  }

  const [vendasMes, primeMes] = await Promise.all([
    client.execute({ sql: sqlVendas, args: vendasArgs }),
    client.execute({ sql: sqlPrime, args: primeArgs }),
  ]);

  const porVendedor: Record<string, AccComissao> = {};

  const ensure = (v: string): AccComissao => {
    if (!porVendedor[v]) porVendedor[v] = emptyAccComissao();
    return porVendedor[v];
  };

  for (const row of vendasMes.rows) {
    if (isVendaCancelada(row.status)) continue;
    const valor = valorLinhaVenda(row);
    if (valor <= 0) continue;
    const ymd = dataYmd(row.data);
    if (!dataNoIntervalo(ymd, periodo.inicio, periodo.fim)) continue;

    const vendedor = String(row.vendedor || "—");
    const acc = ensure(vendedor);
    acc.valorTotal += valor;

    const bucket = classifyComissaoBucket(
      String(row.categoria || ""),
      String(row.subcategoria || "")
    );
    const com = valor * 0.05;
    if (bucket === "PHOTO") {
      acc.valorPhoto += valor;
      acc.comissaoPhoto += com;
    } else if (bucket === "TEMPO_EXTRA") {
      acc.valorTempoExtra += valor;
      acc.comissaoTempoExtra += com;
    } else if (bucket === "ESCAPE") {
      acc.valorEscape += valor;
      acc.comissaoEscape += com;
    } else if (bucket === "TRES_D") {
      acc.valor3d += valor;
      acc.comissao3d += com;
    } else if (bucket === "PRODUTOS") {
      acc.valorProdutos += valor;
      acc.comissaoProdutos += com;
    }
  }

  for (const row of primeMes.rows) {
    const ymd = dataYmd(row.data);
    if (!dataNoIntervalo(ymd, periodo.inicio, periodo.fim)) continue;
    const qt = Number(row.quantidade) || 0;
    if (qt <= 0) continue;

    const vendedor = String(row.vendedor || "—");
    const acc = ensure(vendedor);
    acc.qtdPrime += qt;
    acc.valorPrime += Number(row.valor) || 0;
    acc.comissaoPrime += qt * 1.0;
  }

  const linhas = Object.entries(porVendedor)
    .map(([v, obj]) => mapLinhaComissao(v, obj))
    .filter(
      (r) =>
        r.valorVendas > 0 ||
        r.comissaoPrime > 0 ||
        r.comissaoPhoto > 0 ||
        r.comissaoTempoExtra > 0 ||
        r.comissaoEscape > 0 ||
        r.comissao3d > 0 ||
        r.comissaoProdutos > 0
    )
    .sort((a, b) => b.comissaoTotal - a.comissaoTotal || b.valorVendas - a.valorVendas);

  const totaisAcc = emptyAccComissao();
  for (const obj of Object.values(porVendedor)) {
    totaisAcc.valorTotal += obj.valorTotal;
    totaisAcc.valorPhoto += obj.valorPhoto;
    totaisAcc.comissaoPhoto += obj.comissaoPhoto;
    totaisAcc.valorTempoExtra += obj.valorTempoExtra;
    totaisAcc.comissaoTempoExtra += obj.comissaoTempoExtra;
    totaisAcc.valorEscape += obj.valorEscape;
    totaisAcc.comissaoEscape += obj.comissaoEscape;
    totaisAcc.valor3d += obj.valor3d;
    totaisAcc.comissao3d += obj.comissao3d;
    totaisAcc.valorProdutos += obj.valorProdutos;
    totaisAcc.comissaoProdutos += obj.comissaoProdutos;
    totaisAcc.comissaoPrime += obj.comissaoPrime;
    totaisAcc.qtdPrime += obj.qtdPrime;
    totaisAcc.valorPrime += obj.valorPrime;
  }

  registrarLogConsulta(
    LOG_TIPO.CONSULTA_RELATORIO,
    { mes: mesYm, unidade: unidadeF, vendedor: vendedorF },
    "Relatorio comissao"
  );

  return {
    mes: mesYm,
    mesRotulo: periodo.rotulo,
    linhas,
    totais: mapLinhaComissao("TOTAL", totaisAcc),
  };
}

function rotuloBucketComissao(bucket: string): string {
  if (bucket === "PHOTO") return "PHOTO";
  if (bucket === "TEMPO_EXTRA") return "Tempo extra";
  if (bucket === "ESCAPE") return "Escape";
  if (bucket === "TRES_D") return "3D";
  if (bucket === "PRODUTOS") return "Produtos";
  if (bucket === "PRIME") return "PRIME";
  return "Sem comissão";
}

/** Detalhe das vendas/PRIME de um vendedor no mês (para bater conta na tela de comissão). */
export async function getDetalheComissaoVendedor(filtros: {
  mes?: string;
  unidade?: string;
  vendedor: string;
}) {
  const vendedor = normalizeText(filtros.vendedor);
  if (!vendedor) throw new Error("Informe o vendedor.");

  const mesYm = filtros.mes?.trim() || mesAtualISO();
  const periodo = parseMesFiltro(mesYm);
  const unidadeF = normalizeUpper(filtros.unidade || "");
  const client = getClient();

  const vendasArgs: (string | number)[] = [
    periodo.inicio,
    `${periodo.fim}T23:59:59.999Z`,
    vendedor,
  ];
  let sqlVendas = `SELECT id, data, unidade, sku, descricao, categoria, subcategoria,
                          quantidade, preco_unitario, subtotal_bruto, desconto, valor_recebido, status
                   FROM vendas
                   WHERE data >= ? AND data <= ?
                     AND TRIM(vendedor) = ?
                     AND coalesce(upper(status), '') != 'CANCELADO'`;
  if (unidadeF) {
    sqlVendas += ` AND UPPER(TRIM(unidade)) = ?`;
    vendasArgs.push(unidadeF);
  }
  sqlVendas += ` ORDER BY data, id`;

  const primeArgs: (string | number)[] = [
    periodo.inicio,
    `${periodo.fim}T23:59:59.999Z`,
    vendedor,
  ];
  let sqlPrime = `SELECT id, data, unidade, item, quantidade, valor
                  FROM prime_vendas
                  WHERE data >= ? AND data <= ?
                    AND TRIM(vendedor) = ?
                    AND coalesce(upper(status), '') != 'CANCELADO'`;
  if (unidadeF) {
    sqlPrime += ` AND UPPER(TRIM(unidade)) = ?`;
    primeArgs.push(unidadeF);
  }
  sqlPrime += ` ORDER BY data, id`;

  const [vendasMes, primeMes] = await Promise.all([
    client.execute({ sql: sqlVendas, args: vendasArgs }),
    client.execute({ sql: sqlPrime, args: primeArgs }),
  ]);

  const linhas: Array<{
    id: string;
    tipo: "venda" | "prime";
    data: string;
    dataFmt: string;
    unidade: string;
    sku: string;
    item: string;
    quantidade: number;
    valor: number;
    bucket: string;
    bucketRotulo: string;
    comissao: number;
  }> = [];

  for (const row of vendasMes.rows) {
    if (isVendaCancelada(row.status)) continue;
    const ymd = dataYmd(row.data);
    if (!dataNoIntervalo(ymd, periodo.inicio, periodo.fim)) continue;
    const valor = valorLinhaVenda(row);
    const bucket = classifyComissaoBucket(
      String(row.categoria || ""),
      String(row.subcategoria || "")
    );
    const comissavel = Boolean(bucket);
    linhas.push({
      id: `v-${row.id}`,
      tipo: "venda",
      data: ymd,
      dataFmt: formatDataHoraBR(row.data),
      unidade: String(row.unidade || ""),
      sku: String(row.sku || ""),
      item: String(row.descricao || row.sku || ""),
      quantidade: Number(row.quantidade) || 0,
      valor,
      bucket: bucket || "",
      bucketRotulo: rotuloBucketComissao(bucket || ""),
      comissao: comissavel ? Number((valor * 0.05).toFixed(2)) : 0,
    });
  }

  for (const row of primeMes.rows) {
    const ymd = dataYmd(row.data);
    if (!dataNoIntervalo(ymd, periodo.inicio, periodo.fim)) continue;
    const qt = Number(row.quantidade) || 0;
    if (qt <= 0) continue;
    const valor = Number(row.valor) || 0;
    linhas.push({
      id: `p-${row.id}`,
      tipo: "prime",
      data: ymd,
      dataFmt: formatDataHoraBR(row.data),
      unidade: String(row.unidade || ""),
      sku: "",
      item: String(row.item || "PRIME"),
      quantidade: qt,
      valor,
      bucket: "PRIME",
      bucketRotulo: "PRIME",
      comissao: Number((qt * 1).toFixed(2)),
    });
  }

  linhas.sort((a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id));

  const totais = {
    quantidade: linhas.reduce((s, l) => s + l.quantidade, 0),
    valor: Number(linhas.reduce((s, l) => s + l.valor, 0).toFixed(2)),
    comissao: Number(linhas.reduce((s, l) => s + l.comissao, 0).toFixed(2)),
  };

  registrarLogConsulta(
    LOG_TIPO.CONSULTA_RELATORIO,
    { mes: mesYm, unidade: unidadeF, vendedor, tipo: "comissao-detalhe" },
    "Detalhe comissao vendedor"
  );

  return {
    mes: mesYm,
    mesRotulo: periodo.rotulo,
    vendedor,
    linhas,
    totais,
  };
}

/** Pódio = mês anterior ao selecionado; disputa = mês selecionado. */
export async function getVendaMalucaMesPassado(filtros?: { unidade?: string; mes?: string }) {
  const mesDisputa = filtros?.mes || mesAtualISO();
  const mesPodio = mesAnteriorDe(mesDisputa);
  const unidade = normalizeText(filtros?.unidade || "");

  const [podio, disputa] = await Promise.all([
    rankingsMalucaDoMes(mesPodio, unidade || undefined),
    rankingsMalucaDoMes(mesDisputa, unidade || undefined),
  ]);

  registrarLogConsulta(
    LOG_TIPO.CONSULTA_RELATORIO,
    { mesPodio, mesDisputa, unidade: unidade || null },
    "Venda Maluca"
  );

  return {
    mes: mesPodio,
    mesRotulo: podio.periodo.rotulo,
    mesDisputa,
    mesDisputaRotulo: disputa.periodo.rotulo,
    unidade: unidade || "",
    topProdutos: podio.rankingProdutos.slice(0, 3),
    topPhotos: podio.rankingPhotos.slice(0, 3),
    topPrime: podio.rankingPrime.slice(0, 3),
    topConstancia: podio.rankingConstancia.slice(0, 3),
    disputaProdutos: disputa.rankingProdutos,
    disputaPhotos: disputa.rankingPhotos,
    disputaPrime: disputa.rankingPrime,
    disputaConstancia: disputa.rankingConstancia,
  };
}
