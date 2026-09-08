import { getClient } from "@/db";

let tabelaOk = false;

export async function ensureRateLimitTable() {
  if (tabelaOk) return;
  await getClient().execute(`
    CREATE TABLE IF NOT EXISTS rate_limit (
      chave TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 1,
      reset_at BIGINT NOT NULL
    )
  `);
  tabelaOk = true;
}

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSec: number };

/** Rate limit compartilhado via PostgreSQL (funciona em serverless). */
export async function verificarRateLimitDb(
  chave: string,
  max = 8,
  janelaMs = 15 * 60 * 1000
): Promise<RateLimitResult> {
  await ensureRateLimitTable();
  const agora = Date.now();
  const client = getClient();

  const atual = await client.execute({
    sql: "SELECT count, reset_at FROM rate_limit WHERE chave = ? LIMIT 1",
    args: [chave],
  });
  const row = atual.rows[0] as { count: number; reset_at: number } | undefined;

  if (!row || Number(row.reset_at) <= agora) {
    await client.execute({
      sql: `INSERT INTO rate_limit (chave, count, reset_at) VALUES (?, 1, ?)
            ON CONFLICT (chave) DO UPDATE SET count = 1, reset_at = EXCLUDED.reset_at`,
      args: [chave, agora + janelaMs],
    });
    return { ok: true };
  }

  const count = Number(row.count) || 0;
  if (count >= max) {
    return { ok: false, retryAfterSec: Math.ceil((Number(row.reset_at) - agora) / 1000) };
  }

  await client.execute({
    sql: "UPDATE rate_limit SET count = count + 1 WHERE chave = ?",
    args: [chave],
  });
  return { ok: true };
}
