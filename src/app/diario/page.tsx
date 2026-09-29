"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import VendasPeriodoTable, { type VendaPeriodo } from "@/components/VendasPeriodoTable";
import FiltroItens, { anexarItensQuery, useOpcoesItens } from "@/components/FiltroItens";
import { hojeISO, UNIDADES, asArray } from "@/lib/client";

export default function RelatorioSimplesPage() {
  const [dataInicio, setDataInicio] = useState(hojeISO());
  const [dataFim, setDataFim] = useState(hojeISO());
  const [unidade, setUnidade] = useState("");
  const [vendedor, setVendedor] = useState("");
  const [categoria, setCategoria] = useState("");
  const [subcategoria, setSubcategoria] = useState("");
  const [vendedores, setVendedores] = useState<string[]>([]);
  const [categorias, setCategorias] = useState<Record<string, string[]>>({});
  const [vendas, setVendas] = useState<VendaPeriodo[] | null>(null);
  const [itensSel, setItensSel] = useState<string[]>([]);
  const qItens = new URLSearchParams({ tipo: "itens" });
  if (unidade) qItens.set("unidade", unidade);
  if (categoria) qItens.set("categoria", categoria);
  if (subcategoria) qItens.set("subcategoria", subcategoria);
  const itensOpcoes = useOpcoesItens(`/api/relatorios?${qItens}`, itensSel, setItensSel);

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
    const q = new URLSearchParams({ tipo: "simples", dataInicio, dataFim });
    if (unidade) q.set("unidade", unidade);
    if (vendedor) q.set("vendedor", vendedor);
    if (categoria) q.set("categoria", categoria);
    if (subcategoria) q.set("subcategoria", subcategoria);
    anexarItensQuery(q, itensSel);
    const d = await fetch(`/api/relatorios?${q}`).then((r) => r.json());
    if (d && !d.error) setVendas(asArray<VendaPeriodo>(d.vendas));
  }

  useEffect(() => {
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const subs =
    categoria && categorias[categoria]
      ? categorias[categoria]
      : [...new Set(Object.values(categorias).flat())].sort();

  return (
    <AppShell title="Relatório simples">
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
        <FiltroItens
          opcoes={itensOpcoes.opcoes}
          carregando={itensOpcoes.carregando}
          selecionados={itensSel}
          onChange={setItensSel}
        />
      </div>
      <button className="btn" onClick={carregar}>
        Carregar
      </button>
      {vendas && (
        <VendasPeriodoTable title="Relatório simples" linhas={vendas} modo="simples" />
      )}
    </AppShell>
  );
}
