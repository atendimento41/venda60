import { NextResponse } from "next/server";
import {
  cancelarVenda,
  listarVendasParaCancelamento,
} from "@/services/vendas";
import {
  cancelarPrime,
  listarPrimeParaCancelamento,
} from "@/services/prime";
import { ensurePrimeSchema, ensureVendasSchema } from "@/lib/ensure-schema";
import { getSessao } from "@/lib/auth-api";
import { mensagemErroApi } from "@/lib/api-error";

export async function GET(req: Request) {
  try {
    await ensureVendasSchema();
    await ensurePrimeSchema();
    const { searchParams } = new URL(req.url);
    const tipo = (searchParams.get("tipo") || "venda").toLowerCase();
    const filtros = {
      nome: searchParams.get("nome") || undefined,
      unidade: searchParams.get("unidade") || undefined,
      vendedor: searchParams.get("vendedor") || undefined,
      dataInicio: searchParams.get("dataInicio") || undefined,
      dataFim: searchParams.get("dataFim") || undefined,
      incluirCanceladas: searchParams.get("incluirCanceladas") === "true",
    };
    if (tipo === "prime") {
      return NextResponse.json(await listarPrimeParaCancelamento(filtros));
    }
    return NextResponse.json(await listarVendasParaCancelamento(filtros));
  } catch (e) {
    return NextResponse.json({ error: mensagemErroApi(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await ensureVendasSchema();
    await ensurePrimeSchema();
    const body = await req.json();
    const id = Number(body.id || body.sheetRow);
    if (!id) throw new Error("ID inválido.");
    const sessao = await getSessao();
    const operador = sessao?.nome || sessao?.login;
    const tipo = String(body.tipo || "venda").toLowerCase();
    if (tipo === "prime") {
      return NextResponse.json(await cancelarPrime(id, String(body.motivo || ""), operador));
    }
    return NextResponse.json(await cancelarVenda(id, String(body.motivo || ""), operador));
  } catch (e) {
    return NextResponse.json({ error: mensagemErroApi(e) }, { status: 400 });
  }
}
