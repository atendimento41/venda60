import { NextResponse } from "next/server";
import {
  getUltimasVendas,
  listarItensPorUnidade,
  registrarVenda,
} from "@/services/vendas";
import {
  ensureItensSchema,
  ensureVendasSchema,
  ensureVendedoresSchema,
} from "@/lib/ensure-schema";
import { mensagemErroApi } from "@/lib/api-error";
import { getSessao } from "@/lib/auth-api";
import { assertUnidadeDoUsuario } from "@/services/vendedores";

export async function GET(req: Request) {
  try {
    await ensureVendasSchema();
    await ensureItensSchema();
    await ensureVendedoresSchema();
    const { searchParams } = new URL(req.url);
    const unidade = searchParams.get("unidade");
    const ultimas = searchParams.get("ultimas");
    const dias = searchParams.get("dias");
    const data = searchParams.get("data") || searchParams.get("dia");
    const mes = searchParams.get("mes");
    const vendedor = searchParams.get("vendedor");
    const limit = searchParams.get("limit");
    const listarLancamentos = Boolean(
      ultimas != null ||
        dias != null ||
        data ||
        mes ||
        vendedor ||
        searchParams.get("lancamentos")
    );

    if (listarLancamentos) {
      return NextResponse.json(
        await getUltimasVendas({
          dias: dias ? Number(dias) : undefined,
          data: data || undefined,
          mes: mes || undefined,
          unidade: unidade || undefined,
          vendedor: vendedor || undefined,
          limit: limit ? Number(limit) : ultimas ? Number(ultimas) : undefined,
          page: searchParams.get("page") ? Number(searchParams.get("page")) : undefined,
          pageSize: searchParams.get("pageSize")
            ? Number(searchParams.get("pageSize"))
            : undefined,
        })
      );
    }
    if (unidade) {
      const sessao = await getSessao();
      try {
        assertUnidadeDoUsuario(sessao?.unidades, unidade, sessao?.nome || "Usuário");
      } catch (e) {
        return NextResponse.json({ error: mensagemErroApi(e) }, { status: 403 });
      }
      return NextResponse.json(await listarItensPorUnidade(unidade));
    }
    return NextResponse.json({ error: "Parâmetro inválido" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: mensagemErroApi(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await ensureVendasSchema();
    await ensureItensSchema();
    await ensureVendedoresSchema();
    const body = await req.json();
    const sessao = await getSessao();
    const result = await registrarVenda(body, {
      unidadesUsuario: sessao?.unidades,
      nomeUsuario: sessao?.nome || sessao?.login,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: mensagemErroApi(e) }, { status: 400 });
  }
}
