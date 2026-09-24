import { db } from "@/db";
import { solicitacoesEdicao, vendas, primeVendas } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import {
  agoraISO,
  formatDataHoraBR,
  isVendaCancelada,
  normalizeText,
  normalizeUpper,
} from "@/lib/utils";
import { LOG_TIPO, operadorAtual, registrarLog } from "@/lib/log";
import { ensureSolicitacoesEdicaoSchema } from "@/lib/ensure-schema";
import { atualizarVenda } from "@/services/vendas";
import {
  atualizarPrime,
  getNivelPrime,
  valorVendaPrime,
} from "@/services/prime";
import { obterVendedorPorIdOuNome } from "@/services/vendedores";

export type TipoSolicitacao = "VENDA" | "PRIME";
export type StatusSolicitacao = "PENDENTE" | "APROVADA" | "RECUSADA" | "CANCELADA";

export type ValoresVendaPropostos = {
  data: string;
  idVendedor: string;
  vendedor: string;
  valorRecebido: number;
};

export type ValoresPrimePropostos = {
  data: string;
  idVendedor: string;
  vendedor: string;
  item: string;
  quantidade: number;
};

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function mapRow(row: typeof solicitacoesEdicao.$inferSelect) {
  return {
    id: row.id,
    tipo: row.tipo as TipoSolicitacao,
    registroId: row.registroId,
    unidade: row.unidade || "",
    valoresAtual: parseJson<Record<string, unknown>>(row.valoresAtual, {}),
    valoresPropostos: parseJson<Record<string, unknown>>(row.valoresPropostos, {}),
    motivo: row.motivo,
    status: row.status as StatusSolicitacao,
    solicitadoPor: row.solicitadoPor,
    solicitadoEm: row.solicitadoEm,
    solicitadoEmFmt: formatDataHoraBR(row.solicitadoEm),
    decididoPor: row.decididoPor || "",
    decididoEm: row.decididoEm || "",
    decididoEmFmt: row.decididoEm ? formatDataHoraBR(row.decididoEm) : "",
    obsDecisao: row.obsDecisao || "",
    mudancas: parseJson<Array<{ campo: string; de: string; para: string }>>(row.mudancas, []),
  };
}

async function snapshotVenda(registroId: number) {
  const [row] = await db.select().from(vendas).where(eq(vendas.id, registroId));
  if (!row) throw new Error("Venda não encontrada.");
  if (isVendaCancelada(row.status)) throw new Error("Venda cancelada não pode ser editada.");
  const raw = String(row.data || "").trim();
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/.exec(raw);
  return {
    unidade: row.unidade || "",
    atual: {
      data: m ? m[1] : raw.slice(0, 16),
      dataHora: formatDataHoraBR(row.data),
      idVendedor: String(row.idVendedor || ""),
      vendedor: String(row.vendedor || ""),
      valorRecebido: Number(row.valorRecebido) || 0,
      item: String(row.descricao || row.sku || ""),
    } satisfies ValoresVendaPropostos & { dataHora: string; item: string },
  };
}

async function snapshotPrime(registroId: number) {
  const [row] = await db.select().from(primeVendas).where(eq(primeVendas.id, registroId));
  if (!row) throw new Error("Lançamento PRIME não encontrado.");
  if (isVendaCancelada(row.status)) throw new Error("PRIME cancelado não pode ser editado.");
  const raw = String(row.data || "").trim();
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/.exec(raw);
  const nivel = row.nivel || getNivelPrime(row.item) || "";
  return {
    unidade: row.unidade || "",
    atual: {
      data: m ? m[1] : raw.slice(0, 16),
      dataHora: formatDataHoraBR(row.data),
      idVendedor: String(row.idVendedor || ""),
      vendedor: String(row.vendedor || ""),
      item: nivel || row.item,
      quantidade: row.quantidade,
      valorRecebido: valorVendaPrime(row.quantidade, nivel || row.item),
    } satisfies ValoresPrimePropostos & { dataHora: string; valorRecebido: number },
  };
}

