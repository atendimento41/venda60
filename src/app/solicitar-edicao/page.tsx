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

type LinhaVenda = {
  id: number;
  dataHora: string;
  dataLocal: string;
  idVendedor: string;
  vendedor: string;
  unidade: string;
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

type MinhaSolic = {
  id: number;
  tipo: string;
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
  const [formVenda, setFormVenda] = useState({ dataLocal: "", idVendedor: "", valor: "" });
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

  function abrirVenda(l: LinhaVenda) {
    const vend =
      vendedores.find((v) => v.id === l.idVendedor) ||
      vendedores.find((v) => v.nome === l.vendedor);
    setEditId(l.id);
    setFormVenda({
      dataLocal: l.dataLocal || "",
      idVendedor: vend?.id || l.idVendedor || "",
      valor: String(Number(l.valorRecebido || 0).toFixed(2)).replace(".", ","),
    });
    setMotivo("");
    setErro("");
    setMsg("");
  }

  function abrirPrime(l: LinhaPrime) {
    const vend =
      vendedores.find((v) => v.id === l.idVendedor) ||
      vendedores.find((v) => v.nome === l.vendedor);
    setEditId(l.id);
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

  async function enviar() {
    if (!editId) return;
    if (motivo.trim().length < 10) {
      setErro("Informe o motivo da solicitação (mínimo 10 caracteres).");
      return;
    }
    setSalvando(true);
    setErro("");
    const body =
      aba === "VENDA"
        ? {
            tipo: "VENDA",
            registroId: editId,
            motivo,
            data: formVenda.dataLocal,
            idVendedor: formVenda.idVendedor,
            valorRecebido: formVenda.valor,
          }
        : {
            tipo: "PRIME",
            registroId: editId,
            motivo,
            data: formPrime.dataLocal,
            idVendedor: formPrime.idVendedor,
            item: formPrime.item,
            quantidade: Math.floor(Number(String(formPrime.quantidade).replace(",", "."))),
          };
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
        <h2>Solicitar edição</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Monte o pedido de alteração. Quem tem permissão de editar irá aprovar ou recusar. O motivo é
          obrigatório.
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
            Solicitar alteração — {aba} #{editId}
          </h3>
          {aba === "VENDA" ? (
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
            <label>Motivo da solicitação *</label>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              style={{ width: "100%" }}
              placeholder="Por que precisa alterar (mínimo 10 caracteres)"
            />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button type="button" className="btn" onClick={enviar} disabled={salvando}>
              {salvando ? "Enviando…" : "Enviar solicitação"}
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
                      <td>{l.item}</td>
                      <td className="num">R$ {formatMoeda(l.valorRecebido || 0)}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => abrirVenda(l)}
                        >
                          Solicitar
                        </button>
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
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => abrirPrime(l)}
                        >
                          Solicitar
                        </button>
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
                  <td colSpan={6} className="muted">
                    Nenhuma solicitação neste tipo.
                  </td>
                </tr>
              ) : (
                minhas.map((s) => (
                  <tr key={s.id}>
                    <td>{s.id}</td>
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
