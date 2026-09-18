"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { apiGet, asArray, formatMoeda, UNIDADES } from "@/lib/client";

type Aba = "venda" | "prime";

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
    comissaoVendas?: number;
  }[];
  totalDiaria: number;
  totalMensal: number;
  diariaPrime: { vendedor: string; qtd: number; valor: number; comissao: number }[];
  mensalPrime: { vendedor: string; qtd: number; valor: number; comissao: number }[];
  totalDiariaPrimeValor: number;
  totalDiariaPrimeQtd: number;
  totalDiariaPrimeComissao: number;
  totalMensalPrimeValor: number;
  totalMensalPrimeQtd: number;
  totalMensalPrimeComissao: number;
};

export default function ResumoDiarioPage() {
  const [relatorio, setRelatorio] = useState<RelatorioIndex | null>(null);
  const [unidade, setUnidade] = useState("");
  const [aba, setAba] = useState<Aba>("venda");
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
        setRelatorio({
          ...r.data,
          diariaPrime: asArray(r.data.diariaPrime),
          mensalPrime: asArray(r.data.mensalPrime),
          totalDiariaPrimeValor: Number(r.data.totalDiariaPrimeValor) || 0,
          totalDiariaPrimeQtd: Number(r.data.totalDiariaPrimeQtd) || 0,
          totalDiariaPrimeComissao: Number(r.data.totalDiariaPrimeComissao) || 0,
          totalMensalPrimeValor: Number(r.data.totalMensalPrimeValor) || 0,
          totalMensalPrimeQtd: Number(r.data.totalMensalPrimeQtd) || 0,
          totalMensalPrimeComissao: Number(r.data.totalMensalPrimeComissao) || 0,
        });
      }
    });
  }, [unidade]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const diaria = asArray(relatorio?.diaria);
  const mensal = asArray(relatorio?.mensal);
  const diariaPrime = asArray(relatorio?.diariaPrime);
  const mensalPrime = asArray(relatorio?.mensalPrime);

  return (
    <AppShell title="Resumo diário">
      <div className="filters" style={{ marginBottom: 12 }}>
        <label className="check-inline">
          <input
            type="radio"
            name="aba-resumo"
            checked={aba === "venda"}
            onChange={() => setAba("venda")}
          />
          Vendas
        </label>
        <label className="check-inline">
          <input
            type="radio"
            name="aba-resumo"
            checked={aba === "prime"}
            onChange={() => setAba("prime")}
          />
          PRIME
        </label>
      </div>

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

      {aba === "venda" ? (
        <>
          <div className="kpi-row">
            <div className="kpi">
              <div className="kpi-label">Total diário (vendas)</div>
              <div className="kpi-value">
                {relatorio ? `R$ ${formatMoeda(relatorio.totalDiaria)}` : "—"}
              </div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Total mensal (vendas)</div>
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
            <h2>Vendas{unidade ? ` · ${unidade}` : ""}</h2>
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
                <h3>Comissões do mês (vendas)</h3>
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
                          <td className="num">
                            {formatMoeda(
                              r.comissaoVendas != null
                                ? r.comissaoVendas
                                : r.comissaoPhoto +
                                    r.comissaoTempoExtra +
                                    r.comissao3d +
                                    r.comissaoProdutos
                            )}
                          </td>
                        </tr>
                      ))}
                      {mensal.length === 0 && (
                        <tr>
                          <td colSpan={7} className="muted">
                            Sem comissões de venda neste mês.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </section>
        </>
      ) : (
        <>
          <div className="kpi-row">
            <div className="kpi">
              <div className="kpi-label">Valor PRIME (dia)</div>
              <div className="kpi-value">
                {relatorio ? `R$ ${formatMoeda(relatorio.totalDiariaPrimeValor)}` : "—"}
              </div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Qtd / comissão (dia)</div>
              <div className="kpi-value">
                {relatorio
                  ? `${relatorio.totalDiariaPrimeQtd} · R$ ${formatMoeda(relatorio.totalDiariaPrimeComissao)}`
                  : "—"}
              </div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Valor PRIME (mês)</div>
              <div className="kpi-value">
                {relatorio ? `R$ ${formatMoeda(relatorio.totalMensalPrimeValor)}` : "—"}
              </div>
            </div>
          </div>

          <section>
            <h2>PRIME{unidade ? ` · ${unidade}` : ""}</h2>
            {loading ? (
              <p>Carregando resumo…</p>
            ) : relatorio ? (
              <>
                <h3>PRIME do dia</h3>
                <table>
                  <thead>
                    <tr>
                      <th>Vendedor</th>
                      <th className="num">Qtd</th>
                      <th className="num">Valor</th>
                      <th className="num">Comissão</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diariaPrime.map((r) => (
                      <tr key={r.vendedor}>
                        <td>{r.vendedor}</td>
                        <td className="num">{r.qtd}</td>
                        <td className="num">R$ {formatMoeda(r.valor)}</td>
                        <td className="num">R$ {formatMoeda(r.comissao)}</td>
                      </tr>
                    ))}
                    {diariaPrime.length === 0 && (
                      <tr>
                        <td colSpan={4} className="muted">
                          Nenhum PRIME no dia para este filtro.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <h3>PRIME do mês</h3>
                <div style={{ overflowX: "auto" }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Vendedor</th>
                        <th className="num">Qtd</th>
                        <th className="num">Valor</th>
                        <th className="num">Comissão</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mensalPrime.map((r) => (
                        <tr key={r.vendedor}>
                          <td>{r.vendedor}</td>
                          <td className="num">{r.qtd}</td>
                          <td className="num">R$ {formatMoeda(r.valor)}</td>
                          <td className="num">R$ {formatMoeda(r.comissao)}</td>
                        </tr>
                      ))}
                      {mensalPrime.length === 0 && (
                        <tr>
                          <td colSpan={4} className="muted">
                            Sem PRIME neste mês.
                          </td>
                        </tr>
                      )}
                      {mensalPrime.length > 0 && relatorio ? (
                        <tr>
                          <td>
                            <strong>Total</strong>
                          </td>
                          <td className="num">
                            <strong>{relatorio.totalMensalPrimeQtd}</strong>
                          </td>
                          <td className="num">
                            <strong>R$ {formatMoeda(relatorio.totalMensalPrimeValor)}</strong>
                          </td>
                          <td className="num">
                            <strong>R$ {formatMoeda(relatorio.totalMensalPrimeComissao)}</strong>
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </section>
        </>
      )}
    </AppShell>
  );
}
