"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { apiGet, asArray, formatMoeda, mesAtualISO, UNIDADES } from "@/lib/client";

type Rank = {
  posicao: number;
  vendedor: string;
  valor: number;
  quantidade: number;
};

type ModoMaluca = "produtos" | "photos" | "prime" | "constancia";

type Payload = {
  mes: string;
  mesRotulo: string;
  mesDisputa: string;
  mesDisputaRotulo: string;
  unidade?: string;
  topProdutos: Rank[];
  topPhotos: Rank[];
  topPrime: Rank[];
  topConstancia: Rank[];
  disputaProdutos: Rank[];
  disputaPhotos: Rank[];
  disputaPrime: Rank[];
  disputaConstancia: Rank[];
  error?: string;
};

function medalha(pos: number) {
  if (pos === 1) return "1º";
  if (pos === 2) return "2º";
  if (pos === 3) return "3º";
  return `${pos}º`;
}

function textoScore(r: Rank | undefined, modo: ModoMaluca) {
  if (!r) return "—";
  if (modo === "prime") {
    return (
      <>
        {r.quantidade} prime
        {r.valor > 0 ? <small>R$ {formatMoeda(r.valor)}</small> : null}
      </>
    );
  }
  if (modo === "constancia") {
    return (
      <>
        {r.quantidade} {r.quantidade === 1 ? "dia" : "dias"}
        <small>R$ {formatMoeda(r.valor)} no período</small>
      </>
    );
  }
  return (
    <>
      R$ {formatMoeda(r.valor)}
      <small>{r.quantidade} un.</small>
    </>
  );
}

