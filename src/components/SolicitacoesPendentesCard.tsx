"use client";

import { useCallback, useEffect, useState } from "react";
import { asArray, formatMoeda } from "@/lib/client";

export type SolicitacaoResumo = {
  id: number;
  tipo: string;
  acao?: string;
  registroId: number;
  unidade: string;
  valoresAtual: Record<string, unknown>;
  valoresPropostos: Record<string, unknown>;
  motivo: string;
  status: string;
  solicitadoPor: string;
  solicitadoEmFmt: string;
};

function fmtValor(v: unknown) {
  if (v == null || v === "") return "—";
  if (typeof v === "number") return formatMoeda(v);
  return String(v);
}

function resumoDePara(s: SolicitacaoResumo) {
  if (String(s.acao || "").toUpperCase() === "CANCELAMENTO") {
    return ["Cancelar lançamento (devolver estoque se venda)"];
  }
  const a = s.valoresAtual || {};
  const p = s.valoresPropostos || {};
  const linhas: string[] = [];
  if (String(a.data || "") !== String(p.data || "")) {
    linhas.push(`data: ${a.dataHora || a.data || "—"} → ${p.data || "—"}`);
  }
  if (String(a.vendedor || "") !== String(p.vendedor || "")) {
    linhas.push(`vendedor: ${a.vendedor || "—"} → ${p.vendedor || "—"}`);
  }
  if (s.tipo === "VENDA") {
    const skuA = String(a.sku || "");
    const skuP = String(p.sku || "");
    if (skuA && skuP && skuA !== skuP) {
      linhas.push(`item: ${skuA} (${a.item || "—"}) → ${skuP}`);
    }
    if (Number(a.quantidade) !== Number(p.quantidade) && p.quantidade != null) {
      linhas.push(`qtd: ${a.quantidade ?? "—"} → ${p.quantidade}`);
    }
    if (Number(a.valorRecebido) !== Number(p.valorRecebido)) {
      linhas.push(`valor: R$ ${fmtValor(a.valorRecebido)} → R$ ${fmtValor(p.valorRecebido)}`);
    }
  } else {
    if (String(a.item || "") !== String(p.item || "")) {
      linhas.push(`item: ${a.item || "—"} → ${p.item || "—"}`);
    }
    if (Number(a.quantidade) !== Number(p.quantidade)) {
      linhas.push(`qtd: ${a.quantidade ?? "—"} → ${p.quantidade ?? "—"}`);
    }
  }
  return linhas.length ? linhas : ["(mesmos valores — sem mudança aparente)"];
}

export default function SolicitacoesPendentesCard({
  tipo,
  onDecidido,
}: {
  tipo: "VENDA" | "PRIME";
  onDecidido?: () => void;
}) {
  const [linhas, setLinhas] = useState<SolicitacaoResumo[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");
  const [recusaId, setRecusaId] = useState(0);
  const [obsRecusa, setObsRecusa] = useState("");
  const [busyId, setBusyId] = useState(0);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    const res = await fetch(`/api/solicitacoes-edicao?modo=pendentes&tipo=${tipo}`);
    const d = await res.json();
    setCarregando(false);
    if (!res.ok) {
      setLinhas([]);
      return;
    }
    setLinhas(asArray<SolicitacaoResumo>(d.linhas ?? d));
  }, [tipo]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function aprovar(id: number) {
    setBusyId(id);
    setErro("");
    setMsg("");
    const res = await fetch("/api/solicitacoes-edicao", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "aprovar", id }),
    });
    const d = await res.json();
    setBusyId(0);
    if (!res.ok) {
      setErro(d.error || "Falha ao aprovar.");
      return;
    }
    setMsg(d.message || "Aprovado.");
    setRecusaId(0);
    void carregar();
    onDecidido?.();
  }

  async function recusar(id: number) {
    if (obsRecusa.trim().length < 10) {
      setErro("Informe a observação da recusa (mínimo 10 caracteres).");
      return;
    }
    setBusyId(id);
    setErro("");
    setMsg("");
    const res = await fetch("/api/solicitacoes-edicao", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "recusar", id, obs: obsRecusa }),
    });
    const d = await res.json();
    setBusyId(0);
    if (!res.ok) {
      setErro(d.error || "Falha ao recusar.");
      return;
    }
    setMsg(d.message || "Recusado.");
    setRecusaId(0);
    setObsRecusa("");
    void carregar();
    onDecidido?.();
  }

  if (!carregando && !linhas.length && !msg && !erro) return null;

  return (
    <section className="card" style={{ marginBottom: 16 }}>
      <h2>Solicitações pendentes</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Confirme ou recuse pedidos de alteração/cancelamento. Os valores do pedido não podem ser
        editados aqui. Troca de item devolve estoque do antigo e baixa o novo.
      </p>
      {msg && <p className="ok">{msg}</p>}
      {erro && <p className="erro">{erro}</p>}
      {carregando && !linhas.length ? (
        <p className="muted">Carregando…</p>
      ) : !linhas.length ? (
        <p className="muted">Nenhuma solicitação pendente.</p>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>#</th>
                <th>Tipo</th>
                <th>Registro</th>
                <th>Solicitante</th>
                <th>Quando</th>
                <th>Motivo</th>
                <th>Pedido</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((s) => {
                const ehCancel = String(s.acao || "").toUpperCase() === "CANCELAMENTO";
                return (
                  <tr key={s.id}>
                    <td>{s.id}</td>
                    <td>{ehCancel ? "Cancelamento" : "Edição"}</td>
                    <td>
                      {s.tipo} #{s.registroId}
                      {s.unidade ? ` · ${s.unidade}` : ""}
                    </td>
                    <td>{s.solicitadoPor}</td>
                    <td>{s.solicitadoEmFmt}</td>
                    <td style={{ maxWidth: 220 }}>{s.motivo}</td>
                    <td>
                      <ul style={{ margin: 0, paddingLeft: 16 }}>
                        {resumoDePara(s).map((l) => (
                          <li key={l}>{l}</li>
                        ))}
                      </ul>
                      {recusaId === s.id && (
                        <div style={{ marginTop: 8 }}>
                          <label>Obs. da recusa (campo obrigatório)</label>
                          <textarea
                            value={obsRecusa}
                            onChange={(e) => setObsRecusa(e.target.value)}
                            rows={2}
                            style={{ width: "100%" }}
                            placeholder="Por que está recusando (mín. 10 caracteres)"
                          />
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <button
                          type="button"
                          className="btn"
                          disabled={busyId === s.id}
                          onClick={() => aprovar(s.id)}
                        >
                          {busyId === s.id ? "…" : "Aprovar"}
                        </button>
                        {recusaId === s.id ? (
                          <>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              disabled={busyId === s.id}
                              onClick={() => recusar(s.id)}
                            >
                              Confirmar recusa
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => {
                                setRecusaId(0);
                                setObsRecusa("");
                              }}
                            >
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => {
                              setRecusaId(s.id);
                              setObsRecusa("");
                              setErro("");
                            }}
                          >
                            Recusar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
