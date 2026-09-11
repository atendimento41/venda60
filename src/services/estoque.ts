import { db } from "@/db";
import { estoque, itens, movimentosEstoque, vendas } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { agoraISO, isVendaCancelada, normalizeText, normalizeUpper, UNIDADES_PADRAO } from "@/lib/utils";
import { LOG_TIPO, registrarLog, registrarLogConsulta } from "@/lib/log";
import { operadorAtual } from "@/lib/log";
import { agregarVendasPorSkuUnidade } from "@/lib/vendas-db";

async function movimento(
  sku: string,
  unidade: string,
  delta: number,
  tipo: string,
  referencia?: string
) {
  const [linha] = await db
    .select()
    .from(estoque)
    .where(and(eq(estoque.sku, sku), eq(estoque.unidade, unidade)));
  const qtdAtual = linha?.quantidade ?? 0;
  const qtdNova = qtdAtual + delta;
  if (qtdNova < 0) throw new Error("Quantidade resultante negativa.");

  if (linha) {
    await db.update(estoque).set({ quantidade: qtdNova }).where(eq(estoque.id, linha.id));
  } else if (delta >= 0) {
    const [item] = await db.select().from(itens).where(eq(itens.sku, sku));
    await db.insert(estoque).values({
      sku,
      unidade,
      quantidade: qtdNova,
      nome: item?.descricao || sku,
    });
  }

  await db.insert(movimentosEstoque).values({
    dataHora: agoraISO(),
    sku,
    unidade,
    delta,
    quantidadeApos: qtdNova,
    tipo,
    operador: await operadorAtual(),
    referencia,
  });
  return qtdNova;
}

export async function aplicarMovimentoEstoque(
  sku: string,
  unidade: string,
  delta: number,
  tipo: string,
  referencia?: string
) {
  return movimento(sku, unidade, delta, tipo, referencia);
}

export async function listarUnidadesEstoque() {
  const rows = await db.select({ unidade: estoque.unidade }).from(estoque);
  const set = new Set<string>(UNIDADES_PADRAO);
  rows.forEach((r) => {
    if (r.unidade) set.add(r.unidade);
  });
  return [...set].sort((a, b) =>
    normalizeUpper(a).localeCompare(normalizeUpper(b), "pt-BR")
  );
}

export async function getOpcoesFiltrosEstoque() {
  const allItens = await db.select().from(itens).where(eq(itens.ativo, true));
  const map: Record<string, Set<string>> = {};
  for (const item of allItens) {
    const cat = normalizeText(item.categoriaDash);
    if (!cat) continue;
    if (!map[cat]) map[cat] = new Set();
    if (item.subcategoriaMeep) map[cat].add(item.subcategoriaMeep);
  }
  const categoriasRaw: Record<string, string[]> = {};
  Object.keys(map)
    .sort((a, b) => normalizeUpper(a).localeCompare(normalizeUpper(b), "pt-BR"))
    .forEach((cat) => {
      categoriasRaw[cat] = [...map[cat]].sort((a, b) =>
        normalizeUpper(a).localeCompare(normalizeUpper(b), "pt-BR")
      );
    });
  return {
    unidades: await listarUnidadesEstoque(),
    categoriasRaw,
  };
}

