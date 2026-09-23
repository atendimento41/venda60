import { NextResponse } from "next/server";
import {
  getDetalheComissaoVendedor,
  getRelatorioComissao,
  getRelatorioFiltrado,
  getRelatorioSaidasMensal,
  getRelatorioSimples,
  getRelatorioVendasPorVendedor,
  getVendaMalucaMesPassado,
  listarCategoriasRelatorio,
  listarVendedoresNomes,
} from "@/services/relatorios";
import { mensagemErroApi } from "@/lib/api-error";

export async function GET(req: Request) {
  try {
    const { ensurePrimeSchema, ensureVendasSchema } = await import("@/lib/ensure-schema");
    await ensureVendasSchema();
    await ensurePrimeSchema();
    const { searchParams } = new URL(req.url);
    const tipo = searchParams.get("tipo") || "index";

    if (tipo === "index") {
      return NextResponse.json(
        await getRelatorioVendasPorVendedor({
          unidade: searchParams.get("unidade") || undefined,
        })
      );
    }
    if (tipo === "detalhado") {
      return NextResponse.json(
        await getRelatorioFiltrado({
          dataInicio: searchParams.get("dataInicio") || undefined,
          dataFim: searchParams.get("dataFim") || undefined,
          unidade: searchParams.get("unidade") || undefined,
          vendedor: searchParams.get("vendedor") || undefined,
          categoria: searchParams.get("categoria") || undefined,
          subcategoria: searchParams.get("subcategoria") || undefined,
        })
      );
    }
    if (tipo === "diario" || tipo === "simples") {
      return NextResponse.json(
        await getRelatorioSimples({
          data: searchParams.get("data") || undefined,
          dataInicio: searchParams.get("dataInicio") || undefined,
          dataFim: searchParams.get("dataFim") || undefined,
          unidade: searchParams.get("unidade") || undefined,
          vendedor: searchParams.get("vendedor") || undefined,
          categoria: searchParams.get("categoria") || undefined,
          subcategoria: searchParams.get("subcategoria") || undefined,
        })
      );
    }
    if (tipo === "saidas-mensal") {
      return NextResponse.json(
        await getRelatorioSaidasMensal({
          mes: searchParams.get("mes") || "",
          unidade: searchParams.get("unidade"),
          categoria: searchParams.get("categoria"),
          subcategoria: searchParams.get("subcategoria"),
          somenteComSaida:
            searchParams.get("somenteComSaida") !== "0" &&
            searchParams.get("somenteComSaida") !== "false",
        })
      );
    }
    if (tipo === "venda-maluca") {
      return NextResponse.json(
        await getVendaMalucaMesPassado({
          unidade: searchParams.get("unidade") || undefined,
          mes: searchParams.get("mes") || undefined,
        })
      );
    }
    if (tipo === "comissao") {
      return NextResponse.json(
        await getRelatorioComissao({
          mes: searchParams.get("mes") || undefined,
          unidade: searchParams.get("unidade") || undefined,
          vendedor: searchParams.get("vendedor") || undefined,
        })
      );
    }
    if (tipo === "comissao-detalhe") {
      return NextResponse.json(
        await getDetalheComissaoVendedor({
          mes: searchParams.get("mes") || undefined,
          unidade: searchParams.get("unidade") || undefined,
          vendedor: searchParams.get("vendedor") || "",
        })
      );
    }
    if (tipo === "categorias") {
      return NextResponse.json(await listarCategoriasRelatorio());
    }
    if (tipo === "vendedores") {
      return NextResponse.json(await listarVendedoresNomes());
    }
    return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: mensagemErroApi(e) },
      { status: 500 }
    );
  }
}
