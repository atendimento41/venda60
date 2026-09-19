import { NextResponse } from "next/server";
import { getClient } from "@/db";
import { cookieSessao, criarTokenSessao } from "@/lib/session";
import { paginasVendas, primeiraPagina, temAcessoVendas } from "@/lib/roles";
import { lerSsoToken } from "@/lib/sso";
import { ensureUsuariosTable } from "@/lib/ensure-usuarios";
import { parseUnidadesJson } from "@/services/vendedores";

async function dadosSessaoDb(userId: number): Promise<{ sv: number; unidades: string[] | null }> {
  try {
    await ensureUsuariosTable();
    const rs = await getClient().execute({
      sql: "SELECT sessao_ver, unidades FROM usuarios WHERE id = ? LIMIT 1",
      args: [userId],
    });
    const row = rs.rows?.[0] as { sessao_ver?: number; unidades?: string } | undefined;
    return {
      sv: Number(row?.sessao_ver) || 1,
      unidades: row?.unidades != null ? parseUnidadesJson(row.unidades) : null,
    };
  } catch {
    return { sv: 1, unidades: null };
  }
}

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

  const db = await dadosSessaoDb(payload.sub);

  const sessao = await criarTokenSessao({
    id: payload.sub,
    login: payload.login,
    nome: payload.nome,
    paginas,
    unidades: db.unidades ?? payload.unidades ?? [],
    sv: db.sv,
  });

  const dest = primeiraPagina(paginas);
  const res = NextResponse.redirect(new URL(dest, req.url));
  res.headers.set("Set-Cookie", cookieSessao(sessao));
  return res;
}
