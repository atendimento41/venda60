import { NextResponse } from "next/server";
import { getClient } from "@/db";
import { getSessao } from "@/lib/auth-api";
import { hashSenha, verificarSenha } from "@/lib/password";
import { ensureUsuariosTable } from "@/lib/ensure-usuarios";
import { mensagemErroApi } from "@/lib/api-error";
import { validarSenhaSegura } from "@/lib/senha-politica";
import { ipDoRequest, verificarRateLimit } from "@/lib/rate-limit";
import { cookieSessao, criarTokenSessao } from "@/lib/session";
import { parsePaginas } from "@/lib/roles";
import { incrementarSessaoVer } from "@/lib/sessao-validar";
import { parseUnidadesJson } from "@/services/vendedores";

export async function POST(req: Request) {
  try {
    const ip = ipDoRequest(req);
    const limite = await verificarRateLimit(`trocar-senha:${ip}`, 5, 15 * 60 * 1000);
    if (!limite.ok) {
      return NextResponse.json(
        { error: "Muitas tentativas. Aguarde alguns minutos." },
        { status: 429, headers: { "Retry-After": String(limite.retryAfterSec) } }
      );
    }

    const sessao = await getSessao();
    if (!sessao) {
      return NextResponse.json({ error: "Faça login para continuar." }, { status: 401 });
    }

    const body = await req.json();
    const senhaAtual = String(body.senhaAtual || "");
    const senhaNova = String(body.senhaNova || "");
    const confirmacao = String(body.senhaNovaConfirmacao || body.confirmacao || "");

    if (!senhaAtual || !senhaNova) {
      return NextResponse.json({ error: "Informe a senha atual e a nova senha." }, { status: 400 });
    }
    const erroSenha = validarSenhaSegura(senhaNova);
    if (erroSenha) {
      return NextResponse.json({ error: erroSenha }, { status: 400 });
    }
    if (senhaNova !== confirmacao) {
      return NextResponse.json({ error: "A confirmação não confere com a nova senha." }, { status: 400 });
    }

    await ensureUsuariosTable();
    const result = await getClient().execute({
      sql: "SELECT id, senha_hash, paginas, unidades FROM usuarios WHERE id = ? LIMIT 1",
      args: [sessao.id],
    });
    const user = result.rows[0] as
      | { id: number; senha_hash: string; paginas: string; unidades?: string }
      | undefined;
    if (!user || !verificarSenha(senhaAtual, String(user.senha_hash))) {
      return NextResponse.json({ error: "Senha atual incorreta." }, { status: 400 });
    }

    await getClient().execute({
      sql: "UPDATE usuarios SET senha_hash = ? WHERE id = ?",
      args: [hashSenha(senhaNova), sessao.id],
    });
    await incrementarSessaoVer(sessao.id);

    const rs = await getClient().execute({
      sql: "SELECT sessao_ver FROM usuarios WHERE id = ? LIMIT 1",
      args: [sessao.id],
    });
    const sv = Number(rs.rows[0]?.sessao_ver) || 1;
    const token = await criarTokenSessao({
      id: sessao.id,
      login: sessao.login,
      nome: sessao.nome,
      paginas: parsePaginas(user.paginas),
      unidades: parseUnidadesJson(user.unidades),
      sv,
    });

    const res = NextResponse.json({ ok: true, message: "Senha alterada com sucesso." });
    res.headers.set("Set-Cookie", cookieSessao(token));
    return res;
  } catch (e) {
    return NextResponse.json({ error: mensagemErroApi(e) }, { status: 500 });
  }
}
