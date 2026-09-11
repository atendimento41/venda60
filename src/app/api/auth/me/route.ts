import { NextResponse } from "next/server";
import { getSessao } from "@/lib/auth-api";
import { linksPermitidos } from "@/lib/roles";

export async function GET() {
  const sessao = await getSessao();
  if (!sessao) {
    return NextResponse.json({ logado: false }, { status: 401 });
  }
  return NextResponse.json({
    logado: true,
    usuario: {
      id: sessao.id,
      nome: sessao.nome,
      login: sessao.login,
      unidades: sessao.unidades || [],
      vendedorId: sessao.vendedorId || null,
    },
    links: linksPermitidos(sessao.paginas).map((l) => ({ href: l.href, label: l.label })),
  });
}
