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

const ITENS_PRIME = [
  { nome: "ELITE", preco: 1 },
  { nome: "PLATINA", preco: 1 },
  { nome: "OURO", preco: 1 },
];

export function listarItensPrime() {
  return ITENS_PRIME;
}

export function getNivelPrime(itemNome: string) {
  const u = normalizeUpper(itemNome);
  if (u.includes("ELITE")) return "ELITE";
  if (u.includes("PLATINA")) return "PLATINA";
  if (u.includes("OURO")) return "OURO";
  return "";
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

  const precoItem = ITENS_PRIME.find((i) => normalizeUpper(i.nome) === normalizeUpper(item));
  const valor = (precoItem?.preco ?? 1) * qtd;

  await db.insert(primeVendas).values({
    data: agoraISO(),
    idVendedor: vendedor.id,
    vendedor: vendedor.nome,
    unidade,
    item,
    quantidade: qtd,
    valor,
    nivel: getNivelPrime(item),
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
    porVendedor[v].qtd += row.quantidade;
    porVendedor[v].valor += row.valor;
    porVendedor[v].comissao += row.quantidade;
    porVendedor[v].itens.push(row);
  }

  const resumo = Object.values(porVendedor).sort((a, b) => b.valor - a.valor);
  const vendas = filtradas
    .slice()
    .sort((a, b) => String(b.data).localeCompare(String(a.data)))
    .map((row) => ({
      dataHora: formatDataHoraBR(row.data),
      vendedor: row.vendedor || "—",
      unidade: row.unidade || "",
      item: row.item,
      categoria: row.nivel || getNivelPrime(row.item) || "PRIME",
      quantidade: row.quantidade,
      valor: row.valor,
    }));
  return {
    resumo,
    vendas,
    detalhes: filtradas,
    totalQtd: filtradas.reduce((s, r) => s + r.quantidade, 0),
    totalValor: filtradas.reduce((s, r) => s + r.valor, 0),
    totalComissao: filtradas.reduce((s, r) => s + r.quantidade, 0),
  };
}

export async function listarPrimeParaCancelamento(filtros: {
  nome?: string;
  unidade?: string;
  vendedor?: string;
  dataInicio?: string;
  dataFim?: string;
  incluirCanceladas?: boolean;
}) {
  await ensurePrimeSchema();
  const rows = await db.select().from(primeVendas).orderBy(desc(primeVendas.id)).limit(2000);
  const somenteAbertas = !filtros.incluirCanceladas;

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
      quantidade: row.quantidade,
      valorRecebido: row.valor,
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
