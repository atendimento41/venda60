import { NextResponse } from "next/server";
import { listarVendedores, salvarVendedor } from "@/services/vendedores";
import { ensureVendedoresSchema } from "@/lib/ensure-schema";
import { mensagemErroApi } from "@/lib/api-error";

export async function GET(req: Request) {
  try {
    await ensureVendedoresSchema();
    const { searchParams } = new URL(req.url);
    const todos = searchParams.get("todos") === "1" || searchParams.get("todos") === "true";
    return NextResponse.json(await listarVendedores(todos));
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
