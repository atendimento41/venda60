import { NextResponse } from "next/server";
import { atualizarPrime, listarPrimeParaEditar } from "@/services/prime";
import { ensurePrimeSchema, ensureVendedoresSchema } from "@/lib/ensure-schema";
import { mensagemErroApi } from "@/lib/api-error";
import { getSessao } from "@/lib/auth-api";

export async function GET(req: Request) {
  try {
    await ensurePrimeSchema();
    await ensureVendedoresSchema();
    const { searchParams } = new URL(req.url);
    const dataIso = searchParams.get("data") || undefined;
    const dataInicio = searchParams.get("dataInicio") || dataIso;
    const dataFim = searchParams.get("dataFim") || dataIso;
    const semData = !dataInicio && !dataFim;

    const res = await listarPrimeParaEditar({
      unidade: searchParams.get("unidade") || undefined,
      vendedor: searchParams.get("vendedor") || undefined,
      dataInicio: dataInicio || undefined,
      dataFim: dataFim || undefined,
      nivel: searchParams.get("nivel") || searchParams.get("subcategoria") || undefined,
      nome: searchParams.get("nome") || searchParams.get("item") || undefined,
      usarUltimoDia: semData || searchParams.get("padrao") === "1",
    });
    return NextResponse.json(res);
  } catch (e) {
    return NextResponse.json({ error: mensagemErroApi(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await ensurePrimeSchema();
    await ensureVendedoresSchema();
    const body = await req.json();
    const sessao = await getSessao();
    const result = await atualizarPrime(
      {
        id: Number(body.id),
        data: body.data,
        idVendedor: body.idVendedor ?? body.id_vendedor,
        vendedor: body.vendedor,
        item: body.item,
        quantidade: body.quantidade,
      },
      sessao?.nome || sessao?.login
    );
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: mensagemErroApi(e) }, { status: 400 });
  }
}
