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
  valor: number;
};

export default function VendasPeriodoTable({
  title = "Vendas do período",
  linhas,
}: {
  title?: string;
  linhas: VendaPeriodo[];
}) {
  const total = linhas.reduce((s, l) => s + (Number(l.valor) || 0), 0);
  return (
    <>
      <div className="btn-row" style={{ marginTop: 24 }}>
        <h2 style={{ margin: 0, flex: 1 }}>{title}</h2>
        <ExportPdfButton
          titulo={title}
          colunas={["Data/hora", "Vendedor", "Unidade", "Item", "Categoria", "Qtd", "Valor"]}
          linhas={linhas.map((l) => [
            l.dataHora,
            l.vendedor,
            l.unidade,
            l.item,
            l.categoria || "—",
            l.quantidade,
            `R$ ${formatMoeda(l.valor)}`,
          ])}
          rodape={`Linhas: ${linhas.length} | Total: R$ ${formatMoeda(total)}`}
          disabled={linhas.length === 0}
        />
      </div>
      <p className="muted">Data e hora em que cada venda foi criada.</p>
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Data/hora</th>
              <th>Vendedor</th>
              <th>Unidade</th>
              <th>Item</th>
              <th>Categoria</th>
              <th className="num">Qtd</th>
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
                <td className="num">R$ {formatMoeda(l.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="totals">
        Linhas: {linhas.length} | Total: R$ {formatMoeda(total)}
      </div>
    </>
  );
}
