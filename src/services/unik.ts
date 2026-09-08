import { db } from "@/db";
import { entregaUnik, estoque, itens, movimentosEstoque, unikLojaStatus, unikVinculos, vendas } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import {
  agoraISO,
  dataYmd,
  formatDataHoraBR,
  isVendaCancelada,
  mesAtualISO,
  normalizeText,
  normalizeUpper,
  parseMesFiltro,
  parsePreco,
  UNIDADES_PADRAO,
} from "@/lib/utils";
import { LOG_TIPO, registrarLog, registrarLogConsulta } from "@/lib/log";
import { textoFormulaRelatorioVendasUnik } from "@/lib/unik-relatorio";
import { validarFotoUrl } from "@/lib/foto";
import {
  calcularLinhaRelatorioUnik,
  custoUnikRelatorioVendas,
  custoUnitarioLancamento,
  fotoUrlParaListagem,
  maxCustoSugestaoDeLancamentos,
  precoUnitarioEncomenda,
  resolverCustoUnikUnitario,
  roundMoney,
  unitCustoLancamento,
  valorFinalEncomenda,
} from "@/lib/unik-calculo";
import { listarVendasNoPeriodo } from "@/lib/vendas-db";
import { aplicarMovimentoEstoque } from "./estoque";
import { ensureItensSchema, ensureUnikSchema } from "@/lib/ensure-schema";

export function chaveNomeItem(s: unknown): string {
  return normalizeUpper(s).replace(/\s+/g, " ").trim();
}

export function textoContemUnik3d(s: unknown): boolean {
  const t = chaveNomeItem(s);
  if (!t.includes("UNIK")) return false;
  return t.includes("3D") || /\b3\s*D\b/.test(t);
}

/** Subcategoria Meep UNIK 3D, em um único campo. */
export function campoEhUnik3d(valor: unknown): boolean {
  return textoContemUnik3d(valor);
}

export function itemEhUnik3d(categoria?: string | null, subcategoria?: string | null): boolean {
  return campoEhUnik3d(subcategoria) || campoEhUnik3d(categoria);
}

function vendaEhUnik3d(
  item: { subcategoriaMeep?: string | null } | undefined,
  row: { categoria?: string | null; subcategoria?: string | null }
): boolean {
  const naVenda = campoEhUnik3d(row.categoria) || campoEhUnik3d(row.subcategoria);
  if (!naVenda) return false;
  if (item && normalizeText(item.subcategoriaMeep)) {
    return campoEhUnik3d(item.subcategoriaMeep);
  }
  return true;
}

/** Primeiro mês com vendas UNIK nos gráficos. */
const UNIK_MES_INICIO_DADOS = "2026-02";
export const UNIK_UNIDADE_GERAL = "GERAL";
export const UNIK_LOJAS = [...UNIDADES_PADRAO];

function chaveUnidadeUnik(unidade: unknown): string {
  const t = normalizeUpper(unidade).replace(/[^A-Z0-9]/g, "");
  if (!t) return "";
  if (t === "GERAL" || t === "CENTRAL" || t === "DEPOSITO") return UNIK_UNIDADE_GERAL;
  if (t === "PKS") return "PKS";
  if (t === "SSU") return "SSU";
  if (t === "TGS") return "TGS";
  if (t === "PIER21" || t === "PIER") return "PIER 21";
  const raw = normalizeText(unidade);
  const loja = UNIK_LOJAS.find((u) => normalizeUpper(u) === normalizeUpper(raw));
  return loja || normalizeUpper(raw);
}

let unikGeralMigrado = false;

/** Lançamento antigo ia para a loja; o depósito UNIK é GERAL. Move o saldo que ainda não foi distribuído. */
async function migrarEstoqueUnikLojaParaGeral() {
  if (unikGeralMigrado) return;
  unikGeralMigrado = true;
  const allItens = await db.select().from(itens);
  const unikSkus = new Set(
    allItens.filter((i) => campoEhUnik3d(i.subcategoriaMeep)).map((i) => normalizeUpper(i.sku))
  );
  if (!unikSkus.size) return;
  const movs = await db.select().from(movimentosEstoque);
  const jaDistribuiu = new Set(
    movs
      .filter((m) => normalizeUpper(m.tipo) === "UNIK_DISTRIBUICAO")
      .map((m) => normalizeUpper(m.sku))
  );
  const estRows = await db.select().from(estoque);
  for (const row of estRows) {
    const up = normalizeUpper(row.sku);
    if (!unikSkus.has(up)) continue;
    if (jaDistribuiu.has(up)) continue;
    const uni = chaveUnidadeUnik(row.unidade);
    if (uni === UNIK_UNIDADE_GERAL) continue;
    if (!UNIK_LOJAS.includes(uni as (typeof UNIK_LOJAS)[number])) continue;
    const q = Number(row.quantidade) || 0;
    if (q <= 0) continue;
    try {
      await aplicarMovimentoEstoque(row.sku, row.unidade, -q, "UNIK_AJUSTE", row.sku);
      await aplicarMovimentoEstoque(row.sku, UNIK_UNIDADE_GERAL, q, "UNIK_ENTREGA", row.sku);
    } catch {
      /* saldo pode ter mudado entre a leitura e o movimento */
    }
  }
}

async function sincronizarCustoSugestaoItemPorSku(sku: string) {
  const skuLimpo = normalizeText(sku);
  if (!skuLimpo) return;
  const vinculos = await db.select().from(unikVinculos);
  const skuPorChave = Object.fromEntries(vinculos.map((v) => [v.nomeChave, v.sku]));
  const entregas = await db.select().from(entregaUnik);
  const linhas = entregas.map((row) => ({
    sku: row.sku,
    nome: row.nome,
    custo: row.custo,
    quantidade: row.quantidade,
    sugestaoVenda: row.sugestaoVenda,
    status: row.status,
    tipo: row.tipo,
    encomenda: classificarStatusUnik(row.status, row.tipo) === "ENCOMENDA",
  }));
  const { custo, sugestaoVenda } = maxCustoSugestaoDeLancamentos(skuLimpo, linhas, skuPorChave);
  const patch: { custo?: number; sugestaoVenda?: number } = {};
  if (custo > 0) patch.custo = custo;
  if (sugestaoVenda > 0) patch.sugestaoVenda = sugestaoVenda;
  if (Object.keys(patch).length) {
    await db.update(itens).set(patch).where(eq(itens.sku, skuLimpo));
  }
}

async function buildCustoUnikPorSku(): Promise<Record<string, number>> {
  const vinculos = await db.select().from(unikVinculos);
  const skuPorChave = Object.fromEntries(vinculos.map((v) => [v.nomeChave, v.sku]));
  const entregas = await db.select().from(entregaUnik);
  const custoUnikPorSku: Record<string, number> = {};

  for (const row of entregas) {
    const encomenda = classificarStatusUnik(row.status, row.tipo) === "ENCOMENDA";
    if (encomenda) continue;
    const unit = custoUnitarioLancamento(Number(row.custo) || 0, Number(row.quantidade) || 1, false);
    if (unit <= 0) continue;

    const skus = new Set<string>();
    const skuRow = normalizeUpper(row.sku);
    if (skuRow) skus.add(skuRow);
    const nome = normalizeText(row.nome);
    if (nome) {
      const skuV = normalizeUpper(skuPorChave[chaveNomeItem(nome)] || "");
      if (skuV) skus.add(skuV);
    }

    for (const up of skus) {
      custoUnikPorSku[up] = Math.max(custoUnikPorSku[up] || 0, unit);
    }
  }
  return custoUnikPorSku;
}

export function classificarStatusUnik(status: unknown, tipo?: unknown): "ENTREGUE" | "RETIRADA" | "ENCOMENDA" | "" {
  const t = chaveNomeItem(`${status || ""} ${tipo || ""}`);
  if (!t) return "";
  if (t.includes("NAO ENTREG") || t.includes("NAO-ENTREG")) return "";
  if (t.includes("ENCOMENDA") && !t.includes("ENTREG") && !t.includes("RETIR") && !t.includes("LEVANTAMENTO")) {
    return "ENCOMENDA";
  }
  if (t.includes("RETIRAD") || t.includes("RETIROU") || t.includes("RETIR") || t.includes("SAIDA") || t.includes("COLETA")) {
    return "RETIRADA";
  }
  if (
    t.includes("LEVANTAMENTO") ||
    t.includes("ENTREGUE") ||
    t.includes("ENTREGA") ||
    t.includes("ENTREG") ||
    t.includes("ENTRAD") ||
    t.includes("RECEB")
  ) {
    return "ENTREGUE";
  }
  return "";
}

function deltaUnik(status: unknown, tipo: unknown, qtdBruta: number): number {
  const q = Math.abs(Number(qtdBruta) || 0);
  const cls = classificarStatusUnik(status, tipo);
  if (cls === "RETIRADA") return -q;
  if (cls === "ENTREGUE") return q;
  if (cls === "ENCOMENDA") return 0;
  if (qtdBruta < 0) return qtdBruta;
  return q;
}

function scoreSimilaridade(alvo: string, cand: string): number {
  if (!alvo || !cand) return 0;
  if (alvo === cand) return 1000;
  let score = 0;
  if (cand.includes(alvo) || alvo.includes(cand)) score += 60;
  let pref = 0;
  const lim = Math.min(alvo.length, cand.length);
  while (pref < lim && alvo.charAt(pref) === cand.charAt(pref)) pref++;
  score += Math.min(25, pref * 2);
  const ta = alvo.split(" ").filter(Boolean);
  const setB = new Set(cand.split(" ").filter(Boolean));
  score += ta.filter((w) => setB.has(w)).length * 12;
  return score;
}

