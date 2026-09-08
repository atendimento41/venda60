"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { apiGet, asArray, formatMoeda, mesAtualISO, UNIDADES } from "@/lib/client";

type LinhaComissao = {
  vendedor: string;
  valorVendas: number;
  valorPhoto: number;
  comissaoPhoto: number;
  valorTempoExtra: number;
  comissaoTempoExtra: number;
  valorEscape: number;
  comissaoEscape: number;
  valor3d: number;
  comissao3d: number;
  valorProdutos: number;
  comissaoProdutos: number;
  qtdPrime: number;
  valorPrime: number;
  comissaoPrime: number;
  comissaoTotal: number;
};

type RelatorioComissao = {
  mes: string;
  mesRotulo: string;
  linhas: LinhaComissao[];
  totais: LinhaComissao;
};

type DetalheLinha = {
  id: string;
  tipo: "venda" | "prime";
  dataFmt: string;
  unidade: string;
  sku: string;
  item: string;
  quantidade: number;
  valor: number;
  bucketRotulo: string;
  comissao: number;
};

type DetalheComissao = {
  mesRotulo: string;
  vendedor: string;
  linhas: DetalheLinha[];
  totais: { quantidade: number; valor: number; comissao: number };
};

function normalizarBusca(s: string): string {
  return String(s || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Exibe comissão (cima) e valor total (baixo). */
function CelTotalComissao({ total, comissao }: { total: number; comissao: number }) {
  return (
    <td className="num">
      R$ {formatMoeda(comissao)}
      <br />
      <span className="muted">R$ {formatMoeda(total)}</span>
    </td>
  );
}

function CelPrime({ comissao, valor, qtd }: { comissao: number; valor: number; qtd: number }) {
  return (
    <td className="num">
      R$ {formatMoeda(comissao)}
      <br />
      <span className="muted">
        R$ {formatMoeda(valor)} · {qtd} un.
      </span>
    </td>
  );
}

function totalVendasComissao(r: LinhaComissao): number {
  return Number(
    (r.valorPhoto + r.valorTempoExtra + r.valor3d + r.valorProdutos + r.valorPrime).toFixed(2)
  );
}

function somarLinhas(linhas: LinhaComissao[]): LinhaComissao {
  const acc: LinhaComissao = {
    vendedor: "TOTAL",
    valorVendas: 0,
    valorPhoto: 0,
    comissaoPhoto: 0,
    valorTempoExtra: 0,
    comissaoTempoExtra: 0,
    valorEscape: 0,
    comissaoEscape: 0,
    valor3d: 0,
    comissao3d: 0,
    valorProdutos: 0,
    comissaoProdutos: 0,
    qtdPrime: 0,
    valorPrime: 0,
    comissaoPrime: 0,
    comissaoTotal: 0,
  };
  for (const r of linhas) {
    acc.valorVendas += r.valorVendas;
    acc.valorPhoto += r.valorPhoto;
    acc.comissaoPhoto += r.comissaoPhoto;
    acc.valorTempoExtra += r.valorTempoExtra;
    acc.comissaoTempoExtra += r.comissaoTempoExtra;
    acc.valorEscape += r.valorEscape;
    acc.comissaoEscape += r.comissaoEscape;
    acc.valor3d += r.valor3d;
    acc.comissao3d += r.comissao3d;
    acc.valorProdutos += r.valorProdutos;
    acc.comissaoProdutos += r.comissaoProdutos;
    acc.qtdPrime += r.qtdPrime;
    acc.valorPrime += r.valorPrime;
    acc.comissaoPrime += r.comissaoPrime;
    acc.comissaoTotal += r.comissaoTotal;
  }
  const round = (n: number) => Number(n.toFixed(2));
  return {
    ...acc,
    valorVendas: round(acc.valorVendas),
    valorPhoto: round(acc.valorPhoto),
    comissaoPhoto: round(acc.comissaoPhoto),
    valorTempoExtra: round(acc.valorTempoExtra),
    comissaoTempoExtra: round(acc.comissaoTempoExtra),
    valorEscape: round(acc.valorEscape),
    comissaoEscape: round(acc.comissaoEscape),
    valor3d: round(acc.valor3d),
    comissao3d: round(acc.comissao3d),
    valorProdutos: round(acc.valorProdutos),
    comissaoProdutos: round(acc.comissaoProdutos),
    valorPrime: round(acc.valorPrime),
    comissaoPrime: round(acc.comissaoPrime),
    comissaoTotal: round(acc.comissaoTotal),
  };
}

function LinhaTabela({
  r,
  total,
  ativo,
  onNome,
}: {
  r: LinhaComissao;
  total?: boolean;
  ativo?: boolean;
  onNome?: () => void;
}) {
  const vendas = totalVendasComissao(r);
  return (
    <tr
      style={{
        ...(total ? { fontWeight: 600, borderTop: "2px solid var(--border, #333)" } : undefined),
        ...(ativo ? { background: "rgba(200, 40, 40, 0.12)" } : undefined),
      }}
    >
      <td>
        {total || !onNome ? (
          r.vendedor
        ) : (
          <button
            type="button"
            className="link-btn"
            onClick={onNome}
            title="Ver lançamentos deste vendedor"
            style={{
              background: "none",
              border: "none",
              padding: 0,
              color: "inherit",
              textDecoration: "underline",
              cursor: "pointer",
              font: "inherit",
              textAlign: "left",
            }}
          >
            {r.vendedor}
          </button>
        )}
      </td>
      <CelTotalComissao total={r.valorPhoto} comissao={r.comissaoPhoto} />
      <CelTotalComissao total={r.valorTempoExtra} comissao={r.comissaoTempoExtra} />
      <CelTotalComissao total={r.valor3d} comissao={r.comissao3d} />
      <CelTotalComissao total={r.valorProdutos} comissao={r.comissaoProdutos} />
      <CelPrime comissao={r.comissaoPrime} valor={r.valorPrime} qtd={r.qtdPrime} />
      <td className="num" style={total ? undefined : { fontWeight: 600 }}>
        R$ {formatMoeda(r.comissaoTotal)}
        <br />
        <span className="muted">R$ {formatMoeda(vendas)}</span>
      </td>
    </tr>
  );
}

export default function ComissaoPage() {
  const [mes, setMes] = useState(mesAtualISO());
  const [unidade, setUnidade] = useState("");
  const [buscaNome, setBuscaNome] = useState("");
  const [relatorio, setRelatorio] = useState<RelatorioComissao | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [vendedorDetalhe, setVendedorDetalhe] = useState("");
  const [detalhe, setDetalhe] = useState<DetalheComissao | null>(null);
  const [erroDetalhe, setErroDetalhe] = useState("");
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function carregar() {
    setCarregando(true);
    setErro("");
    setVendedorDetalhe("");
    setDetalhe(null);
    const q = new URLSearchParams({ tipo: "comissao", mes });
    if (unidade) q.set("unidade", unidade);
    const r = await apiGet<RelatorioComissao>(`/api/relatorios?${q}`);
    setCarregando(false);
    if (r.error) {
      setErro(r.error);
      setRelatorio(null);
      return;
    }
    if (r.data && Array.isArray(r.data.linhas)) {
      setRelatorio(r.data);
    }
  }

  async function abrirDetalhe(nome: string) {
    if (vendedorDetalhe === nome) {
      setVendedorDetalhe("");
      setDetalhe(null);
      setErroDetalhe("");
      return;
    }
    setVendedorDetalhe(nome);
    setDetalhe(null);
    setErroDetalhe("");
    setCarregandoDetalhe(true);
    const q = new URLSearchParams({
      tipo: "comissao-detalhe",
      mes,
      vendedor: nome,
    });
    if (unidade) q.set("unidade", unidade);
    const r = await apiGet<DetalheComissao>(`/api/relatorios?${q}`);
    setCarregandoDetalhe(false);
    if (r.error) {
      setErroDetalhe(r.error);
      return;
    }
    if (r.data) setDetalhe(r.data);
  }

  const linhasFiltradas = useMemo(() => {
    const todas = asArray(relatorio?.linhas);
    const q = normalizarBusca(buscaNome);
    if (!q) return todas;
    return todas.filter((r) => normalizarBusca(r.vendedor).includes(q));
  }, [relatorio, buscaNome]);

  const totaisFiltrados = useMemo(
    () => (linhasFiltradas.length ? somarLinhas(linhasFiltradas) : null),
    [linhasFiltradas]
  );

  return (
    <AppShell title="Comissão">
      <p className="muted">
        Em cada coluna: <strong>comissão</strong> (cima) e <strong>valor total</strong> (baixo). PHOTO /
        Tempo extra / 3D / Produtos = 5%. PRIME = R$ 1,00 por ingresso. Clique no nome do vendedor para ver
        o detalhe dos lançamentos.
      </p>

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
        <div className="field" style={{ minWidth: 220, flex: 1 }}>
          <label>Nome</label>
          <input
            type="search"
            placeholder="Digite para filtrar…"
            value={buscaNome}
            onChange={(e) => setBuscaNome(e.target.value)}
            autoComplete="off"
          />
        </div>
        <button className="btn" onClick={carregar} disabled={carregando}>
          {carregando ? "Carregando…" : "Filtrar"}
        </button>
      </div>

      {erro && <p className="msg-erro">{erro}</p>}

      {relatorio && (
        <section>
          <h2>
            Comissões · {relatorio.mesRotulo}
            {unidade ? ` · ${unidade}` : ""}
            {buscaNome.trim() ? ` · “${buscaNome.trim()}”` : ""}
          </h2>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th className="num">
                    PHOTO 5%
                    <br />
                    <span className="muted">comissão / total</span>
                  </th>
                  <th className="num">
                    Tempo extra 5%
                    <br />
                    <span className="muted">comissão / total</span>
                  </th>
                  <th className="num">
                    3D 5%
                    <br />
                    <span className="muted">comissão / total</span>
                  </th>
                  <th className="num">
                    Produtos 5%
                    <br />
                    <span className="muted">comissão / total</span>
                  </th>
                  <th className="num">
                    PRIME 1 por ingresso
                    <br />
                    <span className="muted">comissão / valor</span>
                  </th>
                  <th className="num">
                    Total
                    <br />
                    <span className="muted">comissão / total</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {linhasFiltradas.map((r) => (
                  <LinhaTabela
                    key={r.vendedor}
                    r={r}
                    ativo={vendedorDetalhe === r.vendedor}
                    onNome={() => abrirDetalhe(r.vendedor)}
                  />
                ))}
                {totaisFiltrados && <LinhaTabela r={totaisFiltrados} total />}
              </tbody>
            </table>
          </div>
          {!carregando && linhasFiltradas.length === 0 && (
            <p className="muted">Nenhuma comissão neste filtro.</p>
          )}
        </section>
      )}

      {vendedorDetalhe && (
        <section style={{ marginTop: 24 }}>
          <div className="btn-row" style={{ alignItems: "center", marginBottom: 8 }}>
            <h2 style={{ margin: 0 }}>
              Detalhe · {vendedorDetalhe}
              {detalhe ? ` · ${detalhe.mesRotulo}` : ""}
            </h2>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setVendedorDetalhe("");
                setDetalhe(null);
                setErroDetalhe("");
              }}
            >
              Fechar
            </button>
          </div>
          <p className="muted">
            Cada linha mostra o tipo de comissão (PHOTO, Tempo extra, 3D, Produtos, PRIME ou sem comissão),
            quantidade, valor e comissão calculada.
          </p>
          {carregandoDetalhe && <p className="muted">Carregando detalhe…</p>}
          {erroDetalhe && <p className="msg-erro">{erroDetalhe}</p>}
          {detalhe && (
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Data/hora</th>
                    <th>Unidade</th>
                    <th>Tipo</th>
                    <th>Item</th>
                    <th>SKU</th>
                    <th className="num">Qtd</th>
                    <th className="num">Valor</th>
                    <th className="num">Comissão</th>
                  </tr>
                </thead>
                <tbody>
                  {detalhe.linhas.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="muted">
                        Nenhum lançamento neste filtro.
                      </td>
                    </tr>
                  ) : (
                    detalhe.linhas.map((l) => (
                      <tr key={l.id}>
                        <td>{l.dataFmt}</td>
                        <td>{l.unidade || "—"}</td>
                        <td>{l.bucketRotulo}</td>
                        <td>{l.item}</td>
                        <td>{l.sku || "—"}</td>
                        <td className="num">{l.quantidade}</td>
                        <td className="num">R$ {formatMoeda(l.valor)}</td>
                        <td className="num">R$ {formatMoeda(l.comissao)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                {detalhe.linhas.length > 0 && (
                  <tfoot>
                    <tr>
                      <th colSpan={5}>Total</th>
                      <th className="num">{detalhe.totais.quantidade}</th>
                      <th className="num">R$ {formatMoeda(detalhe.totais.valor)}</th>
                      <th className="num">R$ {formatMoeda(detalhe.totais.comissao)}</th>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </section>
      )}

      {!relatorio && !erro && !carregando && <p>Carregando…</p>}
    </AppShell>
  );
}
