import { db } from "@/db";
import { vendedores } from "@/db/schema";
import { eq } from "drizzle-orm";
import { UNIDADES_PADRAO, normalizeText, normalizeUpper } from "@/lib/utils";
import { LOG_TIPO, registrarLog } from "@/lib/log";
import { ensureVendedoresSchema } from "@/lib/ensure-schema";

export type VendedorDTO = {
  id: string;
  nome: string;
  ativo: boolean;
  unidades: string[];
};

export function parseUnidadesJson(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x).trim()).filter(Boolean);
  }
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return [];
    try {
      const j = JSON.parse(s);
      if (Array.isArray(j)) return j.map((x) => String(x).trim()).filter(Boolean);
    } catch {
      /* ignore */
    }
  }
  return [];
}

export function serializarUnidades(unidades: unknown): string {
  const lista = Array.isArray(unidades) ? unidades.map((x) => String(x).trim()) : [];
  const validas = UNIDADES_PADRAO.filter((u) =>
    lista.some((x) => normalizeUpper(x) === normalizeUpper(u))
  );
  return JSON.stringify(validas);
}

/** Lista vazia/ausente = todas as unidades (vendedores legados). */
export function unidadesDisponiveisVendedor(unidades: string[]): string[] {
  if (!unidades.length) return [...UNIDADES_PADRAO];
  return UNIDADES_PADRAO.filter((u) =>
    unidades.some((x) => normalizeUpper(x) === normalizeUpper(u))
  );
}

export function vendedorPodeVenderNaUnidade(unidades: string[], unidade: string): boolean {
  if (!unidades.length) return true;
  return unidades.some((u) => normalizeUpper(u) === normalizeUpper(unidade));
}

function toDTO(row: { id: string; nome: string; ativo: boolean; unidades?: string | null }): VendedorDTO {
  return {
    id: row.id,
    nome: row.nome,
    ativo: Boolean(row.ativo),
    unidades: parseUnidadesJson(row.unidades),
  };
}

export async function listarVendedores(todos = false): Promise<VendedorDTO[]> {
  await ensureVendedoresSchema();
  const rows = todos
    ? await db.select().from(vendedores).orderBy(vendedores.nome)
    : await db.select().from(vendedores).where(eq(vendedores.ativo, true)).orderBy(vendedores.nome);
  return rows.map(toDTO);
}

export async function listarVendedoresAtivos(): Promise<VendedorDTO[]> {
  return listarVendedores(false);
}

export async function obterVendedorPorIdOuNome(id?: string, nome?: string): Promise<VendedorDTO | null> {
  await ensureVendedoresSchema();
  const idLimpo = normalizeText(id);
  if (idLimpo) {
    const [row] = await db.select().from(vendedores).where(eq(vendedores.id, idLimpo));
    if (row) return toDTO(row);
  }
  const nomeLimpo = normalizeText(nome);
  if (nomeLimpo) {
    const rows = await db.select().from(vendedores);
    const row = rows.find((v) => normalizeText(v.nome) === nomeLimpo);
    if (row) return toDTO(row);
  }
  return null;
}

export function assertUnidadeDoVendedor(v: VendedorDTO, unidade: string) {
  if (!vendedorPodeVenderNaUnidade(v.unidades, unidade)) {
    throw new Error(`${v.nome} não pode lançar na unidade ${unidade}.`);
  }
}

/** Login do sistema: []/ausente = todas; senão só as listadas. */
export function assertUnidadeDoUsuario(
  unidadesUsuario: string[] | undefined | null,
  unidade: string,
  rotulo = "Usuário"
) {
  if (!unidadesUsuario || unidadesUsuario.length === 0) return;
  if (!vendedorPodeVenderNaUnidade(unidadesUsuario, unidade)) {
    throw new Error(
      `${rotulo} só pode lançar na(s) unidade(s): ${unidadesUsuario.join(", ")}.`
    );
  }
}

export function itemPodeVenderNaUnidade(unidadesItem: string[], unidade: string): boolean {
  return vendedorPodeVenderNaUnidade(unidadesItem, unidade);
}

async function proximoId(): Promise<string> {
  const rows = await db.select({ id: vendedores.id }).from(vendedores);
  let max = 0;
  for (const r of rows) {
    const m = /^V(\d+)$/i.exec(r.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `V${String(max + 1).padStart(3, "0")}`;
}

export async function salvarVendedor(dados: {
  id?: string;
  nome?: string;
  unidades?: unknown;
  ativo?: boolean;
  desativar?: boolean;
}) {
  await ensureVendedoresSchema();
  const id = normalizeText(dados.id);

  if (id && dados.desativar) {
    const [row] = await db.select().from(vendedores).where(eq(vendedores.id, id));
    if (!row) throw new Error("Vendedor não encontrado.");
    await db.update(vendedores).set({ ativo: false }).where(eq(vendedores.id, id));
    await registrarLog(LOG_TIPO.EDICAO_VENDEDOR, { id }, true, `Vendedor desativado: ${row.nome}`);
    return { ok: true, message: "Vendedor desativado." };
  }

  const nome = normalizeText(dados.nome);
  if (!nome) throw new Error("Nome obrigatório.");
  const unidadesJson = serializarUnidades(dados.unidades);
  const ativo = dados.ativo !== false;

  if (id) {
    const [row] = await db.select().from(vendedores).where(eq(vendedores.id, id));
    if (!row) throw new Error("Vendedor não encontrado.");
    await db
      .update(vendedores)
      .set({ nome, unidades: unidadesJson, ativo })
      .where(eq(vendedores.id, id));
    await registrarLog(
      LOG_TIPO.EDICAO_VENDEDOR,
      { id, nome, unidades: JSON.parse(unidadesJson), ativo },
      true,
      `Vendedor atualizado: ${nome}`
    );
    return { ok: true, message: "Vendedor atualizado.", id };
  }

  const novoId = await proximoId();
  await db.insert(vendedores).values({
    id: novoId,
    nome,
    ativo: true,
    unidades: unidadesJson,
  });
  await registrarLog(
    LOG_TIPO.CADASTRO_VENDEDOR,
    { id: novoId, nome, unidades: JSON.parse(unidadesJson) },
    true,
    `Vendedor criado: ${nome}`
  );
  return { ok: true, message: "Vendedor criado.", id: novoId };
}
