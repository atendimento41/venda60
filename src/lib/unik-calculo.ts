/** Cálculo do relatório UNIK · vendas (fonte única para tela, API e testes). */

import { normalizeUpper } from "./utils";

function chaveNomeUnik(s: unknown): string {
  return normalizeUpper(s).replace(/\s+/g, " ").trim();
}

export function roundMoney(n: number): number {
  return Number((Number(n) || 0).toFixed(2));
}

export const CUSTO_60_PERCENTUAL = 0.12;

/** 12% do valor de venda unitário. */
export function custo60Unitario(valorVenda: number): number {
  return roundMoney(valorVenda * CUSTO_60_PERCENTUAL);
}

/** 12% do total (unitário × quantidade). */
export function custo60DaVenda(valorVenda: number, qtd: number): number {
  return roundMoney(custo60Unitario(valorVenda) * (Number(qtd) || 1));
}

/**
 * Precedência do custo UNIK unitário (lançamentos / outras telas):
 * 1. Lançamento UNIK · 2. Cadastro do item · 3. null
 */
export function resolverCustoUnikUnitario(
  custoLancamento?: number | null,
  custoCadastro?: number | null
): number | null {
  const lanc = Number(custoLancamento) || 0;
  if (lanc > 0) return roundMoney(lanc);
  const cad = Number(custoCadastro) || 0;
  if (cad > 0) return roundMoney(cad);
  return null;
}

/** Custo UNIK unitário no relatório de vendas: somente cadastro do item. */
export function custoUnikRelatorioVendas(custoCadastro?: number | null): number | null {
  const cad = Number(custoCadastro) || 0;
  return cad > 0 ? roundMoney(cad) : null;
}

export function unitCustoLancamento(custoTotal: number, qtdEnt: number): number {
  const c = Number(custoTotal) || 0;
  if (c <= 0) return 0;
  const q = Number(qtdEnt) || 1;
  return q > 1 ? roundMoney(c / q) : c;
}

/**
 * Preço unitário da encomenda: maior entre custo e sugestão de venda.
 * Valor final = esse preço × quantidade.
 */
export function precoUnitarioEncomenda(custo: number, sugestaoVenda: number): number {
  return roundMoney(Math.max(Number(custo) || 0, Number(sugestaoVenda) || 0));
}

export function valorFinalEncomenda(
  custo: number,
  sugestaoVenda: number,
  quantidade: number
): number {
  const qtd = Number(quantidade) || 1;
  return roundMoney(precoUnitarioEncomenda(custo, sugestaoVenda) * qtd);
}

/**
 * Custo unitário gravado no lançamento UNIK.
 * Entrega/retirada: campo custo já é por unidade.
 * Encomenda: campo custo é o total do lançamento.
 */
export function custoUnitarioLancamento(
  custo: number,
  quantidade: number,
  encomenda = false
): number {
  const c = Number(custo) || 0;
  if (c <= 0) return 0;
  const q = Number(quantidade) || 1;
  if (encomenda) return unitCustoLancamento(c, q);
  return roundMoney(c);
}

/** Maior custo unitário e maior sugestão entre lançamentos de um SKU. */
export function maxCustoSugestaoDeLancamentos(
  sku: string,
  linhas: Array<{
    sku?: string | null;
    nome?: string | null;
    custo?: number | null;
    quantidade?: number | null;
    sugestaoVenda?: number | null;
    status?: string | null;
    tipo?: string | null;
    encomenda?: boolean;
  }>,
  skuPorNomeChave?: Record<string, string>
): { custo: number; sugestaoVenda: number } {
  const alvo = String(sku || "")
    .trim()
    .toUpperCase();
  if (!alvo) return { custo: 0, sugestaoVenda: 0 };

  let maxCusto = 0;
  let maxSugestao = 0;
  for (const row of linhas) {
    if (row.encomenda) continue;
    const nome = String(row.nome || "").trim();
    const chave = chaveNomeUnik(nome);
    const skuRow =
      String(row.sku || "")
        .trim()
        .toUpperCase() || (chave && skuPorNomeChave?.[chave] ? String(skuPorNomeChave[chave]).toUpperCase() : "");
    if (skuRow !== alvo) continue;
    const unit = custoUnitarioLancamento(
      Number(row.custo) || 0,
      Number(row.quantidade) || 1,
      Boolean(row.encomenda)
    );
    if (unit > maxCusto) maxCusto = unit;
    const sug = Number(row.sugestaoVenda) || 0;
    if (sug > maxSugestao) maxSugestao = sug;
  }
  return { custo: maxCusto, sugestaoVenda: maxSugestao };
}

export type LinhaCalculoUnikInput = {
  quantidade: number;
  valorVenda: number;
  totalVendido?: number;
  /** Custo UNIK unitário (campo custo do item). */
  custoUnik: number | null;
};

export type LinhaCalculoUnik = {
  totalVendido: number;
  custoUnik: number | null;
  custo60: number;
  resultado: number;
  receberUnik: number;
  receber60: number;
};

/**
 * Calcula por unidade e multiplica pela quantidade no final.
 * custo 60 = 12% do valor venda
 * receber UNIK = (valor venda − custo 60 − custo UNIK) ÷ 2 + custo UNIK
 * receber 60 = (valor venda − custo 60 − custo UNIK) ÷ 2 + custo 60
 */
export function calcularLinhaRelatorioUnik(input: LinhaCalculoUnikInput): LinhaCalculoUnik {
  const qtd = Number(input.quantidade) || 1;
  const valorVenda = roundMoney(input.valorVenda);
  const totalVendido = roundMoney(input.totalVendido ?? qtd * valorVenda);

  const custoUnikUnit = input.custoUnik != null ? roundMoney(input.custoUnik) : null;
  const custoUnikUnitNum = custoUnikUnit ?? 0;

  const custo60Unit = custo60Unitario(valorVenda);
  const resultadoUnit = roundMoney(valorVenda - custo60Unit - custoUnikUnitNum);
  const receberUnikUnit = roundMoney(resultadoUnit / 2 + custoUnikUnitNum);
  const receber60Unit = roundMoney(resultadoUnit / 2 + custo60Unit);

  const custo60 = roundMoney(custo60Unit * qtd);
  const custoUnik = custoUnikUnit != null ? roundMoney(custoUnikUnit * qtd) : null;
  const resultado = roundMoney(resultadoUnit * qtd);
  const receberUnik = roundMoney(receberUnikUnit * qtd);
  const receber60 = roundMoney(receber60Unit * qtd);

  return { totalVendido, custoUnik, custo60, resultado, receberUnik, receber60 };
}

/** Listagens: não enviar base64 no JSON — use lib/foto.ts */
export { fotoUrlParaListagem } from "./foto";
