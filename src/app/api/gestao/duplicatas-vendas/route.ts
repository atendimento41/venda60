import { NextResponse } from "next/server";
import {
  listarDuplicatasVendas,
  vendasDedupeAPartirDe,
} from "@/lib/vendas-db";
import { mensagemErroApi } from "@/lib/api-error";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    if (searchParams.get("duplicatas") === "1") {
      const aPartirDe = searchParams.get("aPartirDe") || vendasDedupeAPartirDe();
      const grupos = await listarDuplicatasVendas(aPartirDe);
      return NextResponse.json({
        aPartirDe,
        totalGrupos: grupos.length,
        totalLinhasDuplicadas: grupos.reduce((s, g) => s + g.quantidade, 0),
        grupos: grupos.slice(0, 200),
      });
    }
    return NextResponse.json({ error: "Parâmetro inválido" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: mensagemErroApi(e) }, { status: 500 });
  }
}