export async function getEstoqueFiltrado(filtros: {
  unidade?: string | null;
  categoria?: string | null;
  subcategoria?: string | null;
}) {
  const unidadeF = normalizeUpper(filtros.unidade || "");
  const catF = normalizeUpper(filtros.categoria || "");
  const subF = normalizeUpper(filtros.subcategoria || "");

  const rows = await db
    .select({
      sku: estoque.sku,
      unidade: estoque.unidade,
      quantidade: estoque.quantidade,
      nome: estoque.nome,
      descricao: itens.descricao,
      categoria: itens.categoriaDash,
      subcategoria: itens.subcategoriaMeep,
      preco: itens.preco,
      ilimitado: itens.ilimitado,
    })
    .from(estoque)
    .innerJoin(itens, eq(estoque.sku, itens.sku))
    .where(eq(itens.ativo, true));

  const linhas = rows
    .filter((r) => {
      if (r.ilimitado) return false;
      if (unidadeF && normalizeUpper(r.unidade) !== unidadeF) return false;
      if (catF && normalizeUpper(r.categoria) !== catF) return false;
      if (subF && normalizeUpper(r.subcategoria) !== subF) return false;
      return true;
    })
    .map((r) => ({
      unidade: r.unidade,
      sku: r.sku,
      item: r.descricao || r.nome || "Sem descrição",
      categoria: r.categoria || "",
      subcategoria: r.subcategoria || "",
      precoI: r.preco,
      estoque: r.quantidade,
      ilimitado: false,
    }))
    .sort((a, b) => {
      const u = normalizeUpper(a.unidade).localeCompare(normalizeUpper(b.unidade), "pt-BR");
      if (u) return u;
      return normalizeUpper(a.item).localeCompare(normalizeUpper(b.item), "pt-BR");
    });

  const todosItens = await db.select().from(itens).where(eq(itens.ativo, true));
  for (const item of todosItens) {
    if (!item.ilimitado) continue;
    if (catF && normalizeUpper(item.categoriaDash) !== catF) continue;
    if (subF && normalizeUpper(item.subcategoriaMeep) !== subF) continue;
    linhas.push({
      unidade: unidadeF ? String(filtros.unidade) : "Todas",
      sku: item.sku,
      item: item.descricao,
      categoria: item.categoriaDash || "",
      subcategoria: item.subcategoriaMeep || "",
      precoI: item.preco,
      estoque: 0,
      ilimitado: true,
    });
  }

  registrarLogConsulta(LOG_TIPO.CONSULTA_ESTOQUE, filtros, "Consulta estoque");
  return {
    linhas,
    totalSkus: linhas.length,
    totalEstoque: linhas.filter((l) => !l.ilimitado).reduce((s, l) => s + l.estoque, 0),
  };
}

function qtdArredEst(n: number) {
  const v = Number((Number(n) || 0).toFixed(4));
  return Math.abs(v) < 1e-9 ? 0 : v;
}