export async function criarSolicitacaoEdicao(
  input: {
    tipo: string;
    registroId: number;
    motivo: string;
    data?: string;
    idVendedor?: string;
    vendedor?: string;
    valorRecebido?: number | string;
    item?: string;
    quantidade?: number | string;
  },
  operador?: string
) {
  await ensureSolicitacoesEdicaoSchema();
  const tipo = normalizeUpper(input.tipo) as TipoSolicitacao;
  if (tipo !== "VENDA" && tipo !== "PRIME") throw new Error("Tipo inválido (VENDA ou PRIME).");
  const registroId = Number(input.registroId);
  if (!Number.isFinite(registroId) || registroId <= 0) throw new Error("Registro inválido.");
  const motivo = normalizeText(input.motivo);
  if (motivo.length < 10) {
    throw new Error("Informe o motivo da solicitação (mínimo 10 caracteres).");
  }

  const quem = normalizeText(operador) || (await operadorAtual());

  const [pendente] = await db
    .select()
    .from(solicitacoesEdicao)
    .where(
      and(
        eq(solicitacoesEdicao.tipo, tipo),
        eq(solicitacoesEdicao.registroId, registroId),
        eq(solicitacoesEdicao.status, "PENDENTE")
      )
    )
    .limit(1);
  if (pendente) {
    throw new Error(`Já existe solicitação pendente #${pendente.id} para este registro.`);
  }

  let unidade = "";
  let valoresAtual: Record<string, unknown> = {};
  let valoresPropostos: Record<string, unknown> = {};

  if (tipo === "VENDA") {
    const snap = await snapshotVenda(registroId);
    unidade = snap.unidade;
    valoresAtual = {
      data: snap.atual.data,
      idVendedor: snap.atual.idVendedor,
      vendedor: snap.atual.vendedor,
      valorRecebido: snap.atual.valorRecebido,
      item: snap.atual.item,
      dataHora: snap.atual.dataHora,
    };
    if (!input.data?.trim()) throw new Error("Informe a data e hora propostas.");
    const vend = await obterVendedorPorIdOuNome(input.idVendedor, input.vendedor);
    if (!vend) throw new Error("Selecione o vendedor.");
    if (!vend.ativo) throw new Error("Vendedor inativo.");
    const valorRaw = input.valorRecebido;
    if (valorRaw == null || String(valorRaw).trim() === "") throw new Error("Informe o valor.");
    const valorNovo = Number(String(valorRaw).replace(",", "."));
    if (!Number.isFinite(valorNovo) || valorNovo < 0) throw new Error("Valor inválido.");
    valoresPropostos = {
      data: normalizeText(input.data),
      idVendedor: vend.id,
      vendedor: vend.nome,
      valorRecebido: Math.round(valorNovo * 100) / 100,
    };
  } else {
    const snap = await snapshotPrime(registroId);
    unidade = snap.unidade;
    valoresAtual = {
      data: snap.atual.data,
      idVendedor: snap.atual.idVendedor,
      vendedor: snap.atual.vendedor,
      item: snap.atual.item,
      quantidade: snap.atual.quantidade,
      valorRecebido: snap.atual.valorRecebido,
      dataHora: snap.atual.dataHora,
    };
    if (!input.data?.trim()) throw new Error("Informe a data e hora propostas.");
    const vend = await obterVendedorPorIdOuNome(input.idVendedor, input.vendedor);
    if (!vend) throw new Error("Selecione o vendedor.");
    if (!vend.ativo) throw new Error("Vendedor inativo.");
    const item = normalizeText(input.item);
    if (!item || !getNivelPrime(item)) {
      throw new Error("Item PRIME inválido (use ELITE, PLATINA ou OURO).");
    }
    const qtd = Math.floor(Number(String(input.quantidade ?? "").replace(",", ".")));
    if (!Number.isFinite(qtd) || qtd <= 0) throw new Error("Quantidade inválida.");
    valoresPropostos = {
      data: normalizeText(input.data),
      idVendedor: vend.id,
      vendedor: vend.nome,
      item,
      quantidade: qtd,
    };
  }

  const [inserted] = await db
    .insert(solicitacoesEdicao)
    .values({
      tipo,
      registroId,
      unidade,
      valoresAtual: JSON.stringify(valoresAtual),
      valoresPropostos: JSON.stringify(valoresPropostos),
      motivo,
      status: "PENDENTE",
      solicitadoPor: quem,
      solicitadoEm: agoraISO(),
    })
    .returning({ id: solicitacoesEdicao.id });

  const id = inserted?.id;
  await registrarLog(
    LOG_TIPO.SOLICITACAO_EDICAO,
    {
      id,
      tipo,
      registroId,
      solicitadoPor: quem,
      motivo,
      valoresAtual,
      valoresPropostos,
    },
    true,
    `Solicitação #${id} ${tipo} #${registroId} por ${quem}: ${motivo}`
  );

  return {
    ok: true,
    message: `Solicitação #${id} enviada. Aguardando aprovação.`,
    id,
  };
}

export async function listarMinhasSolicitacoes(solicitante: string, tipo?: string) {
  await ensureSolicitacoesEdicaoSchema();
  const quem = normalizeText(solicitante);
  const rows = await db
    .select()
    .from(solicitacoesEdicao)
    .orderBy(desc(solicitacoesEdicao.id))
    .limit(200);
  const tipoF = tipo ? normalizeUpper(tipo) : "";
  return rows
    .filter((r) => normalizeText(r.solicitadoPor) === quem)
    .filter((r) => !tipoF || normalizeUpper(r.tipo) === tipoF)
    .slice(0, 100)
    .map(mapRow);
}

