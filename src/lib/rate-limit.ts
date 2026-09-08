import { verificarRateLimitDb } from "./rate-limit-db";

type Entrada = { count: number; resetAt: number };

const tentativas = new Map<string, Entrada>();

function limparExpirados() {
  const agora = Date.now();
  for (const [chave, e] of tentativas) {
    if (e.resetAt <= agora) tentativas.delete(chave);
  }
}

export function ipDoRequest(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip") || "unknown";
}

function verificarRateLimitMemoria(
  chave: string,
  max = 8,
  janelaMs = 15 * 60 * 1000
): { ok: true } | { ok: false; retryAfterSec: number } {
  limparExpirados();
  const agora = Date.now();
  const atual = tentativas.get(chave);

  if (!atual || atual.resetAt <= agora) {
    tentativas.set(chave, { count: 1, resetAt: agora + janelaMs });
    return { ok: true };
  }

  if (atual.count >= max) {
    return { ok: false, retryAfterSec: Math.ceil((atual.resetAt - agora) / 1000) };
  }

  atual.count += 1;
  return { ok: true };
}

/** Rate limit: PostgreSQL (global) com fallback em memória. */
export async function verificarRateLimit(
  chave: string,
  max = 8,
  janelaMs = 15 * 60 * 1000
): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  try {
    return await verificarRateLimitDb(chave, max, janelaMs);
  } catch {
    return verificarRateLimitMemoria(chave, max, janelaMs);
  }
}
