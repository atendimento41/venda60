export const APP_BUILD = "2026.08.22-vercel-v1";
export const UNIDADES_PADRAO = ["PKS", "SSU", "PIER 21", "TGS"] as const;
export const LOG_RETENTION_DAYS = 30;

import { formatMoeda as formatMoedaShared, formatMoedaOuNull } from "./format";
export { formatMoedaOuNull };

export function normalizeText(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

export function normalizeUpper(value: unknown): string {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

export function parsePreco(valor: unknown): number {
  if (valor == null || valor === "") return 0;
  if (typeof valor === "number") return isNaN(valor) ? 0 : valor;
  let s = String(valor)
    .trim()
    .replace(/R\$/gi, "")
    .replace(/\$/g, "")
    .replace(/\s/g, "")
    .replace(/[^\d,.-]/g, "");
  s = s.replace(/\./g, "").replace(/,/g, ".");
  const num = parseFloat(s);
  return isNaN(num) ? 0 : num;
}

export function formatMoeda(valor: number): string {
  return formatMoedaShared(valor);
}

const DEFAULT_TZ = "America/Sao_Paulo";

export function getAppTimezone(): string {
  const raw = String(process.env.APP_TIMEZONE || "").trim();
  if (!raw || raw.startsWith(":") || raw === "UTC" || raw.toUpperCase() === ":UTC") {
    return DEFAULT_TZ;
  }
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: raw }).format(new Date());
    return raw;
  } catch {
    return DEFAULT_TZ;
  }
}

export function hojeISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: getAppTimezone() }).format(new Date());
}

/** YYYY-MM-DD even if the field stores a full datetime. */
export function dataYmd(value: unknown): string {
  const s = String(value || "").trim();
  if (!s) return "";
  const local = /^(\d{4}-\d{2}-\d{2})T/.exec(s);
  if (local && !s.endsWith("Z") && !/[+-]\d{2}:\d{2}$/.test(s)) return local[1];
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}/.test(s) && (s.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(s))) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      return new Intl.DateTimeFormat("en-CA", { timeZone: getAppTimezone() }).format(d);
    }
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: getAppTimezone() }).format(d);
  }
  return s.slice(0, 10);
}

export function formatDataHoraBR(value: unknown): string {
  const s = String(value || "").trim();
  if (!s) return "—";
  const local = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(s);
  if (local && !s.endsWith("Z") && !/[+-]\d{2}:\d{2}$/.test(s)) {
    return `${local[3]}/${local[2]}/${local[1]}, ${local[4]}:${local[5]}:${local[6]}`;
  }
  if (s.includes("T") || (s.length > 10 && s.includes(":"))) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      return new Intl.DateTimeFormat("pt-BR", {
        timeZone: getAppTimezone(),
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(d);
    }
  }
  const ymd = dataYmd(s);
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    const [y, m, day] = ymd.split("-");
    return `${day}/${m}/${y}`;
  }
  return s;
}

export function agoraISO(): string {
  return dataHoraAppISO();
}

/** Data/hora atual no fuso da app (YYYY-MM-DDTHH:mm:ss.sss, sem Z — horário de São Paulo). */
export function dataHoraAppISO(d: Date = new Date()): string {
  const tz = getAppTimezone();
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
    hour12: false,
  })
    .format(d)
    .replace(" ", "T")
    .replace(/,(\d{3})$/, ".$1");
}

/**
 * Normaliza data de venda para horário da app (São Paulo), sem sufixo Z/UTC.
 */
export function normalizarDataVendaISO(value?: string | Date | null): string {
  if (value instanceof Date && !isNaN(value.getTime())) return dataHoraAppISO(value);
  const s = String(value ?? "").trim();
  if (!s) return agoraISO();
  if (s.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(s)) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return dataHoraAppISO(d);
  }
  const local = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?)$/.exec(s);
  if (local) return local[1];
  if (s.includes("T") || /\d{1,2}:\d{2}/.test(s)) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return dataHoraAppISO(d);
  }
  const ymd = dataYmd(s);
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return `${ymd}T12:00:00.000`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return dataHoraAppISO(d);
  return agoraISO();
}

export function mesAtualISO(): string {
  return hojeISO().slice(0, 7);
}

/** YYYY-MM do mês anterior ao atual (timezone app). */
export function mesPassadoISO(): string {
  return mesAnteriorDe(mesAtualISO());
}

