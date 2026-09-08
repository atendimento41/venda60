"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import VendasPeriodoTable, { type VendaPeriodo } from "@/components/VendasPeriodoTable";
import { hojeISO, UNIDADES, asArray } from "@/lib/client";

export default function DiarioPage() {
  const [data, setData] = useState(hojeISO());
  const [unidade, setUnidade] = useState("");
  const [vendas, setVendas] = useState<VendaPeriodo[] | null>(null);

  async function carregar() {
    const q = new URLSearchParams({ tipo: "diario", data });
    if (unidade) q.set("unidade", unidade);
    const d = await fetch(`/api/relatorios?${q}`).then((r) => r.json());
    setVendas(asArray<VendaPeriodo>(d));
  }

  useEffect(() => {
    carregar();
  }, []);

  return (
    <AppShell title="Relatório Diário">
      <div className="filters">
        <div className="field">
          <label>Data</label>
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
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
      </div>
      <button className="btn" onClick={carregar}>
        Carregar
      </button>
      {vendas && <VendasPeriodoTable title="Relatório diário" linhas={vendas} />}
    </AppShell>
  );
}
