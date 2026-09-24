"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import {
  asArray,
  formatMoeda,
  UNIDADES,
  type VendedorClient,
} from "@/lib/client";

type TipoAba = "VENDA" | "PRIME";
type ModoPedido = "EDICAO" | "CANCELAMENTO";

type LinhaVenda = {
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

type LinhaPrime = {
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
type ItemLoja = { sku: string; descricao: string; preco: number };

type MinhaSolic = {
  id: number;
  tipo: string;
  acao?: string;
  registroId: number;
  status: string;
  motivo: string;
  solicitadoEmFmt: string;
  decididoPor?: string;
  obsDecisao?: string;
};

function unicos(valores: string[]) {
  return [...new Set(valores.map((v) => String(v || "").trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "pt-BR")
  );
}

export default function SolicitarEdicaoPage() {
  const [aba, setAba] = useState<TipoAba>("VENDA");
  const [vendedores, setVendedores] = useState<VendedorClient[]>([]);
  const [itensPrime, setItensPrime] = useState<ItemPrime[]>([]);
  const [itensLoja, setItensLoja] = useState<ItemLoja[]>([]);
  const [unidade, setUnidade] = useState("");
  const [vendedorFiltro, setVendedorFiltro] = useState("");
  const [data, setData] = useState("");
  const [categoria, setCategoria] = useState("");
  const [subcategoria, setSubcategoria] = useState("");
  const [nivel, setNivel] = useState("");
  const [nome, setNome] = useState("");
  const [linhasVenda, setLinhasVenda] = useState<LinhaVenda[]>([]);
  const [linhasPrime, setLinhasPrime] = useState<LinhaPrime[]>([]);
  const [minhas, setMinhas] = useState<MinhaSolic[]>([]);
  const [ultimoDia, setUltimoDia] = useState("");
  const [editId, setEditId] = useState(0);
  const [modoPedido, setModoPedido] = useState<ModoPedido>("EDICAO");
  const [unidadeLinha, setUnidadeLinha] = useState("");
  const [formVenda, setFormVenda] = useState({
    dataLocal: "",
    idVendedor: "",
    sku: "",
    quantidade: "1",
    valor: "",
  });
  const [formPrime, setFormPrime] = useState({
    dataLocal: "",
    idVendedor: "",
    item: "",
    quantidade: "1",
  });
  const [motivo, setMotivo] = useState("");
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

  async function carregarItensUnidade(uni: string) {
    if (!uni) {
      setItensLoja([]);
      return;
    }
    const res = await fetch(`/api/vendas?unidade=${encodeURIComponent(uni)}`);
    const d = await res.json();
    if (!res.ok) {
      setItensLoja([]);
      return;
    }
    setItensLoja(
      asArray(d).map((i: Record<string, unknown>) => ({
        sku: String(i.sku || ""),
        descricao: String(i.descricao || i.nome || i.sku || ""),
        preco: Number(i.preco) || 0,
      }))
    );
  }

  const carregarMinhas = useCallback(async () => {
    const res = await fetch(`/api/solicitacoes-edicao?modo=minhas&tipo=${aba}`);
    const d = await res.json();
    if (res.ok) setMinhas(asArray<MinhaSolic>(d.linhas ?? d));
  }, [aba]);

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

      if (aba === "VENDA") {
        const res = await fetch(`/api/vendas/editar?${q}`);
        const d = await res.json();
        setCarregando(false);
        if (!res.ok) {
          setLinhasVenda([]);
          setErro(d.error || "Falha ao carregar vendas.");
          return;
        }
        setLinhasVenda(asArray<LinhaVenda>(d.linhas ?? d));
        if (d.ultimoDia) setUltimoDia(String(d.ultimoDia));
        if (!opts?.manterData && d.dataPadrao) setData(String(d.dataPadrao));
      } else {
        if (nivel) q.set("nivel", nivel);
        const res = await fetch(`/api/prime/editar?${q}`);
        const d = await res.json();
        setCarregando(false);
        if (!res.ok) {
          setLinhasPrime([]);
          setErro(d.error || "Falha ao carregar PRIME.");
          return;
        }
        setLinhasPrime(asArray<LinhaPrime>(d.linhas ?? d));
        if (d.ultimoDia) setUltimoDia(String(d.ultimoDia));
        if (!opts?.manterData && d.dataPadrao) setData(String(d.dataPadrao));
      }
      setEditId(0);
      void carregarMinhas();
    },
    [aba, unidade, vendedorFiltro, data, nome, nivel, carregarMinhas]
  );

  useEffect(() => {
    if (iniciado) return;
    setIniciado(true);
    void carregar({ dataFiltro: "" });
  }, [iniciado, carregar]);

  useEffect(() => {
    setEditId(0);
    setMotivo("");
    setErro("");
    setMsg("");
    void carregar({ dataFiltro: data || "", manterData: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- troca de aba
  }, [aba]);

  const categorias = useMemo(() => unicos(linhasVenda.map((l) => l.categoria)), [linhasVenda]);
  const subcategorias = useMemo(() => {
    const base = linhasVenda.filter((l) => !categoria || l.categoria === categoria);
    return unicos(base.map((l) => l.subcategoria));
  }, [linhasVenda, categoria]);

  const vendasFiltradas = useMemo(() => {
    return linhasVenda.filter((l) => {
      if (categoria && l.categoria !== categoria) return false;
      if (subcategoria && l.subcategoria !== subcategoria) return false;
      return true;
    });
  }, [linhasVenda, categoria, subcategoria]);

  const niveis = useMemo(() => unicos(linhasPrime.map((l) => l.nivel)), [linhasPrime]);
  const primesFiltradas = useMemo(() => {
    return linhasPrime.filter((l) => !nivel || l.nivel === nivel);
  }, [linhasPrime, nivel]);

  const valorPreviewPrime = useMemo(() => {
    const item = itensPrime.find((i) => i.nome === formPrime.item);
    const qtd = Math.floor(Number(String(formPrime.quantidade).replace(",", "."))) || 0;
    if (!item || qtd <= 0) return 0;
    return Math.round(item.preco * qtd * 100) / 100;
  }, [itensPrime, formPrime.item, formPrime.quantidade]);

  async function abrirVenda(l: LinhaVenda, modo: ModoPedido) {
    const vend =
      vendedores.find((v) => v.id === l.idVendedor) ||
      vendedores.find((v) => v.nome === l.vendedor);
    setModoPedido(modo);
    setEditId(l.id);
    setUnidadeLinha(l.unidade || "");
    setFormVenda({
      dataLocal: l.dataLocal || "",
      idVendedor: vend?.id || l.idVendedor || "",
      sku: l.sku || "",
      quantidade: String(l.quantidade || 1),
      valor: String(Number(l.valorRecebido || 0).toFixed(2)).replace(".", ","),
    });
    setMotivo("");
    setErro("");
    setMsg("");
    if (modo === "EDICAO") void carregarItensUnidade(l.unidade || "");
  }

  function abrirPrime(l: LinhaPrime, modo: ModoPedido) {
    const vend =
      vendedores.find((v) => v.id === l.idVendedor) ||
      vendedores.find((v) => v.nome === l.vendedor);
    setModoPedido(modo);
    setEditId(l.id);
    setUnidadeLinha(l.unidade || "");
    setFormPrime({
      dataLocal: l.dataLocal || "",
      idVendedor: vend?.id || l.idVendedor || "",
      item: l.nivel || l.item || "",
      quantidade: String(l.quantidade || 1),
    });
    setMotivo("");
    setErro("");
    setMsg("");
  }

  function onSkuChange(sku: string) {
    const item = itensLoja.find((i) => i.sku === sku);
    const qtd = Math.floor(Number(String(formVenda.quantidade).replace(",", "."))) || 1;
    setFormVenda((f) => ({
      ...f,
      sku,
      valor: item
        ? String((Math.round(item.preco * qtd * 100) / 100).toFixed(2)).replace(".", ",")
        : f.valor,
    }));
  }

  async function enviar() {
    if (!editId) return;
    if (motivo.trim().length < 10) {
      setErro("Informe o motivo da solicitação (mínimo 10 caracteres).");
      return;
    }
    setSalvando(true);
    setErro("");
    let body: Record<string, unknown>;
    if (modoPedido === "CANCELAMENTO") {
      body = { tipo: aba, acao: "CANCELAMENTO", registroId: editId, motivo };
    } else if (aba === "VENDA") {
      body = {
        tipo: "VENDA",
        acao: "EDICAO",
        registroId: editId,
        motivo,
        data: formVenda.dataLocal,
        idVendedor: formVenda.idVendedor,
        sku: formVenda.sku,
        quantidade: Math.floor(Number(String(formVenda.quantidade).replace(",", "."))),
        valorRecebido: formVenda.valor,
      };
    } else {
      body = {
        tipo: "PRIME",
        acao: "EDICAO",
        registroId: editId,
        motivo,
        data: formPrime.dataLocal,
        idVendedor: formPrime.idVendedor,
        item: formPrime.item,
        quantidade: Math.floor(Number(String(formPrime.quantidade).replace(",", "."))),
      };
    }
    const res = await fetch("/api/solicitacoes-edicao", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    setSalvando(false);
    if (!res.ok) {
      setErro(d.error || "Falha ao enviar solicitação.");
      return;
    }
    setMsg(d.message || "Solicitação enviada.");
    setEditId(0);
    setMotivo("");
    void carregarMinhas();
  }

  return (
    <AppShell title="Solicitar edição">
      <section className="card">
        <h2>Solicitar edição / cancelamento</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Peça alteração (inclui troca de item, com ajuste de estoque na aprovação) ou cancelamento.
          Quem edita aprova ou recusa. Motivo obrigatório.
          {ultimoDia ? ` · Último dia: ${ultimoDia.split("-").reverse().join("/")}` : ""}
        </p>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button
            type="button"
            className={aba === "VENDA" ? "btn" : "btn btn-secondary"}
            onClick={() => setAba("VENDA")}
          >
            Venda
          </button>
          <button
            type="button"
            className={aba === "PRIME" ? "btn" : "btn btn-secondary"}
            onClick={() => setAba("PRIME")}
          >
            PRIME
          </button>
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
          {aba === "VENDA" ? (
            <>
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
            </>
          ) : (
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
          )}
          <div className="field">
            <label>Busca</label>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder={aba === "VENDA" ? "Nome ou SKU" : "ELITE, PLATINA…"}
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
          <h3>
            {modoPedido === "CANCELAMENTO" ? "Solicitar cancelamento" : "Solicitar alteração"} —{" "}
            {aba} #{editId}
            {unidadeLinha ? ` · ${unidadeLinha}` : ""}
          </h3>
          {modoPedido === "CANCELAMENTO" ? (
            <p className="muted">
              Ao aprovar, o lançamento será cancelado
              {aba === "VENDA" ? " e o estoque devolvido" : ""}.
            </p>
          ) : aba === "VENDA" ? (
            <div className="filters">
              <div className="field">
                <label>Data e hora</label>
                <input
                  type="datetime-local"
                  value={formVenda.dataLocal}
                  onChange={(e) => setFormVenda((f) => ({ ...f, dataLocal: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Vendedor</label>
                <select
                  value={formVenda.idVendedor}
                  onChange={(e) => setFormVenda((f) => ({ ...f, idVendedor: e.target.value }))}
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
                <label>Item (SKU)</label>
                <select value={formVenda.sku} onChange={(e) => onSkuChange(e.target.value)}>
                  <option value="">Selecione</option>
                  {itensLoja.map((i) => (
                    <option key={i.sku} value={i.sku}>
                      {i.descricao} ({i.sku})
                    </option>
                  ))}
                  {formVenda.sku && !itensLoja.some((i) => i.sku === formVenda.sku) && (
                    <option value={formVenda.sku}>{formVenda.sku} (atual)</option>
                  )}
                </select>
              </div>
              <div className="field">
                <label>Quantidade</label>
                <input
                  value={formVenda.quantidade}
                  onChange={(e) => setFormVenda((f) => ({ ...f, quantidade: e.target.value }))}
                  inputMode="numeric"
                />
              </div>
              <div className="field">
                <label>Valor recebido (R$)</label>
                <input
                  value={formVenda.valor}
                  onChange={(e) => setFormVenda((f) => ({ ...f, valor: e.target.value }))}
                  inputMode="decimal"
                />
              </div>
            </div>
          ) : (
            <div className="filters">
              <div className="field">
                <label>Data e hora</label>
                <input
                  type="datetime-local"
                  value={formPrime.dataLocal}
                  onChange={(e) => setFormPrime((f) => ({ ...f, dataLocal: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Vendedor</label>
                <select
                  value={formPrime.idVendedor}
                  onChange={(e) => setFormPrime((f) => ({ ...f, idVendedor: e.target.value }))}
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
                  value={formPrime.item}
                  onChange={(e) => setFormPrime((f) => ({ ...f, item: e.target.value }))}
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
                  value={formPrime.quantidade}
                  onChange={(e) => setFormPrime((f) => ({ ...f, quantidade: e.target.value }))}
                  inputMode="numeric"
                />
              </div>
              <div className="field">
                <label>Valor (calculado)</label>
                <input value={`R$ ${formatMoeda(valorPreviewPrime)}`} readOnly />
              </div>
            </div>
          )}
          <div className="field" style={{ marginTop: 8 }}>
            <label>Motivo da solicitação (campo obrigatório)</label>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              style={{ width: "100%" }}
              placeholder="Por que precisa alterar/cancelar (mínimo 10 caracteres)"
            />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button type="button" className="btn" onClick={enviar} disabled={salvando}>
              {salvando ? "Enviando…" : "Enviar solicitação"}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setEditId(0)}>
              Fechar
            </button>
          </div>
        </section>
      )}

      <section className="card" style={{ marginTop: 16 }}>
        <p className="muted">
          {carregando
            ? "Carregando…"
            : aba === "VENDA"
              ? `${vendasFiltradas.length} venda(s)`
              : `${primesFiltradas.length} lançamento(s)`}
          {data ? ` em ${data.split("-").reverse().join("/")}` : ""}
        </p>
        <div className="table-wrap">
          {aba === "VENDA" ? (
            <table className="data">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Data/hora</th>
                  <th>Unidade</th>
                  <th>Vendedor</th>
                  <th>Item</th>
                  <th>Valor</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {!vendasFiltradas.length ? (
                  <tr>
                    <td colSpan={7} className="muted">
                      Nenhuma venda encontrada.
                    </td>
                  </tr>
                ) : (
                  vendasFiltradas.map((l) => (
                    <tr key={l.id}>
                      <td>{l.id}</td>
                      <td>{l.dataHora}</td>
                      <td>{l.unidade}</td>
                      <td>{l.vendedor}</td>
                      <td>
                        {l.item}
                        {l.sku ? ` (${l.sku})` : ""}
                      </td>
                      <td className="num">R$ {formatMoeda(l.valorRecebido || 0)}</td>
                      <td>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => void abrirVenda(l, "EDICAO")}
                          >
                            Alterar
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => void abrirVenda(l, "CANCELAMENTO")}
                          >
                            Cancelar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Data/hora</th>
                  <th>Unidade</th>
                  <th>Vendedor</th>
                  <th>Item</th>
                  <th>Qtd</th>
                  <th>Valor</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {!primesFiltradas.length ? (
                  <tr>
                    <td colSpan={8} className="muted">
                      Nenhum PRIME encontrado.
                    </td>
                  </tr>
                ) : (
                  primesFiltradas.map((l) => (
                    <tr key={l.id}>
                      <td>{l.id}</td>
                      <td>{l.dataHora}</td>
                      <td>{l.unidade}</td>
                      <td>{l.vendedor}</td>
                      <td>{l.nivel || l.item}</td>
                      <td className="num">{l.quantidade}</td>
                      <td className="num">R$ {formatMoeda(l.valorRecebido || 0)}</td>
                      <td>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => abrirPrime(l, "EDICAO")}
                          >
                            Alterar
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => abrirPrime(l, "CANCELAMENTO")}
                          >
                            Cancelar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h3>Minhas solicitações ({aba})</h3>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>#</th>
                <th>Ação</th>
                <th>Registro</th>
                <th>Status</th>
                <th>Quando</th>
                <th>Motivo</th>
                <th>Decisão</th>
              </tr>
            </thead>
            <tbody>
              {!minhas.length ? (
                <tr>
                  <td colSpan={7} className="muted">
                    Nenhuma solicitação neste tipo.
                  </td>
                </tr>
              ) : (
                minhas.map((s) => (
                  <tr key={s.id}>
                    <td>{s.id}</td>
                    <td>
                      {String(s.acao || "").toUpperCase() === "CANCELAMENTO"
                        ? "Cancelamento"
                        : "Edição"}
                    </td>
                    <td>
                      {s.tipo} #{s.registroId}
                    </td>
                    <td>{s.status}</td>
                    <td>{s.solicitadoEmFmt}</td>
                    <td>{s.motivo}</td>
                    <td>
                      {s.decididoPor
                        ? `${s.decididoPor}${s.obsDecisao ? ` — ${s.obsDecisao}` : ""}`
                        : "—"}
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
