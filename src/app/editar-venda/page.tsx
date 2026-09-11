"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import {
  asArray,
  formatMoeda,
  UNIDADES,
  type VendedorClient,
} from "@/lib/client";

type Linha = {
  id: number;
  dataHora: string;
  dataLocal: string;
  idVendedor: string;
  vendedor: string;
  unidade: string;
  sku: string;
  item: string;
  categoria: string;
  subcategoria: string;
  quantidade: number;
  valorRecebido: number;
};

function unicos(valores: string[]) {
  return [...new Set(valores.map((v) => String(v || "").trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "pt-BR")
  );
}

export default function EditarVendaPage() {
  const [vendedores, setVendedores] = useState<VendedorClient[]>([]);
  const [unidade, setUnidade] = useState("");
  const [vendedorFiltro, setVendedorFiltro] = useState("");
  const [data, setData] = useState("");
  const [categoria, setCategoria] = useState("");
  const [subcategoria, setSubcategoria] = useState("");
  const [nome, setNome] = useState("");
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [ultimoDia, setUltimoDia] = useState("");
  const [editId, setEditId] = useState(0);
  const [form, setForm] = useState({
    dataLocal: "",
    idVendedor: "",
    valor: "",
  });
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [iniciado, setIniciado] = useState(false);

  useEffect(() => {
    fetch("/api/vendedores")
      .then((r) => r.json())
      .then((d) => setVendedores(asArray(d) as VendedorClient[]))
      .catch(() => setVendedores([]));
  }, []);

  const carregar = useCallback(
    async (opts?: { dataFiltro?: string; manterData?: boolean }) => {
      setCarregando(true);
      setErro("");
      setMsg("");
      const q = new URLSearchParams();
      if (unidade) q.set("unidade", unidade);
      if (vendedorFiltro) q.set("vendedor", vendedorFiltro);
      const dia = opts?.dataFiltro !== undefined ? opts.dataFiltro : data;
      if (dia) {
        q.set("dataInicio", dia);
        q.set("dataFim", dia);
      } else {
        q.set("padrao", "1");
      }
      if (nome.trim()) q.set("nome", nome.trim());
      const res = await fetch(`/api/vendas/editar?${q}`);
      const d = await res.json();
      setCarregando(false);
      if (!res.ok) {
        setLinhas([]);
        setErro(d.error || "Falha ao carregar vendas.");
        return;
      }
      const lista = asArray<Linha>(d.linhas ?? d);
      setLinhas(lista);
      if (d.ultimoDia) setUltimoDia(String(d.ultimoDia));
      if (!opts?.manterData && d.dataPadrao) setData(String(d.dataPadrao));
      setEditId(0);
    },
    [unidade, vendedorFiltro, data, nome]
  );

  useEffect(() => {
    if (iniciado) return;
    setIniciado(true);
    void carregar({ dataFiltro: "" });
  }, [iniciado, carregar]);

  const categorias = useMemo(() => unicos(linhas.map((l) => l.categoria)), [linhas]);
  const subcategorias = useMemo(() => {
    const base = linhas.filter((l) => !categoria || l.categoria === categoria);
    return unicos(base.map((l) => l.subcategoria));
  }, [linhas, categoria]);

  const linhasFiltradas = useMemo(() => {
    return linhas.filter((l) => {
      if (categoria && l.categoria !== categoria) return false;
      if (subcategoria && l.subcategoria !== subcategoria) return false;
      return true;
    });
  }, [linhas, categoria, subcategoria]);

  function abrir(l: Linha) {
    const vend =
      vendedores.find((v) => v.id === l.idVendedor) ||
      vendedores.find((v) => v.nome === l.vendedor);
    setEditId(l.id);
    setForm({
      dataLocal: l.dataLocal || "",
      idVendedor: vend?.id || l.idVendedor || "",
      valor: String(Number(l.valorRecebido || 0).toFixed(2)).replace(".", ","),
    });
    setErro("");
    setMsg("");
  }

  async function salvar() {
    if (!editId) return;
    if (!form.dataLocal) {
      setErro("Informe a data e hora.");
      return;
    }
    if (!form.idVendedor) {
      setErro("Selecione o vendedor.");
      return;
    }
    setSalvando(true);
    setErro("");
    const res = await fetch("/api/vendas/editar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editId,
        data: form.dataLocal,
        idVendedor: form.idVendedor,
        valorRecebido: form.valor,
      }),
    });
    const d = await res.json();
    setSalvando(false);
    if (!res.ok) {
      setErro(d.error || "Falha ao salvar venda.");
      return;
    }
    setMsg(d.message || "Venda atualizada.");
    setEditId(0);
    void carregar({ manterData: true });
  }

  return (
    <AppShell title="Editar venda">
      <section className="card">
        <h2>Editar venda</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Ajuste data/hora, vendedor ou valor após o lançamento. Toda alteração fica no Log
          (valor antigo → valor novo).
          {ultimoDia ? ` · Último dia com lançamento: ${ultimoDia.split("-").reverse().join("/")}` : ""}
        </p>
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
            <select value={vendedorFiltro} onChange={(e) => setVendedorFiltro(e.target.value)}>
              <option value="">Todos</option>
              {vendedores.map((v) => (
                <option key={v.id} value={v.nome}>
                  {v.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Data</label>
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
          <div className="field">
            <label>Categoria</label>
            <select
              value={categoria}
              onChange={(e) => {
                setCategoria(e.target.value);
                setSubcategoria("");
              }}
            >
              <option value="">Todas</option>
              {categorias.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Subcategoria</label>
            <select value={subcategoria} onChange={(e) => setSubcategoria(e.target.value)}>
              <option value="">Todas</option>
              {subcategorias.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Busca item</label>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome ou SKU"
            />
          </div>
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => carregar({ dataFiltro: data, manterData: true })}
          disabled={carregando}
        >
          {carregando ? "Carregando…" : "Filtrar"}
        </button>
        {msg && <p className="ok">{msg}</p>}
        {erro && <p className="erro">{erro}</p>}
      </section>

      {editId > 0 && (
        <section className="card" style={{ marginTop: 16 }}>
          <h3>Editar venda #{editId}</h3>
          <div className="filters">
            <div className="field">
              <label>Data e hora</label>
              <input
                type="datetime-local"
                value={form.dataLocal}
                onChange={(e) => setForm((f) => ({ ...f, dataLocal: e.target.value }))}
              />
            </div>
            <div className="field">
              <label>Vendedor</label>
              <select
                value={form.idVendedor}
                onChange={(e) => setForm((f) => ({ ...f, idVendedor: e.target.value }))}
              >
                <option value="">Selecione</option>
                {vendedores.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Valor recebido (R$)</label>
              <input
                value={form.valor}
                onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))}
                inputMode="decimal"
              />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button type="button" className="btn" onClick={salvar} disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar alterações"}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setEditId(0)}>
              Cancelar
            </button>
          </div>
        </section>
      )}

      <section className="card" style={{ marginTop: 16 }}>
        <p className="muted">
          {carregando
            ? "Carregando…"
            : `${linhasFiltradas.length} venda(s)${data ? ` em ${data.split("-").reverse().join("/")}` : ""}`}
        </p>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>#</th>
                <th>Data/hora</th>
                <th>Unidade</th>
                <th>Vendedor</th>
                <th>Item</th>
                <th>Cat.</th>
                <th>Sub.</th>
                <th>Qtd</th>
                <th>Valor</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {!linhasFiltradas.length ? (
                <tr>
                  <td colSpan={10} className="muted">
                    Nenhuma venda encontrada{data ? " neste dia" : ""}.
                  </td>
                </tr>
              ) : (
                linhasFiltradas.map((l) => (
                  <tr key={l.id}>
                    <td>{l.id}</td>
                    <td>{l.dataHora}</td>
                    <td>{l.unidade}</td>
                    <td>{l.vendedor}</td>
                    <td>{l.item}</td>
                    <td>{l.categoria || "—"}</td>
                    <td>{l.subcategoria || "—"}</td>
                    <td className="num">{l.quantidade}</td>
                    <td className="num">R$ {formatMoeda(l.valorRecebido || 0)}</td>
                    <td>
                      <button type="button" className="btn btn-secondary" onClick={() => abrir(l)}>
                        Editar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
