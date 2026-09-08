import {
  pgTable,
  text,
  integer,
  doublePrecision,
  boolean,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const usuarios = pgTable("usuarios", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  login: text("login").notNull().unique(),
  nome: text("nome").notNull(),
  senhaHash: text("senha_hash").notNull(),
  paginas: text("paginas").notNull().default("[]"),
  /** JSON array. Vazio [] = todas as unidades (legado). */
  unidades: text("unidades").notNull().default("[]"),
  ativo: boolean("ativo").notNull().default(true),
  sessaoVer: integer("sessao_ver").notNull().default(1),
});

export const vendedores = pgTable("vendedores", {
  id: text("id").primaryKey(),
  nome: text("nome").notNull(),
  ativo: boolean("ativo").notNull().default(true),
  unidades: text("unidades").notNull().default("[]"),
});

export const itens = pgTable("itens", {
  sku: text("sku").primaryKey(),
  categoriaDash: text("categoria_dash"),
  subcategoriaMeep: text("subcategoria_meep"),
  descricao: text("descricao").notNull(),
  preco: doublePrecision("preco").notNull().default(0),
  ativo: boolean("ativo").notNull().default(true),
  custo: doublePrecision("custo").notNull().default(0),
  fotoUrl: text("foto_url"),
  ilimitado: boolean("ilimitado").notNull().default(false),
  sugestaoVenda: doublePrecision("sugestao_venda").notNull().default(0),
  precoFinalSalvo: boolean("preco_final_salvo").notNull().default(false),
  /** JSON array. Vazio [] = todas as unidades (legado). */
  unidades: text("unidades").notNull().default("[]"),
});

export const estoque = pgTable(
  "estoque",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    sku: text("sku")
      .notNull()
      .references(() => itens.sku),
    unidade: text("unidade").notNull(),
    quantidade: integer("quantidade").notNull().default(0),
    nome: text("nome"),
  },
  (t) => [uniqueIndex("estoque_sku_unidade").on(t.sku, t.unidade)]
);

export const vendas = pgTable("vendas", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  data: text("data").notNull(),
  idVendedor: text("id_vendedor"),
  vendedor: text("vendedor"),
  unidade: text("unidade").notNull(),
  categoria: text("categoria"),
  subcategoria: text("subcategoria"),
  sku: text("sku").notNull(),
  descricao: text("descricao"),
  precoUnitario: doublePrecision("preco_unitario").notNull().default(0),
  quantidade: integer("quantidade").notNull().default(1),
  subtotalBruto: doublePrecision("subtotal_bruto").notNull().default(0),
  desconto: doublePrecision("desconto").notNull().default(0),
  valorRecebido: doublePrecision("valor_recebido").notNull().default(0),
  status: text("status").default(""),
  canceladoPor: text("cancelado_por"),
  canceladoEm: text("cancelado_em"),
  motivoCancelamento: text("motivo_cancelamento"),
});

export const primeVendas = pgTable("prime_vendas", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  data: text("data").notNull(),
  idVendedor: text("id_vendedor"),
  vendedor: text("vendedor"),
  unidade: text("unidade"),
  item: text("item").notNull(),
  quantidade: integer("quantidade").notNull().default(1),
  valor: doublePrecision("valor").notNull().default(0),
  nivel: text("nivel"),
  status: text("status").default(""),
  canceladoPor: text("cancelado_por"),
  canceladoEm: text("cancelado_em"),
  motivoCancelamento: text("motivo_cancelamento"),
});

export const logOperacoes = pgTable("log_operacoes", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  dataHora: text("data_hora").notNull(),
  operador: text("operador"),
  tipo: text("tipo").notNull(),
  sucesso: boolean("sucesso").notNull().default(true),
  dados: text("dados"),
  mensagem: text("mensagem"),
});

export const entregaUnik = pgTable("entrega_unik", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  data: text("data"),
  tipo: text("tipo"),
  nome: text("nome"),
  sku: text("sku"),
  quantidade: doublePrecision("quantidade").default(0),
  status: text("status"),
  unidade: text("unidade"),
  estoqueAplicado: boolean("estoque_aplicado").notNull().default(false),
  fotoUrl: text("foto_url"),
  custo: doublePrecision("custo").notNull().default(0),
  sugestaoVenda: doublePrecision("sugestao_venda").notNull().default(0),
  recebidoPor: text("recebido_por"),
  estoqueUnidade: text("estoque_unidade"),
});

export const unikVinculos = pgTable("unik_vinculos", {
  nomeChave: text("nome_chave").primaryKey(),
  sku: text("sku").notNull(),
  nomeOriginal: text("nome_original"),
});

export const unikLojaStatus = pgTable(
  "unik_loja_status",
  {
    sku: text("sku").notNull(),
    unidade: text("unidade").notNull(),
    enviado: boolean("enviado").notNull().default(false),
    lancado: boolean("lancado").notNull().default(false),
  },
  (t) => [uniqueIndex("unik_loja_sku_unidade").on(t.sku, t.unidade)]
);

export const movimentosEstoque = pgTable("movimentos_estoque", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  dataHora: text("data_hora").notNull(),
  sku: text("sku").notNull(),
  unidade: text("unidade").notNull(),
  delta: integer("delta").notNull(),
  quantidadeApos: integer("quantidade_apos"),
  tipo: text("tipo").notNull(),
  operador: text("operador"),
  referencia: text("referencia"),
});

export const estoqueSnapshots = pgTable(
  "estoque_snapshots",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    mes: text("mes").notNull(),
    sku: text("sku").notNull(),
    unidade: text("unidade").notNull(),
    quantidade: integer("quantidade").notNull().default(0),
  },
  (t) => [uniqueIndex("snapshot_mes_sku_unidade").on(t.mes, t.sku, t.unidade)]
);

export type Vendedor = typeof vendedores.$inferSelect;
export type Item = typeof itens.$inferSelect;
export type Estoque = typeof estoque.$inferSelect;
export type Venda = typeof vendas.$inferSelect;
export type PrimeVenda = typeof primeVendas.$inferSelect;