function nomeParaMatch(s: unknown): string {
  return chaveNomeItem(s)
    .replace(/^UNIK(\s*3D)?\s*/g, "")
    .replace(/\bUNIK\b/g, " ")
    .replace(/\b3D\b/g, " ")
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sugerirItemEstoque(
  nome: string,
  itensUnik: Array<{ sku: string; descricao: string }>
): { sku: string; descricao: string } | null {
  const alvo = nomeParaMatch(nome);
  if (!alvo) return null;
  let melhor: { sku: string; descricao: string } | null = null;
  let melhorScore = 0;
  for (const item of itensUnik) {
    const cand = nomeParaMatch(item.descricao);
    let sc = scoreSimilaridade(alvo, cand);
    if (chaveNomeItem(nome) === chaveNomeItem(item.sku) || chaveNomeItem(nome).includes(chaveNomeItem(item.sku))) {
      sc += 80;
    }
    if (sc > melhorScore) {
      melhorScore = sc;
      melhor = item;
    }
  }
  return melhorScore >= 20 ? melhor : null;
}

export async function listarItensParaUnik() {
  await ensureUnikSchema();
  const rows = await db.select().from(itens).where(eq(itens.ativo, true));
  return rows
    .filter((r) => campoEhUnik3d(r.subcategoriaMeep))
    .map((r) => ({
      sku: r.sku,
      descricao: r.descricao,
      preco: r.preco || 0,
      fotoUrl: r.fotoUrl || "",
      unik3d: true,
    }))
    .sort((a, b) => chaveNomeItem(a.descricao).localeCompare(chaveNomeItem(b.descricao), "pt-BR"));
}

async function contextoUnik() {
  await ensureUnikSchema();
  const allItens = await db.select().from(itens);
  const vinculos = await db.select().from(unikVinculos);
  const skuPorChave = Object.fromEntries(vinculos.map((v) => [v.nomeChave, v.sku]));
  const itemPorSku = Object.fromEntries(allItens.map((i) => [normalizeUpper(i.sku), i]));
  const descricoes = allItens.map((i) => i.descricao);
  const itensUnik = allItens.filter((i) => campoEhUnik3d(i.subcategoriaMeep));
  return { allItens, skuPorChave, itemPorSku, descricoes, itensUnik };
}

function lancamentoDeRow(
  row: {
    id: number;
    data: string | null;
    status: string | null;
    tipo: string | null;
    unidade: string | null;
    nome: string | null;
    sku: string | null;
    quantidade: number | null;
    fotoUrl?: string | null;
    custo?: number | null;
    sugestaoVenda?: number | null;
    recebidoPor?: string | null;
    estoqueUnidade?: string | null;
  },
  ctx: Awaited<ReturnType<typeof contextoUnik>>
) {
  const nome = normalizeText(row.nome);
  const sku = normalizeText(row.sku) || ctx.skuPorChave[chaveNomeItem(nome)] || "";
  const item = sku ? ctx.itemPorSku[normalizeUpper(sku)] : undefined;
  const semSku = !item;
  const qtd = Number(row.quantidade) || 0;
  const cls = classificarStatusUnik(row.status, row.tipo);
  const delta = cls === "ENCOMENDA" ? 0 : deltaUnik(row.status, row.tipo, qtd);
  const sugestao = semSku ? sugerirItemEstoque(nome, ctx.itensUnik) : null;
  const sugestaoLinha = Number(row.sugestaoVenda) || 0;
  return {
    id: row.id,
    data: row.data || "",
    dataYmd: dataYmd(row.data || ""),
    dataFmt: formatDataHoraBR(row.data || ""),
    status: normalizeText(row.status),
    tipo: normalizeText(row.tipo),
    unidade: normalizeText(row.unidade),
    nomeEntrega: nome,
    sku: item?.sku || "",
    descricaoItem: item?.descricao || "",
    semSku,
    alertaSku: semSku ? "Ainda não vinculado a um item do estoque." : "",
    sugestaoNome: sugestao?.descricao || "",
    sugestaoSku: sugestao?.sku || "",
    quantidade: qtd,
    deltaEstoque: delta,
    fotoUrl: normalizeText(row.fotoUrl) || normalizeText(item?.fotoUrl),
    fotoLancamento: normalizeText(row.fotoUrl),
    custo: Number(row.custo) || 0,
    sugestaoVenda: sugestaoLinha,
    precoVenda: item ? Number(item.preco) || 0 : 0,
    recebidoPor: normalizeText(row.recebidoPor),
  };
}

export async function listarLancamentosUnik(filtros?: {
  custo?: string;
  sugestao?: string;
  todos?: boolean;
  nome?: string;
  item?: string;
}) {
  const ctx = await contextoUnik();
  const entregas = await db.select().from(entregaUnik).orderBy(desc(entregaUnik.id));
  const filtroCusto = normalizeText(filtros?.custo);
  const filtroSugestao = normalizeText(filtros?.sugestao);
  const soCustoZero = filtroCusto === "0" || filtroCusto === "eq0";
  const soSugestaoZero = filtroSugestao === "0" || filtroSugestao === "eq0";
  const nomeF = chaveNomeItem(filtros?.nome);
  const itemF = normalizeUpper(filtros?.item);
  const todos = Boolean(filtros?.todos);

  let filtradas = entregas;
  if (soCustoZero) filtradas = filtradas.filter((row) => !(Number(row.custo) > 0));
  if (soSugestaoZero) filtradas = filtradas.filter((row) => !(Number(row.sugestaoVenda) > 0));
  if (nomeF) {
    filtradas = filtradas.filter(
      (row) =>
        chaveNomeItem(row.nome).includes(nomeF) ||
        chaveNomeItem(row.recebidoPor).includes(nomeF) ||
        chaveNomeItem(row.sku).includes(nomeF)
    );
  }
  if (itemF) {
    filtradas = filtradas.filter((row) => {
      const lanc = lancamentoDeRow(row, ctx);
      return (
        normalizeUpper(lanc.descricaoItem).includes(itemF) ||
        normalizeUpper(lanc.sku).includes(itemF)
      );
    });
  }

  if (!todos && !soCustoZero && !soSugestaoZero && !nomeF) {
    let ultimaYmd = "";
    for (const row of entregas) {
      const y = dataYmd(row.data || "");
      if (y && (!ultimaYmd || y > ultimaYmd)) ultimaYmd = y;
    }
    if (!ultimaYmd) return { data: "", dataFmt: "", lancamentos: [] };
    filtradas = entregas.filter((row) => dataYmd(row.data || "") === ultimaYmd);
    return {
      data: ultimaYmd,
      dataFmt: formatDataHoraBR(ultimaYmd),
      lancamentos: filtradas.map((row) => lancamentoDeRow(row, ctx)),
    };
  }

  return {
    data: "",
    dataFmt: todos ? "todos" : [soCustoZero ? "custo 0" : "", soSugestaoZero ? "sugestão 0" : ""].filter(Boolean).join(" · "),
    lancamentos: filtradas.map((row) => lancamentoDeRow(row, ctx)),
  };
}

export async function listarLancamentosUltimaData() {
  return listarLancamentosUnik();
}

export async function atualizarLancamentoUnik(dados: {
  id: number;
  custo?: number | string;
  sugestaoVenda?: number | string;
  recebidoPor?: string;
  fotoUrl?: string;
  quantidade?: number | string;
}) {
  await ensureUnikSchema();
  const id = Number(dados.id);
  if (!id) throw new Error("Lançamento inválido.");
  const [row] = await db.select().from(entregaUnik).where(eq(entregaUnik.id, id));
  if (!row) throw new Error("Lançamento não encontrado.");

  const temCusto =
    dados.custo !== undefined && dados.custo !== null && String(dados.custo).trim() !== "";
  const temSugestao =
    dados.sugestaoVenda !== undefined && dados.sugestaoVenda !== null && String(dados.sugestaoVenda).trim() !== "";
  const temQuantidade =
    dados.quantidade !== undefined && dados.quantidade !== null && String(dados.quantidade).trim() !== "";
  const custo = temCusto ? parsePreco(dados.custo) : Number(row.custo) || 0;
  const sugestaoVenda = temSugestao ? parsePreco(dados.sugestaoVenda) : Number(row.sugestaoVenda) || 0;
  const qtdAntiga = Number(row.quantidade) || 0;
  const quantidade = temQuantidade ? Math.floor(Number(dados.quantidade)) : qtdAntiga;
  if (temQuantidade && (!quantidade || quantidade <= 0)) {
    throw new Error("Quantidade deve ser maior que zero.");
  }
  const recebidoPor =
    dados.recebidoPor !== undefined ? normalizeText(dados.recebidoPor) : normalizeText(row.recebidoPor);
  const patch: {
    custo: number;
    sugestaoVenda: number;
    recebidoPor: string;
    quantidade: number;
    fotoUrl?: string;
  } = { custo, sugestaoVenda, recebidoPor, quantidade };
  if (dados.fotoUrl !== undefined) {
    const foto = normalizeText(dados.fotoUrl);
    patch.fotoUrl = foto ? validarFotoUrl(foto) : "";
  }

  if (temQuantidade && quantidade < qtdAntiga) {
    throw new Error(
      "Não é possível reduzir a quantidade. Regularize o estoque (retirada, distribuição ou ajuste) antes de diminuir este lançamento."
    );
  }

  if (temQuantidade && quantidade > qtdAntiga && row.estoqueAplicado) {
    if (sku) {
      const [item] = await db.select().from(itens).where(eq(itens.sku, sku));
      if (item && !item.ilimitado) {
        const excesso = quantidade - qtdAntiga;
        const cls = classificarStatusUnik(row.status, row.tipo);
        if (cls === "ENCOMENDA") {
          /* encomenda não movimenta estoque */
        } else if (excesso > 0) {
          const deltaExcesso = cls === "RETIRADA" ? -excesso : excesso;
          await aplicarMovimentoEstoque(
            sku,
            UNIK_UNIDADE_GERAL,
            deltaExcesso,
            "UNIK_AJUSTE",
            sku
          );
        }
      }
    }
  }

  await db.update(entregaUnik).set(patch).where(eq(entregaUnik.id, id));

  const ctx = await contextoUnik();
  const sku = normalizeText(row.sku) || ctx.skuPorChave[chaveNomeItem(row.nome)] || "";
  if (sku && (temSugestao || temCusto)) {
    await sincronizarCustoSugestaoItemPorSku(sku);
  }
  if (sku && patch.fotoUrl) {
    await sincronizarFotosItemUnik(sku, patch.fotoUrl);
  }

  await registrarLog(
    LOG_TIPO.LANCAMENTO_UNIK,
    { id, custo, sugestaoVenda, recebidoPor, quantidade, sku },
    true,
    `Edição lançamento UNIK #${id}`
  );

  return { ok: true, message: "Lançamento salvo." };
}

export async function excluirLancamentoUnik(idBruto: number) {
  await ensureUnikSchema();
  const id = Number(idBruto);
  if (!id) throw new Error("Lançamento inválido.");
  const [row] = await db.select().from(entregaUnik).where(eq(entregaUnik.id, id));
  if (!row) throw new Error("Lançamento não encontrado.");
  await reverterEstoqueLinha(row);
  await db.delete(entregaUnik).where(eq(entregaUnik.id, id));
  await registrarLog(LOG_TIPO.LANCAMENTO_UNIK, { id, nome: row.nome }, true, `Exclusão lançamento UNIK #${id}`);
  return { ok: true, message: `Lançamento “${normalizeText(row.nome) || id}” excluído.` };
}

export async function listarNomesPendentesUnik(opcoes?: { todos?: boolean }) {
  const todos = Boolean(opcoes?.todos);
  const ctx = await contextoUnik();
  const entregas = await db.select().from(entregaUnik).orderBy(desc(entregaUnik.id));
  const pendentesMap: Record<
    string,
    {
      nome: string;
      quantidade: number;
      datas: Set<string>;
      sugestaoNome: string;
      sugestaoSku: string;
      fotoUnik: string;
      custo: number;
      sugestaoVenda: number;
      ultimoId: number;
    }
  > = {};
  for (const row of entregas) {
    const lanc = lancamentoDeRow(row, ctx);
    if (!lanc.nomeEntrega) continue;
    if (!todos) {
      if (!lanc.semSku) continue;
      if (classificarStatusUnik(lanc.status, lanc.tipo) === "ENCOMENDA") continue;
    }
    const ch = chaveNomeItem(lanc.nomeEntrega);
    if (!pendentesMap[ch]) {
      pendentesMap[ch] = {
        nome: lanc.nomeEntrega,
        quantidade: 0,
        datas: new Set(),
        sugestaoNome: lanc.sugestaoNome,
        sugestaoSku: lanc.sugestaoSku,
        fotoUnik: "",
        custo: 0,
        sugestaoVenda: 0,
        ultimoId: 0,
      };
    }
    pendentesMap[ch].quantidade += lanc.quantidade || 0;
    if (lanc.dataYmd) pendentesMap[ch].datas.add(lanc.dataYmd);
    if (!pendentesMap[ch].fotoUnik && lanc.fotoLancamento) {
      pendentesMap[ch].fotoUnik = lanc.fotoLancamento;
    }
    const rowId = Number(row.id) || 0;
    if (rowId >= pendentesMap[ch].ultimoId) {
      pendentesMap[ch].ultimoId = rowId;
      pendentesMap[ch].custo = Number(lanc.custo) || 0;
      pendentesMap[ch].sugestaoVenda = Number(lanc.sugestaoVenda) || 0;
    }
  }
  const nomesPendentes = Object.values(pendentesMap)
    .map((p) => {
      const datas = [...p.datas].sort().reverse();
      return {
        nome: p.nome,
        quantidade: p.quantidade,
        dataEntrega: datas[0] || "",
        dataFmt: datas.map((d) => formatDataHoraBR(d)).join(", "),
        sugestaoNome: p.sugestaoNome,
        sugestaoSku: p.sugestaoSku,
        fotoUnik: p.fotoUnik,
        custo: p.custo,
        sugestaoVenda: p.sugestaoVenda,
      };
    })
    .sort((a, b) => (b.dataEntrega || "").localeCompare(a.dataEntrega || "") || a.nome.localeCompare(b.nome, "pt-BR"));
  return { nomesPendentes };
}

async function reverterEstoqueLinha(row: {
  status: string | null;
  tipo: string | null;
  quantidade: number | null;
  unidade: string | null;
  sku?: string | null;
  estoqueAplicado?: boolean | null;
  estoqueUnidade?: string | null;
}) {
  if (!row.estoqueAplicado) return;
  const sku = normalizeText(row.sku);
  const unidade = normalizeText(row.estoqueUnidade) || UNIK_UNIDADE_GERAL;
  if (!sku) return;
  const [item] = await db.select().from(itens).where(eq(itens.sku, sku));
  if (!item || item.ilimitado) return;
  const delta = deltaUnik(row.status, row.tipo, Number(row.quantidade) || 0);
  if (delta === 0) return;
  try {
    await aplicarMovimentoEstoque(sku, unidade, -delta, "UNIK_AJUSTE", sku);
  } catch {
    const fallback = normalizeText(row.unidade);
    if (fallback && fallback !== unidade) {
      try {
        await aplicarMovimentoEstoque(sku, fallback, -delta, "UNIK_AJUSTE", sku);
      } catch {
        /* estoque pode já ter sido vendido; o vínculo mesmo assim é corrigido */
      }
    }
  }
}

async function aplicarEstoqueLinha(
  row: {
    id: number;
    status: string | null;
    tipo: string | null;
    quantidade: number | null;
    unidade: string | null;
    sku?: string | null;
    estoqueAplicado?: boolean | null;
  },
  item: { sku: string; ilimitado: boolean },
  aplicarEstoque: boolean
) {
  if (row.estoqueAplicado) {
    await db.update(entregaUnik).set({ sku: item.sku }).where(eq(entregaUnik.id, row.id));
    return;
  }
  if (aplicarEstoque) {
    const delta = deltaUnik(row.status, row.tipo, Number(row.quantidade) || 0);
    const unidade = UNIK_UNIDADE_GERAL;
    if (delta !== 0 && !item.ilimitado) {
      await aplicarMovimentoEstoque(
        item.sku,
        unidade,
        delta,
        delta > 0 ? "UNIK_ENTREGA" : "UNIK_RETIRADA",
        item.sku
      );
    }
    await db
      .update(entregaUnik)
      .set({ sku: item.sku, estoqueAplicado: true, estoqueUnidade: unidade })
      .where(eq(entregaUnik.id, row.id));
    return;
  }
  await db
    .update(entregaUnik)
    .set({ sku: item.sku, estoqueAplicado: true })
    .where(eq(entregaUnik.id, row.id));
}

async function sincronizarFotosItemUnik(sku: string, fotoNova = "") {
  const skuLimpo = normalizeText(sku);
  if (!skuLimpo) return;
  const [item] = await db.select().from(itens).where(eq(itens.sku, skuLimpo));
  if (!item) return;
  const entregas = await db.select().from(entregaUnik);
  const doSku = entregas.filter((r) => normalizeUpper(r.sku) === normalizeUpper(skuLimpo));
  const fotoDeEntrega =
    validarFotoUrl(fotoNova) || doSku.map((r) => normalizeText(r.fotoUrl)).find(Boolean) || "";
  const fotoItem = normalizeText(item.fotoUrl);
  const fotoFinal = fotoItem || fotoDeEntrega;
  if (!fotoFinal) return;
  if (!fotoItem) {
    await db.update(itens).set({ fotoUrl: fotoFinal }).where(eq(itens.sku, skuLimpo));
  }
  for (const row of doSku) {
    if (!normalizeText(row.fotoUrl)) {
      await db.update(entregaUnik).set({ fotoUrl: fotoFinal }).where(eq(entregaUnik.id, row.id));
    }
  }
}

export async function salvarFotoUnikSku(sku: string, fotoUrl: string) {
  await ensureUnikSchema();
  const skuLimpo = normalizeText(sku);
  const foto = validarFotoUrl(fotoUrl);
  if (!skuLimpo) throw new Error("SKU obrigatório.");
  if (!foto) throw new Error("Selecione uma foto.");
  const [item] = await db.select().from(itens).where(eq(itens.sku, skuLimpo));
  if (!item) throw new Error("Item do estoque não encontrado.");
  await db.update(itens).set({ fotoUrl: foto }).where(eq(itens.sku, skuLimpo));
  const entregas = await db.select().from(entregaUnik);
  for (const row of entregas) {
    if (normalizeUpper(row.sku) !== normalizeUpper(skuLimpo)) continue;
    await db.update(entregaUnik).set({ fotoUrl: foto }).where(eq(entregaUnik.id, row.id));
  }
  return { ok: true, message: "Foto anexada no item e nas entregas UNIK deste SKU." };
}

export async function registrarEntregaUnik(dados: {
  data?: string;
  sku?: string;
  nome?: string;
  quantidade: number;
  status: string;
  tipo?: string;
  unidade: string;
  fotoUrl?: string;
  custo?: number | string;
  sugestaoVenda?: number | string;
  recebidoPor?: string;
}) {
  await ensureUnikSchema();
  const nome = normalizeText(dados.nome);
  const unidade = normalizeText(dados.unidade);
  const qtd = Number(dados.quantidade);
  if (!nome) throw new Error("Informe o nome do item UNIK.");
  if (!unidade) throw new Error("Unidade obrigatória.");
  if (!qtd || qtd <= 0) throw new Error("Quantidade deve ser maior que zero.");

  const status = normalizeText(dados.status) || "Entregue";
  const tipo = normalizeText(dados.tipo);
  const cls = classificarStatusUnik(status, tipo);
  if (!cls) throw new Error("Status inválido. Use Entregue, Retirado ou Encomenda.");
  const fotoUrl = validarFotoUrl(dados.fotoUrl || "");
  const custo = parsePreco(dados.custo);
  const sugestaoVenda = parsePreco(dados.sugestaoVenda);
  const recebidoPor = normalizeText(dados.recebidoPor);

  const allItens = await db.select().from(itens).where(eq(itens.ativo, true));
  const vinculos = await db.select().from(unikVinculos);
  const chave = chaveNomeItem(nome);
  const vinculo = vinculos.find((v) => v.nomeChave === chave);
  const skuInformado = normalizeText(dados.sku);
  const sku = skuInformado || vinculo?.sku || "";
  const item = sku ? allItens.find((i) => i.sku === sku) : undefined;
  if (item && !campoEhUnik3d(item.subcategoriaMeep)) {
    throw new Error("Na UNIK só vale item com subcategoria UNIK 3D.");
  }

  const data = dados.data ? String(dados.data) : agoraISO();
  const [criada] = await db
    .insert(entregaUnik)
    .values({
      data,
      tipo: tipo || status,
      nome,
      sku: "",
      quantidade: qtd,
      status,
      unidade,
      estoqueAplicado: false,
      fotoUrl: fotoUrl || (item?.fotoUrl || ""),
      custo,
      sugestaoVenda,
      recebidoPor,
    })
    .returning();

  const linha = criada
    ? criada
    : (await db.select().from(entregaUnik).orderBy(desc(entregaUnik.id)).limit(1))[0];
  if (item && linha) {
    await aplicarEstoqueLinha(linha, item, true);
    await sincronizarFotosItemUnik(item.sku, fotoUrl || item.fotoUrl || "");
    if (custo > 0 || sugestaoVenda > 0) {
      await sincronizarCustoSugestaoItemPorSku(item.sku);
    }
  }

  await registrarLog(
    LOG_TIPO.LANCAMENTO_UNIK,
    { nome, sku: item?.sku || "", unidade, qtd, status },
    true,
    `UNIK ${status}: ${nome}`
  );

  if (!item) {
    return {
      ok: true,
      message: `Nome “${nome}” lançado. Depois vincule este nome a um item do estoque para o resumo e o estoque atualizarem.`,
      nome,
      pendenteVinculo: true,
    };
  }

  const delta = deltaUnik(status, tipo, qtd);
  return {
    ok: true,
    message:
      delta === 0
        ? `Registrado e vinculado a ${item.descricao} (encomenda, sem mexer no estoque).`
        : delta > 0
          ? `Registrado, vinculado a ${item.descricao} e ${qtd} un. adicionada(s) no depósito.`
          : `Registrado, vinculado a ${item.descricao} e ${qtd} un. retirada(s) do depósito.`,
    nome,
    sku: item.sku,
    pendenteVinculo: false,
  };
}

export async function vincularNomeUnik(
  nome: string,
  sku: string,
  opts?: { encomenda?: boolean; custo?: number | string }
) {
  await ensureUnikSchema();
  const nomeLimpo = normalizeText(nome);
  const skuLimpo = normalizeText(sku);
  const encomenda = Boolean(opts?.encomenda);
  if (!nomeLimpo) throw new Error("Nome UNIK obrigatório.");
  if (!encomenda && !skuLimpo) throw new Error("Selecione o item do estoque para vincular.");

  const chave = chaveNomeItem(nomeLimpo);

  if (encomenda) {
    const custoInformado = parsePreco(opts?.custo);
    await db.delete(unikVinculos).where(eq(unikVinculos.nomeChave, chave));
    const entregas = await db.select().from(entregaUnik);
    const matching = entregas
      .filter((row) => chaveNomeItem(row.nome) === chave)
      .sort((a, b) => Number(b.id) - Number(a.id));
    if (!matching.length) {
      throw new Error(`Nenhum lançamento encontrado para “${nomeLimpo}”.`);
    }
    const somaAtual = matching.reduce((s, row) => s + (Number(row.custo) || 0), 0);
    // Custo opcional: se não informar, mantém o que já existir nos lançamentos (pode ser 0).
    const custoTotal = custoInformado > 0 ? custoInformado : somaAtual;
    let aplicadas = 0;
    for (let i = 0; i < matching.length; i++) {
      const row = matching[i];
      await reverterEstoqueLinha(row);
      await db
        .update(entregaUnik)
        .set({
          sku: "",
          status: "Encomenda",
          tipo: "Encomenda",
          estoqueAplicado: false,
          // Custo total no lançamento mais recente; evita somar o mesmo valor várias vezes no gráfico.
          custo: i === 0 ? custoTotal : 0,
        })
        .where(eq(entregaUnik.id, row.id));
      aplicadas++;
    }
    await registrarLog(
      LOG_TIPO.LANCAMENTO_UNIK,
      { nome: nomeLimpo, sku: "", aplicadas, encomenda: true, custo: custoTotal },
      true,
      `Encomenda UNIK sem item: ${nomeLimpo} (custo R$ ${custoTotal.toFixed(2)})`
    );
    return {
      ok: true,
      message:
        custoTotal > 0
          ? `“${nomeLimpo}” marcado como encomenda (custo total R$ ${custoTotal.toFixed(2)}). Estoque não muda.`
          : `“${nomeLimpo}” marcado como encomenda (sem custo). Estoque não muda.`,
      sku: "",
    };
  }

  const [item] = await db.select().from(itens).where(eq(itens.sku, skuLimpo));
  if (!item) throw new Error("Item do estoque não encontrado.");
  if (!campoEhUnik3d(item.subcategoriaMeep)) {
    throw new Error("Na UNIK só vale item com subcategoria UNIK 3D.");
  }

  const [existe] = await db.select().from(unikVinculos).where(eq(unikVinculos.nomeChave, chave));
  if (existe) {
    await db
      .update(unikVinculos)
      .set({ sku: skuLimpo, nomeOriginal: nomeLimpo })
      .where(eq(unikVinculos.nomeChave, chave));
  } else {
    await db.insert(unikVinculos).values({
      nomeChave: chave,
      sku: skuLimpo,
      nomeOriginal: nomeLimpo,
    });
  }

  const entregas = await db.select().from(entregaUnik);
  let aplicadas = 0;
  let estoqueNovo = 0;
  let fotoNova = normalizeText(item.fotoUrl);
  for (const row of entregas) {
    if (chaveNomeItem(row.nome) !== chave) continue;
    await reverterEstoqueLinha(row);
    const clsAtual = classificarStatusUnik(row.status, row.tipo);
    const status = clsAtual === "ENCOMENDA" || !row.status ? "Entregue" : row.status;
    const tipo = clsAtual === "ENCOMENDA" ? "Entregue" : row.tipo;
    await db
      .update(entregaUnik)
      .set({
        sku: skuLimpo,
        status,
        tipo,
        estoqueAplicado: false,
      })
      .where(eq(entregaUnik.id, row.id));
    await aplicarEstoqueLinha(
      { ...row, sku: skuLimpo, status, tipo, estoqueAplicado: false },
      item,
      true
    );
    aplicadas++;
    estoqueNovo++;
    if (!fotoNova) fotoNova = normalizeText(row.fotoUrl);
  }
  await sincronizarFotosItemUnik(item.sku, fotoNova);

  await sincronizarCustoSugestaoItemPorSku(item.sku);

  await registrarLog(
    LOG_TIPO.LANCAMENTO_UNIK,
    { nome: nomeLimpo, sku: skuLimpo, aplicadas, estoqueNovo, encomenda: false },
    true,
    `Vínculo UNIK: ${nomeLimpo} → ${item.descricao}`
  );

  return {
    ok: true,
    message:
      estoqueNovo > 0
        ? `“${nomeLimpo}” vinculado a ${item.descricao} (SKU ${item.sku}). ${aplicadas} lançamento(s) atualizado(s).`
        : `“${nomeLimpo}” vinculado a ${item.descricao} (SKU ${item.sku}). ${aplicadas} lançamento(s) atualizado(s).`,
    sku: item.sku,
  };
}

export async function vincularNomesUnik(
  nomes: string[],
  sku: string,
  opts?: { encomenda?: boolean; custo?: number | string }
) {
  const lista = [...new Set((nomes || []).map((n) => normalizeText(n)).filter(Boolean))];
  if (!lista.length) throw new Error("Marque pelo menos um nome UNIK.");
  if (opts?.encomenda) {
    if (lista.length > 1) {
      throw new Error(
        "Marque encomenda um nome por vez, com o custo total daquele item. Assim o gráfico não soma o mesmo valor em vários nomes."
      );
    }
    return vincularNomeUnik(lista[0], "", { encomenda: true, custo: opts.custo });
  }
  let ultimo = { ok: true, message: "", sku };
  for (const nome of lista) {
    ultimo = await vincularNomeUnik(nome, sku, opts);
  }
  const skuLimpo = normalizeText(sku);
  if (skuLimpo && !opts?.encomenda) {
    await sincronizarCustoSugestaoItemPorSku(skuLimpo);
  }
  const [item] = await db.select().from(itens).where(eq(itens.sku, skuLimpo));
  return {
    ok: true,
    message: `${lista.length} nome(s) vinculado(s) a ${item?.descricao || sku}.`,
    sku: ultimo.sku,
  };
}

export async function listarVinculosUnik() {
  const ctx = await contextoUnik();
  const entregas = await db.select().from(entregaUnik);
  const map: Record<
    string,
    {
      nome: string;
      sku: string;
      descricaoItem: string;
      quantidade: number;
      datas: Set<string>;
      encomenda: boolean;
      fotoUnik: string;
      fotoItem: string;
      custoLancamento: number;
      sugestaoLancamento: number;
    }
  > = {};

  const vinculos = await db.select().from(unikVinculos);
  for (const v of vinculos) {
    const item = ctx.itemPorSku[normalizeUpper(v.sku)];
    map[v.nomeChave] = {
      nome: v.nomeOriginal || v.nomeChave,
      sku: v.sku,
      descricaoItem: item?.descricao || "",
      quantidade: 0,
      datas: new Set(),
      encomenda: false,
      fotoUnik: "",
      fotoItem: normalizeText(item?.fotoUrl),
      custoLancamento: 0,
      sugestaoLancamento: 0,
    };
  }

  for (const row of entregas) {
    const lanc = lancamentoDeRow(row, ctx);
    if (!lanc.nomeEntrega) continue;
    const ehEncomenda = classificarStatusUnik(lanc.status, lanc.tipo) === "ENCOMENDA";
    if (lanc.semSku && !ehEncomenda) continue;
    const ch = chaveNomeItem(lanc.nomeEntrega);
    if (!map[ch]) {
      map[ch] = {
        nome: lanc.nomeEntrega,
        sku: lanc.sku,
        descricaoItem: lanc.descricaoItem,
        quantidade: 0,
        datas: new Set(),
        encomenda: false,
        fotoUnik: "",
        fotoItem: "",
        custoLancamento: 0,
        sugestaoLancamento: 0,
      };
    }
    map[ch].quantidade += lanc.quantidade || 0;
    if (lanc.dataYmd) map[ch].datas.add(lanc.dataYmd);
    if (!ehEncomenda) {
      const unit = custoUnitarioLancamento(Number(lanc.custo) || 0, Number(lanc.quantidade) || 1, false);
      if (unit > map[ch].custoLancamento) map[ch].custoLancamento = unit;
      const sug = Number(lanc.sugestaoVenda) || 0;
      if (sug > map[ch].sugestaoLancamento) map[ch].sugestaoLancamento = sug;
    }
    if (ehEncomenda) {
      map[ch].encomenda = true;
      map[ch].sku = "";
      map[ch].descricaoItem = "";
      map[ch].fotoItem = "";
    }
    if (!map[ch].fotoUnik && lanc.fotoLancamento) map[ch].fotoUnik = lanc.fotoLancamento;
    if (!map[ch].fotoItem && !ehEncomenda && lanc.sku) {
      const item = ctx.itemPorSku[normalizeUpper(lanc.sku)];
      if (item?.fotoUrl) map[ch].fotoItem = normalizeText(item.fotoUrl);
    }
  }

  const vinculosLista = Object.values(map)
    .map((p) => {
      const datas = [...p.datas].sort().reverse();
      const item = p.sku ? ctx.itemPorSku[normalizeUpper(p.sku)] : undefined;
      return {
        nome: p.nome,
        sku: p.sku,
        descricaoItem: p.descricaoItem,
        quantidade: p.quantidade,
        dataFmt: datas.map((d) => formatDataHoraBR(d)).join(", ") || "—",
        encomenda: p.encomenda,
        fotoUnik: p.fotoUnik,
        fotoItem: p.fotoItem,
        custoLancamento: p.custoLancamento,
        sugestaoLancamento: p.sugestaoLancamento,
        custoItem: Number(item?.custo) || 0,
        sugestaoItem: Number(item?.sugestaoVenda) || 0,
        /** Compat: UI antiga usava fotoUrl = foto do item (ou UNIK se não houver item). */
        fotoUrl: p.fotoItem || p.fotoUnik,
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  return { vinculos: vinculosLista };
}

export async function resincronizarCustosSugestaoItensUnik(opcoes?: { dryRun?: boolean }) {
  await ensureUnikSchema();
  await ensureItensSchema();
  const dryRun = Boolean(opcoes?.dryRun);

  const vinculos = await db.select().from(unikVinculos);
  const skuPorChave = Object.fromEntries(vinculos.map((v) => [v.nomeChave, v.sku]));
  const entregas = await db.select().from(entregaUnik);
  const allItens = await db.select().from(itens);

  const skus = new Set<string>();
  for (const v of vinculos) {
    const s = normalizeText(v.sku);
    if (s) skus.add(s);
  }
  for (const row of entregas) {
    if (classificarStatusUnik(row.status, row.tipo) === "ENCOMENDA") continue;
    const skuRow = normalizeText(row.sku);
    if (skuRow) skus.add(skuRow);
    const nome = normalizeText(row.nome);
    if (nome) {
      const skuV = normalizeText(skuPorChave[chaveNomeItem(nome)] || "");
      if (skuV) skus.add(skuV);
    }
  }

  const linhas = entregas.map((row) => ({
    sku: row.sku,
    nome: row.nome,
    custo: row.custo,
    quantidade: row.quantidade,
    sugestaoVenda: row.sugestaoVenda,
    status: row.status,
    tipo: row.tipo,
    encomenda: classificarStatusUnik(row.status, row.tipo) === "ENCOMENDA",
  }));

  const alterados: Array<{
    sku: string;
    descricao: string;
    custoAntes: number;
    custoDepois: number;
    sugestaoAntes: number;
    sugestaoDepois: number;
  }> = [];

  for (const sku of [...skus].sort()) {
    const item = allItens.find((i) => normalizeUpper(i.sku) === normalizeUpper(sku));
    if (!item || !campoEhUnik3d(item.subcategoriaMeep)) continue;

    const { custo, sugestaoVenda } = maxCustoSugestaoDeLancamentos(sku, linhas, skuPorChave);
    const patch: { custo?: number; sugestaoVenda?: number } = {};
    if (custo > 0) patch.custo = custo;
    if (sugestaoVenda > 0) patch.sugestaoVenda = sugestaoVenda;
    if (!Object.keys(patch).length) continue;

    const custoAntes = Number(item.custo) || 0;
    const sugestaoAntes = Number(item.sugestaoVenda) || 0;
    const custoDepois = patch.custo ?? custoAntes;
    const sugestaoDepois = patch.sugestaoVenda ?? sugestaoAntes;

    if (custoDepois === custoAntes && sugestaoDepois === sugestaoAntes) continue;

    if (!dryRun) {
      await db.update(itens).set(patch).where(eq(itens.sku, sku));
    }

    alterados.push({
      sku,
      descricao: item.descricao,
      custoAntes,
      custoDepois,
      sugestaoAntes,
      sugestaoDepois,
    });
  }

  return { ok: true, itens: skus.size, atualizados: alterados.length, alterados };
}

export async function desvincularNomeUnik(nome: string) {
  await ensureUnikSchema();
  const nomeLimpo = normalizeText(nome);
  if (!nomeLimpo) throw new Error("Nome UNIK obrigatório.");
  const chave = chaveNomeItem(nomeLimpo);
  const entregas = await db.select().from(entregaUnik);
  let n = 0;
  for (const row of entregas) {
    if (chaveNomeItem(row.nome) !== chave) continue;
    await reverterEstoqueLinha(row);
    const ehEncomenda = classificarStatusUnik(row.status, row.tipo) === "ENCOMENDA";
    await db
      .update(entregaUnik)
      .set({
        sku: "",
        estoqueAplicado: false,
        ...(ehEncomenda ? { status: "Entregue", tipo: "Entregue" } : {}),
      })
      .where(eq(entregaUnik.id, row.id));
    n++;
  }
  await db.delete(unikVinculos).where(eq(unikVinculos.nomeChave, chave));
  await registrarLog(LOG_TIPO.LANCAMENTO_UNIK, { nome: nomeLimpo, n }, true, `Desvínculo UNIK: ${nomeLimpo}`);
  return { ok: true, message: `Vínculo de “${nomeLimpo}” desfeito. ${n} lançamento(s) voltaram a pendente.` };
}

function montarNomesUnikPorSku(
  vinculos: { sku: string; nomeChave: string; nomeOriginal: string | null }[],
  entregas: { sku: string | null; nome: string | null; status: string | null; tipo: string | null }[],
  skuPorChave: Record<string, string>
): Record<string, string> {
  const nomes: Record<string, string[]> = {};
  function add(sku: string, nome: string) {
    const up = normalizeUpper(sku);
    const n = normalizeText(nome);
    if (!up || !n) return;
    if (!nomes[up]) nomes[up] = [];
    const chave = chaveNomeItem(n);
    if (nomes[up].some((x) => chaveNomeItem(x) === chave)) return;
    nomes[up].push(n);
  }
  for (const v of vinculos) add(v.sku, v.nomeOriginal || v.nomeChave);
  for (const row of entregas) {
    if (classificarStatusUnik(row.status, row.tipo) === "ENCOMENDA") continue;
    const nome = normalizeText(row.nome);
    if (!nome) continue;
    const sku = normalizeText(row.sku) || skuPorChave[chaveNomeItem(nome)] || "";
    add(sku, nome);
  }
  return Object.fromEntries(Object.entries(nomes).map(([k, arr]) => [k, arr.join(" · ")]));
}

function qtdLancadaPorSku(
  entregas: { sku: string | null; nome: string | null; status: string | null; tipo: string | null; quantidade: number | null }[],
  skuPorChave: Record<string, string>
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of entregas) {
    if (classificarStatusUnik(row.status, row.tipo) === "ENCOMENDA") continue;
    const nome = normalizeText(row.nome);
    const sku = normalizeText(row.sku) || (nome ? skuPorChave[chaveNomeItem(nome)] : "") || "";
    const up = normalizeUpper(sku);
    if (!up) continue;
    const delta = deltaUnik(row.status, row.tipo, Number(row.quantidade) || 0);
    if (delta === 0) continue;
    out[up] = (out[up] || 0) + delta;
  }
  return out;
}

function qtdDistribuidaPorSku(
  movs: { sku: string; unidade: string; delta: number | null; tipo: string | null }[]
): Record<string, number> {
  const out: Record<string, number> = {};
  const lojas = UNIK_LOJAS.map((u) => normalizeUpper(u));
  for (const m of movs) {
    if (normalizeUpper(m.tipo) !== "UNIK_DISTRIBUICAO") continue;
    if (!lojas.includes(chaveUnidadeUnik(m.unidade))) continue;
    const d = Number(m.delta) || 0;
    if (d <= 0) continue;
    const up = normalizeUpper(m.sku);
    out[up] = (out[up] || 0) + d;
  }
  return out;
}

export async function getUnikConciliacao(filtros: {
  dataInicio?: string;
  dataFim?: string;
  unidade?: string;
  estoqueAtual?: string;
}) {
  await ensureUnikSchema();
  const allItens = await db.select().from(itens);
  const vinculos = await db.select().from(unikVinculos);
  const skuPorChave = Object.fromEntries(vinculos.map((v) => [v.nomeChave, v.sku]));
  const itemPorSku = Object.fromEntries(allItens.map((i) => [normalizeUpper(i.sku), i]));
  const unidadeFiltro = normalizeUpper(filtros.unidade);
  const lojas = UNIK_LOJAS.map((u) => normalizeUpper(u));
  const entregas = await db.select().from(entregaUnik).orderBy(desc(entregaUnik.id));

  const nomesUnik = montarNomesUnikPorSku(vinculos, entregas, skuPorChave);
  const skusUnik = new Set<string>();
  const saidasPorSkuUnidade: Record<string, number> = {};
  for (const row of entregas) {
    const nome = normalizeText(row.nome);
    if (!nome) continue;
    const cls = classificarStatusUnik(row.status, row.tipo);
    if (cls === "ENCOMENDA") continue;
    const sku = normalizeText(row.sku) || skuPorChave[chaveNomeItem(nome)] || "";
    const item = sku ? itemPorSku[normalizeUpper(sku)] : undefined;
    if (!item || !campoEhUnik3d(item.subcategoriaMeep)) continue;
    const up = normalizeUpper(item.sku);
    skusUnik.add(up);
    const ymd = dataYmd(row.data || "");
    if (filtros.dataInicio && ymd && ymd < filtros.dataInicio) continue;
    if (filtros.dataFim && ymd && ymd > filtros.dataFim) continue;
    const delta = deltaUnik(row.status, row.tipo, Number(row.quantidade) || 0);
    if (delta >= 0) continue;
    const uniEst = normalizeUpper(row.estoqueUnidade || row.unidade);
    if (!lojas.includes(uniEst)) continue;
    const key = `${up}|${uniEst}`;
    saidasPorSkuUnidade[key] = (saidasPorSkuUnidade[key] || 0) + -delta;
  }

  for (const v of vinculos) {
    const item = itemPorSku[normalizeUpper(v.sku)];
    if (item && campoEhUnik3d(item.subcategoriaMeep)) skusUnik.add(normalizeUpper(item.sku));
  }

  const vendPorSkuUnidade: Record<string, number> = {};
  const allVendas = await db.select().from(vendas);
  for (const row of allVendas) {
    if (isVendaCancelada(row.status)) continue;
    const upV = normalizeUpper(row.sku);
    if (!skusUnik.has(upV)) continue;
    const uni = normalizeUpper(row.unidade);
    if (!lojas.includes(uni)) continue;
    const ymd = dataYmd(row.data);
    if (filtros.dataInicio && ymd < filtros.dataInicio) continue;
    if (filtros.dataFim && ymd > filtros.dataFim) continue;
    const qv = Number(row.quantidade) || 0;
    if (qv <= 0) continue;
    const key = `${upV}|${uni}`;
    vendPorSkuUnidade[key] = (vendPorSkuUnidade[key] || 0) + qv;
  }

  const estPorSkuUnidade: Record<string, number> = {};
  const estRows = await db.select().from(estoque);
  for (const row of estRows) {
    const up = normalizeUpper(row.sku);
    if (!skusUnik.has(up)) continue;
    const uni = normalizeUpper(row.unidade);
    if (uni === normalizeUpper(UNIK_UNIDADE_GERAL)) continue;
    if (!lojas.includes(uni) && uni) continue;
    estPorSkuUnidade[`${up}|${uni}`] = (estPorSkuUnidade[`${up}|${uni}`] || 0) + (Number(row.quantidade) || 0);
  }

  const chaves = new Set([
    ...Object.keys(estPorSkuUnidade),
    ...Object.keys(vendPorSkuUnidade),
    ...Object.keys(saidasPorSkuUnidade),
  ]);

  let resumo = [...chaves]
    .map((key) => {
      const [up, uni] = key.split("|");
      const item = itemPorSku[up];
      const estoqueAtual = qtdArred(estPorSkuUnidade[key] || 0);
      const qtdVendida = qtdArred(vendPorSkuUnidade[key] || 0);
      const saidasParceiro = qtdArred(saidasPorSkuUnidade[key] || 0);
      const estoque = qtdArred(estoqueAtual + qtdVendida + saidasParceiro);
      const unidade = UNIK_LOJAS.find((u) => normalizeUpper(u) === uni) || uni;
      return {
        sku: item?.sku || up,
        unidade,
        descricao: item?.descricao || up,
        nomeUnik: nomesUnik[up] || "",
        fotoUrl: normalizeText(item?.fotoUrl),
        estoque,
        saidasParceiro,
        qtdVendida,
        estoqueAtual,
      };
    })
    .filter((r) => {
      if (unidadeFiltro && normalizeUpper(r.unidade) !== unidadeFiltro) return false;
      return true;
    })
    .sort(
      (a, b) =>
        a.descricao.localeCompare(b.descricao, "pt-BR") || a.unidade.localeCompare(b.unidade, "pt-BR")
    );

  const filtroEst = normalizeText(filtros.estoqueAtual);
  if (filtroEst === "eq0") resumo = resumo.filter((r) => Math.abs(r.estoqueAtual) < 1e-9);
  else if (filtroEst === "lt0") resumo = resumo.filter((r) => r.estoqueAtual < -1e-9);
  else if (filtroEst === "gt0") resumo = resumo.filter((r) => r.estoqueAtual > 1e-9);

  registrarLogConsulta(LOG_TIPO.CONSULTA_UNIK, filtros, "Consulta UNIK estoque loja");

  return {
    resumo,
    formula: "Uma linha por unidade da loja. Nome UNIK vem do lançamento/vínculo. Estoque = atual + vendidos + retiradas. Estoque atual é o saldo de hoje nessa unidade.",
    avisos: [] as string[],
  };
}

type LinhaVendaUnik = {
  id: number;
  data: string;
  dataFmt: string;
  unidade: string;
  sku: string;
  descricao: string;
  fotoUrl: string;
  quantidade: number;
  valorVenda: number;
  totalVendido: number;
  custoUnik: number | null;
  custo60: number;
  lucroUnik: number;
  lucro60: number;
  encomenda?: boolean;
};

async function listarVendasUnik60Store(filtros: {
  inicio: string;
  fim: string;
  unidade?: string;
}): Promise<LinhaVendaUnik[]> {
  await ensureUnikSchema();
  const allItens = await db.select().from(itens);
  const itemPorSku = Object.fromEntries(allItens.map((i) => [normalizeUpper(i.sku), i]));

  const unidadeFiltro = normalizeUpper(filtros.unidade);
  const vendasPeriodo = await listarVendasNoPeriodo({
    inicio: filtros.inicio,
    fim: filtros.fim,
    unidade: filtros.unidade,
  });
  const linhas: LinhaVendaUnik[] = [];

  for (const row of vendasPeriodo) {
    const ymd = dataYmd(row.data);
    const item = itemPorSku[normalizeUpper(row.sku)];
    const ehUnik3d = vendaEhUnik3d(item, row);
    if (!ehUnik3d) continue;

    const qtd = Number(row.quantidade) || 1;
    const valorVenda = roundMoney(
      Number(row.precoUnitario) ||
        (Number(row.subtotalBruto) || 0) / qtd ||
        (Number(row.valorRecebido) || 0) / qtd
    );
    const custoUnikUnit = custoUnikRelatorioVendas(Number(item?.custo) || 0);
    const calc = calcularLinhaRelatorioUnik({
      quantidade: qtd,
      valorVenda,
      custoUnik: custoUnikUnit,
    });

    linhas.push({
      id: row.id,
      data: ymd,
      dataFmt: formatDataHoraBR(row.data),
      unidade: row.unidade || "",
      sku: item?.sku || row.sku,
      descricao: item?.descricao || row.descricao || row.sku,
      fotoUrl: fotoUrlParaListagem(item?.fotoUrl, { sku: item?.sku || row.sku }),
      quantidade: qtd,
      valorVenda,
      totalVendido: calc.totalVendido,
      custoUnik: calc.custoUnik,
      custo60: calc.custo60,
      lucroUnik: calc.receberUnik,
      lucro60: calc.receber60,
      encomenda: false,
    });
  }

  const entregas = await db.select().from(entregaUnik).orderBy(desc(entregaUnik.id));
  for (const row of entregas) {
    if (classificarStatusUnik(row.status, row.tipo) !== "ENCOMENDA") continue;
    const ymd = dataYmd(row.data || "");
    if (ymd < filtros.inicio || ymd > filtros.fim) continue;
    if (unidadeFiltro && normalizeUpper(row.unidade) !== unidadeFiltro) continue;
    const item = itemPorSku[normalizeUpper(row.sku)];
    const qtd = Number(row.quantidade) || 1;
    const custoTotal = roundMoney(Number(row.custo) || 0);
    const custoUnikEnc = custoTotal > 0 ? custoTotal : null;
    linhas.push({
      id: -Math.abs(row.id || 0) || -linhas.length - 1,
      data: ymd,
      dataFmt: formatDataHoraBR(row.data),
      unidade: row.unidade || "",
      sku: item?.sku || "",
      descricao: item ? `${item.descricao} (encomenda)` : `${normalizeText(row.nome) || "Encomenda"} (encomenda)`,
      fotoUrl:
        fotoUrlParaListagem(item?.fotoUrl, { sku: item?.sku }) ||
        fotoUrlParaListagem(row.fotoUrl, { unikId: row.id }),
      quantidade: qtd,
      valorVenda: 0,
      totalVendido: 0,
      custoUnik: custoUnikEnc,
      custo60: 0,
      lucroUnik: custoUnikEnc ?? 0,
      lucro60: custoUnikEnc ?? 0,
      encomenda: true,
    });
  }

  return linhas;
}

function somarTotaisUnik(linhas: LinhaVendaUnik[]) {
  return linhas.reduce(
    (acc, l) => ({
      quantidade: acc.quantidade + l.quantidade,
      valorVenda: roundMoney(acc.valorVenda + l.valorVenda),
      totalVendido: roundMoney(acc.totalVendido + l.totalVendido),
      custoUnik: roundMoney(acc.custoUnik + (l.custoUnik ?? 0)),
      custo60: roundMoney(acc.custo60 + l.custo60),
      lucroUnik: roundMoney(acc.lucroUnik + l.lucroUnik),
      lucro60: roundMoney(acc.lucro60 + l.lucro60),
    }),
    { quantidade: 0, valorVenda: 0, totalVendido: 0, custoUnik: 0, custo60: 0, lucroUnik: 0, lucro60: 0 }
  );
}

function mesOffsetISO(ym: string, delta: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function rotuloMesCurto(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const nome = new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
  return `${nome}/${String(y).slice(2)}`;
}

export async function getUnikRelatorioVendas(filtros: {
  mes?: string;
  unidade?: string;
}) {
  const mes = filtros.mes || mesAtualISO();
  const { inicio, fim, rotulo } = parseMesFiltro(mes);
  const linhas = await listarVendasUnik60Store({
    inicio,
    fim,
    unidade: filtros.unidade,
  });
  const totais = somarTotaisUnik(linhas);

  registrarLogConsulta(LOG_TIPO.CONSULTA_UNIK, { mes, ...filtros }, "Relatorio vendas UNIK 3D");

  return {
    linhas,
    totais,
    mes,
    mesRotulo: rotulo,
    formula: textoFormulaRelatorioVendasUnik(),
  };
}

export type LinhaEncomendaUnik = {
  id: number;
  data: string;
  dataFmt: string;
  nome: string;
  unidade: string;
  sku: string;
  descricaoItem: string;
  quantidade: number;
  custo: number;
  valorFinal: number;
  fotoUrl: string;
};

export async function getUnikRelatorioEncomendas(filtros: {
  mes?: string;
  unidade?: string;
  nome?: string;
}) {
  const ctx = await contextoUnik();
  let inicio = "1970-01-01";
  let fim = "2099-12-31";
  let mesRotulo = "Todos os períodos";
  if (filtros.mes) {
    const p = parseMesFiltro(filtros.mes);
    inicio = p.inicio;
    fim = p.fim;
    mesRotulo = p.rotulo;
  }

  const unidadeFiltro = filtros.unidade ? normalizeUpper(filtros.unidade) : "";
  const nomeFiltro = chaveNomeItem(filtros.nome);

  const entregas = await db.select().from(entregaUnik).orderBy(desc(entregaUnik.id));
  const linhas: LinhaEncomendaUnik[] = [];

  for (const row of entregas) {
    if (classificarStatusUnik(row.status, row.tipo) !== "ENCOMENDA") continue;

    const ymd = dataYmd(row.data || "");
    if (ymd < inicio || ymd > fim) continue;
    if (unidadeFiltro && normalizeUpper(row.unidade) !== unidadeFiltro) continue;

    const nome = normalizeText(row.nome);
    if (!nome) continue;
    if (nomeFiltro && !chaveNomeItem(nome).includes(nomeFiltro)) continue;

    const qtd = Number(row.quantidade) || 1;
    const custoLanc = Number(row.custo) || 0;
    const sugestaoLanc = Number(row.sugestaoVenda) || 0;
    const custo = precoUnitarioEncomenda(custoLanc, sugestaoLanc);
    const valorFinal = valorFinalEncomenda(custoLanc, sugestaoLanc, qtd);
    const sku = normalizeText(row.sku) || ctx.skuPorChave[chaveNomeItem(nome)] || "";
    const item = sku ? ctx.itemPorSku[normalizeUpper(sku)] : undefined;

    linhas.push({
      id: Number(row.id) || 0,
      data: ymd,
      dataFmt: formatDataHoraBR(row.data),
      nome,
      unidade: row.unidade || "",
      sku: item?.sku || sku,
      descricaoItem: item?.descricao || "",
      quantidade: qtd,
      custo,
      valorFinal,
      fotoUrl:
        fotoUrlParaListagem(row.fotoUrl, { unikId: row.id }) ||
        fotoUrlParaListagem(item?.fotoUrl, { sku: item?.sku || sku }),
    });
  }

  const totais = linhas.reduce(
    (acc, l) => ({
      quantidade: acc.quantidade + l.quantidade,
      valorFinal: roundMoney(acc.valorFinal + l.valorFinal),
    }),
    { quantidade: 0, valorFinal: 0 }
  );

  registrarLogConsulta(LOG_TIPO.CONSULTA_UNIK, { ...filtros, tipo: "encomendas" }, "Relatorio encomendas UNIK");

  return {
    linhas,
    totais,
    mes: filtros.mes || "",
    mesRotulo,
    formula:
      "Somente lançamentos marcados como encomenda. Preço unitário = maior entre custo e sugestão de venda. Valor final = preço unitário × quantidade.",
  };
}

function somarDia(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d + 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function topItensUnik(linhas: LinhaVendaUnik[], limite = 10) {
  const porItem: Record<
    string,
    { sku: string; descricao: string; quantidade: number; totalVendido: number; lucroUnik: number; lucro60: number }
  > = {};
  for (const l of linhas) {
    const up = normalizeUpper(l.sku);
    if (!porItem[up]) {
      porItem[up] = {
        sku: l.sku,
        descricao: l.descricao,
        quantidade: 0,
        totalVendido: 0,
        lucroUnik: 0,
        lucro60: 0,
      };
    }
    porItem[up].quantidade += l.quantidade;
    porItem[up].totalVendido = roundMoney(porItem[up].totalVendido + l.totalVendido);
    porItem[up].lucroUnik = roundMoney(porItem[up].lucroUnik + l.lucroUnik);
    porItem[up].lucro60 = roundMoney(porItem[up].lucro60 + l.lucro60);
  }
  return Object.values(porItem)
    .sort((a, b) => b.quantidade - a.quantidade || b.totalVendido - a.totalVendido)
    .slice(0, limite);
}

function partirVendasEncomenda(linhas: LinhaVendaUnik[]) {
  const vendas: LinhaVendaUnik[] = [];
  const encomendas: LinhaVendaUnik[] = [];
  for (const l of linhas) {
    if (l.encomenda) encomendas.push(l);
    else vendas.push(l);
  }
  return { vendas, encomendas };
}

export async function getUnikDashboardDiario(filtros: { mes?: string; unidade?: string }) {
  const mes = filtros.mes || mesAtualISO();
  const { inicio, fim, rotulo } = parseMesFiltro(mes);
  const linhas = await listarVendasUnik60Store({
    inicio,
    fim,
    unidade: filtros.unidade,
  });
  const { vendas, encomendas } = partirVendasEncomenda(linhas);

  const porDia: Record<
    string,
    { data: string; label: string; totalVendido: number; lucroUnik: number; lucro60: number }
  > = {};
  const porDiaEncomenda: Record<string, { data: string; label: string; lucro60: number; quantidade: number }> = {};
  for (let d = inicio; d <= fim; d = somarDia(d)) {
    porDia[d] = { data: d, label: d.slice(8), totalVendido: 0, lucroUnik: 0, lucro60: 0 };
    porDiaEncomenda[d] = { data: d, label: d.slice(8), lucro60: 0, quantidade: 0 };
  }
  for (const l of vendas) {
    const dia = porDia[l.data];
    if (!dia) continue;
    dia.totalVendido = roundMoney(dia.totalVendido + l.totalVendido);
    dia.lucroUnik = roundMoney(dia.lucroUnik + l.lucroUnik);
    dia.lucro60 = roundMoney(dia.lucro60 + l.lucro60);
  }
  for (const l of encomendas) {
    const dia = porDiaEncomenda[l.data];
    if (!dia) continue;
    dia.lucro60 = roundMoney(dia.lucro60 + l.lucro60);
    dia.quantidade += l.quantidade;
  }

  const encomendasSemCusto = encomendas.filter((l) => l.custoUnik == null).length;

  registrarLogConsulta(LOG_TIPO.CONSULTA_UNIK, { mes, ...filtros }, "Dashboard UNIK diario UNIK 3D");

  return {
    mes,
    mesRotulo: rotulo,
    totais: somarTotaisUnik(vendas),
    topItens: topItensUnik(vendas),
    porDia: Object.values(porDia),
    totaisEncomenda: somarTotaisUnik(encomendas),
    porDiaEncomenda: Object.values(porDiaEncomenda),
    encomendasSemCusto,
    encomendasQtd: encomendas.reduce((s, l) => s + l.quantidade, 0),
  };
}

export async function getUnikDashboardMes(filtros: {
  mesInicio?: string;
  mesFim?: string;
  mes?: string;
  unidade?: string;
}) {
  const fimYm = filtros.mesFim || filtros.mes || mesAtualISO();
  const inicioYm = filtros.mesInicio || UNIK_MES_INICIO_DADOS;
  const a = inicioYm <= fimYm ? inicioYm : fimYm;
  const b = inicioYm <= fimYm ? fimYm : inicioYm;
  const { inicio } = parseMesFiltro(a);
  const { fim } = parseMesFiltro(b);

  const linhas = await listarVendasUnik60Store({
    inicio,
    fim,
    unidade: filtros.unidade,
  });
  const { vendas, encomendas } = partirVendasEncomenda(linhas);

  const porMes: Record<
    string,
    { mes: string; label: string; totalVendido: number; lucroUnik: number; lucro60: number; quantidade: number }
  > = {};
  const porMesEncomenda: Record<string, { mes: string; label: string; lucro60: number; quantidade: number }> = {};
  for (let ym = a, n = 0; ym <= b && n < 60; ym = mesOffsetISO(ym, 1), n++) {
    porMes[ym] = {
      mes: ym,
      label: rotuloMesCurto(ym),
      totalVendido: 0,
      lucroUnik: 0,
      lucro60: 0,
      quantidade: 0,
    };
    porMesEncomenda[ym] = { mes: ym, label: rotuloMesCurto(ym), lucro60: 0, quantidade: 0 };
  }
  for (const l of vendas) {
    const bucket = porMes[l.data.slice(0, 7)];
    if (!bucket) continue;
    bucket.quantidade += l.quantidade;
    bucket.totalVendido = roundMoney(bucket.totalVendido + l.totalVendido);
    bucket.lucroUnik = roundMoney(bucket.lucroUnik + l.lucroUnik);
    bucket.lucro60 = roundMoney(bucket.lucro60 + l.lucro60);
  }
  for (const l of encomendas) {
    const bucket = porMesEncomenda[l.data.slice(0, 7)];
    if (!bucket) continue;
    bucket.quantidade += l.quantidade;
    bucket.lucro60 = roundMoney(bucket.lucro60 + l.lucro60);
  }

  const encomendasSemCusto = encomendas.filter((l) => l.custoUnik == null).length;

  await registrarLog(
    LOG_TIPO.CONSULTA_UNIK,
    { mesInicio: a, mesFim: b, ...filtros },
    true,
    "Dashboard UNIK mes UNIK 3D"
  );

  return {
    mesInicio: a,
    mesFim: b,
    janela: `${rotuloMesCurto(a)} a ${rotuloMesCurto(b)}`,
    totais: somarTotaisUnik(vendas),
    topItens: topItensUnik(vendas),
    porMes: Object.values(porMes),
    totaisEncomenda: somarTotaisUnik(encomendas),
    porMesEncomenda: Object.values(porMesEncomenda),
    encomendasSemCusto,
    encomendasQtd: encomendas.reduce((s, l) => s + l.quantidade, 0),
  };
}

function qtdArred(n: number) {
  const v = Number((Number(n) || 0).toFixed(4));
  return Math.abs(v) < 1e-9 ? 0 : v;
}

export async function getUnikXItens() {
  await ensureUnikSchema();
  const allItens = await db.select().from(itens);
  const itemPorSku = Object.fromEntries(allItens.map((i) => [normalizeUpper(i.sku), i]));
  const vinculos = await db.select().from(unikVinculos);
  const skuPorChave = Object.fromEntries(vinculos.map((v) => [v.nomeChave, v.sku]));
  const entregas = await db.select().from(entregaUnik);

  type NomeAgg = {
    nome: string;
    sku: string;
    qtdUnik: number;
    datas: Set<string>;
    movimento: boolean;
    fotoUrl: string;
  };
  const porNome: Record<string, NomeAgg> = {};

  function garantirNome(chave: string, nome: string, sku: string): NomeAgg {
    if (!porNome[chave]) {
      porNome[chave] = { nome, sku, qtdUnik: 0, datas: new Set(), movimento: false, fotoUrl: "" };
    }
    if (!porNome[chave].sku && sku) porNome[chave].sku = sku;
    if (nome && porNome[chave].nome === chave) porNome[chave].nome = nome;
    return porNome[chave];
  }

  for (const row of entregas) {
    const nome = normalizeText(row.nome);
    if (!nome) continue;
    const cls = classificarStatusUnik(row.status, row.tipo);
    if (cls === "ENCOMENDA") continue;
    const chave = chaveNomeItem(nome);
    const sku = normalizeText(row.sku) || skuPorChave[chave] || "";
    const agg = garantirNome(chave, nome, sku);
    agg.movimento = true;
    agg.qtdUnik += deltaUnik(row.status, row.tipo, Number(row.quantidade) || 0);
    const ymd = dataYmd(row.data || "");
    if (ymd) agg.datas.add(ymd);
    if (!agg.fotoUrl) agg.fotoUrl = normalizeText(row.fotoUrl);
  }

  const vendPorSku: Record<string, number> = {};
  const allVendas = await db.select().from(vendas);
  for (const row of allVendas) {
    if (isVendaCancelada(row.status)) continue;
    const up = normalizeUpper(row.sku);
    const item = itemPorSku[up];
    if (!item || !campoEhUnik3d(item.subcategoriaMeep)) continue;
    vendPorSku[up] = (vendPorSku[up] || 0) + (Number(row.quantidade) || 0);
  }

  const estPorSku: Record<string, number> = {};
  const estRows = await db.select().from(estoque);
  for (const row of estRows) {
    const up = normalizeUpper(row.sku);
    estPorSku[up] = (estPorSku[up] || 0) + (Number(row.quantidade) || 0);
  }

  const qtdUnikPorSku: Record<string, number> = {};
  const nomesPorSku: Record<string, string[]> = {};
  for (const agg of Object.values(porNome)) {
    if (!agg.movimento) continue;
    const up = normalizeUpper(agg.sku);
    if (!up) continue;
    qtdUnikPorSku[up] = (qtdUnikPorSku[up] || 0) + agg.qtdUnik;
    if (!nomesPorSku[up]) nomesPorSku[up] = [];
    nomesPorSku[up].push(agg.nome);
  }

  const linhas = Object.values(porNome)
    .filter((agg) => {
      if (!agg.movimento) return false;
      if (!agg.sku) return true;
      const item = itemPorSku[normalizeUpper(agg.sku)];
      if (item && !campoEhUnik3d(item.subcategoriaMeep)) return false;
      return true;
    })
    .map((agg) => {
      const item = agg.sku ? itemPorSku[normalizeUpper(agg.sku)] : undefined;
      const up = normalizeUpper(agg.sku);
      const qtdVendida = qtdArred(vendPorSku[up] || 0);
      const estoqueAtual = qtdArred(estPorSku[up] || 0);
      const estoque60 = qtdArred(qtdVendida + estoqueAtual);
      const qtdUnik = qtdArred(agg.qtdUnik);
      const qtdUnikItem = up ? qtdArred(qtdUnikPorSku[up] || 0) : qtdUnik;
      const diferenca = qtdArred(qtdUnik - estoque60);
      const datas = [...agg.datas].sort();
      const ultima = datas[datas.length - 1] || "";
      return {
        nomeUnik: agg.nome,
        nomeItem: item?.descricao || "",
        sku: item?.sku || agg.sku || "",
        fotoUrl: normalizeText(item?.fotoUrl) || agg.fotoUrl,
        qtdUnik,
        qtdUnikItem,
        qtdVendida,
        estoqueAtual,
        estoque60,
        diferenca,
        divergente: Math.abs(diferenca) >= 0.0001,
        outrosNomes: (nomesPorSku[up] || []).filter((n) => chaveNomeItem(n) !== chaveNomeItem(agg.nome)),
        ultimaEntrega: ultima,
        datasEntrega: datas,
        dataFmt: ultima ? formatDataHoraBR(ultima) : "—",
      };
    })
    .sort((a, b) => {
      if (a.ultimaEntrega !== b.ultimaEntrega) return b.ultimaEntrega.localeCompare(a.ultimaEntrega);
      return a.nomeUnik.localeCompare(b.nomeUnik, "pt-BR");
    });

  registrarLogConsulta(LOG_TIPO.CONSULTA_UNIK, { n: linhas.length }, "UNIK x itens");

  return {
    linhas,
    formula:
      "Encomenda fica de fora. Qtd UNIK = entregas − retiradas daquele nome. Estoque 60 = vendidos + saldo atual (todas as unidades). Diferença = qtd UNIK − estoque 60. Use isso para achar nome UNIK ligado ao item errado.",
  };
}

export async function getUnikEstoqueGeral() {
  await ensureUnikSchema();
  await migrarEstoqueUnikLojaParaGeral();
  const allItens = await db.select().from(itens);
  const itensUnik = allItens.filter((i) => campoEhUnik3d(i.subcategoriaMeep));
  const estRows = await db.select().from(estoque);
  const statusRows = await db.select().from(unikLojaStatus);
  const vinculos = await db.select().from(unikVinculos);
  const entregas = await db.select().from(entregaUnik);
  const movs = await db.select().from(movimentosEstoque);
  const skuPorChave = Object.fromEntries(vinculos.map((v) => [v.nomeChave, v.sku]));
  const nomesUnik = montarNomesUnikPorSku(vinculos, entregas, skuPorChave);
  const lancadaMap = qtdLancadaPorSku(entregas, skuPorChave);
  const enviadoMap = qtdDistribuidaPorSku(movs);
  const statusMap = Object.fromEntries(
    statusRows.map((s) => [`${normalizeUpper(s.sku)}|${chaveUnidadeUnik(s.unidade)}`, s])
  );

  const qtdMap: Record<string, number> = {};
  for (const row of estRows) {
    const key = `${normalizeUpper(row.sku)}|${chaveUnidadeUnik(row.unidade)}`;
    qtdMap[key] = (qtdMap[key] || 0) + (Number(row.quantidade) || 0);
  }
  const qtd = (sku: string, unidade: string) => qtdMap[`${normalizeUpper(sku)}|${chaveUnidadeUnik(unidade)}`] || 0;

  const sugestaoMap: Record<string, number> = {};
  const entregasOrd = [...entregas].sort((a, b) => (b.id || 0) - (a.id || 0));
  for (const row of entregasOrd) {
    if (classificarStatusUnik(row.status, row.tipo) === "ENCOMENDA") continue;
    const nome = normalizeText(row.nome);
    const sku = normalizeText(row.sku) || (nome ? skuPorChave[chaveNomeItem(nome)] : "") || "";
    const up = normalizeUpper(sku);
    if (!up) continue;
    if ((sugestaoMap[up] || 0) > 0) continue;
    sugestaoMap[up] = Number(row.sugestaoVenda) || 0;
  }

  const linhas = itensUnik
    .map((item) => {
      const up = normalizeUpper(item.sku);
      const geral = qtdArred(qtd(item.sku, UNIK_UNIDADE_GERAL));
      const lojas = UNIK_LOJAS.map((unidade) => {
        const st = statusMap[`${up}|${chaveUnidadeUnik(unidade)}`];
        return {
          unidade,
          quantidade: qtdArred(qtd(item.sku, unidade)),
          enviado: Boolean(st?.enviado),
          lancado: Boolean(st?.lancado),
        };
      });
      const qtdNasLojas = lojas.reduce((s, j) => s + j.quantidade, 0);
      const qtdLancada = qtdArred(Math.max(0, lancadaMap[up] || 0));
      const qtdJaEnviada = qtdArred(Math.max(enviadoMap[up] || 0, qtdNasLojas));
      const restanteLancamento = qtdArred(Math.max(0, qtdLancada - qtdJaEnviada));
      const podeEnviar = qtdArred(Math.min(geral, restanteLancamento));
      const nomeUnik = nomesUnik[up] || "";
      return {
        sku: item.sku,
        descricao: item.descricao,
        nomeUnik,
        categoria: item.categoriaDash || "",
        fotoUrl: normalizeText(item.fotoUrl),
        preco: Number(item.preco) || 0,
        custo: Number(item.custo) || 0,
        sugestaoVenda: Number(item.sugestaoVenda) || sugestaoMap[up] || 0,
        geral,
        qtdLancada,
        qtdJaEnviada,
        restanteLancamento,
        podeEnviar,
        lojas,
      };
    })
    .filter(
      (l) =>
        l.geral > 0 ||
        l.lojas.some((j) => j.quantidade > 0) ||
        l.qtdLancada > 0 ||
        Boolean(l.nomeUnik)
    )
    .sort((a, b) => a.descricao.localeCompare(b.descricao, "pt-BR"));

  return { linhas, lojas: UNIK_LOJAS, unidadeGeral: UNIK_UNIDADE_GERAL };
}

export async function salvarPrecoFinalUnik(sku: string, preco: number | string) {
  await ensureUnikSchema();
  const skuLimpo = normalizeText(sku);
  if (!skuLimpo) throw new Error("Item obrigatório.");
  const valor = parsePreco(preco);
  if (valor <= 0) throw new Error("Informe o preço final maior que zero.");
  const [item] = await db.select().from(itens).where(eq(itens.sku, skuLimpo));
  if (!item || !campoEhUnik3d(item.subcategoriaMeep)) {
    throw new Error("Só vale item UNIK 3D.");
  }
  await db.update(itens).set({ preco: valor }).where(eq(itens.sku, skuLimpo));
  await registrarLog(LOG_TIPO.LANCAMENTO_UNIK, { sku: skuLimpo, preco: valor }, true, `Preço final UNIK ${skuLimpo}`);
  return { ok: true, message: `Preço final de ${item.descricao}: R$ ${valor.toFixed(2).replace(".", ",")}.` };
}

export async function salvarCustoSugestaoUnik(dados: {
  sku: string;
  custo?: number | string;
  sugestaoVenda?: number | string;
}) {
  await ensureUnikSchema();
  await ensureItensSchema();
  const skuLimpo = normalizeText(dados.sku);
  if (!skuLimpo) throw new Error("Item obrigatório.");
  const [item] = await db.select().from(itens).where(eq(itens.sku, skuLimpo));
  if (!item || !campoEhUnik3d(item.subcategoriaMeep)) {
    throw new Error("Só vale item UNIK 3D.");
  }

  const patch = {
    custo: Math.max(0, parsePreco(dados.custo ?? 0)),
    sugestaoVenda: Math.max(0, parsePreco(dados.sugestaoVenda ?? 0)),
  };

  await db.update(itens).set(patch).where(eq(itens.sku, skuLimpo));

  // Espelha sugestão no lançamento mais recente do SKU (quando existir)
  {
    const entregas = await db.select().from(entregaUnik).orderBy(desc(entregaUnik.id)).limit(800);
    const vinculos = await db.select().from(unikVinculos);
    const skuPorChave = Object.fromEntries(vinculos.map((v) => [v.nomeChave, v.sku]));
    const alvo = entregas.find((row) => {
      if (classificarStatusUnik(row.status, row.tipo) === "ENCOMENDA") return false;
      const nome = normalizeText(row.nome);
      const skuRow =
        normalizeText(row.sku) || (nome ? skuPorChave[chaveNomeItem(nome)] : "") || "";
      return normalizeUpper(skuRow) === normalizeUpper(skuLimpo);
    });
    if (alvo?.id != null) {
      await db
        .update(entregaUnik)
        .set({ sugestaoVenda: patch.sugestaoVenda })
        .where(eq(entregaUnik.id, alvo.id));
    }
  }

  await registrarLog(
    LOG_TIPO.LANCAMENTO_UNIK,
    { sku: skuLimpo, ...patch },
    true,
    `Custo/sugestão UNIK ${skuLimpo}`
  );
  return {
    ok: true,
    message: `${item.descricao}: custo R$ ${patch.custo.toFixed(2).replace(".", ",")} · sugestão R$ ${patch.sugestaoVenda.toFixed(2).replace(".", ",")}.`,
  };
}

export async function distribuirUnikGeral(dados: {
  sku: string;
  destinos: { unidade: string; quantidade: number }[];
  enviado?: boolean;
  lancado?: boolean;
}) {
  await ensureUnikSchema();
  const skuLimpo = normalizeText(dados.sku);
  const [item] = await db.select().from(itens).where(eq(itens.sku, skuLimpo));
  if (!item || !campoEhUnik3d(item.subcategoriaMeep)) throw new Error("Item UNIK 3D obrigatório.");
  if (!(Number(item.preco) > 0)) throw new Error("Defina o preço final antes de separar para as lojas.");

  const destinos = (dados.destinos || [])
    .map((d) => ({
      unidade: UNIK_LOJAS.find((u) => normalizeUpper(u) === normalizeUpper(d.unidade)) || "",
      quantidade: Math.floor(Number(d.quantidade) || 0),
    }))
    .filter((d) => d.unidade && d.quantidade > 0);
  if (!destinos.length) throw new Error("Informe a quantidade para pelo menos uma loja.");

  const total = destinos.reduce((acc, d) => acc + d.quantidade, 0);
  const estTodos = await db.select().from(estoque);
  const geralRows = estTodos.filter(
    (r) =>
      normalizeUpper(r.sku) === normalizeUpper(skuLimpo) &&
      chaveUnidadeUnik(r.unidade) === UNIK_UNIDADE_GERAL
  );
  const qtdGeral = geralRows.reduce((s, r) => s + (Number(r.quantidade) || 0), 0);
  if (total > qtdGeral) {
    throw new Error(`Depósito tem ${qtdGeral}. Não dá para enviar ${total}.`);
  }
  const skuEst = geralRows[0]?.sku || skuLimpo;
  const unidadeGeralDb = geralRows[0]?.unidade || UNIK_UNIDADE_GERAL;

  const vinculos = await db.select().from(unikVinculos);
  const entregas = await db.select().from(entregaUnik);
  const skuPorChave = Object.fromEntries(vinculos.map((v) => [v.nomeChave, v.sku]));
  const up = normalizeUpper(skuLimpo);
  const qtdLancada = Math.max(0, qtdLancadaPorSku(entregas, skuPorChave)[up] || 0);
  const movs = await db.select().from(movimentosEstoque);
  const nasLojas = estTodos
    .filter(
      (r) =>
        normalizeUpper(r.sku) === up &&
        UNIK_LOJAS.some((u) => chaveUnidadeUnik(r.unidade) === u)
    )
    .reduce((s, r) => s + (Number(r.quantidade) || 0), 0);
  const qtdJaEnviada = Math.max(qtdDistribuidaPorSku(movs)[up] || 0, nasLojas);
  const restante = Math.max(0, qtdLancada - qtdJaEnviada);
  if (total > restante) {
    throw new Error(
      `Lançado em Lançar: ${qtdLancada}. Já enviado às lojas: ${qtdJaEnviada}. Só pode enviar mais ${restante}.`
    );
  }

  await aplicarMovimentoEstoque(skuEst, unidadeGeralDb, -total, "UNIK_DISTRIBUICAO", skuEst);
  for (const d of destinos) {
    await aplicarMovimentoEstoque(skuLimpo, d.unidade, d.quantidade, "UNIK_DISTRIBUICAO", skuLimpo);
    const [st] = await db
      .select()
      .from(unikLojaStatus)
      .where(and(eq(unikLojaStatus.sku, skuLimpo), eq(unikLojaStatus.unidade, d.unidade)));
    const enviado = dados.enviado !== undefined ? Boolean(dados.enviado) : Boolean(st?.enviado);
    const lancado = dados.lancado !== undefined ? Boolean(dados.lancado) : Boolean(st?.lancado);
    if (st) {
      await db
        .update(unikLojaStatus)
        .set({ enviado, lancado })
        .where(and(eq(unikLojaStatus.sku, skuLimpo), eq(unikLojaStatus.unidade, d.unidade)));
    } else {
      await db.insert(unikLojaStatus).values({ sku: skuLimpo, unidade: d.unidade, enviado, lancado });
    }
  }

  await registrarLog(LOG_TIPO.LANCAMENTO_UNIK, { sku: skuLimpo, destinos, total }, true, `Distribuição UNIK ${skuLimpo}`);
  return { ok: true, message: `${total} un. de ${item.descricao} enviada(s) para as lojas.` };
}

export async function setUnikLojaStatus(dados: {
  sku: string;
  unidade: string;
  enviado?: boolean;
  lancado?: boolean;
}) {
  await ensureUnikSchema();
  const skuLimpo = normalizeText(dados.sku);
  const unidade = UNIK_LOJAS.find((u) => normalizeUpper(u) === normalizeUpper(dados.unidade));
  if (!skuLimpo || !unidade) throw new Error("Item e unidade obrigatórios.");
  const [st] = await db
    .select()
    .from(unikLojaStatus)
    .where(and(eq(unikLojaStatus.sku, skuLimpo), eq(unikLojaStatus.unidade, unidade)));
  const enviado = dados.enviado !== undefined ? Boolean(dados.enviado) : Boolean(st?.enviado);
  const lancado = dados.lancado !== undefined ? Boolean(dados.lancado) : Boolean(st?.lancado);
  if (st) {
    await db
      .update(unikLojaStatus)
      .set({ enviado, lancado })
      .where(and(eq(unikLojaStatus.sku, skuLimpo), eq(unikLojaStatus.unidade, unidade)));
  } else {
    await db.insert(unikLojaStatus).values({ sku: skuLimpo, unidade, enviado, lancado });
  }
  return { ok: true, message: `${unidade}: ${lancado ? "lançado" : "não lançado"} · ${enviado ? "enviado" : "não enviado"}.` };
}

function canonUnidadeUnikOp(unidade: string): string {
  const u = chaveUnidadeUnik(unidade);
  if (u === UNIK_UNIDADE_GERAL) return UNIK_UNIDADE_GERAL;
  const loja = UNIK_LOJAS.find((x) => x === u);
  if (!loja) throw new Error("Informe a unidade (depósito ou uma loja).");
  return loja;
}

function rotuloUnidadeUnik(unidade: string) {
  return unidade === UNIK_UNIDADE_GERAL ? "Depósito" : unidade;
}

async function baixarEstoqueUnik(sku: string, unidadeCanon: string, qtd: number, tipo: string) {
  const est = await db.select().from(estoque);
  const rows = est.filter(
    (r) => normalizeUpper(r.sku) === normalizeUpper(sku) && chaveUnidadeUnik(r.unidade) === unidadeCanon
  );
  const total = rows.reduce((s, r) => s + (Number(r.quantidade) || 0), 0);
  if (qtd > total) {
    throw new Error(`${rotuloUnidadeUnik(unidadeCanon)} tem ${total}. Não dá para tirar ${qtd}.`);
  }
  let falta = qtd;
  for (const row of rows) {
    if (falta <= 0) break;
    const tem = Number(row.quantidade) || 0;
    if (tem <= 0) continue;
    const tira = Math.min(tem, falta);
    await aplicarMovimentoEstoque(row.sku, row.unidade, -tira, tipo, row.sku);
    falta -= tira;
  }
}

async function creditarEstoqueUnik(sku: string, unidadeCanon: string, qtd: number, tipo: string) {
  const est = await db.select().from(estoque);
  const row = est.find(
    (r) => normalizeUpper(r.sku) === normalizeUpper(sku) && chaveUnidadeUnik(r.unidade) === unidadeCanon
  );
  await aplicarMovimentoEstoque(row?.sku || sku, row?.unidade || unidadeCanon, qtd, tipo, sku);
}

/** UNIK retirou o item do 60 — sai do estoque, não volta para o depósito. */
export async function retirarUnikDo60(dados: { sku: string; unidade: string; quantidade: number }) {
  await ensureUnikSchema();
  const skuLimpo = normalizeText(dados.sku);
  const qtd = Math.floor(Number(dados.quantidade) || 0);
  if (!skuLimpo) throw new Error("Item obrigatório.");
  if (qtd <= 0) throw new Error("Informe a quantidade retirada.");
  const [item] = await db.select().from(itens).where(eq(itens.sku, skuLimpo));
  if (!item || !campoEhUnik3d(item.subcategoriaMeep)) throw new Error("Item UNIK 3D obrigatório.");
  const unidade = canonUnidadeUnikOp(dados.unidade);
  await baixarEstoqueUnik(skuLimpo, unidade, qtd, "UNIK_RETIRADA");
  await registrarLog(
    LOG_TIPO.LANCAMENTO_UNIK,
    { sku: skuLimpo, unidade, qtd },
    true,
    `Retirada UNIK do 60: ${item.descricao}`
  );
  return {
    ok: true,
    message: `${qtd} un. de ${item.descricao} retirada(s) do 60 em ${rotuloUnidadeUnik(unidade)}.`,
  };
}

/** Move o item de uma unidade para outra (loja ↔ loja ou depósito). */
export async function transferirUnikUnidade(dados: {
  sku: string;
  origem: string;
  destino: string;
  quantidade: number;
}) {
  await ensureUnikSchema();
  const skuLimpo = normalizeText(dados.sku);
  const qtd = Math.floor(Number(dados.quantidade) || 0);
  if (!skuLimpo) throw new Error("Item obrigatório.");
  if (qtd <= 0) throw new Error("Informe a quantidade a transferir.");
  const origem = canonUnidadeUnikOp(dados.origem);
  const destino = canonUnidadeUnikOp(dados.destino);
  if (origem === destino) throw new Error("Origem e destino têm que ser diferentes.");
  const [item] = await db.select().from(itens).where(eq(itens.sku, skuLimpo));
  if (!item || !campoEhUnik3d(item.subcategoriaMeep)) throw new Error("Item UNIK 3D obrigatório.");
  await baixarEstoqueUnik(skuLimpo, origem, qtd, "UNIK_TRANSFERENCIA");
  await creditarEstoqueUnik(skuLimpo, destino, qtd, "UNIK_TRANSFERENCIA");
  await registrarLog(
    LOG_TIPO.LANCAMENTO_UNIK,
    { sku: skuLimpo, origem, destino, qtd },
    true,
    `Transferência UNIK ${origem} → ${destino}`
  );
  return {
    ok: true,
    message: `${qtd} un. de ${item.descricao} de ${rotuloUnidadeUnik(origem)} para ${rotuloUnidadeUnik(destino)}.`,
  };
}
