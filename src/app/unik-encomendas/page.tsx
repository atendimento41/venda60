"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import ExportPdfButton from "@/components/ExportPdfButton";
import { formatMoeda, mesAtualISO, UNIDADES, asArray } from "@/lib/client";

type Linha = {
  id: number;
  dataFmt: string;
  nome: string;
  unidade: string;
  sku: string;
  descricaoItem: string;
  quantidade: number;
  custo: number;
  valorFinal: number;
  fotoUrl: string;
};

type Totais = {
  quantidade: number;
  valorFinal: number;
};

export default function UnikEncomendasPage() {
  const [mes, setMes] = useState(mesAtualISO());
  const [unidade, setUnidade] = useState("");
  const [nome, setNome] = useState("");
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [totais, setTotais] = useState<Totais | null>(null);
  const [formula, setFormula] = useState("");
  const [mesRotulo, setMesRotulo] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function carregar() {
    setErro("");
    setCarregando(true);
    const q = new URLSearchParams({ tipo: "encomendas", mes });
    if (unidade) q.set("unidade", unidade);
    if (nome.trim()) q.set("nome", nome.trim());
    const d = await fetch(`/api/unik?${q}`).then((r) => r.json());
    setCarregando(false);
    if (d?.error) {
      setErro(d.error);
      return;
    }
    setLinhas(asArray(d.linhas));
    setTotais(d.totais || null);
    setFormula(d.formula || "");
    setMesRotulo(d.mesRotulo || mes);
  }

  useEffect(() => {
    carregar();
  }, [mes, unidade]);

  return (
    <AppShell title="UNIK · Relatório encomendas">
      <p className="muted">
        Somente itens lançados ou vinculados como <strong>encomenda</strong>. Não precisa de item
        vinculado. O preço unitário é o <strong>maior</strong> entre custo e sugestão de venda; o valor
        final é preço × quantidade.
      </p>
      {formula ? <p className="muted">{formula}</p> : null}

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
        <div className="field">
          <label>Nome UNIK</label>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") carregar();
            }}
            placeholder="Buscar nome"
          />
        </div>
      </div>

      <div className="btn-row">
        <button className="btn" onClick={carregar} disabled={carregando}>
          {carregando ? "Carregando…" : "Carregar relatório"}
        </button>
        <ExportPdfButton
          titulo="UNIK · Relatório encomendas"
          subtitulo={`${mesRotulo || mes}${unidade ? ` · ${unidade}` : " · Todas as unidades"}`}
          colunas={["Data", "Unidade", "Nome UNIK", "Item vinculado", "Qtd", "Preço un.", "Valor final"]}
          linhas={(linhas || []).map((l) => [
            l.dataFmt,
            l.unidade || "—",
            l.nome,
            l.descricaoItem || l.sku || "—",
            l.quantidade,
            `R$ ${formatMoeda(l.custo)}`,
            `R$ ${formatMoeda(l.valorFinal)}`,
          ])}
          extras={
            totais
              ? [
                  {
                    titulo: "Totais",
                    colunas: ["Quantidade", "Valor final"],
                    linhas: [[totais.quantidade, `R$ ${formatMoeda(totais.valorFinal)}`]],
                  },
                ]
              : undefined
          }
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
                <th>Nome UNIK</th>
                <th>Item vinculado</th>
                <th className="num">Qtd</th>
                <th className="num">Preço un.</th>
                <th className="num">Valor final</th>
              </tr>
            </thead>
            <tbody>
              {linhas.length === 0 ? (
                <tr>
                  <td colSpan={8} className="muted">
                    Nenhuma encomenda neste período.
                  </td>
                </tr>
              ) : (
                linhas.map((l) => (
                  <tr key={l.id}>
                    <td>{l.fotoUrl ? <img className="foto-thumb" src={l.fotoUrl} alt="" /> : "—"}</td>
                    <td>{l.dataFmt}</td>
                    <td>{l.unidade || "—"}</td>
                    <td>{l.nome}</td>
                    <td>{l.descricaoItem || (l.sku ? l.sku : "—")}</td>
                    <td className="num">{l.quantidade}</td>
                    <td className="num">R$ {formatMoeda(l.custo)}</td>
                    <td className="num">R$ {formatMoeda(l.valorFinal)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {totais && linhas.length > 0 && (
              <tfoot>
                <tr>
                  <th colSpan={5}>Total</th>
                  <th className="num">{totais.quantidade}</th>
                  <th />
                  <th className="num">R$ {formatMoeda(totais.valorFinal)}</th>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </AppShell>
  );
}
