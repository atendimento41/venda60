import { NextResponse } from "next/server";
import { listarVendedores, salvarVendedor } from "@/services/vendedores";
import { ensureVendedoresSchema } from "@/lib/ensure-schema";
import { mensagemErroApi } from "@/lib/api-error";
import { getSessao } from "@/lib/auth-api";
import { intersecaoUnidades } from "@/lib/client";

export async function GET(req: Request) {
  try {
    await ensureVendedoresSchema();
    const { searchParams } = new URL(req.url);
    const todos = searchParams.get("todos") === "1" || searchParams.get("todos") === "true";
    const lista = await listarVendedores(todos);
    // Admin (?todos=1) vê todos; lançamento filtra pela unidade do usuário logado.
    if (todos) return NextResponse.json(lista);
    const sessao = await getSessao();
    const uu = sessao?.unidades;
    if (!uu || uu.length === 0) return NextResponse.json(lista);
    return NextResponse.json(
      lista.filter((v) => intersecaoUnidades(v.unidades, uu).length > 0)
    );
  } catch (e) {
    return NextResponse.json(
      { error: mensagemErroApi(e) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    await ensureVendedoresSchema();
    const body = await req.json();
    return NextResponse.json(await salvarVendedor(body));
  } catch (e) {
    return NextResponse.json(
      { error: mensagemErroApi(e) },
      { status: 400 }
    );
  }
}