function Podium({
  titulo,
  subtitulo,
  rows,
  modo,
}: {
  titulo: string;
  subtitulo?: string;
  rows: Rank[];
  modo: ModoMaluca;
}) {
  const porPos = (p: number) => rows.find((r) => r.posicao === p);
  const ordem = [2, 1, 3] as const;

  return (
    <section className="maluca-podium-block">
      <h2 className="maluca-podium-title">{titulo}</h2>
      {subtitulo && (
        <p className="muted" style={{ textAlign: "center", margin: "-8px 0 12px" }}>
          {subtitulo}
        </p>
      )}
      <div className="maluca-podium">
        {ordem.map((pos) => {
          const r = porPos(pos);
          const classe =
            pos === 1 ? "maluca-step first" : pos === 2 ? "maluca-step second" : "maluca-step third";
          return (
            <div key={pos} className={classe}>
              <div className={`maluca-avatar ${pos === 1 ? "champ" : ""}`}>
                <span>{medalha(pos)}</span>
              </div>
              <strong className="maluca-name">{r?.vendedor || "—"}</strong>
              <span className="maluca-score">{textoScore(r, modo)}</span>
              <div className={`maluca-pillar p${pos}`} />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Disputa({
  titulo,
  subtitulo,
  rows,
  modo,
}: {
  titulo: string;
  subtitulo?: string;
  rows: Rank[];
  modo: ModoMaluca;
}) {
  const max = useMemo(() => {
    if (!rows.length) return 1;
    if (modo === "prime") return Math.max(1, ...rows.map((r) => r.quantidade));
    if (modo === "constancia") return Math.max(1, ...rows.map((r) => r.quantidade));
    return Math.max(1, ...rows.map((r) => r.valor));
  }, [rows, modo]);

  function valorBarra(r: Rank) {
    if (modo === "prime" || modo === "constancia") return r.quantidade;
    return r.valor;
  }

  function textoBarra(r: Rank) {
    if (modo === "prime") return `${r.quantidade} prime`;
    if (modo === "constancia") {
      return `${r.quantidade} ${r.quantidade === 1 ? "dia" : "dias"} · R$ ${formatMoeda(r.valor)}`;
    }
    return `R$ ${formatMoeda(r.valor)} · ${r.quantidade} un.`;
  }

  return (
    <section className="maluca-race">
      <div className="maluca-race-head">
        <h2>{titulo}</h2>
        <p className="muted">{subtitulo}</p>
      </div>
      <div className="maluca-track">
        {rows.map((r, i) => {
          const valor = valorBarra(r);
          const pct = Math.max(8, Math.round((valor / max) * 100));
          const leader = r.posicao === 1;
          return (
            <div
              key={`${r.vendedor}-${r.posicao}-${modo}`}
              className={`maluca-lane ${leader ? "leader" : ""}`}
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <div className="maluca-lane-meta">
                <span className="maluca-pos">{r.posicao}º</span>
                <span className="maluca-lane-name">{r.vendedor}</span>
                <span className="maluca-lane-val">{textoBarra(r)}</span>
              </div>
              <div className="maluca-bar-wrap">
                <div className="maluca-bar" style={{ width: `${pct}%` }}>
                  <span className="maluca-car" aria-hidden />
                </div>
              </div>
            </div>
          );
        })}
        {rows.length === 0 && <p className="muted">Sem vendas neste mês para este filtro.</p>}
      </div>
    </section>
  );
}

export default function VendaMalucaPage() {
  const [mes, setMes] = useState(mesAtualISO());
  const [unidade, setUnidade] = useState("");
  const [data, setData] = useState<Payload | null>(null);
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(() => {
    setLoading(true);
    setErro("");
    const q = new URLSearchParams({ tipo: "venda-maluca", mes });
    if (unidade) q.set("unidade", unidade);
    apiGet<Payload>(`/api/relatorios?${q}`).then((r) => {
      if (r.error) setErro(r.error);
      else setData(r.data || null);
      setLoading(false);
    });
  }, [mes, unidade]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const filtroLabel = unidade || "Todas as unidades";
  const podioSub = data?.mesRotulo ? `Mês anterior · ${data.mesRotulo}` : "Mês anterior";
  const disputaSub = data?.mesDisputaRotulo
    ? `Mês selecionado · ${data.mesDisputaRotulo} · ${filtroLabel}`
    : `Mês selecionado · ${filtroLabel}`;

  return (
    <AppShell title="Corrida Maluca">
      <div className="maluca-page">
        <header className="maluca-hero">
          <p className="maluca-kicker">Operacional · incentivo</p>
          <h1 className="maluca-hero-title">Corrida Maluca</h1>
          <p className="maluca-hero-sub">
            Escolha o mês da disputa. O pódio mostra o mês anterior
            {data?.mesRotulo ? ` (${data.mesRotulo})` : ""}; a disputa usa o mês selecionado
            {data?.mesDisputaRotulo ? ` (${data.mesDisputaRotulo})` : ""}.
            Top 3 separados: PRIME, Produtos e Photos · constância = mais dias com venda no mês.
          </p>
        </header>

        <div className="filters">
          <div className="field">
            <label>Mês / ano</label>
            <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
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
          <button className="btn" type="button" onClick={carregar} disabled={loading}>
            {loading ? "Carregando…" : "Atualizar"}
          </button>
        </div>

        {loading && <p className="muted">Carregando corrida…</p>}
        {erro && <p className="msg-erro">{erro}</p>}

        {!loading && data && (
          <>
            <h2 className="dash-section">Pódio · {filtroLabel}</h2>
            <div className="maluca-podiums maluca-podiums-4">
              <Podium titulo="Top 3 · PRIME" subtitulo={podioSub} rows={asArray(data.topPrime)} modo="prime" />
              <Podium
                titulo="Top 3 · Produtos"
                subtitulo={podioSub}
                rows={asArray(data.topProdutos)}
                modo="produtos"
              />
              <Podium titulo="Top 3 · Photos" subtitulo={podioSub} rows={asArray(data.topPhotos)} modo="photos" />
              <Podium
                titulo="Maior constância"
                subtitulo={`${podioSub} · dias com venda`}
                rows={asArray(data.topConstancia)}
                modo="constancia"
              />
            </div>

            <h2 className="dash-section">Disputa ao vivo · {filtroLabel}</h2>
            <Disputa titulo="Disputa PRIME" subtitulo={disputaSub} rows={asArray(data.disputaPrime)} modo="prime" />
            <Disputa
              titulo="Disputa Produtos"
              subtitulo={disputaSub}
              rows={asArray(data.disputaProdutos)}
              modo="produtos"
            />
            <Disputa
              titulo="Disputa Photos"
              subtitulo={disputaSub}
              rows={asArray(data.disputaPhotos)}
              modo="photos"
            />
            <Disputa
              titulo="Disputa constância"
              subtitulo={`${disputaSub} · quem vende em mais dias diferentes`}
              rows={asArray(data.disputaConstancia)}
              modo="constancia"
            />
          </>
        )}
      </div>
    </AppShell>
  );
}
