import { NextResponse } from "next/server";
import { listarTodosItensCadastro, salvarItemCadastro } from "@/services/itens";
import { ensureItensSchema } from "@/lib/ensure-schema";
import { mensagemErroApi } from "@/lib/api-error";

export async function GET() {
  try {
    await ensureItensSchema();
    return NextResponse.json(await listarTodosItensCadastro());
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
    return NextResponse.json(await salvarItemCadastro(body));
  } catch (e) {
    return NextResponse.json(
      { error: mensagemErroApi(e) },
      { status: 400 }
    );
  }
}
