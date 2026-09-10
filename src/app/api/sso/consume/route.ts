import { NextResponse } from "next/server";
import { cookieSessao, criarTokenSessao } from "@/lib/session";
import { primeiraPagina, type PaginasPerm } from "@/lib/roles";
import { lerSsoToken } from "@/lib/sso";

/** Extrai só perms de vendas (hrefs sem prefixo de outros módulos). */
function paginasVendas(paginas: PaginasPerm): PaginasPerm {
  if (paginas === "*") return "*";
  return paginas.filter(
    (p) => !p.startsWith("omie:") && !p.startsWith("fin:") && !p.startsWith("hub:")
  );
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const payload = await lerSsoToken(token);
  if (!payload || payload.modulo !== "venda60") {
    return NextResponse.redirect(new URL("/login?erro=sso", req.url));
  }

  const paginas = paginasVendas(payload.paginas);
  if (paginas !== "*" && paginas.length === 0) {
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