export async function getEstoqueConsulta(filtros: {
  unidade?: string | null;
  categoria?: string | null;
  subcategoria?: string | null;
  estoqueAtual?: string | null;
  /** Filtro do depósito GERAL: gt0 | eq0 | (vazio = todos). */
  estoqueGeral?: string | null;
  /** sem = sem foto; com = com foto; vazio = todos. */
  foto?: string | null;
}) {
  const unidadeF = normalizeUpper(filtros.unidade || "");
  const catF = normalizeUpper(filtros.categoria || "");
  const subF = normalizeUpper(filtros.subcategoria || "");
  const geral = normalizeUpper("GERAL");

  const allItens = await db.select().from(itens).where(eq(itens.ativo, true));
  const itemPorSku = Object.fromEntries(allItens.map((i) => [normalizeUpper(i.sku), i]));
  const estRows = await db.select().from(estoque);
  const vendPor = await agregarVendasPorSkuUnidade();
  const movs = await db.select().from(movimentosEstoque);

  const geralPorSku: Record<string, number> = {};
  const estPor: Record<string, number> = {};
  for (const row of estRows) {
    const uni = normalizeUpper(row.unidade);
    const up = normalizeUpper(row.sku);
    if (!itemPorSku[up] || itemPorSku[up].ilimitado) continue;
    if (uni === geral) {
      geralPorSku[up] = (geralPorSku[up] || 0) + (Number(row.quantidade) || 0);
      continue;
    }
    estPor[`${up}|${uni}`] = (estPor[`${up}|${uni}`] || 0) + (Number(row.quantidade) || 0);
  }

  const retPor: Record<string, number> = {};
  for (const m of movs) {
    const d = Number(m.delta) || 0;
    if (d >= 0) continue;
    const t = normalizeUpper(m.tipo);
    if (t !== "AJUSTE_DELTA" && t !== "UNIK_RETIRADA") continue;
    const up = normalizeUpper(m.sku);
    if (!itemPorSku[up] || itemPorSku[up].ilimitado) continue;
    const uni = normalizeUpper(m.unidade);
    if (!uni || uni === geral) continue;
    retPor[`${up}|${uni}`] = (retPor[`${up}|${uni}`] || 0) + -d;
  }

  const chaves = new Set([...Object.keys(estPor), ...Object.keys(vendPor), ...Object.keys(retPor)]);
  // Inclui SKUs que só têm GERAL (ainda não foram às lojas) quando filtro geral/foto pedir
  for (const up of Object.keys(geralPorSku)) {
    if (![...chaves].some((k) => k.startsWith(up + "|"))) {
      // placeholder: será expandido só se unidade vazia — adicionamos linha sintética depois
    }
  }

  let linhas = [...chaves]
    .map((key) => {
      const [up, uni] = key.split("|");
      const item = itemPorSku[up];
      const estoqueAtual = qtdArredEst(estPor[key] || 0);
      const vendidos = qtdArredEst(vendPor[key] || 0);
      const retirada = qtdArredEst(retPor[key] || 0);
      const estoqueTotal = qtdArredEst(estoqueAtual + vendidos + retirada);
      const estoqueGeral = qtdArredEst(geralPorSku[up] || 0);
      const unidade =
        UNIDADES_PADRAO.find((u) => normalizeUpper(u) === uni) ||
        estRows.find((r) => normalizeUpper(r.unidade) === uni)?.unidade ||
        uni;
      return {
        unidade,
        sku: item?.sku || up,
        item: item?.descricao || up,
        categoria: item?.categoriaDash || "",
        subcategoria: item?.subcategoriaMeep || "",
        precoI: Number(item?.preco) || 0,
        fotoUrl: item?.fotoUrl || "",
        estoque: estoqueTotal,
        retirada,
        vendidos,
        estoqueAtual,
        estoqueGeral,
        ilimitado: false,
      };
    })
    .filter((l) => {
      if (unidadeF && normalizeUpper(l.unidade) !== unidadeF) return false;
      if (catF && normalizeUpper(l.categoria) !== catF) return false;
      if (subF && normalizeUpper(l.subcategoria) !== subF) return false;
      return true;
    });

  // Itens só no GERAL (não foram para lojas) — uma linha com unidade GERAL
  if (!unidadeF || unidadeF === geral) {
    for (const [up, qG] of Object.entries(geralPorSku)) {
      const item = itemPorSku[up];
      if (!item || item.ilimitado) continue;
      if (catF && normalizeUpper(item.categoriaDash) !== catF) continue;
      if (subF && normalizeUpper(item.subcategoriaMeep) !== subF) continue;
      const jaTemLoja = linhas.some((l) => normalizeUpper(l.sku) === up);
      if (jaTemLoja && unidadeF !== geral) continue;
      if (unidadeF === geral || !jaTemLoja) {
        linhas.push({
          unidade: "GERAL",
          sku: item.sku,
          item: item.descricao,
          categoria: item.categoriaDash || "",
          subcategoria: item.subcategoriaMeep || "",
          precoI: Number(item.preco) || 0,
          fotoUrl: item.fotoUrl || "",
          estoque: qtdArredEst(qG),
          retirada: 0,
          vendidos: 0,
          estoqueAtual: qtdArredEst(qG),
          estoqueGeral: qtdArredEst(qG),
          ilimitado: false,
        });
      }
    }
  }

  // Completa estoqueGeral em linhas de loja
  for (const l of linhas) {
    if (normalizeUpper(l.unidade) === geral) continue;
    l.estoqueGeral = qtdArredEst(geralPorSku[normalizeUpper(l.sku)] || 0);
  }

  linhas.sort((a, b) => {
    const u = normalizeUpper(a.unidade).localeCompare(normalizeUpper(b.unidade), "pt-BR");
    if (u) return u;
    return normalizeUpper(a.item).localeCompare(normalizeUpper(b.item), "pt-BR");
  });

  const filtroEst = normalizeText(filtros.estoqueAtual);
  if (filtroEst === "eq0") linhas = linhas.filter((r) => Math.abs(r.estoqueAtual) < 1e-9);
  else if (filtroEst === "lt0") linhas = linhas.filter((r) => r.estoqueAtual < -1e-9);
  else if (filtroEst === "gt0") linhas = linhas.filter((r) => r.estoqueAtual > 1e-9);

  const filtroGeral = normalizeText(filtros.estoqueGeral);
  if (filtroGeral === "eq0") linhas = linhas.filter((r) => Math.abs(r.estoqueGeral) < 1e-9);
  else if (filtroGeral === "gt0") linhas = linhas.filter((r) => r.estoqueGeral > 1e-9);

  const filtroFoto = normalizeText(filtros.foto).toLowerCase();
  if (filtroFoto === "sem") linhas = linhas.filter((r) => !String(r.fotoUrl || "").trim());
  else if (filtroFoto === "com") linhas = linhas.filter((r) => Boolean(String(r.fotoUrl || "").trim()));

  for (const item of allItens) {
    if (!item.ilimitado) continue;
    if (catF && normalizeUpper(item.categoriaDash) !== catF) continue;
    if (subF && normalizeUpper(item.subcategoriaMeep) !== subF) continue;
    if (filtroFoto === "sem" && String(item.fotoUrl || "").trim()) continue;
    if (filtroFoto === "com" && !String(item.fotoUrl || "").trim()) continue;
    linhas.push({
      unidade: unidadeF ? String(filtros.unidade) : "Todas",
      sku: item.sku,
      item: item.descricao,
      categoria: item.categoriaDash || "",
      subcategoria: item.subcategoriaMeep || "",
      precoI: Number(item.preco) || 0,
      fotoUrl: item.fotoUrl || "",
      estoque: 0,
      retirada: 0,
      vendidos: 0,
      estoqueAtual: 0,
      estoqueGeral: 0,
      ilimitado: true,
    });
  }

  registrarLogConsulta(LOG_TIPO.CONSULTA_ESTOQUE, filtros, "Consulta estoque operacional");
  return {
    linhas,
    totalSkus: linhas.length,
    totalEstoque: linhas.filter((l) => !l.ilimitado).reduce((s, l) => s + l.estoqueAtual, 0),
    formula:
      "Estoque = atual + vendidos + retiradas na unidade. Estoque geral = depósito (ainda não enviado às lojas).",
  };
}

