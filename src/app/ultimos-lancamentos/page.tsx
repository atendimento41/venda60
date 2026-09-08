"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import PaginacaoBar from "@/components/PaginacaoBar";
import {
  apiGet,
  asArray,
  formatMoeda,
  mesAtualISO,
  UNIDADES,
  type VendedorClient,
} from "@/lib/client";

type Lancamento = {
  id: number;
  dataHora: string;
  unidade: string;
  vendedor: string;
  sku: string;
  item: string;
  quantidade: number;
  precoUnitario: number;
  desconto: number;
  valor: number;
};

export default function UltimosLancamentosPage() {
  const [vendedores, setVendedores] = useState<VendedorClient[]>([]);
  const [unidade, setUnidade] = useState("");
  const [vendedor, setVendedor] = useState("");
  const [mes, setMes] = useState(mesAtualISO());
  const [linhas, setLinhas] = useState<Lancamento[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function carregar(pagina = page) {
    setCarregando(true);
    setErro("");
    const q = new URLSearchParams({
      lancamentos: "1",
      page: String(pagina),
      pageSize: "50",
      mes: mes || mesAtualISO(),
    });
    if (unidade) q.set("unidade", unidade);
    if (vendedor) q.set("vendedor", vendedor);
    const res = await apiGet<
      | Lancamento[]
      | { items: Lancamento[]; page: number; totalPages: number; total: number }
    >(`/api/vendas?${q}`);
    if (res.error) {
      setErro(res.error);
      setLinhas([]);
    } else if (res.data) {
      if (Array.isArray(res.data)) {
        setLinhas(asArray(res.data));
        setTotalPages(1);
        setTotal(res.data.length);
      } else {
        setLinhas(asArray(res.data.items));
        setPage(res.data.page || pagina);
        setTotalPages(res.data.totalPages || 1);
        setTotal(res.data.total || 0);
      }
    }
    setCarregando(false);
  }

  useEffect(() => {
    apiGet<VendedorClient[]>("/api/vendedores").then((r) => setVendedores(asArray(r.data)));
    carregar(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AppShell title="Últimos lançamentos">
      <p className="muted">Vendas lançadas nesta tela. Filtre pelo mês (padrão: mês atual).</p>
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
        <div className="field">
          <label>Vendedor</label>
          <select value={vendedor} onChange={(e) => setVendedor(e.target.value)}>
            <option value="">Todos</option>
            {vendedores.map((v) => (
              <option key={v.id} value={v.nome}>
                {v.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Mês</label>
          <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
        </div>
        <button
          className="btn"
          onClick={() => {
            setPage(1);
            carregar(1);
          }}
          disabled={carregando}
        >
          {carregando ? "Carregando…" : "Filtrar"}
        </button>
      </div>
      {erro && <p className="msg-erro">{erro}</p>}
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Data/hora</th>
              <th>Unidade</th>
              <th>Vendedor</th>
              <th>Item</th>
              <th>SKU</th>
              <th className="num">Qtd</th>
              <th className="num">Preço</th>
              <th className="num">Desconto</th>
              <th className="num">Valor</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id}>
                <td>{l.dataHora}</td>
                <td>{l.unidade}</td>
                <td>{l.vendedor}</td>
                <td>{l.item}</td>
                <td>{l.sku}</td>
                <td className="num">{l.quantidade}</td>
                <td className="num">R$ {formatMoeda(l.precoUnitario)}</td>
                <td className="num">R$ {formatMoeda(l.desconto)}</td>
                <td className="num">R$ {formatMoeda(l.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!carregando && linhas.length === 0 && <p className="muted">Nenhum lançamento neste filtro.</p>}
      <PaginacaoBar
        page={page}
        totalPages={totalPages}
        total={total}
        disabled={carregando}
        onPage={(p) => {
          setPage(p);
          carregar(p);
        }}
      />
    </AppShell>
  );
}
