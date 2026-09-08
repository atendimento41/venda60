import { NextResponse } from "next/server";
import { getClient } from "@/db";
import { mensagemErroApi } from "@/lib/api-error";
import { verificarSenha } from "@/lib/password";
import { ipDoRequest, verificarRateLimit } from "@/lib/rate-limit";
import { cookieSessao, criarTokenSessao } from "@/lib/session";
import { ensureUsuariosTable } from "@/lib/ensure-usuarios";
import { parsePaginas, primeiraPagina } from "@/lib/roles";
import { parseUnidadesJson } from "@/services/vendedores";

function usuarioAtivo(ativo: unknown): boolean {
  return ativo === true || ativo === 1 || ativo === "1" || ativo === "t";
}

export async function POST(req: Request) {
  try {
    const ip = ipDoRequest(req);
    const body = await req.json();
    const login = String(body.login || body.email || "").trim().toLowerCase();
    const senha = String(body.senha || "");

    const limiteIp = await verificarRateLimit(`login:ip:${ip}`, 12, 15 * 60 * 1000);
    if (!limiteIp.ok) {
      return NextResponse.json(
        { error: "Muitas tentativas. Aguarde alguns minutos." },
        { status: 429, headers: { "Retry-After": String(limiteIp.retryAfterSec) } }
      );
    }
    if (login) {
      const limiteLogin = await verificarRateLimit(`login:user:${login}`, 6, 15 * 60 * 1000);
      if (!limiteLogin.ok) {
        return NextResponse.json(
          { error: "Muitas tentativas para este usuário. Aguarde alguns minutos." },
          { status: 429, headers: { "Retry-After": String(limiteLogin.retryAfterSec) } }
        );
      }
    }

    await ensureUsuariosTable();
    if (!login || !senha) {
      return NextResponse.json({ error: "Informe usuário e senha." }, { status: 400 });
    }

    const rs = await getClient().execute({
      sql: "SELECT * FROM usuarios WHERE lower(login) = ? LIMIT 1",
      args: [login],
    });
    const user = rs.rows?.[0] as
      | {
          id: number;
          login: string;
          nome: string;
          senha_hash: string;
          paginas: string;
          unidades?: string;
          ativo: boolean | number | string;
          sessao_ver: number;
        }
      | undefined;

    if (!user || !usuarioAtivo(user.ativo) || !verificarSenha(senha, String(user.senha_hash))) {
      return NextResponse.json({ error: "Usuário ou senha inválidos." }, { status: 401 });
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
    const res = NextResponse.json({
      ok: true,
      usuario: { nome: user.nome, login: user.login, unidades },
      next: primeiraPagina(paginas),
    });
    res.headers.set("Set-Cookie", cookieSessao(token));
    return res;
  } catch (e) {
    return NextResponse.json(
      { error: mensagemErroApi(e, "Falha no login.") },
      { status: 500 }
    );
  }
}
