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
  await client.query("REFRESH MATERIALIZED VIEW CONCURRENTLY mv_vendas_mensal").catch(async () => {
    await client.query("REFRESH MATERIALIZED VIEW mv_vendas_mensal");
  });
  console.log("mv_vendas_mensal atualizada");
} finally {
  await client.end();
}
