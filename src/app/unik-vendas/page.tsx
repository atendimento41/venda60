"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import ExportPdfButton from "@/components/ExportPdfButton";
import FiltroItens, { type OpcaoItem } from "@/components/FiltroItens";
import { formatMoeda, mesAtualISO, UNIDADES, asArray } from "@/lib/client";
import { FORMULA_RELATORIO_VENDAS_UNIK, PRECEDENCIA_CUSTO_UNIK } from "@/lib/unik-relatorio";

type Linha = {
  id: number;
  dataFmt: string;
  unidade: string;
  sku: string;
  descricao: string;
  fotoUrl: string;
  quantidade: number;
  valorVenda: number;
  totalVendido: number;
  custoUnik: number | null;
  custo60: number;
  lucroUnik: number;
  lucro60: number;
};

type Totais = {
  quantidade: number;
  totalVendido: number;
  custoUnik: number;
  custo60: number;
  lucroUnik: number;
  lucro60: number;
};

export default function UnikVendasPage() {
  const [mes, setMes] = useState(mesAtualISO());
  const [unidade, setUnidade] = useState("");
  const [linhasApi, setLinhas] = useState<Linha[] | null>(null);
  const [totaisApi, setTotais] = useState<Totais | null>(null);
  const [itensSel, setItensSel] = useState<string[]>([]);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function carregar() {
    setErro("");
    setCarregando(true);
    const q = new URLSearchParams({ tipo: "vendas", mes });
    if (unidade) q.set("unidade", unidade);
    const d = await fetch(`/api/unik?${q}`).then((r) => r.json());
    setCarregando(false);
    if (d?.error) {
      setErro(d.error);
      return;
    }
    setLinhas(asArray(d.linhas));
    setTotais(d.totais || null);
  }

  useEffect(() => {
    carregar();
  }, [mes, unidade]);

  const opcoesItens: OpcaoItem[] = [];
  const skusVistos = new Set<string>();
  for (const l of linhasApi || []) {
    if (skusVistos.has(l.sku)) continue;
    skusVistos.add(l.sku);
    opcoesItens.push({ valor: l.sku, rotulo: l.descricao || l.sku });
  }
  opcoesItens.sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
  const itensValidos = itensSel.filter((s) => skusVistos.has(s));
  const selSet = new Set(itensValidos);

  const linhas = linhasApi && selSet.size ? linhasApi.filter((l) => selSet.has(l.sku)) : linhasApi;
  const somar = (f: (l: Linha) => number) =>
    Math.round((linhas || []).reduce((s, l) => s + (Number(f(l)) || 0), 0) * 100) / 100;
  const totais: Totais | null =
    selSet.size && linhas
      ? {
          quantidade: somar((l) => l.quantidade),
          totalVendido: somar((l) => l.totalVendido),
          custoUnik: somar((l) => l.custoUnik ?? 0),
          custo60: somar((l) => l.custo60),
          lucroUnik: somar((l) => l.lucroUnik),
          lucro60: somar((l) => l.lucro60),
        }
      : totaisApi;

  return (
    <AppShell title="UNIK · Relatório vendas">
      <div className="unik-formula-help muted">
        <p>Relatório mensal · subcategoria UNIK 3D. Como calcular cada coluna:</p>
        <p>{PRECEDENCIA_CUSTO_UNIK}</p>
        <ol>
          {FORMULA_RELATORIO_VENDAS_UNIK.map((linha) => (
            <li key={linha}>{linha}</li>
          ))}
        </ol>
      </div>

      <div className="filters">
        <div className="field">
          <label>Mês</label>
          <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
        </div>
        <div className="field">
          <label>Unidade</label>
          <select value={unidade} onChange={(e) => setUnidade(e.target.value)}>
            <option value="">Todas</option>
            {UNIDADES.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
        <FiltroItens opcoes={opcoesItens} selecionados={itensValidos} onChange={setItensSel} />
      </div>
      <div className="btn-row">
        <button className="btn" onClick={carregar} disabled={carregando}>
          {carregando ? "Carregando…" : "Carregar relatório"}
        </button>
        <ExportPdfButton
          titulo="UNIK · Relatório vendas"
          subtitulo={`${mes}${unidade ? ` · ${unidade}` : " · Todas as unidades"}`}
          colunas={[
            "Data",
            "Unidade",
            "SKU",
            "Item",
            "Valor venda",
            "Qt vendida",
            "Total vendido",
            "Custo UNIK",
            "Custo 60",
            "Receber UNIK",
            "Receber 60",
          ]}
          linhas={(linhas || []).map((l) => [
            l.dataFmt,
            l.unidade || "—",
            l.sku,
            l.descricao,
            `R$ ${formatMoeda(l.valorVenda)}`,
            l.quantidade,
            `R$ ${formatMoeda(l.totalVendido)}`,
            l.custoUnik != null ? `R$ ${formatMoeda(l.custoUnik)}` : "—",
            `R$ ${formatMoeda(l.custo60)}`,
            `R$ ${formatMoeda(l.lucroUnik)}`,
            `R$ ${formatMoeda(l.lucro60)}`,
          ])}
          totais={
            totais
              ? [
                  "Total",
                  "",
                  "",
                  "",
                  "",
                  totais.quantidade,
                  `R$ ${formatMoeda(totais.totalVendido)}`,
                  `R$ ${formatMoeda(totais.custoUnik)}`,
                  `R$ ${formatMoeda(totais.custo60)}`,
                  `R$ ${formatMoeda(totais.lucroUnik)}`,
                  `R$ ${formatMoeda(totais.lucro60)}`,
                ]
              : undefined
          }
          rodape={FORMULA_RELATORIO_VENDAS_UNIK.join(" ")}
          disabled={!linhas || linhas.length === 0}
        />
      </div>
      {erro && <p className="msg-erro">{erro}</p>}

      {linhas && (
        <div style={{ overflowX: "auto", marginTop: 16 }}>
          <table>
            <thead>
              <tr>
                <th>Foto</th>
                <th>Data</th>
                <th>Unidade</th>
                <th>SKU</th>
                <th>Item no estoque</th>
                <th className="num">Valor venda</th>
                <th className="num">Qt vendida</th>
                <th className="num">Total vendido</th>
                <th className="num">Custo UNIK</th>
                <th className="num">Custo 60</th>
                <th className="num">Receber UNIK</th>
                <th className="num">Receber 60</th>
              </tr>
            </thead>
            <tbody>
              {linhas.length === 0 ? (
                <tr>
                  <td colSpan={12} className="muted">
                    Nenhuma venda UNIK 3D neste mês.
                  </td>
                </tr>
              ) : (
                linhas.map((l) => (
                  <tr key={l.id}>
                    <td>{l.fotoUrl ? <img className="foto-thumb" src={l.fotoUrl} alt="" /> : "—"}</td>
                    <td>{l.dataFmt}</td>
                    <td>{l.unidade || "—"}</td>
                    <td>{l.sku}</td>
                    <td>{l.descricao}</td>
                    <td className="num">R$ {formatMoeda(l.valorVenda)}</td>
                    <td className="num">{l.quantidade}</td>
                    <td className="num">R$ {formatMoeda(l.totalVendido)}</td>
                    <td className="num">{l.custoUnik == null ? "—" : `R$ ${formatMoeda(l.custoUnik)}`}</td>
                    <td className="num">R$ {formatMoeda(l.custo60)}</td>
                    <td className="num">R$ {formatMoeda(l.lucroUnik)}</td>
                    <td className="num">R$ {formatMoeda(l.lucro60)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {totais && linhas.length > 0 && (
              <tfoot>
                <tr>
                  <th colSpan={6}>Total</th>
                  <th className="num">{totais.quantidade}</th>
                  <th className="num">R$ {formatMoeda(totais.totalVendido)}</th>
                  <th className="num">R$ {formatMoeda(totais.custoUnik)}</th>
                  <th className="num">R$ {formatMoeda(totais.custo60)}</th>
                  <th className="num">R$ {formatMoeda(totais.lucroUnik)}</th>
                  <th className="num">R$ {formatMoeda(totais.lucro60)}</th>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </AppShell>
  );
}
