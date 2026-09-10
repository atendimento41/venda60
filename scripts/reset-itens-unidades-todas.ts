/**
 * Zera o vínculo de unidade dos itens → "Todas" (JSON []).
 * Na venda, item com [] aparece em qualquer loja (se tiver estoque).
 * Depois ajuste no Cadastro de itens marcando só as lojas desejadas.
 *
 * Uso: npx tsx scripts/reset-itens-unidades-todas.ts
 */
import { loadEnvLocal } from "../src/lib/load-env";

loadEnvLocal();

async function main() {
  const { getClient } = await import("../src/db");
  const { ensureItensSchema } = await import("../src/lib/ensure-schema");
  await ensureItensSchema();
  const client = getClient();
  const before = await client.execute(
    `SELECT count(*)::int AS n FROM itens WHERE coalesce(trim(unidades),'') NOT IN ('', '[]')`
  );
  const nRest = Number(before.rows[0]?.n ?? 0);
  await client.execute(`UPDATE itens SET unidades = '[]'`);
  const total = await client.execute(`SELECT count(*)::int AS n FROM itens`);
  console.log(
    `Itens agora em todas as unidades: ${Number(total.rows[0]?.n ?? 0)} (antes restritos: ${nRest}).`
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
