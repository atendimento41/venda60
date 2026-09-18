"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { formatMoeda, asArray, comprimirFoto } from "@/lib/client";

type Mov = {
  id: number;
  dataFmt: string;
  status: string;
  tipo: string;
  encomenda?: boolean;
  unidade: string;
  nomeEntrega: string;
  descricaoItem: string;
  quantidade: number;
  fotoUrl?: string;
  fotoLancamento?: string;
  custo?: number;
  sugestaoVenda?: number;
  recebidoPor?: string;
};

function moneyInput(n: number | undefined) {
  const v = Number(n) || 0;
  return v ? formatMoeda(v) : "";
}

function ehEncomenda(m: Mov) {
  if (typeof m.encomenda === "boolean") return m.encomenda;
  const t = `${m.status || ""} ${m.tipo || ""}`.toUpperCase();
  return t.includes("ENCOMENDA");
}

export default function EditarLancamentoUnikPage() {
  const [lista, setLista] = useState<Mov[]>([]);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [busca, setBusca] = useState("");
  const [buscaItem, setBuscaItem] = useState("");
  const [filtroCusto, setFiltroCusto] = useState("");
  const [filtroSugestao, setFiltroSugestao] = useState("");
  const [editId, setEditId] = useState(0);
  const [form, setForm] = useState({
    custo: "",
    sugestao: "",
    recebidoPor: "",
    fotoUrl: "",
    quantidade: "1",
    encomenda: false,
  });
  const [salvando, setSalvando] = useState("");
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [lote, setLote] = useState({
    aplicarCusto: false,
    aplicarSugestao: false,
    aplicarRecebidoPor: false,
    custo: "",
    sugestao: "",
    recebidoPor: "",
  });

  async function carregar(custoF = filtroCusto, sugestaoF = filtroSugestao, nomeF = busca, itemF = buscaItem) {
    const q = new URLSearchParams({ tipo: "lancamentos", todos: "1" });
    if (custoF) q.set("custo", custoF);
    if (sugestaoF) q.set("sugestao", sugestaoF);
    if (nomeF.trim()) q.set("nome", nomeF.trim());
    if (itemF.trim()) q.set("item", itemF.trim());
    const d = await fetch(`/api/unik?${q}`).then((r) => r.json());
    if (d?.error) {
      setErro(d.error);
      return;
    }
    setLista(asArray(d.lancamentos) as Mov[]);
    setSel(new Set());
  }

  useEffect(() => {
    carregar();
  }, []);

  const idsVisiveis = useMemo(() => lista.map((m) => m.id), [lista]);
  const todosSel = idsVisiveis.length > 0 && idsVisiveis.every((id) => sel.has(id));

  function toggleSel(id: number) {
    setSel((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function toggleTodos() {
    if (todosSel) setSel(new Set());
    else setSel(new Set(idsVisiveis));
  }

  function abrir(m: Mov) {
    setEditId(m.id);
    setForm({
      custo: moneyInput(m.custo),
      sugestao: moneyInput(m.sugestaoVenda),
      recebidoPor: m.recebidoPor || "",
      fotoUrl: m.fotoLancamento || m.fotoUrl || "",
      quantidade: String(m.quantidade || 1),
      encomenda: ehEncomenda(m),
    });
    setErro("");
    setMsg("");
  }

  async function onFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setErro("");
    try {
      const dataUrl = await comprimirFoto(file);
      setForm((f) => ({ ...f, fotoUrl: dataUrl }));
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao anexar foto");
    }
  }

  async function salvar(m: Mov) {
    setErro("");
    setMsg("");
    setSalvando(`s:${m.id}`);
    const res = await fetch("/api/unik", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        acao: "editar-lancamento",
        id: m.id,
        custo: form.custo,
        sugestaoVenda: form.sugestao,
        recebidoPor: form.recebidoPor,
        fotoUrl: form.fotoUrl,
        quantidade: form.quantidade,
        encomenda: form.encomenda,
      }),
    });
    const dataRes = await res.json();
    setSalvando("");
    if (!res.ok) {
      setErro(dataRes.error || "Falha ao salvar");
      return;
    }
    setMsg(dataRes.message);
    setEditId(0);
    carregar();
  }

  async function salvarLote() {
    if (sel.size === 0) {
      setErro("Selecione ao menos um lançamento.");
      return;
    }
    if (!lote.aplicarCusto && !lote.aplicarSugestao && !lote.aplicarRecebidoPor) {
      setErro("Marque ao menos um campo para aplicar em lote (custo, sugestão ou quem recebeu).");
      return;
    }
    setErro("");
    setMsg("");
    setSalvando("lote");
    const res = await fetch("/api/unik", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        acao: "editar-lancamentos-lote",
        ids: [...sel],
        aplicarCusto: lote.aplicarCusto,
        aplicarSugestao: lote.aplicarSugestao,
        aplicarRecebidoPor: lote.aplicarRecebidoPor,
        custo: lote.custo,
        sugestaoVenda: lote.sugestao,
        recebidoPor: lote.recebidoPor,
      }),
    });
    const dataRes = await res.json();
    setSalvando("");
    if (!res.ok) {
      setErro(dataRes.error || "Falha na edição em lote");
      return;
    }
    setMsg(dataRes.message);
    setLote({
      aplicarCusto: false,
      aplicarSugestao: false,
      aplicarRecebidoPor: false,
      custo: "",
      sugestao: "",
      recebidoPor: "",
    });
    carregar();
  }

  async function excluir(m: Mov) {
    if (!window.confirm(`Excluir o lançamento “${m.nomeEntrega}”? O estoque aplicado neste lançamento é revertido.`)) {
      return;
    }
    setErro("");
    setMsg("");
    setSalvando(`d:${m.id}`);
    const res = await fetch("/api/unik", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "excluir-lancamento", id: m.id }),
    });
    const dataRes = await res.json();
    setSalvando("");
    if (!res.ok) {
      setErro(dataRes.error || "Falha ao excluir");
      return;
    }
    setMsg(dataRes.message);
    setEditId(0);
    carregar();
  }

  return (
    <AppShell title="UNIK · Edição lançamento">
      <p className="muted">
        Edite um a um (quantidade, foto, encomenda…) ou selecione vários e aplique em lote só{" "}
        <strong>custo UNIK</strong>, <strong>sugestão de preço</strong> e/ou <strong>quem recebeu</strong>.
      </p>

      <div className="filters">
        <div className="field">
          <label>Nome UNIK / quem recebeu</label>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") carregar();
            }}
            placeholder="Buscar"
          />
        </div>
        <div className="field">
          <label>Item vinculado (cadastro)</label>
          <input
            value={buscaItem}
            onChange={(e) => setBuscaItem(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") carregar();
            }}
            placeholder="Ex.: Chaveiro Click 3D"
          />
        </div>
        <div className="field">
          <label>Custo</label>
          <select
            value={filtroCusto}
            onChange={(e) => {
              const v = e.target.value;
              setFiltroCusto(v);
              carregar(v, filtroSugestao, busca);
            }}
          >
            <option value="">Todos</option>
            <option value="0">Custo 0</option>
          </select>
        </div>
        <div className="field">
          <label>Sugestão</label>
          <select
            value={filtroSugestao}
            onChange={(e) => {
              const v = e.target.value;
              setFiltroSugestao(v);
              carregar(filtroCusto, v, busca);
            }}
          >
            <option value="">Todas</option>
            <option value="0">Sugestão 0</option>
          </select>
        </div>
        <button className="btn" onClick={() => carregar()}>
          Buscar
        </button>
      </div>

      {lista.length > 0 ? (
        <section className="dash-card" style={{ marginBottom: 16 }}>
          <h2 style={{ marginTop: 0 }}>Edição em lote</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            {sel.size} selecionado(s). Marque os campos que deseja alterar e salve — os demais ficam iguais.
          </p>
          <div className="btn-row" style={{ marginBottom: 10 }}>
            <label className="check-inline">
              <input type="checkbox" checked={todosSel} onChange={toggleTodos} /> Selecionar todos do filtro
            </label>
            <button type="button" className="btn btn-secondary" disabled={sel.size === 0} onClick={() => setSel(new Set())}>
              Limpar seleção
            </button>
          </div>
          <div className="filters">
            <div className="field">
              <label className="check-inline">
                <input
                  type="checkbox"
                  checked={lote.aplicarCusto}
                  onChange={(e) => setLote((f) => ({ ...f, aplicarCusto: e.target.checked }))}
                />{" "}
                Aplicar custo UNIK
              </label>
              <input
                value={lote.custo}
                disabled={!lote.aplicarCusto}
                onChange={(e) => setLote((f) => ({ ...f, custo: e.target.value }))}
                inputMode="decimal"
                placeholder="0,00"
              />
            </div>
            <div className="field">
              <label className="check-inline">
                <input
                  type="checkbox"
                  checked={lote.aplicarSugestao}
                  onChange={(e) => setLote((f) => ({ ...f, aplicarSugestao: e.target.checked }))}
                />{" "}
                Aplicar sugestão de preço
              </label>
              <input
                value={lote.sugestao}
                disabled={!lote.aplicarSugestao}
                onChange={(e) => setLote((f) => ({ ...f, sugestao: e.target.value }))}
                inputMode="decimal"
                placeholder="0,00"
              />
            </div>
            <div className="field">
              <label className="check-inline">
                <input
                  type="checkbox"
                  checked={lote.aplicarRecebidoPor}
                  onChange={(e) => setLote((f) => ({ ...f, aplicarRecebidoPor: e.target.checked }))}
                />{" "}
                Aplicar quem recebeu
              </label>
              <input
                value={lote.recebidoPor}
                disabled={!lote.aplicarRecebidoPor}
                onChange={(e) => setLote((f) => ({ ...f, recebidoPor: e.target.value }))}
                placeholder="Nome de quem recebeu"
              />
            </div>
          </div>
          <button
            type="button"
            className="btn"
            disabled={salvando === "lote" || sel.size === 0}
            onClick={() => void salvarLote()}
          >
            {salvando === "lote" ? "…" : `Salvar em ${sel.size || 0} lançamento(s)`}
          </button>
        </section>
      ) : null}

      {msg && <p className="msg-ok">{msg}</p>}
      {erro && <p className="msg-erro">{erro}</p>}

      {lista.length === 0 ? (
        <p className="muted">Nenhum lançamento neste filtro.</p>
      ) : (
        lista.map((m) => {
          const aberto = editId === m.id;
          const enc = ehEncomenda(m);
          return (
            <section key={m.id} className="dash-card" style={{ marginBottom: 12 }}>
              <div className="btn-row" style={{ alignItems: "flex-start" }}>
                <label className="check-inline" style={{ marginTop: 8 }}>
                  <input type="checkbox" checked={sel.has(m.id)} onChange={() => toggleSel(m.id)} />
                </label>
                {m.fotoUrl ? <img className="foto-thumb" src={m.fotoUrl} alt="" /> : null}
                <div style={{ flex: 1 }}>
                  <h2 style={{ margin: 0 }}>
                    {m.nomeEntrega}
                    {enc ? (
                      <span className="muted" style={{ fontSize: 13, fontWeight: 500 }}>
                        {" "}
                        · encomenda
                      </span>
                    ) : null}
                  </h2>
                  <p className="muted" style={{ margin: "6px 0 0" }}>
                    {m.dataFmt} · {m.unidade || "—"} · {m.status || m.tipo} · Qtd {m.quantidade}
                    {m.descricaoItem ? ` · ${m.descricaoItem}` : ""}
                    {` · Custo R$ ${formatMoeda(m.custo || 0)}`}
                    {` · Sugestão R$ ${formatMoeda(m.sugestaoVenda || 0)}`}
                    {m.recebidoPor ? ` · Recebeu: ${m.recebidoPor}` : " · Sem quem recebeu"}
                  </p>
                </div>
                <button
                  type="button"
                  className={aberto ? "btn btn-secondary" : "btn"}
                  onClick={() => (aberto ? setEditId(0) : abrir(m))}
                >
                  {aberto ? "Fechar" : "Editar"}
                </button>
              </div>

              {aberto && (
                <>
                  <div className="filters" style={{ marginTop: 12 }}>
                    <div className="field">
                      <label>Quantidade</label>
                      <input
                        type="number"
                        min={m.quantidade || 1}
                        step={1}
                        value={form.quantidade}
                        onChange={(e) => setForm((f) => ({ ...f, quantidade: e.target.value }))}
                      />
                    </div>
                    <div className="field">
                      <label>Quem recebeu</label>
                      <input
                        value={form.recebidoPor}
                        onChange={(e) => setForm((f) => ({ ...f, recebidoPor: e.target.value }))}
                        placeholder="Nome de quem recebeu"
                      />
                    </div>
                    <div className="field">
                      <label>{form.encomenda ? "Custo total (60 → UNIK)" : "Custo UNIK"}</label>
                      <input
                        value={form.custo}
                        onChange={(e) => setForm((f) => ({ ...f, custo: e.target.value }))}
                        inputMode="decimal"
                        placeholder="0,00"
                      />
                      {form.encomenda ? (
                        <span className="muted" style={{ fontSize: 12 }}>
                          Opcional. Encomenda não mexe no estoque; valor entra no relatório de encomendas.
                        </span>
                      ) : null}
                    </div>
                    <div className="field">
                      <label>Sugestão de preço</label>
                      <input
                        value={form.sugestao}
                        onChange={(e) => setForm((f) => ({ ...f, sugestao: e.target.value }))}
                        inputMode="decimal"
                        placeholder="0,00"
                      />
                    </div>
                    <div className="field" style={{ justifyContent: "flex-end" }}>
                      <label className="check-inline" style={{ marginTop: 22 }}>
                        <input
                          type="checkbox"
                          checked={form.encomenda}
                          onChange={(e) => setForm((f) => ({ ...f, encomenda: e.target.checked }))}
                        />{" "}
                        Encomenda
                      </label>
                    </div>
                  </div>
                  {form.encomenda ? (
                    <p className="muted" style={{ marginTop: 0 }}>
                      Ao salvar como encomenda: status Encomenda, vínculo de estoque deste lançamento é removido e o
                      estoque aplicado é revertido.
                    </p>
                  ) : null}
                  <div className="field">
                    <label>Foto</label>
                    <input type="file" accept="image/*" onChange={onFoto} />
                  </div>
                  {form.fotoUrl ? (
                    <div className="foto-preview">
                      <img src={form.fotoUrl} alt="Prévia" />
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setForm((f) => ({ ...f, fotoUrl: "" }))}
                      >
                        Remover foto
                      </button>
                    </div>
                  ) : null}
                  <div className="btn-row" style={{ marginTop: 12 }}>
                    <button className="btn" disabled={salvando === `s:${m.id}`} onClick={() => salvar(m)}>
                      {salvando === `s:${m.id}` ? "…" : "Salvar"}
                    </button>
                    <button
                      className="btn btn-secondary"
                      disabled={salvando === `d:${m.id}`}
                      onClick={() => excluir(m)}
                    >
                      {salvando === `d:${m.id}` ? "…" : "Excluir lançamento"}
                    </button>
                  </div>
                </>
              )}
            </section>
          );
        })
      )}
    </AppShell>
  );
}
