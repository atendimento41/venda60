import { NextResponse, type NextRequest } from "next/server";
import { lerTokenSessao, nomeCookieSessao } from "@/lib/session";
import { emitirSsoToken, hubUrl, ssoConfigurado } from "@/lib/sso";

/** Logo do menu: volta ao Hub levando o login (o Hub relê as permissões no banco). */
export async function GET(req: NextRequest) {
  const hub = hubUrl();
  const sessao = await lerTokenSessao(req.cookies.get(nomeCookieSessao())?.value);
  if (!sessao || !ssoConfigurado()) return NextResponse.redirect(hub);

  const token = await emitirSsoToken(
    {
      sub: sessao.id,
      login: sessao.login,
      nome: sessao.nome,
      paginas: sessao.paginas === "*" ? "*" : [...sessao.paginas],
      unidades: sessao.unidades ?? [],
    },
    "hub",
  );
  const dest = new URL("/api/sso/consume", hub);
  dest.searchParams.set("token", token);
  return NextResponse.redirect(dest);
}
