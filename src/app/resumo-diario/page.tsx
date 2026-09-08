"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { apiGet, asArray, formatMoeda, UNIDADES } from "@/lib/client";

type RelatorioIndex = {
  diaria: { vendedor: string; valor: number }[];
  mensal: {
    vendedor: string;
    valor: number;
    comissaoPhoto: number;
    comissaoTempoExtra: number;
    comissaoEscape: number;
    comissao3d: number;
    comissaoProdutos: number;
    comissaoPrime: number;
    comissaoTotal: number;
  }[];
  totalDiaria: number;
  totalMensal: number;
};

export default function ResumoDiarioPage() {
  const [relatorio, setRelatorio] = useState<RelatorioIndex | null>(null);
  const [unidade, setUnidade] = useState("");
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(() => {
    setLoading(true);
    setErro("");
    const q = unidade ? `?tipo=index&unidade=${encodeURIComponent(unidade)}` : "?tipo=index";
    apiGet<RelatorioIndex>(`/api/relatorios${q}`).then((r) => {
      setLoading(false);
      if (r.error) {
        setErro(r.error);
        return;
      }
      if (r.data && Array.isArray(r.data.diaria) && Array.isArray(r.data.mensal)) {
        setRelatorio(r.data);
      }
    });
  }, [unidade]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const diaria = asArray(relatorio?.diaria);
  const mensal = asArray(relatorio?.mensal);

  return (
    <AppShell title="Resumo diário">
      <div className="filters">
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
        <button className="btn" type="button" onClick={carregar}>
          Atualizar
        </button>
      </div>

      {erro && <p className="msg-erro">{erro}</p>}
      <div className="kpi-row">
        <div className="kpi">
          <div className="kpi-label">Total diário</div>
          <div className="kpi-value">
            {relatorio ? `R$ ${formatMoeda(relatorio.totalDiaria)}` : "—"}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Total mensal</div>
          <div className="kpi-value">
            {relatorio ? `R$ ${formatMoeda(relatorio.totalMensal)}` : "—"}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Vendedores no dia</div>
          <div className="kpi-value">{diaria.length}</div>
        </div>
      </div>

      <section>
        <h2>Resumo{unidade ? ` · ${unidade}` : ""}</h2>
        {loading ? (
          <p>Carregando resumo…</p>
        ) : relatorio ? (
          <>
            <h3>Vendas do dia</h3>
            <table>
              <thead>
                <tr>
                  <th>Vendedor</th>
                  <th className="num">Valor</th>
                </tr>
              </thead>
              <tbody>
                {diaria.map((r) => (
                  <tr key={r.vendedor}>
                    <td>{r.vendedor}</td>
                    <td className="num">R$ {formatMoeda(r.valor)}</td>
                  </tr>
                ))}
                {diaria.length === 0 && (
                  <tr>
                    <td colSpan={2} className="muted">
                      Nenhuma venda no dia para este filtro.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <h3>Comissões do mês</h3>
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Vendedor</th>
                    <th className="num">Vendas</th>
                    <th className="num">PHOTO</th>
                    <th className="num">Tempo extra</th>
                    <th className="num">3D</th>
                    <th className="num">Produtos</th>
                    <th className="num">PRIME</th>
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {mensal.map((r) => (
                    <tr key={r.vendedor}>
                      <td>{r.vendedor}</td>
                      <td className="num">R$ {formatMoeda(r.valor)}</td>
                      <td className="num">{formatMoeda(r.comissaoPhoto)}</td>
                      <td className="num">{formatMoeda(r.comissaoTempoExtra)}</td>
                      <td className="num">{formatMoeda(r.comissao3d)}</td>
                      <td className="num">{formatMoeda(r.comissaoProdutos)}</td>
                      <td className="num">{formatMoeda(r.comissaoPrime)}</td>
                      <td className="num">{formatMoeda(r.comissaoTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </section>
    </AppShell>
  );
}