/** YYYY-MM do mês anterior ao informado. */
export function mesAnteriorDe(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function isVendaCancelada(status: string | null | undefined): boolean {
  return normalizeUpper(status) === "CANCELADO";
}

/** Valor efetivo da linha de venda (prioriza subtotal − desconto quando subtotal > 0). */
export function valorLinhaVenda(row: {
  subtotal_bruto?: unknown;
  desconto?: unknown;
  valor_recebido?: unknown;
}): number {
  const subtotal = Number(row.subtotal_bruto) || 0;
  const desconto = Number(row.desconto) || 0;
  if (subtotal > 0) return Math.max(0, subtotal - desconto);
  return Number(row.valor_recebido) || 0;
}

export function parseMesFiltro(ym: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(ym).trim());
  if (!m) throw new Error("Mês inválido.");
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) throw new Error("Mês inválido.");
  const ultimoDia = new Date(ano, mes, 0).getDate();
  const inicio = `${m[1]}-${m[2]}-01`;
  const fim = `${m[1]}-${m[2]}-${String(ultimoDia).padStart(2, "0")}`;
  return {
    ano,
    mes,
    inicio,
    fim,
    rotulo: `${m[2]}/${m[1]}`,
    mesCorrente: ym === mesAtualISO(),
  };
}

export function dataNoIntervalo(data: string, inicio: string, fim: string): boolean {
  return data >= inicio && data <= fim;
}

export type ComissaoBucket =
  | "TEMPO_EXTRA"
  | "PHOTO"
  | "ESCAPE"
  | "PRODUTOS"
  | "TRES_D"
  | "";

/**
 * Comissão 5%: TEMPO EXTRA / PHOTO / ESCAPE / 3D / PRODUTOS.
 * Aceita os dois campos em qualquer ordem (CSV e cadastro trocam meep/dash).
 * "ESCAPE PHOTO" conta como PHOTO (produto fotográfico), não como ESCAPE.
 */
export function classifyComissaoBucket(
  categoriaE: string,
  subcategoriaF: string
): ComissaoBucket {
  const a = normalizeUpper(categoriaE);
  const b = normalizeUpper(subcategoriaF);
  const fields = [a, b].filter(Boolean);

  if (fields.some((f) => f.includes("TEMPO EXTRA"))) return "TEMPO_EXTRA";
  // PHOTO: rótulo PHOTO, "PHOTO …" ou "ESCAPE PHOTO" (produto fotográfico)
  if (
    fields.some(
      (f) =>
        f === "PHOTO" ||
        f.startsWith("PHOTO ") ||
        f === "ESCAPE PHOTO" ||
        f.endsWith(" PHOTO") ||
        f.includes("ESCAPE PHOTO")
    )
  ) {
    return "PHOTO";
  }
  if (fields.some((f) => f === "ESCAPE" || (f.includes("ESCAPE") && !f.includes("PHOTO"))))
    return "ESCAPE";
  // 3D antes de PRODUTOS (ex.: UNIK 3D + PRODUTOS)
  if (fields.some((f) => f === "3D" || f.includes("3D"))) return "TRES_D";
  if (fields.some((f) => f.includes("PRODUTOS"))) return "PRODUTOS";
  return "";
}

/** PHOTO (rótulo exato) não controla quantidade de estoque. */
export function itemEstoqueIlimitado(categoria: unknown, subcategoria: unknown): boolean {
  const fields = [normalizeUpper(categoria), normalizeUpper(subcategoria)].filter(Boolean);
  return fields.some((f) => f === "PHOTO" || f.startsWith("PHOTO "));
}

export function getOperador(): string {
  return process.env.DEFAULT_OPERADOR || "sistema@local";
}

/** Calendar-date arithmetic on YYYY-MM-DD (timezone-independent). */
export function subtrairDiasYmd(ymd: string, dias: number): string {
  const [y, m, d] = String(ymd).slice(0, 10).split("-").map(Number);
  const utc = Date.UTC(y, (m || 1) - 1, d || 1) - Math.max(0, dias) * 86400000;
  const dt = new Date(utc);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

export function adicionarDiasYmd(ymd: string, dias: number): string {
  const [y, m, d] = String(ymd).slice(0, 10).split("-").map(Number);
  const utc = Date.UTC(y, (m || 1) - 1, d || 1) + Math.max(0, dias) * 86400000;
  const dt = new Date(utc);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Margem SQL para filtrar dias no fuso da app.
 * Vendas gravadas em UTC (toISOString) podem cair no dia seguinte em UTC
 * mesmo sendo do dia correto em America/Sao_Paulo — ampliamos ±1 dia e filtramos com dataYmd.
 */
export function sqlMargemDiaApp(inicio: string, fim: string): { sqlInicio: string; sqlFim: string } {
  const i = String(inicio).slice(0, 10);
  const f = String(fim).slice(0, 10);
  return {
    sqlInicio: `${subtrairDiasYmd(i, 1)}T00:00:00.000Z`,
    sqlFim: `${adicionarDiasYmd(f, 1)}T23:59:59.999Z`,
  };
}
