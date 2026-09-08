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

function normalizarLogin(v: string) {
  return String(v || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function serializarPaginas(raw: unknown): string {
  if (raw === "*" || raw === true) return "*";
  if (Array.isArray(raw)) {
    const set = new Set(raw.map(String));
    const validas = NAV_LINKS.map((l) => l.href).filter((h) => set.has(h));
    return JSON.stringify(validas);
  }
  return JSON.stringify([]);
}

export async function GET(req: Request) {
  await ensureUsuariosTable();
  const gate = await exigirSessao(req);
  if (isResp(gate)) return gate;
  const rs = await getClient().execute(
    "SELECT id, login, nome, paginas, unidades, ativo FROM usuarios ORDER BY nome"
  );
  return NextResponse.json(
    (rs.rows || []).map((u) => ({
      id: u.id,
      login: u.login,
      nome: u.nome,
      paginas: parsePaginas(u.paginas),
      unidades: parseUnidadesJson(u.unidades),
      ativo: Boolean(u.ativo),
    }))
  );
}

export async function POST(req: Request) {
  await ensureUsuariosTable();
  const gate = await exigirSessao(req);
  if (isResp(gate)) return gate;
  try {
    const body = await req.json();
    const login = normalizarLogin(body.login);
    const nome = String(body.nome || "").trim();
    const senha = String(body.senha || "");
    const paginas = serializarPaginas(body.todas ? "*" : body.paginas);
    const unidades = serializarUnidades(body.unidades ?? []);
    const ativo = body.ativo !== false;

    if (!nome) throw new Error("Nome obrigatório.");
    if (!login) throw new Error("Usuário obrigatório (sem espaços).");
    if (!/^[a-z0-9._-]+$/.test(login)) {
      throw new Error("Usuário só pode ter letras, números, ponto, _ ou -.");
    }

    const client = getClient();
    if (body.id) {
      const id = Number(body.id);
      const atual = await client.execute({
        sql: "SELECT paginas, unidades, ativo FROM usuarios WHERE id = ? LIMIT 1",
        args: [id],
      });
      const row = atual.rows[0] as
        | { paginas: string; unidades?: string; ativo: boolean }
        | undefined;
      const mudouPermissao =
        row &&
        (String(row.paginas) !== paginas ||
          String(row.unidades || "[]") !== unidades ||
          Boolean(row.ativo) !== ativo);

      if (senha) {
        const erroSenha = validarSenhaSegura(senha);
        if (erroSenha) throw new Error(erroSenha);
        await client.execute({
          sql: "UPDATE usuarios SET nome = ?, paginas = ?, unidades = ?, ativo = ?, senha_hash = ? WHERE id = ?",
          args: [nome, paginas, unidades, ativo, hashSenha(senha), id],
        });
        await incrementarSessaoVer(id);
      } else {
        await client.execute({
          sql: "UPDATE usuarios SET nome = ?, paginas = ?, unidades = ?, ativo = ? WHERE id = ?",
          args: [nome, paginas, unidades, ativo, id],
        });
        if (mudouPermissao) await incrementarSessaoVer(id);
      }
      return NextResponse.json({
        ok: true,
        message: mudouPermissao || senha
          ? "Usuário atualizado. Ele precisará fazer login novamente."
          : "Usuário atualizado.",
      });
    }

    const erroSenha = validarSenhaSegura(senha);
    if (erroSenha) throw new Error(erroSenha);
    await client.execute({
      sql: "INSERT INTO usuarios (login, nome, senha_hash, paginas, unidades, ativo) VALUES (?, ?, ?, ?, ?, TRUE)",
      args: [login, nome, hashSenha(senha), paginas, unidades],
    });
    return NextResponse.json({ ok: true, message: "Usuário criado." });
  } catch (e) {
    const msg = mensagemErroApi(e, "Falha ao salvar usuário.");
    const jaExiste = /unique/i.test(e instanceof Error ? e.message : "");
    return NextResponse.json(
      { error: jaExiste ? "Esse usuário já existe." : msg },
      { status: 400 }
    );
  }
}
