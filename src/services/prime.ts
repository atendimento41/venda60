import { db } from "@/db";
import { primeVendas } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import {
  agoraISO,
  dataYmd,
  formatDataHoraBR,
  isVendaCancelada,
  normalizeText,
  normalizeUpper,
} from "@/lib/utils";
import { LOG_TIPO, operadorAtual, registrarLog } from "@/lib/log";
import {
  assertUnidadeDoUsuario,
  assertUnidadeDoVendedor,
  obterVendedorPorIdOuNome,
} from "@/services/vendedores";
import { ensurePrimeSchema } from "@/lib/ensure-schema";

/** Preço de venda por ingresso (não confundir com comissão R$ 1/ingresso). */
export const PRECO_INGRESSO_PRIME: Record<"ELITE" | "PLATINA" | "OURO", number> = {
  ELITE: 39.9,
  PLATINA: 59.9,
  OURO: 69.9,
};

export const COMISSAO_POR_INGRESSO_PRIME = 1;

const ITENS_PRIME = [
  { nome: "ELITE", preco: PRECO_INGRESSO_PRIME.ELITE },
  { nome: "PLATINA", preco: PRECO_INGRESSO_PRIME.PLATINA },
  { nome: "OURO", preco: PRECO_INGRESSO_PRIME.OURO },
];

export function listarItensPrime() {
  return ITENS_PRIME;
}

export function getNivelPrime(itemNome: string): "ELITE" | "PLATINA" | "OURO" | "" {
  const u = normalizeUpper(itemNome);
  if (u.includes("ELITE")) return "ELITE";
  if (u.includes("PLATINA")) return "PLATINA";
  if (u.includes("OURO")) return "OURO";
  return "";
}

export function precoIngressoPrime(itemOuNivel: string): number {
  const nivel = getNivelPrime(itemOuNivel);
  return nivel ? PRECO_INGRESSO_PRIME[nivel] : 0;
}

/** Valor total de venda (preço do ingresso × qtd), independente da comissão. */
export function valorVendaPrime(quantidade: number, itemOuNivel: string): number {
  const qtd = Number(quantidade) || 0;
  if (qtd <= 0) return 0;
  return Math.round(precoIngressoPrime(itemOuNivel) * qtd * 100) / 100;
}

export function comissaoPrimeQtd(quantidade: number): number {
  const qtd = Number(quantidade) || 0;
  if (qtd <= 0) return 0;
  return Math.round(qtd * COMISSAO_POR_INGRESSO_PRIME * 100) / 100;
}

export async function salvarVendaPrime(
  dados: {
    vendedor?: string;
    id_vendedor?: string;
    unidade: string;
    item: string;
    quantidade: number;
  },
  opts?: { unidadesUsuario?: string[]; nomeUsuario?: string }
) {
  await ensurePrimeSchema();
  const unidade = normalizeText(dados.unidade);
  const item = normalizeText(dados.item);
  const qtd = Number(dados.quantidade) || 1;
  if (!unidade) throw new Error("Unidade obrigatória.");
  if (!item) throw new Error("Item PRIME obrigatório.");

  assertUnidadeDoUsuario(opts?.unidadesUsuario, unidade, opts?.nomeUsuario || "Usuário");

  const vendedor = await obterVendedorPorIdOuNome(dados.id_vendedor, dados.vendedor);
  if (!vendedor) throw new Error("Selecione um vendedor cadastrado.");
  if (!vendedor.ativo) throw new Error("Vendedor inativo.");
  assertUnidadeDoVendedor(vendedor, unidade);

  const nivel = getNivelPrime(item);
  const valor = valorVendaPrime(qtd, nivel || item);

  await db.insert(primeVendas).values({
    data: agoraISO(),
    idVendedor: vendedor.id,
    vendedor: vendedor.nome,
    unidade,
    item,
    quantidade: qtd,
    valor,
    nivel,
    status: "",
  });

  await registrarLog(LOG_TIPO.LANCAMENTO_PRIME, dados, true, "PRIME registrado");
  return { ok: true, message: "Venda PRIME registrada.", valor };
}

function primeAberta(status: string | null | undefined) {
  return !isVendaCancelada(status);
}

