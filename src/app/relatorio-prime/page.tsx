"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import VendasPeriodoTable, { type VendaPeriodo } from "@/components/VendasPeriodoTable";
import FiltroItens, { anexarItensQuery, useOpcoesItens } from "@/components/FiltroItens";
import { hojeISO, UNIDADES, asArray } from "@/lib/client";

export default function RelatorioPrimePage() {
  const [dataInicio, setDataInicio] = useState(hojeISO().slice(0, 8) + "01");
  const [dataFim, setDataFim] = useState(hojeISO());
  const [unidade, setUnidade] = useState("");
  const [vendas, setVendas] = useState<VendaPeriodo[] | null>(null);
  const [itensSel, setItensSel] = useState<string[]>([]);
  const itensOpcoes = useOpcoesItens("/api/relatorios?tipo=itens&categoria=PRIME", itensSel, setItensSel);

  async function carregar() {
    const q = new URLSearchParams({ dataInicio, dataFim });
    if (unidade) q.set("unidade", unidade);
    anexarItensQuery(q, itensSel);
    const d = await fetch(`/api/prime?${q}`).then((r) => r.json());
    if (d && !d.error) setVendas(asArray<VendaPeriodo>(d.vendas));
  }

  useEffect(() => {
    carregar();
  }, []);

  return (
    <AppShell title="Relatório PRIME">
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
      {vendas && <VendasPeriodoTable title="Relatório PRIME" linhas={vendas} modoPrime />}
    </AppShell>
  );
}
