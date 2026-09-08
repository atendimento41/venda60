import { NextResponse } from "next/server";
import {
  getUnikConciliacao,
  getUnikDashboardDiario,
  getUnikDashboardMes,
  getUnikRelatorioVendas,
  getUnikRelatorioEncomendas,
  getUnikXItens,
  desvincularNomeUnik,
  listarItensParaUnik,
  listarLancamentosUnik,
  atualizarLancamentoUnik,
  excluirLancamentoUnik,
  getUnikEstoqueGeral,
  salvarPrecoFinalUnik,
  salvarCustoSugestaoUnik,
  distribuirUnikGeral,
  setUnikLojaStatus,
  retirarUnikDo60,
  transferirUnikUnidade,
  listarNomesPendentesUnik,
  listarVinculosUnik,
  registrarEntregaUnik,
  salvarFotoUnikSku,
  vincularNomeUnik,
  vincularNomesUnik,
} from "@/services/unik";
import { ensureUnikSchema } from "@/lib/ensure-schema";
import { mensagemErroApi } from "@/lib/api-error";

export async function GET(req: Request) {
  try {
    await ensureUnikSchema();
    const { searchParams } = new URL(req.url);
    const tipo = searchParams.get("tipo") || "";
    if (searchParams.get("itens") || tipo === "itens") {
      return NextResponse.json(await listarItensParaUnik());
    }
    if (tipo === "lancamentos") {
      return NextResponse.json(
        await listarLancamentosUnik({
          custo: searchParams.get("custo") || undefined,
          sugestao: searchParams.get("sugestao") || undefined,
          todos: searchParams.get("todos") === "1",
          nome: searchParams.get("nome") || undefined,
          item: searchParams.get("item") || undefined,
        })
      );
    }
    if (tipo === "pendentes") {
      return NextResponse.json(
        await listarNomesPendentesUnik({ todos: searchParams.get("todos") === "1" })
      );
    }
    if (tipo === "vinculos") {
      return NextResponse.json(await listarVinculosUnik());
    }
    if (tipo === "vendas") {
      return NextResponse.json(
        await getUnikRelatorioVendas({
          mes: searchParams.get("mes") || undefined,
          unidade: searchParams.get("unidade") || undefined,
        })
      );
    }
    if (tipo === "encomendas") {
      return NextResponse.json(
        await getUnikRelatorioEncomendas({
          mes: searchParams.get("mes") || undefined,
          unidade: searchParams.get("unidade") || undefined,
          nome: searchParams.get("nome") || undefined,
        })
      );
    }
    if (tipo === "dash" || tipo === "dash-diario") {
      return NextResponse.json(
        await getUnikDashboardDiario({
          mes: searchParams.get("mes") || undefined,
          unidade: searchParams.get("unidade") || undefined,
        })
      );
    }
    if (tipo === "dash-mes") {
      return NextResponse.json(
        await getUnikDashboardMes({
          mesInicio: searchParams.get("mesInicio") || undefined,
          mesFim: searchParams.get("mesFim") || searchParams.get("mes") || undefined,
          unidade: searchParams.get("unidade") || undefined,
        })
      );
    }
    if (tipo === "x-itens") {
      return NextResponse.json(await getUnikXItens());
    }
    if (tipo === "geral") {
      return NextResponse.json(await getUnikEstoqueGeral());
    }
    return NextResponse.json(
      await getUnikConciliacao({
        dataInicio: searchParams.get("dataInicio") || undefined,
        dataFim: searchParams.get("dataFim") || undefined,
        unidade: searchParams.get("unidade") || undefined,
        estoqueAtual: searchParams.get("estoqueAtual") || undefined,
      })
    );
  } catch (e) {
    return NextResponse.json(
      { error: mensagemErroApi(e) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    await ensureUnikSchema();
    const body = await req.json();
    if (body?.acao === "vincular") {
      const nomes = Array.isArray(body.nomes) ? body.nomes : body.nome ? [body.nome] : [];
      if (nomes.length > 1) {
        return NextResponse.json(
          await vincularNomesUnik(nomes, body.sku, {
            encomenda: Boolean(body.encomenda),
            custo: body.custo,
          })
        );
      }
      return NextResponse.json(
        await vincularNomeUnik(nomes[0] || body.nome, body.sku, {
          encomenda: Boolean(body.encomenda),
          custo: body.custo,
        })
      );
    }
    if (body?.acao === "desvincular") {
      return NextResponse.json(await desvincularNomeUnik(body.nome));
    }
    if (body?.acao === "editar-lancamento") {
      return NextResponse.json(await atualizarLancamentoUnik(body));
    }
    if (body?.acao === "excluir-lancamento") {
      return NextResponse.json(await excluirLancamentoUnik(body.id));
    }
    if (body?.acao === "foto") {
      return NextResponse.json(await salvarFotoUnikSku(body.sku, body.fotoUrl));
    }
    if (body?.acao === "preco-final") {
      return NextResponse.json(await salvarPrecoFinalUnik(body.sku, body.preco));
    }
    if (body?.acao === "custo-sugestao") {
      return NextResponse.json(await salvarCustoSugestaoUnik(body));
    }
    if (body?.acao === "distribuir") {
      return NextResponse.json(await distribuirUnikGeral(body));
    }
    if (body?.acao === "loja-status") {
      return NextResponse.json(await setUnikLojaStatus(body));
    }
    if (body?.acao === "retirar") {
      return NextResponse.json(await retirarUnikDo60(body));
    }
    if (body?.acao === "transferir") {
      return NextResponse.json(await transferirUnikUnidade(body));
    }
    return NextResponse.json(await registrarEntregaUnik(body));
  } catch (e) {
    return NextResponse.json(
      { error: mensagemErroApi(e) },
      { status: 400 }
    );
  }
}
