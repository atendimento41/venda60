"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { formatMoeda, hojeISO, UNIDADES, asArray } from "@/lib/client";

type Linha = {
  sheetRow: number;
  dataHora: string;
  vendedor: string;
  unidade: string;
  item: string;
  categoria?: string;
  subcategoria?: string;
  quantidade: number;
  valorRecebido: number;
  cancelada: boolean;
  motivo?: string;
  canceladoPor?: string;
};

type Tipo = "venda" | "prime";

export default function CancelamentoPage() {
  const [tipo, setTipo] = useState<Tipo>("venda");
  const [dataInicio, setDataInicio] = useState(hojeISO());
  const [dataFim, setDataFim] = useState(hojeISO());
  const [unidade, setUnidade] = useState("");
  const [vendedor, setVendedor] = useState("");
  const [nome, setNome] = useState("");
  const [categoria, setCategoria] = useState("");
  const [subcategoria, setSubcategoria] = useState("");
  const [vendedores, setVendedores] = useState<string[]>([]);
  const [categorias, setCategorias] = useState<Record<string, string[]>>({});
  const [incluirCanceladas, setIncluirCanceladas] = useState(true);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");
  const [alvo, setAlvo] = useState<Linha | null>(null);
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    fetch("/api/relatorios?tipo=vendedores")
      .then((r) => r.json())
      .then((d) => setVendedores(asArray(d)));
    fetch("/api/relatorios?tipo=categorias")
      .then((r) => r.json())
      .then((d) => {
        if (d && !d.error) setCategorias(d);
      });
  }, []);

  async function carregar(opts?: {
    tipo?: Tipo;
    categoria?: string;
    subcategoria?: string;
  }) {
    const t = opts?.tipo ?? tipo;
    const cat = opts?.categoria !== undefined ? opts.categoria : categoria;
    const sub = opts?.subcategoria !== undefined ? opts.subcategoria : subcategoria;
    const q = new URLSearchParams();
    q.set("tipo", t);
    if (dataInicio) q.set("dataInicio", dataInicio);
    if (dataFim) q.set("dataFim", dataFim);
    if (unidade) q.set("unidade", unidade);
    if (vendedor) q.set("vendedor", vendedor);
    if (nome.trim()) q.set("nome", nome.trim());
    if (cat) q.set("categoria", cat);
    if (sub) q.set("subcategoria", sub);
    if (incluirCanceladas) q.set("incluirCanceladas", "true");
    const d = await fetch(`/api/cancelamento?${q}`).then((r) => r.json());
    setLinhas(asArray(d));
  }

  useEffect(() => {
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function trocarTipo(t: Tipo) {
    setTipo(t);
    setAlvo(null);
    setMsg("");
    setErro("");
    const cat = t === "prime" ? "PRIME" : categoria === "PRIME" ? "" : categoria;
    const sub = t === "prime" || categoria === "PRIME" ? "" : subcategoria;
    setCategoria(cat);
    setSubcategoria(sub);
    void carregar({ tipo: t, categoria: cat, subcategoria: sub });
  }

  function abrirCancelar(l: Linha) {
    setAlvo(l);
    setMotivo("");
    setErro("");
    setMsg("");
  }

  async function confirmarCancelar() {
    if (!alvo) return;
    if (motivo.trim().length < 10) {
      setErro("Informe a descrição do cancelamento (mínimo 10 caracteres).");
      return;
    }
    setSalvando(true);
    setErro("");
    const res = await fetch("/api/cancelamento", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: alvo.sheetRow, motivo: motivo.trim(), tipo }),
    });
    const data = await res.json();
    setSalvando(false);
    if (!res.ok) {
      setErro(data.error || "Falha ao cancelar");
      return;
    }
    setMsg(data.message);
    setAlvo(null);
    setMotivo("");
    void carregar();
  }

  const subs =
    categoria && categorias[categoria]
      ? categorias[categoria]
      : [...new Set(Object.values(categorias).flat())].sort();

  return (
    <AppShell title="Cancelar venda / PRIME">
      <div className="filters" style={{ marginBottom: 12 }}>
        <label className="check-inline">
          <input
            type="radio"
            name="tipo-cancel"
            checked={tipo === "venda"}
            onChange={() => trocarTipo("venda")}
          />
          Vendas
        </label>
        <label className="check-inline">
          <input
            type="radio"
            name="tipo-cancel"
            checked={tipo === "prime"}
            onChange={() => trocarTipo("prime")}
          />
          PRIME
        </label>
      </div>
      <div className="filters">
        <div className="field">
          <label>Início</label>
          <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
        </div>
        <div className="field">
          <label>Fim</label>
          <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
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
        <div className="field">
          <label>Vendedor</label>
          <select value={vendedor} onChange={(e) => setVendedor(e.target.value)}>
            <option value="">Todos</option>
            {vendedores.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Nome do item</label>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void carregar();
            }}
            placeholder="Buscar por nome ou SKU"
          />
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
            {Object.keys(categorias)
              .sort()
              .map((c) => (
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
            {subs.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <label className="check-inline">
          <input
            type="checkbox"
            checked={incluirCanceladas}
            onChange={(e) => setIncluirCanceladas(e.target.checked)}
          />
          Incluir canceladas
        </label>
      </div>
      <button className="btn" onClick={() => void carregar()}>
        Buscar
      </button>
      {msg && <p className="msg-ok">{msg}</p>}
      {erro && !alvo && <p className="msg-erro">{erro}</p>}

      {alvo && (
        <div className="panel" style={{ marginTop: 16 }}>
          <h2>Descrição do cancelamento</h2>
          <p className="muted">
            {alvo.dataHora} · {alvo.vendedor} · {alvo.item} · R$ {formatMoeda(alvo.valorRecebido)}
          </p>
          <div className="field">
            <label>Descrição *</label>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={4}
              required
              minLength={10}
              placeholder="Descreva o motivo do cancelamento (mínimo 10 caracteres)…"
            />
          </div>
          {erro && <p className="msg-erro">{erro}</p>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              className="btn"
              disabled={salvando || motivo.trim().length < 10}
              onClick={() => void confirmarCancelar()}
            >
              {salvando ? "Cancelando…" : "Confirmar cancelamento"}
            </button>
            <button className="btn btn-secondary" type="button" onClick={() => setAlvo(null)}>
              Voltar
            </button>
          </div>
        </div>
      )}

      <table style={{ marginTop: 16 }}>
        <thead>
          <tr>
            <th>Data/hora</th>
            <th>Vendedor</th>
            <th>Unidade</th>
            <th>Item</th>
            <th>Categoria</th>
            <th className="num">Qtd</th>
            <th className="num">Valor</th>
            <th>Motivo</th>
            <th>Ação</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={`${tipo}-${l.sheetRow}`}>
              <td>{l.dataHora}</td>
              <td>{l.vendedor}</td>
              <td>{l.unidade}</td>
              <td>{l.item}</td>
              <td>
                {l.categoria || "—"}
                {l.subcategoria ? ` / ${l.subcategoria}` : ""}
              </td>
              <td className="num">{l.quantidade}</td>
              <td className="num">R$ {formatMoeda(l.valorRecebido)}</td>
              <td>{l.cancelada ? l.motivo || "—" : ""}</td>
              <td>
                {l.cancelada ? (
                  <span className="muted">
                    Cancelada{l.canceladoPor ? ` · ${l.canceladoPor}` : ""}
                  </span>
                ) : (
                  <button
                    className="btn"
                    style={{ padding: "4px 8px", fontSize: 12 }}
                    onClick={() => abrirCancelar(l)}
                  >
                    Cancelar
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </AppShell>
  );
}
