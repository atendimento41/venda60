import { NextResponse } from "next/server";
import { db } from "@/db";
import { solicitacoesEdicao } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  aprovarSolicitacao,
  criarSolicitacaoEdicao,
  listarMinhasSolicitacoes,
  listarSolicitacoesPendentes,
  recusarSolicitacao,
} from "@/services/solicitacoes-edicao";
import { ensureSolicitacoesEdicaoSchema, ensureVendedoresSchema } from "@/lib/ensure-schema";
import { mensagemErroApi } from "@/lib/api-error";
import { getSessao } from "@/lib/auth-api";
import { temPagina } from "@/lib/roles";

function podeDecidirTipo(paginas: Parameters<typeof temPagina>[0], tipo: string) {
  const t = String(tipo || "").toUpperCase();
  if (t === "VENDA") return temPagina(paginas, "/editar-venda");
  if (t === "PRIME") return temPagina(paginas, "/editar-prime");
  return false;
}

export async function GET(req: Request) {
  try {
    await ensureSolicitacoesEdicaoSchema();
    const sessao = await getSessao();
    if (!sessao) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    const modo = (searchParams.get("modo") || "minhas").toLowerCase();
    const tipo = searchParams.get("tipo") || undefined;
    const quem = sessao.nome || sessao.login;

    if (modo === "pendentes") {
      const tipoReq = (tipo || "VENDA").toUpperCase();
      if (!podeDecidirTipo(sessao.paginas, tipoReq)) {
        return NextResponse.json({ error: "Sem permissão para aprovar." }, { status: 403 });
      }
      return NextResponse.json({
        linhas: await listarSolicitacoesPendentes(tipoReq),
      });
    }

    if (!temPagina(sessao.paginas, "/solicitar-edicao")) {
      return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    }

    return NextResponse.json({
      linhas: await listarMinhasSolicitacoes(quem, tipo),
    });
  } catch (e) {
    return NextResponse.json({ error: mensagemErroApi(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await ensureSolicitacoesEdicaoSchema();
    await ensureVendedoresSchema();
    const sessao = await getSessao();
    if (!sessao) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }
    const body = await req.json();
    const acao = String(body.acao || "criar").toLowerCase();
    const quem = sessao.nome || sessao.login;

    if (acao === "aprovar" || acao === "recusar") {
      const id = Number(body.id);
      const [row] = await db
        .select({ tipo: solicitacoesEdicao.tipo })
        .from(solicitacoesEdicao)
        .where(eq(solicitacoesEdicao.id, id));
      if (!row) {
        return NextResponse.json({ error: "Solicitação não encontrada." }, { status: 404 });
      }
      if (!podeDecidirTipo(sessao.paginas, row.tipo)) {
        return NextResponse.json({ error: "Sem permissão para decidir este tipo." }, { status: 403 });
      }
      if (acao === "aprovar") {
        return NextResponse.json(await aprovarSolicitacao(id, quem));
      }
      return NextResponse.json(
        await recusarSolicitacao(id, body.obs || body.obsDecisao || "", quem)
      );
    }

    if (!temPagina(sessao.paginas, "/solicitar-edicao")) {
      return NextResponse.json({ error: "Sem permissão para solicitar." }, { status: 403 });
    }

    return NextResponse.json(
      await criarSolicitacaoEdicao(
        {
          tipo: body.tipo,
          acao: body.acao,
          registroId: Number(body.registroId ?? body.id),
          motivo: body.motivo,
          data: body.data,
          idVendedor: body.idVendedor ?? body.id_vendedor,
          vendedor: body.vendedor,
          valorRecebido: body.valorRecebido ?? body.valor,
          sku: body.sku,
          item: body.item,
          quantidade: body.quantidade,
        },
        quem
      )
    );
  } catch (e) {
    return NextResponse.json({ error: mensagemErroApi(e) }, { status: 400 });
  }
}
