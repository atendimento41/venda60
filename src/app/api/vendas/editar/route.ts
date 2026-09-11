import { NextResponse } from "next/server";
import { atualizarVenda, listarVendasParaEditar } from "@/services/vendas";
import { ensureVendasSchema, ensureVendedoresSchema } from "@/lib/ensure-schema";
import { mensagemErroApi } from "@/lib/api-error";
import { getSessao } from "@/lib/auth-api";

export async function GET(req: Request) {
  try {
    await ensureVendasSchema();
    await ensureVendedoresSchema();
    const { searchParams } = new URL(req.url);
    const dataIso = searchParams.get("data") || undefined;
    const dataInicio = searchParams.get("dataInicio") || dataIso;
    const dataFim = searchParams.get("dataFim") || dataIso;
    const semData = !dataInicio && !dataFim;

    const res = await listarVendasParaEditar({
      unidade: searchParams.get("unidade") || undefined,
      vendedor: searchParams.get("vendedor") || undefined,
      dataInicio: dataInicio || undefined,
      dataFim: dataFim || undefined,
      categoria: searchParams.get("categoria") || undefined,
      subcategoria: searchParams.get("subcategoria") || undefined,
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
    await ensureVendasSchema();
    await ensureVendedoresSchema();
    const body = await req.json();
    const sessao = await getSessao();
    const result = await atualizarVenda(
      {
        id: Number(body.id),
        data: body.data,
        idVendedor: body.idVendedor ?? body.id_vendedor,
        vendedor: body.vendedor,
        valorRecebido: body.valorRecebido ?? body.valor,
      },
      sessao?.nome || sessao?.login
    );
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: mensagemErroApi(e) }, { status: 400 });
  }
}
