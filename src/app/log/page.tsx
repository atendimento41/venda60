"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import PaginacaoBar from "@/components/PaginacaoBar";
import { apiGet, asArray } from "@/lib/client";

type LinhaLog = {
  id: number;
  dataHora: string;
  operador: string;
  tipo: string;
  descricao: string;
  referencia: string;
  sucesso: boolean;
};

type LogsResp = {
  linhas: LinhaLog[];
  tipos: string[];
  operadores: string[];
  page?: number;
  totalPages?: number;
  total?: number;
};

type GrupoDuplicata = {
  chave: string;
  quantidade: number;
  ids: number[];
  datas: string[];
};

type DuplicatasResp = {
  aPartirDe: string;
  totalGrupos: number;
  totalLinhasDuplicadas: number;
  grupos: GrupoDuplicata[];
};

export default function LogPage() {
  const [tipos, setTipos] = useState<string[]>([]);
  const [operadores, setOperadores] = useState<string[]>([]);
  const [tipo, setTipo] = useState("");
  const [operador, setOperador] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [linhas, setLinhas] = useState<LinhaLog[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  const [dupAPartirDe, setDupAPartirDe] = useState("2026-09-01");
  const [dupGrupos, setDupGrupos] = useState<GrupoDuplicata[]>([]);
  const [dupResumo, setDupResumo] = useState({ totalGrupos: 0, totalLinhas: 0 });
  const [dupErro, setDupErro] = useState("");
  const [dupCarregando, setDupCarregando] = useState(false);

  async function carregar(pagina = page) {
    setCarregando(true);
    setErro("");
    const q = new URLSearchParams({ page: String(pagina), pageSize: "50" });
    if (tipo) q.set("tipo", tipo);
    if (operador) q.set("operador", operador);
    if (dataInicio) q.set("dataInicio", dataInicio);
    if (dataFim) q.set("dataFim", dataFim);
    const res = await apiGet<LogsResp>(`/api/logs?${q}`);
    if (res.error) {
      setErro(res.error);
      setLinhas([]);
    } else if (res.data) {
      setLinhas(asArray(res.data.linhas));
      setPage(res.data.page || pagina);
      setTotalPages(res.data.totalPages || 1);
      setTotal(res.data.total || 0);
      if (res.data.tipos?.length) setTipos(res.data.tipos);
      if (res.data.operadores?.length) setOperadores(res.data.operadores);
    }
    setCarregando(false);
  }

  async function carregarDuplicatas() {
    setDupCarregando(true);
    setDupErro("");
    const q = new URLSearchParams({ duplicatas: "1", aPartirDe: dupAPartirDe });
    const res = await apiGet<DuplicatasResp>(`/api/gestao/duplicatas-vendas?${q}`);
    if (res.error) {
      setDupErro(res.error);
      setDupGrupos([]);
      setDupResumo({ totalGrupos: 0, totalLinhas: 0 });
    } else if (res.data) {
      setDupGrupos(asArray(res.data.grupos));
      setDupResumo({
        totalGrupos: res.data.totalGrupos || 0,
        totalLinhas: res.data.totalLinhasDuplicadas || 0,
      });
      if (res.data.aPartirDe) setDupAPartirDe(res.data.aPartirDe);
    }
    setDupCarregando(false);
  }

  useEffect(() => {
    carregar();
    carregarDuplicatas();
    // carga inicial
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AppShell title="Log de operações">
      <p className="muted">Quem inseriu, editou ou consultou, e o que foi feito. Mais recentes primeiro (até 300).</p>
      <div className="filters">
        <div className="field">
          <label>Tipo</label>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="">Todos</option>
            {tipos.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Operador</label>
          <select value={operador} onChange={(e) => setOperador(e.target.value)}>
            <option value="">Todos</option>
            {operadores.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>De</label>
          <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
        </div>
        <div className="field">
          <label>Até</label>
          <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
        </div>
        <button className="btn" onClick={() => { setPage(1); carregar(1); }} disabled={carregando}>
          {carregando ? "Carregando…" : "Filtrar"}
        </button>
      </div>
      {erro && <p className="msg-erro">{erro}</p>}
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Data/hora</th>
              <th>Operador</th>
              <th>Tipo</th>
              <th>Descrição</th>
              <th>Referência</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id}>
                <td>{l.dataHora}</td>
                <td>{l.operador}</td>
                <td>{l.tipo}</td>
                <td>{l.descricao}</td>
                <td>{l.referencia}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!carregando && linhas.length === 0 && <p className="muted">Nenhum registro neste filtro.</p>}
      <PaginacaoBar
        page={page}
        totalPages={totalPages}
        total={total}
        disabled={carregando}
        onPage={(p) => {
          setPage(p);
          carregar(p);
        }}
      />

      <hr style={{ margin: "2rem 0" }} />

      <h2 style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>Vendas duplicadas</h2>
      <p className="muted">
        Grupos com mesma data, SKU, unidade, vendedor, quantidade e valor — verificados a partir da data informada
        (dados legados anteriores podem repetir sem alerta).
      </p>
      <div className="filters">
        <div className="field">
          <label>Verificar a partir de</label>
          <input type="date" value={dupAPartirDe} onChange={(e) => setDupAPartirDe(e.target.value)} />
        </div>
        <button className="btn" onClick={carregarDuplicatas} disabled={dupCarregando}>
          {dupCarregando ? "Verificando…" : "Verificar duplicatas"}
        </button>
      </div>
      {dupErro && <p className="msg-erro">{dupErro}</p>}
      {!dupCarregando && dupResumo.totalGrupos > 0 && (
        <p className="muted">
          {dupResumo.totalGrupos} grupo(s) · {dupResumo.totalLinhas} linha(s) envolvidas
        </p>
      )}
      {dupGrupos.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Qtd</th>
                <th>IDs</th>
                <th>Datas</th>
                <th>Chave</th>
              </tr>
            </thead>
            <tbody>
              {dupGrupos.map((g) => (
                <tr key={g.chave}>
                  <td>{g.quantidade}</td>
                  <td>{g.ids.join(", ")}</td>
                  <td>{g.datas.join(", ")}</td>
                  <td style={{ fontSize: "0.85rem" }}>{g.chave}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!dupCarregando && dupGrupos.length === 0 && !dupErro && (
        <p className="muted">Nenhuma duplicata encontrada neste período.</p>
      )}
    </AppShell>
  );
}