export async function listarSolicitacoesPendentes(tipo: string) {
  await ensureSolicitacoesEdicaoSchema();
  const tipoF = normalizeUpper(tipo) as TipoSolicitacao;
  if (tipoF !== "VENDA" && tipoF !== "PRIME") throw new Error("Tipo inválido.");
  const rows = await db
    .select()
    .from(solicitacoesEdicao)
    .where(and(eq(solicitacoesEdicao.tipo, tipoF), eq(solicitacoesEdicao.status, "PENDENTE")))
    .orderBy(desc(solicitacoesEdicao.id))
    .limit(200);
  return rows.map(mapRow);
}

export async function aprovarSolicitacao(id: number, operador?: string) {
  await ensureSolicitacoesEdicaoSchema();
  const sid = Number(id);
  if (!Number.isFinite(sid) || sid <= 0) throw new Error("Solicitação inválida.");

  const [row] = await db.select().from(solicitacoesEdicao).where(eq(solicitacoesEdicao.id, sid));
  if (!row) throw new Error("Solicitação não encontrada.");
  if (row.status !== "PENDENTE") throw new Error("Solicitação não está pendente.");

  const quem = normalizeText(operador) || (await operadorAtual());
  const proposto = parseJson<Record<string, unknown>>(row.valoresPropostos, {});
  let mudancas: Array<{ campo: string; de: string; para: string }> = [];

  if (row.tipo === "VENDA") {
    const res = await atualizarVenda(
      {
        id: row.registroId,
        data: String(proposto.data || ""),
        idVendedor: String(proposto.idVendedor || ""),
        vendedor: String(proposto.vendedor || ""),
        valorRecebido: proposto.valorRecebido as number | string,
      },
      quem
    );
    mudancas = res.mudancas || [];
  } else {
    const res = await atualizarPrime(
      {
        id: row.registroId,
        data: String(proposto.data || ""),
        idVendedor: String(proposto.idVendedor || ""),
        vendedor: String(proposto.vendedor || ""),
        item: String(proposto.item || ""),
        quantidade: proposto.quantidade as number | string,
      },
      quem
    );
    mudancas = res.mudancas || [];
  }

  await db
    .update(solicitacoesEdicao)
    .set({
      status: "APROVADA",
      decididoPor: quem,
      decididoEm: agoraISO(),
      mudancas: JSON.stringify(mudancas),
    })
    .where(eq(solicitacoesEdicao.id, sid));

  const resumo =
    mudancas.length > 0
      ? mudancas.map((m) => `${m.campo}: ${m.de} → ${m.para}`).join("; ")
      : "sem mudanças efetivas";

  await registrarLog(
    LOG_TIPO.APROVACAO_EDICAO,
    {
      id: sid,
      tipo: row.tipo,
      registroId: row.registroId,
      solicitadoPor: row.solicitadoPor,
      aprovadoPor: quem,
      motivo: row.motivo,
      mudancas,
    },
    true,
    `Solicitação #${sid} APROVADA: ${row.tipo} #${row.registroId} — pediu ${row.solicitadoPor}, autorizou ${quem}. Motivo: ${row.motivo}. ${resumo}`
  );

  return {
    ok: true,
    message: `Solicitação #${sid} aprovada.`,
    mudancas,
  };
}

export async function recusarSolicitacao(id: number, obs: string, operador?: string) {
  await ensureSolicitacoesEdicaoSchema();
  const sid = Number(id);
  if (!Number.isFinite(sid) || sid <= 0) throw new Error("Solicitação inválida.");
  const razao = normalizeText(obs);
  if (razao.length < 10) {
    throw new Error("Informe a observação da recusa (mínimo 10 caracteres).");
  }

  const [row] = await db.select().from(solicitacoesEdicao).where(eq(solicitacoesEdicao.id, sid));
  if (!row) throw new Error("Solicitação não encontrada.");
  if (row.status !== "PENDENTE") throw new Error("Solicitação não está pendente.");

  const quem = normalizeText(operador) || (await operadorAtual());

  await db
    .update(solicitacoesEdicao)
    .set({
      status: "RECUSADA",
      decididoPor: quem,
      decididoEm: agoraISO(),
      obsDecisao: razao,
    })
    .where(eq(solicitacoesEdicao.id, sid));

  await registrarLog(
    LOG_TIPO.RECUSA_EDICAO,
    {
      id: sid,
      tipo: row.tipo,
      registroId: row.registroId,
      solicitadoPor: row.solicitadoPor,
      recusadoPor: quem,
      motivo: row.motivo,
      obsDecisao: razao,
      valoresPropostos: parseJson(row.valoresPropostos, {}),
    },
    true,
    `Solicitação #${sid} RECUSADA: ${row.tipo} #${row.registroId} — pediu ${row.solicitadoPor}, recusou ${quem}. Motivo pedido: ${row.motivo}. Obs: ${razao}`
  );

  return { ok: true, message: `Solicitação #${sid} recusada.` };
}
