import { db } from "@/db";
import { logOperacoes } from "@/db/schema";
import { lt } from "drizzle-orm";
import { getSessao } from "@/lib/auth-api";
import {
  agoraISO,
  dataYmd,
  formatDataHoraBR,
  getOperador,
  LOG_RETENTION_DAYS,
  normalizeText,
  normalizeUpper,
} from "./utils";
import {
  montarPaginaResult,
  normalizarPagina,
  normalizarPageSize,
} from "./paginacao";

async function operadorDaSessao(): Promise<string | null> {
  try {
    const sessao = await getSessao();
    if (sessao?.login) return `${sessao.nome} (${sessao.login})`;
  } catch {
    /* fora de request HTTP */
  }
  return null;
}

/** Operador para movimentos e logs: sessão logada ou fallback de ambiente. */
export async function operadorAtual(): Promise<string> {
  return (await operadorDaSessao()) || getOperador();
}

let ultimaLimpezaLogs = 0;

export async function registrarLog(
  tipo: string,
  dados: unknown,
  sucesso: boolean,
  mensagem: string,
  operador?: string
) {
  try {
    const quem = operador || (await operadorDaSessao()) || getOperador();
    await db.insert(logOperacoes).values({
      dataHora: agoraISO(),
      operador: quem,
      tipo,
      sucesso,
      dados: JSON.stringify(dados ?? {}),
      mensagem: mensagem.slice(0, 500),
    });
    // Limpeza só a cada 6h — evita DELETE em toda consulta/escrita
    const agora = Date.now();
    if (agora - ultimaLimpezaLogs > 6 * 60 * 60 * 1000) {
      ultimaLimpezaLogs = agora;
      void limparLogsExpirados();
    }
  } catch {
    /* log não deve quebrar operação principal */
  }
}

/** Consultas: registra sem atrasar a resposta da API. */
export function registrarLogConsulta(
  tipo: string,
  dados: unknown,
  mensagem: string
) {
  void registrarLog(tipo, dados, true, mensagem);
}

export async function limparLogsExpirados() {
  const limite = new Date();
  limite.setDate(limite.getDate() - LOG_RETENTION_DAYS);
  await db
    .delete(logOperacoes)
    .where(lt(logOperacoes.dataHora, limite.toISOString()));
}

export const LOG_TIPO = {
  LANCAMENTO_VENDA: "LANCAMENTO_VENDA",
  LANCAMENTO_PRIME: "LANCAMENTO_PRIME",
  CANCELAMENTO_VENDA: "CANCELAMENTO_VENDA",
  CANCELAMENTO_PRIME: "CANCELAMENTO_PRIME",
  EDICAO_DATA_VENDA: "EDICAO_DATA_VENDA",
  EDICAO_VENDA: "EDICAO_VENDA",
  CADASTRO_ITEM: "CADASTRO_ITEM",
  ESTOQUE_CADASTRO: "ESTOQUE_CADASTRO",
  ESTOQUE_AJUSTE: "ESTOQUE_AJUSTE",
  ESTOQUE_DEFINIR: "ESTOQUE_DEFINIR",
  CONSULTA_RELATORIO: "CONSULTA_RELATORIO",
  CONSULTA_ESTOQUE: "CONSULTA_ESTOQUE",
  CONSULTA_SAIDAS_MENSAL: "CONSULTA_SAIDAS_MENSAL",
  CONSULTA_UNIK: "CONSULTA_UNIK",
  CONSULTA_VENDAS: "CONSULTA_VENDAS",
  LANCAMENTO_UNIK: "LANCAMENTO_UNIK",
  CADASTRO_VENDEDOR: "CADASTRO_VENDEDOR",
  EDICAO_VENDEDOR: "EDICAO_VENDEDOR",
} as const;

function formatarReferencia(dados: string | null): string {
  if (!dados) return "—";
  try {
    const j = JSON.parse(dados);
    const s = typeof j === "string" ? j : JSON.stringify(j);
    return s.length > 180 ? s.slice(0, 177) + "…" : s;
  } catch {
    const s = String(dados);
    return s.length > 180 ? s.slice(0, 177) + "…" : s;
  }
}

export async function listarLogs(filtros: {
  tipo?: string;
  operador?: string;
  dataInicio?: string;
  dataFim?: string;
  limit?: number;
  page?: number;
  pageSize?: number;
}) {
  const page = normalizarPagina(filtros.page);
  const pageSize = normalizarPageSize(filtros.pageSize, 50, 100);
  const client = (await import("@/db")).getClient();

  const where: string[] = ["1=1"];
  const args: unknown[] = [];
  const tipo = normalizeText(filtros.tipo);
  const operadorQ = normalizeUpper(filtros.operador);

  if (tipo) {
    where.push("tipo = ?");
    args.push(tipo);
  }
  if (operadorQ) {
    where.push("upper(operador) LIKE ?");
    args.push(`%${operadorQ}%`);
  }
  if (filtros.dataInicio) {
    where.push("substring(data_hora from 1 for 10) >= ?");
    args.push(filtros.dataInicio);
  }
  if (filtros.dataFim) {
    where.push("substring(data_hora from 1 for 10) <= ?");
    args.push(filtros.dataFim);
  }

  const whereSql = where.join(" AND ");
  const countRs = await client.execute({
    sql: `SELECT count(*)::int AS c FROM log_operacoes WHERE ${whereSql}`,
    args,
  });
  const total = Number(countRs.rows[0]?.c) || 0;

  const offset = (page - 1) * pageSize;
  const result = await client.execute({
    sql: `SELECT id, data_hora, operador, tipo, sucesso, dados, mensagem
          FROM log_operacoes
          WHERE ${whereSql}
          ORDER BY id DESC
          LIMIT ? OFFSET ?`,
    args: [...args, pageSize, offset],
  });

  const meta = await client.execute(
    `SELECT DISTINCT tipo FROM log_operacoes ORDER BY tipo LIMIT 80`
  );
  const ops = await client.execute(
    `SELECT DISTINCT operador FROM log_operacoes WHERE operador IS NOT NULL AND operador != '' ORDER BY operador LIMIT 80`
  );

  const tiposSet = new Set<string>([...Object.values(LOG_TIPO), ...meta.rows.map((r) => String(r.tipo))]);
  const operadores = ops.rows.map((r) => String(r.operador)).filter(Boolean);

  const linhas = result.rows.map((r) => ({
    id: Number(r.id),
    dataHora: formatDataHoraBR(r.data_hora),
    operador: String(r.operador || "—"),
    tipo: String(r.tipo),
    descricao: String(r.mensagem || ""),
    referencia: formatarReferencia(r.dados == null ? null : String(r.dados)),
    sucesso: Boolean(r.sucesso),
  }));

  return {
    ...montarPaginaResult(linhas, total, page, pageSize),
    linhas,
    tipos: [...tiposSet].sort((a, b) => a.localeCompare(b, "pt-BR")),
    operadores: operadores.sort((a, b) => a.localeCompare(b, "pt-BR")),
  };
}
