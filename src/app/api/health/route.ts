import { NextResponse } from "next/server";
import { getClient } from "@/db";
import { isProducao } from "@/lib/api-error";

/** Verifica conexão com o banco. Em produção, detalhes só com HEALTH_TOKEN. */
export async function GET(req: Request) {
  const tokenEsperado = process.env.HEALTH_TOKEN?.trim();
  const token = new URL(req.url).searchParams.get("token");
  const tokenOk = Boolean(tokenEsperado && token === tokenEsperado);

  if (tokenEsperado && !tokenOk) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    await getClient().execute("SELECT 1");
    if (!isProducao() || tokenOk) {
      const u = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
      return NextResponse.json({
        ok: true,
        db: u?.pathname?.replace(/^\//, "") || null,
        user: u?.username || null,
        host: u?.hostname || null,
      });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[health]", e);
    const msg = e instanceof Error ? e.message.trim() : String(e ?? "").trim();
    return NextResponse.json(
      {
        ok: false,
        error: tokenOk || !isProducao() ? msg || "Erro de conexão" : "Banco indisponível.",
      },
      { status: 503 }
    );
  }
}