export async function listarLinhasEstoqueAdmin(filtros: {
  unidade?: string;
  categoria?: string;
  subcategoria?: string;
  nome?: string;
}) {
  const res = await getEstoqueFiltrado(filtros);
  const { campoEhUnik3d } = await import("./unik");
  let linhas = res.linhas
    .filter((l) => !campoEhUnik3d(l.subcategoria) && !campoEhUnik3d(l.categoria))
    .map((l, i) => ({ ...l, sheetRow: i + 1 }));
  if (filtros.nome) {
    const n = normalizeUpper(filtros.nome);
    linhas = linhas.filter(
      (l) =>
        normalizeUpper(l.item).includes(n) || normalizeUpper(l.sku).includes(n)
    );
  }
  return linhas;
}

async function recusarAlocacaoUnik3d(sku: string) {
  const { campoEhUnik3d } = await import("./unik");
  const [item] = await db.select().from(itens).where(eq(itens.sku, sku));
  if (item && (campoEhUnik3d(item.subcategoriaMeep) || campoEhUnik3d(item.categoriaDash))) {
    throw new Error("Item UNIK 3D se aloca nas telas UNIK, não em Alocação de item.");
  }
}

/** Define quantidade absoluta (cria linha se não existir). Aceita GERAL. */
async function definirQuantidadeAbsoluta(
  sku: string,
  unidade: string,
  quantidade: number,
  tipo: string,
) {
  const [item] = await db.select().from(itens).where(eq(itens.sku, sku));
  if (!item?.ativo) throw new Error("SKU não encontrado como item ativo.");
  if (item.ilimitado) return Number(quantidade) || 0;

  const [linha] = await db
    .select()
    .from(estoque)
    .where(and(eq(estoque.sku, sku), eq(estoque.unidade, unidade)));
  const atual = linha ? Number(linha.quantidade) || 0 : 0;
  const alvo = Number(quantidade) || 0;
  if (alvo < 0) throw new Error("Quantidade inválida.");
  const delta = alvo - atual;
  if (delta === 0) return alvo;
  return movimento(sku, unidade, delta, tipo);
}

/**
 * No cadastro do item: grava estoque GERAL e/ou aloca nas lojas.
 * Alocações saem do GERAL quando houver saldo (senão só entram na loja).
 */
