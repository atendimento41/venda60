import { NextResponse } from "next/server";
import {
  cookieOAuthState,
  gerarOAuthState,
  googleOAuthConfigurado,
  urlAutorizacaoGoogle,
} from "@/lib/google-oauth";

export async function GET(req: Request) {
  if (!googleOAuthConfigurado()) {
    return NextResponse.redirect(
      new URL("/login?erro=" + encodeURIComponent("Login Google não configurado."), req.url)
    );
  }
  const url = new URL(req.url);
  let next = url.searchParams.get("next") || "/";
  if (!next.startsWith("/") || next.startsWith("//")) next = "/";

  const state = gerarOAuthState();
  const res = NextResponse.redirect(urlAutorizacaoGoogle({ state, req }));
  res.headers.append("Set-Cookie", cookieOAuthState(state, next));
  return res;
}
