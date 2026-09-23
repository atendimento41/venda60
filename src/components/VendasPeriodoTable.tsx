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
  valor: number;
};

export default function VendasPeriodoTable({
  title = "Vendas do período",
  linhas,
  modo = "detalhado",
}: {
  title?: string;
  linhas: VendaPeriodo[];
  /** detalhado = uma linha por item; simples = já agregado por venda */
  modo?: "detalhado" | "simples";
}) {
  const totalValor = linhas.reduce((s, l) => s + (Number(l.valor) || 0), 0);
  const totalDesconto = linhas.reduce((s, l) => s + (Number(l.desconto) || 0), 0);
  const colItem = modo === "simples" ? "Itens" : "Item";
  const colunas = ["Data/hora", "Vendedor", "Unidade", colItem, "Categoria", "Qtd", "Desconto", "Valor"];

  return (
    <>
      <div className="btn-row" style={{ marginTop: 24 }}>
        <h2 style={{ margin: 0, flex: 1 }}>{title}</h2>
        <ExportPdfButton
          titulo={title}
          colunas={colunas}
          linhas={linhas.map((l) => [
            l.dataHora,
            l.vendedor,
            l.unidade,
            l.item,
            l.categoria || "—",
            l.quantidade,
            `R$ ${formatMoeda(l.desconto || 0)}`,
            `R$ ${formatMoeda(l.valor)}`,
          ])}
          rodape={`Linhas: ${linhas.length} | Desconto: R$ ${formatMoeda(totalDesconto)} | Total: R$ ${formatMoeda(totalValor)}`}
          disabled={linhas.length === 0}
        />
      </div>
      <p className="muted">
        {modo === "simples"
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
              <th className="num">Desconto</th>
              <th className="num">Valor</th>
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
                <td className="num">R$ {formatMoeda(l.desconto || 0)}</td>
                <td className="num">R$ {formatMoeda(l.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="totals">
        Linhas: {linhas.length} | Desconto: R$ {formatMoeda(totalDesconto)} | Total: R$ {formatMoeda(totalValor)}
      </div>
    </>
  );
}
