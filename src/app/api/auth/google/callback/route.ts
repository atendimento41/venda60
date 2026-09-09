import { NextResponse } from "next/server";
import { getClient } from "@/db";
import { ensureUsuariosTable } from "@/lib/ensure-usuarios";
import {
  cookieOAuthStateClear,
  lerCookieOAuthState,
  trocarCodePorPerfilGoogle,
} from "@/lib/google-oauth";
import { parsePaginas, primeiraPagina } from "@/lib/roles";
import { cookieSessao, criarTokenSessao } from "@/lib/session";
import { parseUnidadesJson } from "@/services/vendedores";

function usuarioAtivo(ativo: unknown): boolean {
  return ativo === true || ativo === 1 || ativo === "1" || ativo === "t";
}

function redirectLoginErro(req: Request, msg: string) {
  const res = NextResponse.redirect(
    new URL("/login?erro=" + encodeURIComponent(msg), req.url)
  );
  res.headers.append("Set-Cookie", cookieOAuthStateClear());
  return res;
}

export async function GET(req: Request) {
  try {
    await ensureUsuariosTable();
    const url = new URL(req.url);
    const err = url.searchParams.get("error");
    if (err) {
      return redirectLoginErro(req, "Login Google cancelado.");
    }

    const code = url.searchParams.get("code") || "";
    const state = url.searchParams.get("state") || "";
    const saved = lerCookieOAuthState(req.headers.get("cookie"));
    if (!code || !state || !saved || saved.state !== state) {
      return redirectLoginErro(req, "Sessão Google inválida. Tente de novo.");
    }

    const profile = await trocarCodePorPerfilGoogle(code, req);
    if (!profile.emailVerified) {
      return redirectLoginErro(
        req,
        "A conta Google precisa ter e-mail verificado."
      );
    }

    const rs = await getClient().execute({
      sql: `SELECT * FROM usuarios
            WHERE email IS NOT NULL AND lower(email) = ?
            LIMIT 1`,
      args: [profile.email],
    });
    const user = rs.rows?.[0] as
      | {
          id: number;
          login: string;
          nome: string;
          paginas: string;
          unidades?: string;
          ativo: unknown;
          sessao_ver: number;
          email_verificado_em?: string | null;
        }
      | undefined;

    if (!user || !usuarioAtivo(user.ativo)) {
      return redirectLoginErro(
        req,
        "Nenhum usuário ativo com este e-mail. Peça ao admin para cadastrar seu e-mail pessoal."
      );
    }

    // Google já autenticou o e-mail → marca como verificado se ainda pendente
    if (!user.email_verificado_em) {
      await getClient().execute({
        sql: `UPDATE usuarios
              SET email_verificado_em = ?,
                  email_token_hash = NULL,
                  email_token_expira = NULL
              WHERE id = ?`,
        args: [new Date().toISOString(), user.id],
      });
    }

    const paginas = parsePaginas(user.paginas);
    const unidades = parseUnidadesJson(user.unidades);
    const token = await criarTokenSessao({
      id: Number(user.id),
      login: String(user.login),
      nome: String(user.nome),
      paginas,
      unidades,
      sv: Number(user.sessao_ver) || 1,
    });

    let next = saved.next || primeiraPagina(paginas);
    if (!next.startsWith("/") || next.startsWith("//")) next = primeiraPagina(paginas);

    const res = NextResponse.redirect(new URL(next, req.url));
    res.headers.append("Set-Cookie", cookieOAuthStateClear());
    res.headers.append("Set-Cookie", cookieSessao(token));
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha no login Google.";
    return redirectLoginErro(req, msg);
  }
}
