import { db } from "./index";
import { vendedores, itens, estoque } from "./schema";
import { eq, and } from "drizzle-orm";

const UNIDADES = ["PKS", "SSU", "PIER 21", "TGS"];

async function seed() {
  const vendedoresSeed = [
    { id: "V001", nome: "Vendedor Demo", ativo: true, unidades: "[]" },
  ];
  for (const v of vendedoresSeed) {
    const ex = await db.select().from(vendedores).where(eq(vendedores.id, v.id));
    if (!ex.length) await db.insert(vendedores).values(v);
  }

  const itensSeed = [
    {
      sku: "SKU-DEMO-001",
      categoriaDash: "PHOTO",
      subcategoriaMeep: "PRODUTOS",
      descricao: "Item demonstração",
      preco: 50,
      ativo: true,
    },
  ];
  for (const item of itensSeed) {
    const exItem = await db.select().from(itens).where(eq(itens.sku, item.sku));
    if (!exItem.length) await db.insert(itens).values(item);
    for (const unidade of UNIDADES) {
      const exEst = await db
        .select()
        .from(estoque)
        .where(and(eq(estoque.sku, item.sku), eq(estoque.unidade, unidade)));
      if (!exEst.length) {
        await db.insert(estoque).values({
          sku: item.sku,
          unidade,
          quantidade: 10,
          nome: item.descricao,
        });
      }
    }
  }

  console.log("Seed concluído.");
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
