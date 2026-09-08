"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { formatMoeda, UNIDADES, asArray } from "@/lib/client";

type Linha = {
  sheetRow: number;
  dataHora: string;
  vendedor: string;
  unidade: string;
  item: string;
  quantidade: number;
  valorRecebido: number;
  cancelada: boolean;
  motivo?: string;
  canceladoPor?: string;
};

type Tipo = "venda" | "prime";

export default function CancelamentoPage() {
  const [tipo, setTipo] = useState<Tipo>("venda");
  const [unidade, setUnidade] = useState("");
  const [vendedor, setVendedor] = useState("");
  const [incluirCanceladas, setIncluirCanceladas] = useState(true);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");
  const [alvo, setAlvo] = useState<Linha | null>(null);
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function carregar(t: Tipo = tipo) {
    const q = new URLSearchParams();
    q.set("tipo", t);
    if (unidade) q.set("unidade", unidade);
    if (vendedor) q.set("vendedor", vendedor);
    if (incluirCanceladas) q.set("incluirCanceladas", "true");
    const d = await fetch(`/api/cancelamento?${q}`).then((r) => r.json());
    setLinhas(asArray(d));
  }

  useEffect(() => {
    carregar();
  }, []);

  function trocarTipo(t: Tipo) {
    setTipo(t);
    setAlvo(null);
    setMsg("");
    setErro("");
    carregar(t);
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
    carregar();
  }

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
          <input
            value={vendedor}
            onChange={(e) => setVendedor(e.target.value)}
            placeholder="Nome exato"
          />
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
      <button className="btn" onClick={() => carregar()}>
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
              onClick={confirmarCancelar}
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
