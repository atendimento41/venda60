"use client";

import { useEffect, useMemo, useState } from "react";
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

export default function EditarDataVendaPage() {
  const [vendedores, setVendedores] = useState<VendedorClient[]>([]);
  const [unidade, setUnidade] = useState("");
  const [vendedor, setVendedor] = useState("");
  const [data, setData] = useState("");
  const [categoria, setCategoria] = useState("");
  const [subcategoria, setSubcategoria] = useState("");
  const [nome, setNome] = useState("");
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [editId, setEditId] = useState(0);
  const [dataEdit, setDataEdit] = useState("");
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    fetch("/api/vendedores")
      .then((r) => r.json())
      .then((d) => setVendedores(asArray(d) as VendedorClient[]))
      .catch(() => setVendedores([]));
  }, []);

  async function carregar() {
    setCarregando(true);
    setErro("");
    setMsg("");
    const q = new URLSearchParams();
    if (unidade) q.set("unidade", unidade);
    if (vendedor) q.set("vendedor", vendedor);
    if (data) {
      q.set("dataInicio", data);
      q.set("dataFim", data);
    }
    if (nome.trim()) q.set("nome", nome.trim());
    const res = await fetch(`/api/vendas/data?${q}`);
    const d = await res.json();
    setCarregando(false);
    if (!res.ok) {
      setLinhas([]);
      setErro(d.error || "Falha ao carregar vendas.");
      return;
    }
    setLinhas(asArray(d) as Linha[]);
    setEditId(0);
  }

  useEffect(() => {
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    setEditId(l.id);
    setDataEdit(l.dataLocal || "");
    setErro("");
    setMsg("");
  }

  async function salvar() {
    if (!editId) return;
    if (!dataEdit) {
      setErro("Informe a nova data e hora.");
      return;
    }
    setSalvando(true);
    setErro("");
    const res = await fetch("/api/vendas/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editId, data: dataEdit }),
    });
    const d = await res.json();
    setSalvando(false);
    if (!res.ok) {
      setErro(d.error || "Falha ao salvar data.");
      return;
    }
    setMsg(d.message || "Data atualizada.");
    setEditId(0);
    carregar();
  }

  return (
    <AppShell title="Editar data da venda">
      <section className="card">
        <h2>Editar data / hora</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          No lançamento a data fica automática. Aqui você ajusta depois, se precisar.
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
        <button type="button" className="btn" onClick={() => carregar()} disabled={carregando}>
          {carregando ? "Carregando…" : "Filtrar"}
        </button>
        {msg && <p className="ok">{msg}</p>}
        {erro && <p className="erro">{erro}</p>}
      </section>

      {editId > 0 && (
        <section className="card" style={{ marginTop: 16 }}>
          <h3>Nova data / hora · venda #{editId}</h3>
          <div className="field">
            <label>Data e hora</label>
            <input
              type="datetime-local"
              value={dataEdit}
              onChange={(e) => setDataEdit(e.target.value)}
            />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button type="button" className="btn" onClick={salvar} disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar data"}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setEditId(0)}>
              Cancelar
            </button>
          </div>
        </section>
      )}

      <section className="card" style={{ marginTop: 16 }}>
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
                    Nenhuma venda encontrada.
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
                        Editar data
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
