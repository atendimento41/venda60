import { NextResponse } from "next/server";
import { getClient } from "@/db";
import { hashSenha } from "@/lib/password";
import { exigirSessao, isResp } from "@/lib/auth-api";
import { ensureUsuariosTable } from "@/lib/ensure-usuarios";
import { NAV_LINKS, parsePaginas } from "@/lib/roles";
import { mensagemErroApi } from "@/lib/api-error";
import { validarSenhaSegura } from "@/lib/senha-politica";
import { incrementarSessaoVer } from "@/lib/sessao-validar";
import { parseUnidadesJson, serializarUnidades } from "@/services/vendedores";
import {
  dispararVerificacaoEmail,
  limparEmailUsuario,
  normalizarEmail,
  statusEmailUsuario,
} from "@/lib/email-verificacao";
import { resolverLoginEEmail } from "@/lib/login-email";

function serializarPaginas(raw: unknown): string {
  if (raw === "*" || raw === true) return "*";
  if (Array.isArray(raw)) {
    const set = new Set(raw.map(String));
    const validas = NAV_LINKS.map((l) => l.href).filter((h) => set.has(h));
    return JSON.stringify(validas);
  }
  return JSON.stringify([]);
}

async function idPorLogin(login: string): Promise<number | null> {
  const rs = await getClient().execute({
    sql: "SELECT id FROM usuarios WHERE login = ? LIMIT 1",
    args: [login],
  });
  const id = Number(rs.rows?.[0]?.id);
  return id || null;
}

export async function GET(req: Request) {
  await ensureUsuariosTable();
  const gate = await exigirSessao(req);
  if (isResp(gate)) return gate;
  const rs = await getClient().execute(
    "SELECT id, login, nome, paginas, unidades, ativo, email, email_verificado_em, vendedor_id FROM usuarios ORDER BY nome"
  );
  return NextResponse.json(
    (rs.rows || []).map((u) => {
      const st = statusEmailUsuario(u as { email?: string; email_verificado_em?: string });
      return {
        id: u.id,
        login: u.login,
        nome: u.nome,
        paginas: parsePaginas(u.paginas),
        unidades: parseUnidadesJson(u.unidades),
        vendedorId: String(u.vendedor_id || "").trim() || null,
        ativo: Boolean(u.ativo),
        email: st.email,
        emailVerificado: st.emailVerificado,
        emailStatus: st.emailStatus,
      };
    })
  );
}

export async function POST(req: Request) {
  await ensureUsuariosTable();
  const gate = await exigirSessao(req);
  if (isResp(gate)) return gate;
  try {
    const body = await req.json();
    const resolvido = resolverLoginEEmail({
      login: String(body.login || ""),
      email: body.email ?? "",
    });
    const login = resolvido.login;
    const emailRaw = resolvido.email;
    const nome = String(body.nome || "").trim();
    const senha = String(body.senha || "");
    const paginas = serializarPaginas(body.todas ? "*" : body.paginas);
    const unidades = serializarUnidades(body.unidades ?? []);
    const vendedorId = String(body.vendedorId || body.vendedor_id || "").trim() || null;
    const ativo = body.ativo !== false;

    if (!nome) throw new Error("Nome obrigatório.");

    const client = getClient();
    let avisoEmail: string | undefined;
    let emailEnviado = false;

    if (body.id) {
      const id = Number(body.id);
      const atual = await client.execute({
        sql: "SELECT login, paginas, unidades, ativo, email, vendedor_id FROM usuarios WHERE id = ? LIMIT 1",
        args: [id],
      });
      const row = atual.rows[0] as
        | {
            login: string;
            paginas: string;
            unidades?: string;
            ativo: boolean;
            email?: string | null;
            vendedor_id?: string | null;
          }
        | undefined;
      const mudouPermissao =
        row &&
        (String(row.paginas) !== paginas ||
          String(row.unidades || "[]") !== unidades ||
          String(row.vendedor_id || "") !== String(vendedorId || "") ||
          Boolean(row.ativo) !== ativo);

      if (senha) {
        const erroSenha = validarSenhaSegura(senha);
        if (erroSenha) throw new Error(erroSenha);
        await client.execute({
          sql: "UPDATE usuarios SET nome = ?, paginas = ?, unidades = ?, vendedor_id = ?, ativo = ?, senha_hash = ? WHERE id = ?",
          args: [nome, paginas, unidades, vendedorId, ativo, hashSenha(senha), id],
        });
        await incrementarSessaoVer(id);
      } else {
        await client.execute({
          sql: "UPDATE usuarios SET nome = ?, paginas = ?, unidades = ?, vendedor_id = ?, ativo = ? WHERE id = ?",
          args: [nome, paginas, unidades, vendedorId, ativo, id],
        });
        if (mudouPermissao) await incrementarSessaoVer(id);
      }

      const loginReal = String(row?.login || login);
      const anterior = normalizarEmail(row?.email);
      if (!emailRaw) {
        if (anterior) await limparEmailUsuario(id);
      } else if (emailRaw !== anterior) {
        const r = await dispararVerificacaoEmail({
          userId: id,
          email: emailRaw,
          nome,
          login: loginReal,
        });
        emailEnviado = r.enviado;
        avisoEmail = r.aviso;
      }

      let message = mudouPermissao || senha
        ? "Usuário atualizado. Ele precisará fazer login novamente."
        : "Usuário atualizado.";
      if (emailEnviado) message += " E-mail de verificação enviado.";
      else if (avisoEmail) message += " " + avisoEmail;

      return NextResponse.json({ ok: true, message, emailEnviado, avisoEmail });
    }

    const erroSenha = validarSenhaSegura(senha);
    if (erroSenha) throw new Error(erroSenha);
    await client.execute({
      sql: "INSERT INTO usuarios (login, nome, senha_hash, paginas, unidades, vendedor_id, ativo) VALUES (?, ?, ?, ?, ?, ?, TRUE)",
      args: [login, nome, hashSenha(senha), paginas, unidades, vendedorId],
    });
    const novoId = await idPorLogin(login);
    if (!novoId) throw new Error("Usuário criado, mas não foi possível obter o ID.");

    let message = "Usuário criado.";
    if (emailRaw) {
      const r = await dispararVerificacaoEmail({
        userId: novoId,
        email: emailRaw,
        nome,
        login,
      });
      emailEnviado = r.enviado;
      avisoEmail = r.aviso;
      if (emailEnviado) message += " E-mail de verificação enviado.";
      else if (avisoEmail) message += " " + avisoEmail;
    } else if (String(body.login || "").includes("@")) {
      message += " Login salvo como " + login + " e e-mail pessoal associado.";
    }

    return NextResponse.json({ ok: true, message, emailEnviado, avisoEmail });
  } catch (e) {
    const msg = mensagemErroApi(e, "Falha ao salvar usuário.");
    const jaExiste = /unique|usuarios_email_unique/i.test(e instanceof Error ? e.message : "");
    return NextResponse.json(
      {
        error: jaExiste
          ? /email/i.test(e instanceof Error ? e.message : "")
            ? "Este e-mail pessoal já está em uso."
            : "Esse usuário já existe."
          : msg,
      },
      { status: 400 }
    );
  }
}
