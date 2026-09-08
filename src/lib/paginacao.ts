export type PaginaResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export function normalizarPagina(raw: unknown, padrao = 1): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : padrao;
}

export function normalizarPageSize(raw: unknown, padrao = 50, max = 100): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return padrao;
  return Math.min(Math.floor(n), max);
}

export function montarPaginaResult<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number
): PaginaResult<T> {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return {
    items,
    page,
    pageSize,
    total,
    totalPages,
  };
}
