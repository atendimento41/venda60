export function formatMoeda(valor: number): string {
  return Number(valor || 0).toFixed(2).replace(".", ",");
}

export function formatMoedaOuNull(valor: number | null | undefined): string {
  if (valor == null) return "—";
  return formatMoeda(valor);
}
