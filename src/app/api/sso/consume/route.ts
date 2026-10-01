import { NextResponse } from "next/server";
import { getClient } from "@/db";
import { cookieSessao, criarTokenSessao } from "@/lib/session";
import { paginasVendas, primeiraPagina, temAcessoVendas } from "@/lib/roles";
import { ERRO_SSO_CONFIG, ERRO_SSO_TOKEN, ERRO_SSO_USUARIO, lerSsoToken, ssoConfigurado } from "@/lib/sso";
import { ensureUsuariosTable } from "@/lib/ensure-usuarios";
import { parseUnidadesJson } from "@/services/vendedores";

async function dadosSessaoDb(
  userId: number,
): Promise<{ ok: true; sv: number; unidades: string[] | null } | { ok: false }> {
  try {
    await ensureUsuariosTable();
    const rs = await getClient().execute({
      sql: "SELECT sessao_ver, unidades, ativo FROM usuarios WHERE id = ? LIMIT 1",
      args: [userId],
    });
    const row = rs.rows?.[0] as
      | { sessao_ver?: number; unidades?: string; ativo?: boolean | number }
      | undefined;
    if (!row) return { ok: false };
    const ativo = row.ativo === true || row.ativo === 1;
    if (!ativo) return { ok: false };
    return {
      ok: true,
      sv: Number(row.sessao_ver) || 1,
      unidades: row.unidades != null ? parseUnidadesJson(row.unidades) : null,
    };
  } catch {
    return { ok: false };
  }
}

function paraLogin(req: Request, erro: string) {
  const u = new URL("/login", req.url);
  u.searchParams.set("erro", erro);
  return NextResponse.redirect(u);
}

export async function GET(req: Request) {
  if (process.env.VERCEL && !ssoConfigurado()) return paraLogin(req, ERRO_SSO_CONFIG);
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const payload = await lerSsoToken(token);
  if (!payload || payload.modulo !== "venda60") return paraLogin(req, ERRO_SSO_TOKEN);

  const paginas = paginasVendas(payload.paginas);
  if (!temAcessoVendas(paginas)) {
    return paraLogin(req, "Seu usuário não tem permissão no Vendas (ajuste no Hub).");
  }

  const db = await dadosSessaoDb(payload.sub);
  if (!db.ok) return paraLogin(req, ERRO_SSO_USUARIO);

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
