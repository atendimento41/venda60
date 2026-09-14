import { NextResponse } from "next/server";
import { cookieSessao, criarTokenSessao } from "@/lib/session";
import { paginasVendas, primeiraPagina, temAcessoVendas } from "@/lib/roles";
import { lerSsoToken } from "@/lib/sso";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const payload = await lerSsoToken(token);
  if (!payload || payload.modulo !== "venda60") {
    return NextResponse.redirect(new URL("/login?erro=sso", req.url));
  }

  const paginas = paginasVendas(payload.paginas);
  if (!temAcessoVendas(paginas)) {
    return NextResponse.redirect(new URL("/login?erro=perm", req.url));
  }

  const sessao = await criarTokenSessao({
    id: payload.sub,
    login: payload.login,
    nome: payload.nome,
    paginas,
    unidades: payload.unidades || [],
    sv: 1,
  });

  const dest = primeiraPagina(paginas);
  const res = NextResponse.redirect(new URL(dest, req.url));
  res.headers.set("Set-Cookie", cookieSessao(sessao));
  return res;
}
