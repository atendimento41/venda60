import { NextResponse } from "next/server";
import { listarLogs } from "@/lib/log";
import { mensagemErroApi } from "@/lib/api-error";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const result = await listarLogs({
      tipo: searchParams.get("tipo") || undefined,
      operador: searchParams.get("operador") || undefined,
      dataInicio: searchParams.get("dataInicio") || undefined,
      dataFim: searchParams.get("dataFim") || undefined,
      page: searchParams.get("page") ? Number(searchParams.get("page")) : 1,
      pageSize: searchParams.get("pageSize") ? Number(searchParams.get("pageSize")) : 50,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: mensagemErroApi(e) },
      { status: 500 }
    );
  }
}
