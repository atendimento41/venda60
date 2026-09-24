"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import SolicitacoesPendentesCard from "@/components/SolicitacoesPendentesCard";
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
  item: string;
  nivel: string;
  quantidade: number;
  valorRecebido: number;
};

type ItemPrime = { nome: string; preco: number };

function unicos(valores: string[]) {
  return [...new Set(valores.map((v) => String(v || "").trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "pt-BR")
  );
}

export default function EditarPrimePage() {
  const [vendedores, setVendedores] = useState<VendedorClient[]>([]);
  const [itensPrime, setItensPrime] = useState<ItemPrime[]>([]);
  const [unidade, setUnidade] = useState("");
  const [vendedorFiltro, setVendedorFiltro] = useState("");
  const [data, setData] = useState("");
  const [nivel, setNivel] = useState("");
  const [nome, setNome] = useState("");
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [ultimoDia, setUltimoDia] = useState("");
  const [editId, setEditId] = useState(0);
  const [form, setForm] = useState({
    dataLocal: "",
    idVendedor: "",
    item: "",
    quantidade: "1",
  });
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [iniciado, setIniciado] = useState(false);

  useEffect(() => {
    void Promise.all([
      fetch("/api/vendedores").then((r) => r.json()),
      fetch("/api/prime?itens=1").then((r) => r.json()),
    ]).then(([vRes, iRes]) => {
      setVendedores(asArray(vRes) as VendedorClient[]);
      setItensPrime(asArray(iRes) as ItemPrime[]);
    });
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
      if (nivel) q.set("nivel", nivel);
      if (nome.trim()) q.set("nome", nome.trim());
      const res = await fetch(`/api/prime/editar?${q}`);
      const d = await res.json();
      setCarregando(false);
      if (!res.ok) {
        setLinhas([]);
        setErro(d.error || "Falha ao carregar PRIME.");
        return;
      }
      const lista = asArray<Linha>(d.linhas ?? d);
      setLinhas(lista);
      if (d.ultimoDia) setUltimoDia(String(d.ultimoDia));
      if (!opts?.manterData && d.dataPadrao) setData(String(d.dataPadrao));
      setEditId(0);
    },
    [unidade, vendedorFiltro, data, nivel, nome]
  );

  useEffect(() => {
    if (iniciado) return;
    setIniciado(true);
    void carregar({ dataFiltro: "" });
  }, [iniciado, carregar]);

  const niveis = useMemo(() => unicos(linhas.map((l) => l.nivel)), [linhas]);

  const linhasFiltradas = useMemo(() => {
    return linhas.filter((l) => {
      if (nivel && l.nivel !== nivel) return false;
      return true;
    });
  }, [linhas, nivel]);

  const valorPreview = useMemo(() => {
    const item = itensPrime.find((i) => i.nome === form.item);
    const qtd = Math.floor(Number(String(form.quantidade).replace(",", "."))) || 0;
    if (!item || qtd <= 0) return 0;
    return Math.round(item.preco * qtd * 100) / 100;
  }, [itensPrime, form.item, form.quantidade]);

  function abrir(l: Linha) {
    const vend =
      vendedores.find((v) => v.id === l.idVendedor) ||
      vendedores.find((v) => v.nome === l.vendedor);
    setEditId(l.id);
    setForm({
      dataLocal: l.dataLocal || "",
      idVendedor: vend?.id || l.idVendedor || "",
      item: l.nivel || l.item || "",
      quantidade: String(l.quantidade || 1),
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
    if (!form.item) {
      setErro("Selecione o item PRIME.");
      return;
    }
    const qtd = Math.floor(Number(String(form.quantidade).replace(",", ".")));
    if (!Number.isFinite(qtd) || qtd <= 0) {
      setErro("Quantidade inválida.");
      return;
    }
    setSalvando(true);
    setErro("");
    const res = await fetch("/api/prime/editar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editId,
        data: form.dataLocal,
        idVendedor: form.idVendedor,
        item: form.item,
        quantidade: qtd,
      }),
    });
    const d = await res.json();
    setSalvando(false);
    if (!res.ok) {
      setErro(d.error || "Falha ao salvar PRIME.");
      return;
    }
    setMsg(d.message || "PRIME atualizado.");
    setEditId(0);
    void carregar({ manterData: true });
  }

  return (
    <AppShell title="Editar PRIME">
      <SolicitacoesPendentesCard
        tipo="PRIME"
        onDecidido={() => void carregar({ manterData: true })}
      />
      <section className="card">
        <h2>Editar PRIME</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Ajuste data/hora, vendedor, item ou quantidade após o lançamento. O valor é recalculado
          pelo preço do ingresso. Toda alteração fica no Log (valor antigo → valor novo).
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
            <label>Nível</label>
            <select value={nivel} onChange={(e) => setNivel(e.target.value)}>
              <option value="">Todos</option>
              {(niveis.length ? niveis : ["ELITE", "PLATINA", "OURO"]).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Busca item</label>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="ELITE, PLATINA…"
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
          <h3>Editar PRIME #{editId}</h3>
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
              <label>Item PRIME</label>
              <select
                value={form.item}
                onChange={(e) => setForm((f) => ({ ...f, item: e.target.value }))}
              >
                <option value="">Selecione</option>
                {itensPrime.map((i) => (
                  <option key={i.nome} value={i.nome}>
                    {i.nome} (R$ {i.preco.toFixed(2).replace(".", ",")})
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Quantidade</label>
              <input
                value={form.quantidade}
                onChange={(e) => setForm((f) => ({ ...f, quantidade: e.target.value }))}
                inputMode="numeric"
              />
            </div>
            <div className="field">
              <label>Valor (calculado)</label>
              <input value={`R$ ${formatMoeda(valorPreview)}`} readOnly />
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
            : `${linhasFiltradas.length} lançamento(s)${data ? ` em ${data.split("-").reverse().join("/")}` : ""}`}
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
                <th>Nível</th>
                <th>Qtd</th>
                <th>Valor</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {!linhasFiltradas.length ? (
                <tr>
                  <td colSpan={9} className="muted">
                    Nenhum PRIME encontrado{data ? " neste dia" : ""}.
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
                    <td>{l.nivel || "—"}</td>
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
