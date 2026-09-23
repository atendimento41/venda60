"use client";

import ExportPdfButton from "@/components/ExportPdfButton";
import { formatMoeda } from "@/lib/client";

export type VendaPeriodo = {
  dataHora: string;
  vendedor: string;
  unidade: string;
  item: string;
  categoria?: string;
  quantidade: number;
  desconto?: number;
  /** Valor de venda (não comissão). */
  valor: number;
  /** Comissão do lançamento (ex.: PRIME R$ 1/ingresso). */
  comissao?: number;
};

export default function VendasPeriodoTable({
  title = "Vendas do período",
  linhas,
  modo = "detalhado",
  /** Quando true: coluna "Valor venda", comissão opcional e rodapé de totais de venda. */
  modoPrime = false,
}: {
  title?: string;
  linhas: VendaPeriodo[];
  /** detalhado = uma linha por item; simples = já agregado por venda */
  modo?: "detalhado" | "simples";
  modoPrime?: boolean;
}) {
  const totalValor = linhas.reduce((s, l) => s + (Number(l.valor) || 0), 0);
  const totalDesconto = linhas.reduce((s, l) => s + (Number(l.desconto) || 0), 0);
  const totalComissao = linhas.reduce((s, l) => s + (Number(l.comissao) || 0), 0);
  const temComissao = modoPrime || linhas.some((l) => l.comissao != null);
  const colItem = modo === "simples" ? "Itens" : "Item";
  const rotuloValor = modoPrime ? "Valor venda" : "Valor";
  const colunas = [
    "Data/hora",
    "Vendedor",
    "Unidade",
    colItem,
    "Categoria",
    "Qtd",
    ...(modoPrime ? [] : ["Desconto"]),
    rotuloValor,
    ...(temComissao ? ["Comissão"] : []),
  ];

  const rodape = modoPrime
    ? `Linhas: ${linhas.length} | Total venda PRIME: R$ ${formatMoeda(totalValor)} | Comissão: R$ ${formatMoeda(totalComissao)}`
    : `Linhas: ${linhas.length} | Desconto: R$ ${formatMoeda(totalDesconto)} | Total: R$ ${formatMoeda(totalValor)}`;

  return (
    <>
      <div className="btn-row" style={{ marginTop: 24 }}>
        <h2 style={{ margin: 0, flex: 1 }}>{title}</h2>
        <ExportPdfButton
          titulo={title}
          colunas={colunas}
          linhas={linhas.map((l) => {
            const base = [
              l.dataHora,
              l.vendedor,
              l.unidade,
              l.item,
              l.categoria || "—",
              l.quantidade,
            ];
            if (!modoPrime) base.push(`R$ ${formatMoeda(l.desconto || 0)}`);
            base.push(`R$ ${formatMoeda(l.valor)}`);
            if (temComissao) base.push(`R$ ${formatMoeda(l.comissao || 0)}`);
            return base;
          })}
          rodape={rodape}
          disabled={linhas.length === 0}
        />
      </div>
      <p className="muted">
        {modoPrime
          ? "Valor venda = preço do ingresso × quantidade (ELITE R$ 39,90 · PLATINA R$ 59,90 · OURO R$ 69,90). Comissão = R$ 1,00 por ingresso."
          : modo === "simples"
            ? "Cada linha é uma venda completa (itens somados)."
            : "Data e hora em que cada item da venda foi criado."}
      </p>
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Data/hora</th>
              <th>Vendedor</th>
              <th>Unidade</th>
              <th>{colItem}</th>
              <th>Categoria</th>
              <th className="num">Qtd</th>
              {!modoPrime ? <th className="num">Desconto</th> : null}
              <th className="num">{rotuloValor}</th>
              {temComissao ? <th className="num">Comissão</th> : null}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => (
              <tr key={`${l.item}-${l.dataHora}-${i}`}>
                <td>{l.dataHora}</td>
                <td>{l.vendedor}</td>
                <td>{l.unidade}</td>
                <td>{l.item}</td>
                <td>{l.categoria || "—"}</td>
                <td className="num">{l.quantidade}</td>
                {!modoPrime ? (
                  <td className="num">R$ {formatMoeda(l.desconto || 0)}</td>
                ) : null}
                <td className="num">R$ {formatMoeda(l.valor)}</td>
                {temComissao ? (
                  <td className="num">R$ {formatMoeda(l.comissao || 0)}</td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="totals">{rodape}</div>
    </>
  );
}
