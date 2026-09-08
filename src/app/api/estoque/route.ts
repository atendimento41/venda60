import { NextResponse } from "next/server";
import {
  adminEstoqueAjustarDelta,
  adminEstoqueCadastrar,
  adminEstoqueDefinirQuantidade,
  getEstoqueConsulta,
  getOpcoesFiltrosEstoque,
  listarLinhasEstoqueAdmin,
} from "@/services/estoque";
import { getOpcoesAdminEstoque } from "@/services/itens";
import { ensureItensSchema } from "@/lib/ensure-schema";
import { mensagemErroApi } from "@/lib/api-error";

export async function GET(req: Request) {
  try {
    await ensureItensSchema();
    const { searchParams } = new URL(req.url);
    const opcoes = searchParams.get("opcoes");
    const admin = searchParams.get("admin");

    if (opcoes === "admin") {
      return NextResponse.json(await getOpcoesAdminEstoque());
    }
    if (opcoes) {
      return NextResponse.json(await getOpcoesFiltrosEstoque());
    }

    const filtros = {
      unidade: searchParams.get("unidade") || undefined,
      categoria: searchParams.get("categoria") || undefined,
      subcategoria: searchParams.get("subcategoria") || undefined,
      nome: searchParams.get("nome") || undefined,
      estoqueAtual: searchParams.get("estoqueAtual") || undefined,
    };

    if (admin) {
      return NextResponse.json(await listarLinhasEstoqueAdmin(filtros));
    }
    return NextResponse.json(await getEstoqueConsulta(filtros));
  } catch (e) {
    return NextResponse.json(
      { error: mensagemErroApi(e) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    await ensureItensSchema();
    const body = await req.json();
    const acao = body.acao;
    if (acao === "cadastrar") return NextResponse.json(await adminEstoqueCadastrar(body));
    if (acao === "ajustar") return NextResponse.json(await adminEstoqueAjustarDelta(body));
    if (acao === "definir") return NextResponse.json(await adminEstoqueDefinirQuantidade(body));
    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: mensagemErroApi(e) },
      { status: 400 }
    );
  }
}
