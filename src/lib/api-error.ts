const ERRO_INTERNO =
  /operator does not exist|syntax error|ECONNREFUSED|password authentication|relation .* does not exist|duplicate key value|column .* does not exist|invalid input syntax|connection terminated|timeout expired|SSL/i;

export function isProducao(): boolean {
  return Boolean(process.env.VERCEL || process.env.NODE_ENV === "production");
}

/** Evita expor detalhes de banco/infra em produção; mantém mensagens de negócio. */
export function mensagemErroApi(e: unknown, fallback = "Erro interno. Tente novamente."): string {
  const msg = e instanceof Error ? e.message.trim() : String(e ?? "").trim();
  if (!msg) return fallback;
  if (!isProducao()) return msg;
  if (ERRO_INTERNO.test(msg)) {
    console.error("[api]", msg, e);
    return fallback;
  }
  return msg;
}
