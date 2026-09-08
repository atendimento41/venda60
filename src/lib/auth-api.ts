import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { nomeCookieSessao, lerTokenSessao } from "./session";
import { podeAcessarApi, type SessaoUsuario } from "./roles";
import { validarSessaoNoBanco } from "./sessao-validar";

export async function getSessao(): Promise<SessaoUsuario | null> {
  const store = await cookies();
  const sessao = await lerTokenSessao(store.get(nomeCookieSessao())?.value);
  if (!sessao) return null;
  try {
    return await validarSessaoNoBanco(sessao);
  } catch {
    return sessao;
  }
}

export async function exigirSessao(req: Request): Promise<{ sessao: SessaoUsuario } | NextResponse> {
  const sessao = await getSessao();
  if (!sessao) {
    return NextResponse.json(
      { error: "Sessão expirada ou permissões alteradas. Faça login novamente." },
      { status: 401 }
    );
  }
  const url = new URL(req.url);
  if (!podeAcessarApi(sessao.paginas, req.method, url.pathname)) {
    return NextResponse.json({ error: "Sem permissão para esta operação." }, { status: 403 });
  }
  return { sessao };
}

export function isResp(v: unknown): v is NextResponse {
  return v instanceof NextResponse;
}
