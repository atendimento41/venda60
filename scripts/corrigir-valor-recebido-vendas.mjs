/**
 * Corrige vendas com valor_recebido = 0 mas subtotal_bruto > 0
 * (faziam comissão e detalhe ficarem zerados).
 */
import pg from "pg";
import { loadEnvLocal } from "../src/lib/load-env.js";

loadEnvLocal();

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 15_000,
  ssl: process.env.DATABASE_SSL === "1" ? { rejectUnauthorized: false } : undefined,
});

await client.connect();
try {
  const before = await client.query(`
    SELECT count(*)::int AS n
    FROM vendas
    WHERE coalesce(valor_recebido, 0) = 0
      AND coalesce(subtotal_bruto, 0) > 0
      AND coalesce(upper(status), '') != 'CANCELADO'
  `);
  console.log("Vendas com valor_recebido 0 e subtotal > 0:", before.rows[0].n);

  const r = await client.query(`
    UPDATE vendas
    SET valor_recebido = GREATEST(0, coalesce(subtotal_bruto, 0) - coalesce(desconto, 0))
    WHERE coalesce(valor_recebido, 0) = 0
      AND coalesce(subtotal_bruto, 0) > 0
      AND coalesce(upper(status), '') != 'CANCELADO'
    RETURNING id, sku, descricao, subtotal_bruto, desconto, valor_recebido, vendedor
  `);
  console.log("Corrigidas:", r.rowCount);
  for (const row of r.rows.slice(0, 20)) {
    console.log(
      `  #${row.id} ${row.sku} ${row.descricao} · ${row.vendedor} → R$ ${Number(row.valor_recebido).toFixed(2)}`
    );
  }
  if (r.rowCount > 20) console.log(`  ... e mais ${r.rowCount - 20}`);
} finally {
  await client.end();
}
