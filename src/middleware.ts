import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { lerTokenSessao, nomeCookieSessao } from "@/lib/session";
import { podeAcessarApi, podeAcessarPagina, primeiraPagina } from "@/lib/roles";

const PUBLIC_PAGES = ["/login", "/verificar-email"];
const PUBLIC_APIS = [
  "/api/auth/login",
  "/api/auth/verificar-email",
  "/api/auth/google",
  "/api/health",
  "/api/sso/consume",
];

function withSecurityHeaders(res: NextResponse): NextResponse {
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (process.env.VERCEL) {
    res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  return res;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get(nomeCookieSessao())?.value;
  const sessao = await lerTokenSessao(token);

  if (PUBLIC_PAGES.includes(pathname) || PUBLIC_APIS.includes(pathname) || pathname.startsWith("/api/auth/google")) {
    if (pathname === "/login" && sessao) {
      return withSecurityHeaders(
        NextResponse.redirect(new URL(primeiraPagina(sessao.paginas), req.url))
      );
    }
    return withSecurityHeaders(NextResponse.next());
  }

  if (!sessao) {
    if (pathname.startsWith("/api/")) {
      return withSecurityHeaders(
        NextResponse.json({ error: "Faça login para continuar." }, { status: 401 })
      );
    }
    const login = new URL("/login", req.url);
    login.searchParams.set("next", pathname);
    return withSecurityHeaders(NextResponse.redirect(login));
  }

  if (pathname.startsWith("/api/")) {
    if (!podeAcessarApi(sessao.paginas, req.method, pathname)) {
      return withSecurityHeaders(
        NextResponse.json({ error: "Sem permissão para esta operação." }, { status: 403 })
      );
    }
    return withSecurityHeaders(NextResponse.next());
  }

  if (!podeAcessarPagina(sessao.paginas, pathname)) {
    return withSecurityHeaders(
      NextResponse.redirect(new URL(primeiraPagina(sessao.paginas), req.url))
    );
  }

  return withSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