export async function aplicarEstoqueNoCadastro(opts: {
  sku: string;
  descricao: string;
  estoqueGeral?: number | null;
  alocacoes?: { unidade: string; quantidade: number }[];
}): Promise<string> {
  const sku = normalizeText(opts.sku);
  if (!sku) return "";
  const msgs: string[] = [];

  if (opts.estoqueGeral != null && opts.estoqueGeral !== undefined) {
    const q = Number(opts.estoqueGeral);
    if (!Number.isFinite(q) || q < 0) throw new Error("Estoque geral inválido.");
    await definirQuantidadeAbsoluta(sku, "GERAL", q, "CADASTRO_GERAL");
    msgs.push(`geral=${q}`);
  }

  const alocs = Array.isArray(opts.alocacoes) ? opts.alocacoes : [];
  for (const a of alocs) {
    const unidade = normalizeText(a.unidade);
    const q = Number(a.quantidade) || 0;
    if (!unidade || normalizeUpper(unidade) === "GERAL" || q <= 0) continue;
    await recusarAlocacaoUnik3d(sku);

    const [geral] = await db
      .select()
      .from(estoque)
      .where(and(eq(estoque.sku, sku), eq(estoque.unidade, "GERAL")));
    const saldoGeral = Number(geral?.quantidade) || 0;
    if (saldoGeral >= q) {
      await movimento(sku, "GERAL", -q, "ALOCACAO_CADASTRO");
      await movimento(sku, unidade, q, "ALOCACAO_CADASTRO");
    } else {
      await definirQuantidadeAbsoluta(sku, unidade, q, "CADASTRO_UNIDADE");
    }
    msgs.push(`${unidade}=${q}`);
  }

  if (!msgs.length) return "";
  return ` · Estoque: ${msgs.join(", ")}`;
}

export async function adminEstoqueCadastrar(dados: {
  sku: string;
  unidade: string;
  quantidade: number;
}) {
  const sku = normalizeText(dados.sku);
  const unidade = normalizeText(dados.unidade);
  const qtd = Number(dados.quantidade);
  if (!sku || !unidade) throw new Error("SKU e unidade obrigatórios.");
  if (isNaN(qtd) || qtd < 0) throw new Error("Quantidade inválida.");
  await recusarAlocacaoUnik3d(sku);

  const [existe] = await db
    .select()
    .from(estoque)
    .where(and(eq(estoque.sku, sku), eq(estoque.unidade, unidade)));
  if (existe) throw new Error("Já existe estoque para este SKU nesta unidade.");

  const [item] = await db.select().from(itens).where(eq(itens.sku, sku));
  if (!item?.ativo) throw new Error("SKU não encontrado como item ativo.");

  await db.insert(estoque).values({
    sku,
    unidade,
    quantidade: qtd,
    nome: item.descricao,
  });
  await db.insert(movimentosEstoque).values({
    dataHora: agoraISO(),
    sku,
    unidade,
    delta: qtd,
    quantidadeApos: qtd,
    tipo: "CADASTRO",
    operador: await operadorAtual(),
  });

  await registrarLog(LOG_TIPO.ESTOQUE_CADASTRO, dados, true, "Estoque cadastrado");
  return { ok: true, message: "Estoque cadastrado." };
}

export async function adminEstoqueAjustarDelta(dados: {
  sku: string;
  unidade: string;
  delta: number;
}) {
  const sku = normalizeText(dados.sku);
  const unidade = normalizeText(dados.unidade);
  const delta = Number(dados.delta);
  if (!sku || !unidade) throw new Error("SKU e unidade obrigatórios.");
  await recusarAlocacaoUnik3d(sku);
  const [item] = await db.select().from(itens).where(eq(itens.sku, sku));
  if (item?.ilimitado) throw new Error("Este item é ilimitado e não usa quantidade.");
  const nova = await movimento(sku, unidade, delta, "AJUSTE_DELTA");
  await registrarLog(LOG_TIPO.ESTOQUE_AJUSTE, dados, true, "Ajuste estoque");
  return { ok: true, message: "Estoque ajustado.", quantidade: nova };
}

export async function adminEstoqueDefinirQuantidade(dados: {
  sku: string;
  unidade: string;
  quantidade: number;
}) {
  const sku = normalizeText(dados.sku);
  const unidade = normalizeText(dados.unidade);
  const alvo = Number(dados.quantidade);
  await recusarAlocacaoUnik3d(sku);
  const [linha] = await db
    .select()
    .from(estoque)
    .where(and(eq(estoque.sku, sku), eq(estoque.unidade, unidade)));
  if (!linha) {
    // cria se não existir (inclui GERAL)
    await adminEstoqueCadastrar({ sku, unidade, quantidade: alvo });
    return { ok: true, message: "Quantidade definida.", quantidade: alvo };
  }
  const delta = alvo - linha.quantidade;
  await movimento(sku, unidade, delta, "DEFINIR_QTD");
  await registrarLog(LOG_TIPO.ESTOQUE_DEFINIR, dados, true, "Quantidade definida");
  return { ok: true, message: "Quantidade definida.", quantidade: alvo };
}
