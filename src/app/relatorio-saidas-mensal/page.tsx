"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import ExportPdfButton from "@/components/ExportPdfButton";
import { mesAtualISO, asArray } from "@/lib/client";

type LinhaSaida = {
  unidade: string;
  sku: string;
  item: string;
  categoria: string;
  subcategoria: string;
  estoqueInicio: number;
  saidas: number;
  estoqueFinal: number;
};

export default function SaidasMensalPage() {
  const [opcoes, setOpcoes] = useState<{ unidades: string[]; categoriasRaw: Record<string, string[]> }>({ unidades: [], categoriasRaw: {} });
  const [mes, setMes] = useState(mesAtualISO());
  const [unidade, setUnidade] = useState("");
  const [categoria, setCategoria] = useState("");
  const [subcategoria, setSubcategoria] = useState("");
  const [somenteComSaida, setSomenteComSaida] = useState("1");
  const [res, setRes] = useState<{ mesRotulo: string; linhas: LinhaSaida[]; totalSaidas: number; totalEstoqueInicio: number; totalEstoqueFinal: number } | null>(null);

  useEffect(() => {
    fetch("/api/estoque?opcoes=1").then((r) => r.json()).then(setOpcoes);
  }, []);

  async function carregar() {
    const q = new URLSearchParams({ tipo: "saidas-mensal", mes, somenteComSaida });
    if (unidade) q.set("unidade", unidade);
    if (categoria) q.set("categoria", categoria);
    if (subcategoria) q.set("subcategoria", subcategoria);
    const d = await fetch(`/api/relatorios?${q}`).then((r) => r.json());
    if (d && !d.error && Array.isArray(d.linhas)) setRes(d);
  }

  useEffect(() => { carregar(); }, []);

  return (
    <AppShell title="Relatório de Saídas Mensais">
      <div className="filters">
        <div className="field"><label>Mês</label><input type="month" value={mes} onChange={(e) => setMes(e.target.value)} /></div>
        <div className="field"><label>Unidade</label>
          <select value={unidade} onChange={(e) => setUnidade(e.target.value)}>
            <option value="">Todas</option>
            {opcoes.unidades.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div className="field"><label>Categoria</label>
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="">Todas</option>
            {Object.keys(opcoes.categoriasRaw).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="field"><label>Subcategoria</label>
          <select value={subcategoria} onChange={(e) => setSubcategoria(e.target.value)}>
            <option value="">Todas</option>
            {(opcoes.categoriasRaw[categoria] || []).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="field"><label>Exibição</label>
          <select value={somenteComSaida} onChange={(e) => setSomenteComSaida(e.target.value)}>
            <option value="1">Somente com saída</option>
            <option value="0">Todos</option>
          </select>
        </div>
      </div>
      <div className="btn-row">
        <button className="btn" onClick={carregar}>Carregar</button>
        <ExportPdfButton
          titulo="Relatório de Saídas Mensais"
          subtitulo={res?.mesRotulo || mes}
          colunas={["Unidade", "SKU", "Item", "Categoria", "Sub", "Início", "Saídas", "Final"]}
          linhas={(res?.linhas || []).map((l) => [
            l.unidade,
            l.sku,
            l.item,
            l.categoria,
            l.subcategoria,
            l.estoqueInicio,
            l.saidas,
            l.estoqueFinal,
          ])}
          rodape={
            res
              ? `Saídas: ${res.totalSaidas} | Início total: ${res.totalEstoqueInicio} | Final total: ${res.totalEstoqueFinal}`
              : undefined
          }
          disabled={!res || asArray(res.linhas).length === 0}
        />
      </div>
      {res && (
        <>
          <p className="muted" style={{ textAlign: "center" }}>Período: {res.mesRotulo}</p>
          <table style={{ marginTop: 16 }}>
            <thead><tr><th>Unidade</th><th>SKU</th><th>Item</th><th>Categoria</th><th>Sub</th><th className="num">Início</th><th className="num">Saídas</th><th className="num">Final</th></tr></thead>
            <tbody>
              {asArray<LinhaSaida>(res.linhas).map((l, i) => (
                <tr key={i}>
                  <td>{l.unidade}</td><td>{l.sku}</td><td>{l.item}</td><td>{l.categoria}</td><td>{l.subcategoria}</td>
                  <td className="num">{l.estoqueInicio}</td><td className="num">{l.saidas}</td><td className="num">{l.estoqueFinal}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="totals">
            Saídas: {res.totalSaidas} | Início total: {res.totalEstoqueInicio} | Final total: {res.totalEstoqueFinal}
          </div>
        </>
      )}
    </AppShell>
  );
}
