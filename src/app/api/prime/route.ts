import { NextResponse } from "next/server";
import {
  getRelatorioPrimeFiltrado,
  listarItensPrime,
  salvarVendaPrime,
} from "@/services/prime";
import { mensagemErroApi } from "@/lib/api-error";
import { getSessao } from "@/lib/auth-api";
import { ensurePrimeSchema } from "@/lib/ensure-schema";

export async function GET(req: Request) {
  try {
    await ensurePrimeSchema();
    const { searchParams } = new URL(req.url);
    if (searchParams.get("itens")) {
      return NextResponse.json(listarItensPrime());
    }
    const filtros = {
      dataInicio: searchParams.get("dataInicio") || undefined,
      dataFim: searchParams.get("dataFim") || undefined,
      unidade: searchParams.get("unidade") || undefined,
      vendedor: searchParams.get("vendedor") || undefined,
      subcategoria: searchParams.get("subcategoria") || undefined,
    };
    return NextResponse.json(await getRelatorioPrimeFiltrado(filtros));
  } catch (e) {
    return NextResponse.json({ error: mensagemErroApi(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await ensurePrimeSchema();
    const body = await req.json();
    const sessao = await getSessao();
    return NextResponse.json(
      await salvarVendaPrime(body, {
        unidadesUsuario: sessao?.unidades,
        nomeUsuario: sessao?.nome || sessao?.login,
      })
    );
  } catch (e) {
    return NextResponse.json({ error: mensagemErroApi(e) }, { status: 400 });
  }
}