export async function getRelatorioPrimeFiltrado(filtros: {
  dataInicio?: string;
  dataFim?: string;
  unidade?: string;
  vendedor?: string;
  subcategoria?: string;
}) {
  await ensurePrimeSchema();
  const rows = await db.select().from(primeVendas).orderBy(desc(primeVendas.id));
  const filtradas = rows.filter((row) => {
    if (!primeAberta(row.status)) return false;
    const ymd = dataYmd(row.data);
    if (filtros.dataInicio && ymd < filtros.dataInicio) return false;
    if (filtros.dataFim && ymd > filtros.dataFim) return false;
    if (filtros.unidade && normalizeUpper(row.unidade) !== normalizeUpper(filtros.unidade))
      return false;
    if (filtros.vendedor && normalizeText(row.vendedor) !== normalizeText(filtros.vendedor))
      return false;
    if (filtros.subcategoria) {
      const nivel = getNivelPrime(row.item);
      if (normalizeUpper(nivel) !== normalizeUpper(filtros.subcategoria)) return false;
    }
    return true;
  });

  const porVendedor: Record<
    string,
    { vendedor: string; qtd: number; valor: number; comissao: number; itens: typeof filtradas }
  > = {};

  for (const row of filtradas) {
    const v = row.vendedor || "—";
    if (!porVendedor[v]) {
      porVendedor[v] = { vendedor: v, qtd: 0, valor: 0, comissao: 0, itens: [] };
    }
    const valorVenda = valorVendaPrime(row.quantidade, row.nivel || row.item);
    const comissao = comissaoPrimeQtd(row.quantidade);
    porVendedor[v].qtd += row.quantidade;
    porVendedor[v].valor += valorVenda;
    porVendedor[v].comissao += comissao;
    porVendedor[v].itens.push(row);
  }

  const resumo = Object.values(porVendedor).sort((a, b) => b.valor - a.valor);
  const vendas = filtradas
    .slice()
    .sort((a, b) => String(b.data).localeCompare(String(a.data)))
    .map((row) => {
      const nivel = row.nivel || getNivelPrime(row.item) || "PRIME";
      return {
        dataHora: formatDataHoraBR(row.data),
        vendedor: row.vendedor || "—",
        unidade: row.unidade || "",
        item: row.item,
        categoria: nivel,
        quantidade: row.quantidade,
        /** Valor de venda (ingresso × qtd) — não é comissão. */
        valor: valorVendaPrime(row.quantidade, row.nivel || row.item),
        comissao: comissaoPrimeQtd(row.quantidade),
      };
    });
  const totalQtd = filtradas.reduce((s, r) => s + r.quantidade, 0);
  const totalValor = vendas.reduce((s, r) => s + r.valor, 0);
  const totalComissao = vendas.reduce((s, r) => s + r.comissao, 0);
  return {
    resumo,
    vendas,
    detalhes: filtradas,
    totalQtd,
    totalValor,
    totalComissao,
  };
}

export async function listarPrimeParaCancelamento(filtros: {
  nome?: string;
  unidade?: string;
  vendedor?: string;
  dataInicio?: string;
  dataFim?: string;
  categoria?: string;
  subcategoria?: string;
  incluirCanceladas?: boolean;
}) {
  await ensurePrimeSchema();
  const rows = await db.select().from(primeVendas).orderBy(desc(primeVendas.id)).limit(2000);
  const somenteAbertas = !filtros.incluirCanceladas;
  const catF = normalizeUpper(filtros.categoria || "");
  const subF = normalizeUpper(filtros.subcategoria || "");

  return rows
    .filter((row) => {
      if (somenteAbertas && !primeAberta(row.status)) return false;
      if (filtros.unidade && normalizeUpper(row.unidade) !== normalizeUpper(filtros.unidade))
        return false;
      if (filtros.vendedor && normalizeText(row.vendedor) !== normalizeText(filtros.vendedor))
        return false;
      const ymd = dataYmd(row.data);
      if (filtros.dataInicio && ymd < filtros.dataInicio) return false;
      if (filtros.dataFim && ymd > filtros.dataFim) return false;
      // PRIME: categoria só faz sentido como "PRIME"; subcategoria = nível
      if (catF && catF !== "PRIME") return false;
      if (subF && normalizeUpper(row.nivel || "") !== subF) return false;
      if (filtros.nome) {
        const n = normalizeUpper(filtros.nome);
        if (!normalizeUpper(row.item).includes(n)) return false;
      }
      return true;
    })
    .slice(0, 400)
    .map((row) => ({
      sheetRow: row.id,
      dataHora: formatDataHoraBR(row.data),
      vendedor: row.vendedor || "—",
      unidade: row.unidade || "",
      sku: "",
      item: row.item,
      categoria: "PRIME",
      subcategoria: row.nivel || "",
      quantidade: row.quantidade,
      valorRecebido: valorVendaPrime(row.quantidade, row.nivel || row.item),
      status: row.status || "",
      canceladoPor: row.canceladoPor || "",
      canceladoEm: row.canceladoEm ? formatDataHoraBR(row.canceladoEm) : "",
      motivo: row.motivoCancelamento || "",
      cancelada: !primeAberta(row.status),
    }));
}

export async function cancelarPrime(id: number, motivo: string, operador?: string) {
  await ensurePrimeSchema();
  const razao = normalizeText(motivo);
  if (razao.length < 10) {
    throw new Error("Informe a descrição do cancelamento (mínimo 10 caracteres).");
  }

  const [row] = await db.select().from(primeVendas).where(eq(primeVendas.id, id));
  if (!row) throw new Error("Lançamento PRIME não encontrado.");
  if (!primeAberta(row.status)) throw new Error("PRIME já cancelado.");

  const quem = normalizeText(operador) || (await operadorAtual());

  await db
    .update(primeVendas)
    .set({
      status: "CANCELADO",
      canceladoPor: quem,
      canceladoEm: agoraISO(),
      motivoCancelamento: razao,
    })
    .where(eq(primeVendas.id, id));

  await registrarLog(
    LOG_TIPO.CANCELAMENTO_PRIME,
    { id, motivo: razao },
    true,
    `PRIME cancelado: ${razao}`
  );
  return { ok: true, message: "Lançamento PRIME cancelado." };
}
