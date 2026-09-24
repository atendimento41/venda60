import { db, getClient } from "@/db";
import { primeVendas } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import {
  agoraISO,
  dataYmd,
  formatDataHoraBR,
  hojeISO,
  isVendaCancelada,
  normalizeText,
  normalizeUpper,
  normalizarDataVendaISO,
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

export async function obterUltimoDiaPrime(): Promise<string> {
  await ensurePrimeSchema();
  const client = getClient();
  const rs = await client.execute({
    sql: `SELECT MAX(SUBSTRING(data FROM 1 FOR 10)) AS d
          FROM prime_vendas
          WHERE COALESCE(UPPER(status), '') != 'CANCELADO'
            AND data ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'`,
    args: [],
  });
  const d = String(rs.rows[0]?.d || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : hojeISO();
}

export async function listarPrimeParaEditar(filtros: {
  nome?: string;
  unidade?: string;
  vendedor?: string;
  dataInicio?: string;
  dataFim?: string;
  nivel?: string;
  /** Se true e sem data, usa o último dia com lançamento. */
  usarUltimoDia?: boolean;
}) {
  await ensurePrimeSchema();
  let dataInicio = normalizeText(filtros.dataInicio);
  let dataFim = normalizeText(filtros.dataFim);
  const ultimoDia = await obterUltimoDiaPrime();

  if (!dataInicio && !dataFim && filtros.usarUltimoDia !== false) {
    dataInicio = ultimoDia;
    dataFim = ultimoDia;
  }

  const nivelF = normalizeUpper(filtros.nivel || "");
  const nomeF = normalizeUpper(filtros.nome || "");
  const rows = await db.select().from(primeVendas).orderBy(desc(primeVendas.id)).limit(2000);

  const linhas = rows
    .filter((row) => {
      if (!primeAberta(row.status)) return false;
      const ymd = dataYmd(row.data);
      if (dataInicio && ymd < dataInicio) return false;
      if (dataFim && ymd > dataFim) return false;
      if (filtros.unidade && normalizeUpper(row.unidade) !== normalizeUpper(filtros.unidade))
        return false;
      if (filtros.vendedor && normalizeText(row.vendedor) !== normalizeText(filtros.vendedor))
        return false;
      const nivel = row.nivel || getNivelPrime(row.item) || "";
      if (nivelF && normalizeUpper(nivel) !== nivelF) return false;
      if (nomeF && !normalizeUpper(row.item).includes(nomeF) && !normalizeUpper(nivel).includes(nomeF))
        return false;
      return true;
    })
    .slice(0, 500)
    .map((row) => {
      const raw = String(row.data || "").trim();
      const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/.exec(raw);
      const nivel = row.nivel || getNivelPrime(row.item) || "";
      return {
        id: row.id,
        dataHora: formatDataHoraBR(row.data),
        dataLocal: m ? m[1] : raw.slice(0, 16),
        idVendedor: String(row.idVendedor || ""),
        vendedor: row.vendedor || "—",
        unidade: row.unidade || "",
        item: row.item,
        nivel,
        quantidade: row.quantidade,
        valorRecebido: valorVendaPrime(row.quantidade, nivel || row.item),
      };
    });

  return {
    linhas,
    dataPadrao: dataInicio || dataFim || ultimoDia,
    ultimoDia,
    total: linhas.length,
  };
}

export async function atualizarPrime(
  input: {
    id: number;
    data?: string;
    idVendedor?: string;
    vendedor?: string;
    item?: string;
    quantidade?: number | string;
  },
  operador?: string
) {
  await ensurePrimeSchema();
  const sid = Number(input.id);
  if (!Number.isFinite(sid) || sid <= 0) throw new Error("Lançamento PRIME inválido.");

  const [row] = await db.select().from(primeVendas).where(eq(primeVendas.id, sid));
  if (!row) throw new Error("Lançamento PRIME não encontrado.");
  if (!primeAberta(row.status)) throw new Error("PRIME cancelado não pode ser editado.");

  const patch: Partial<{
    data: string;
    idVendedor: string;
    vendedor: string;
    item: string;
    nivel: string;
    quantidade: number;
    valor: number;
  }> = {};
  const mudancas: Array<{ campo: string; de: string; para: string }> = [];

  if (input.data != null && String(input.data).trim()) {
    const dataNova = normalizarDataVendaISO(input.data);
    const de = String(row.data || "");
    if (dataNova !== de) {
      patch.data = dataNova;
      mudancas.push({
        campo: "data",
        de: formatDataHoraBR(de),
        para: formatDataHoraBR(dataNova),
      });
    }
  }

  const querVendedor =
    (input.idVendedor != null && String(input.idVendedor).trim()) ||
    (input.vendedor != null && String(input.vendedor).trim());
  if (querVendedor) {
    const vend = await obterVendedorPorIdOuNome(input.idVendedor, input.vendedor);
    if (!vend) throw new Error("Vendedor não encontrado.");
    if (!vend.ativo) throw new Error("Vendedor inativo.");
    assertUnidadeDoVendedor(vend, row.unidade || "");
    const idAnt = String(row.idVendedor || "");
    const nomeAnt = String(row.vendedor || "");
    if (vend.id !== idAnt || normalizeText(vend.nome) !== normalizeText(nomeAnt)) {
      patch.idVendedor = vend.id;
      patch.vendedor = vend.nome;
      mudancas.push({
        campo: "vendedor",
        de: nomeAnt || "—",
        para: vend.nome,
      });
    }
  }

  let itemFinal = row.item;
  let qtdFinal = row.quantidade;

  if (input.item != null && String(input.item).trim()) {
    const itemNovo = normalizeText(input.item);
    const nivelNovo = getNivelPrime(itemNovo);
    if (!nivelNovo) throw new Error("Item PRIME inválido (use ELITE, PLATINA ou OURO).");
    const itemAnt = String(row.item || "");
    const nivelAnt = row.nivel || getNivelPrime(itemAnt) || "";
    if (normalizeUpper(itemNovo) !== normalizeUpper(itemAnt) || nivelNovo !== nivelAnt) {
      patch.item = itemNovo;
      patch.nivel = nivelNovo;
      mudancas.push({
        campo: "item",
        de: itemAnt || "—",
        para: itemNovo,
      });
    }
    itemFinal = itemNovo;
  }

  if (input.quantidade != null && String(input.quantidade).trim() !== "") {
    const qtdNova = Math.floor(Number(String(input.quantidade).replace(",", ".")));
    if (!Number.isFinite(qtdNova) || qtdNova <= 0) throw new Error("Quantidade inválida.");
    if (qtdNova !== row.quantidade) {
      patch.quantidade = qtdNova;
      mudancas.push({
        campo: "quantidade",
        de: String(row.quantidade),
        para: String(qtdNova),
      });
    }
    qtdFinal = qtdNova;
  }

  const nivelFinal = patch.nivel || row.nivel || getNivelPrime(itemFinal) || itemFinal;
  const valorNovo = valorVendaPrime(qtdFinal, nivelFinal);
  const valorAnt = Number(row.valor) || valorVendaPrime(row.quantidade, row.nivel || row.item);
  if (Math.abs(valorNovo - valorAnt) > 0.0001) {
    patch.valor = valorNovo;
    mudancas.push({
      campo: "valor",
      de: valorAnt.toFixed(2),
      para: valorNovo.toFixed(2),
    });
  }

  if (!mudancas.length) {
    return { ok: true, message: "Nenhuma alteração.", mudancas: [] };
  }

  await db.update(primeVendas).set(patch).where(eq(primeVendas.id, sid));

  const quem = normalizeText(operador) || (await operadorAtual());
  const resumo = mudancas.map((m) => `${m.campo}: ${m.de} → ${m.para}`).join("; ");
  await registrarLog(
    LOG_TIPO.EDICAO_PRIME,
    { id: sid, operador: quem, mudancas },
    true,
    `PRIME #${sid} alterado por ${quem}: ${resumo}`
  );
  return {
    ok: true,
    message: `PRIME #${sid} atualizado (${mudancas.length} campo(s)).`,
    mudancas,
  };
}
