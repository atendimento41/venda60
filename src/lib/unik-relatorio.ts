/** Texto explicativo do relatório UNIK · vendas (tela e PDF). */
export const PRECEDENCIA_CUSTO_UNIK = "Custo UNIK = cadastro do item (campo custo).";

export const FORMULA_RELATORIO_VENDAS_UNIK = [
  "Custo 60 = 12% do valor de venda (unitário).",
  "Custo UNIK = cadastro do item (unitário).",
  "Receber UNIK = ((valor venda − custo 60 − custo UNIK) ÷ 2 + custo UNIK) × quantidade.",
  "Receber 60 = ((valor venda − custo 60 − custo UNIK) ÷ 2 + custo 60) × quantidade.",
] as const;

export function textoFormulaRelatorioVendasUnik(): string {
  return `${PRECEDENCIA_CUSTO_UNIK} ${FORMULA_RELATORIO_VENDAS_UNIK.join(" ")}`;
}
