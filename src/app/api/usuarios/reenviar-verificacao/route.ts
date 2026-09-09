import { NextResponse } from "next/server";
import { exigirSessao, isResp } from "@/lib/auth-api";
import { ensureUsuariosTable } from "@/lib/ensure-usuarios";
import { mensagemErroApi } from "@/lib/api-error";
import { reenviarVerificacao } from "@/lib/email-verificacao";

export async function POST(req: Request) {
  await ensureUsuariosTable();
  const gate = await exigirSessao(req);
  if (isResp(gate)) return gate;
  try {
    const body = await req.json();
    const id = Number(body.id);
    if (!id) throw new Error("ID inválido.");
    const r = await reenviarVerificacao(id);
    return NextResponse.json({
      ok: true,
      emailEnviado: r.enviado,
      message: r.enviado
        ? "E-mail de verificação reenviado."
        : r.aviso || "Não foi possível reenviar.",
      aviso: r.aviso,
    });
  } catch (e) {
    return NextResponse.json(
      { error: mensagemErroApi(e, "Falha ao reenviar verificação.") },
      { status: 400 }
    );
  }
}
