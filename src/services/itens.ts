import { db } from "@/db";
import { itens, unikVinculos } from "@/db/schema";
import { eq } from "drizzle-orm";
import { normalizeText, normalizeUpper, itemEstoqueIlimitado } from "@/lib/utils";
import { LOG_TIPO, registrarLog } from "@/lib/log";
import { parseUnidadesJson, serializarUnidades } from "@/services/vendedores";

export async function listarTodosItensCadastro() {
  const vinculos = await db.select().from(unikVinculos);
  const nomeUnikPorSku = Object.fromEntries(
    vinculos.map((v) => [v.sku, normalizeText(v.nomeOriginal) || v.nomeChave])
  );
  const rows = await db.select().from(itens).orderBy(itens.descricao);
  return rows.map((r) => ({
    sku: r.sku,
    categoriaDash: r.categoriaDash || "",
    subcategoriaMeep: r.subcategoriaMeep || "",
    descricao: r.descricao,
    preco: r.preco,
    ativo: r.ativo,
    custo: r.custo,
    sugestaoVenda: Number(r.sugestaoVenda) || 0,
    nomeUnik: nomeUnikPorSku[r.sku] || "",
    fotoUrl: r.fotoUrl || "",
    ilimitado: Boolean(r.ilimitado),
    unidades: parseUnidadesJson(r.unidades),
  }));
}

export async function salvarItemCadastro(dados: {
  sku?: string;
  categoriaDash?: string;
  subcategoriaMeep?: string;
  descricao: string;
  preco?: number;
  ativo?: boolean;
  fotoUrl?: string;
  ilimitado?: boolean;
  nomeUnik?: string;
  unidades?: string[];
}) {
  const descricao = normalizeText(dados.descricao);
  if (!descricao) throw new Error("Descrição obrigatória.");

  const skuInformado = normalizeText(dados.sku);
  let sku = skuInformado;
  const [existeAntes] = skuInformado
    ? await db.select().from(itens).where(eq(itens.sku, skuInformado))
    : [undefined];
  if (existeAntes) sku = existeAntes.sku;

  if (!sku) {
    const all = await db.select({ sku: itens.sku }).from(itens);
    let max = 0;
    for (const r of all) {
      const m = /^SKU-(\d+)$/i.exec(r.sku);
      if (m) max = Math.max(max, Number(m[1]));
    }
    sku = `SKU-${String(max + 1).padStart(4, "0")}`;
  }

  const categoriaDash = normalizeText(dados.categoriaDash);
  const subcategoriaMeep = normalizeText(dados.subcategoriaMeep);
  if (!categoriaDash) throw new Error("Categoria obrigatória.");
  if (!subcategoriaMeep) throw new Error("Subcategoria obrigatória.");

  const fotoUrl = String(dados.fotoUrl || "").trim();
  if (fotoUrl.startsWith("data:") && fotoUrl.length > 700_000) {
    throw new Error("Foto grande demais. Use uma imagem menor.");
  }

  const [existe] = await db.select().from(itens).where(eq(itens.sku, sku));
  const unidadesJson = serializarUnidades(dados.unidades ?? []);
  const payload = {
    sku,
    categoriaDash,
    subcategoriaMeep,
    descricao,
    preco: Number(dados.preco) || 0,
    ativo: dados.ativo !== false,
    custo: existe ? Number(existe.custo) || 0 : 0,
    sugestaoVenda: existe ? Number(existe.sugestaoVenda) || 0 : 0,
    fotoUrl,
    ilimitado: dados.ilimitado === true || itemEstoqueIlimitado(categoriaDash, subcategoriaMeep),
    unidades: unidadesJson,
  };

  if (existe) {
    await db.update(itens).set(payload).where(eq(itens.sku, sku));
  } else {
    await db.insert(itens).values(payload);
  }

  const nomeUnik = normalizeText(dados.nomeUnik);
  let msgVinculo = "";
  if (nomeUnik) {
    const { vincularNomeUnik, campoEhUnik3d } = await import("./unik");
    if (!campoEhUnik3d(subcategoriaMeep)) {
      throw new Error("Para vincular item UNIK, use subcategoria UNIK 3D.");
    }
    const [vincAtual] = await db.select().from(unikVinculos).where(eq(unikVinculos.sku, sku));
    const nomeAtual = normalizeText(vincAtual?.nomeOriginal);
    const precisaVincular = !existe || normalizeUpper(nomeAtual) !== normalizeUpper(nomeUnik);
    if (precisaVincular) {
      const vinc = await vincularNomeUnik(nomeUnik, sku);
      msgVinculo = ` · ${vinc.message}`;
    }
  }

  await registrarLog(LOG_TIPO.CADASTRO_ITEM, { sku, nomeUnik: nomeUnik || null }, true, "Item salvo");
  return { ok: true, message: "Item salvo." + msgVinculo, sku };
}

export async function listarSkusItensAtivos() {
  const rows = await db.select().from(itens).where(eq(itens.ativo, true));
  return rows
    .map((r) => ({ sku: r.sku, descricao: r.descricao }))
    .sort((a, b) =>
      normalizeUpper(a.descricao).localeCompare(normalizeUpper(b.descricao), "pt-BR")
    );
}

export async function getOpcoesAdminEstoque() {
  const { getOpcoesFiltrosEstoque } = await import("./estoque");
  const { campoEhUnik3d } = await import("./unik");
  const pack = await getOpcoesFiltrosEstoque();
  const rows = await db.select().from(itens).where(eq(itens.ativo, true));
  const itensAtivos = rows
    .filter((r) => !campoEhUnik3d(r.subcategoriaMeep) && !campoEhUnik3d(r.categoriaDash))
    .map((r) => ({ sku: r.sku, descricao: r.descricao }))
    .sort((a, b) =>
      normalizeUpper(a.descricao).localeCompare(normalizeUpper(b.descricao), "pt-BR")
    );
  const unidades = pack.unidades.filter((u) => normalizeUpper(u) !== "GERAL");
  return { ...pack, unidades, itens: itensAtivos };
}
