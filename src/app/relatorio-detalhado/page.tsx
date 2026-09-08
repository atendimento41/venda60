"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import VendasPeriodoTable, { type VendaPeriodo } from "@/components/VendasPeriodoTable";
import { hojeISO, UNIDADES, asArray } from "@/lib/client";

export default function RelatorioDetalhadoPage() {
  const [dataInicio, setDataInicio] = useState(hojeISO());
  const [dataFim, setDataFim] = useState(hojeISO());
  const [unidade, setUnidade] = useState("");
  const [vendedor, setVendedor] = useState("");
  const [categoria, setCategoria] = useState("");
  const [subcategoria, setSubcategoria] = useState("");
  const [vendedores, setVendedores] = useState<string[]>([]);
  const [categorias, setCategorias] = useState<Record<string, string[]>>({});
  const [vendas, setVendas] = useState<VendaPeriodo[] | null>(null);

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

  async function carregar() {
    const q = new URLSearchParams({ tipo: "detalhado", dataInicio, dataFim });
    if (unidade) q.set("unidade", unidade);
    if (vendedor) q.set("vendedor", vendedor);
    if (categoria) q.set("categoria", categoria);
    if (subcategoria) q.set("subcategoria", subcategoria);
    const d = await fetch(`/api/relatorios?${q}`).then((r) => r.json());
    if (d && !d.error) setVendas(asArray<VendaPeriodo>(d.vendas));
  }

  return (
    <AppShell title="Relatório Detalhado">
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
          <label>Categoria (col F)</label>
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="">Todas</option>
            {Object.keys(categorias).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Subcategoria (col E)</label>
          <select value={subcategoria} onChange={(e) => setSubcategoria(e.target.value)}>
            <option value="">Todas</option>
            {(categorias[categoria] || Object.values(categorias).flat()).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>
      <button className="btn" onClick={carregar}>
        Carregar
      </button>
      {vendas && <VendasPeriodoTable title="Relatório detalhado" linhas={vendas} />}
    </AppShell>
  );
}
