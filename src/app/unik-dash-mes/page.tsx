"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import BarChart, { TrendChart } from "@/components/BarChart";
import ExportPdfButton from "@/components/ExportPdfButton";
import { KpiCard, KpiGrid } from "@/components/KpiCard";import { formatMoeda, mesAtualISO, UNIK_MES_INICIO_DADOS, UNIDADES } from "@/lib/client";

type TopItem = {
  sku: string;
  descricao: string;
  quantidade: number;
  totalVendido: number;
  lucroUnik: number;
  lucro60: number;
};

type Mes = {
  mes: string;
  label: string;
  totalVendido: number;
  lucroUnik: number;
  lucro60: number;
  quantidade: number;
};

type Totais = {
  quantidade: number;
  totalVendido: number;
  custoUnik: number;
  custo60: number;
  lucroUnik: number;
  lucro60: number;
};

type MesEnc = { mes: string; label: string; lucro60: number; quantidade: number };

export default function UnikDashMesPage() {
  const hoje = mesAtualISO();
  const [mesInicio, setMesInicio] = useState(UNIK_MES_INICIO_DADOS);
  const [mesFim, setMesFim] = useState(hoje);
  const [unidade, setUnidade] = useState("");
  const [janela, setJanela] = useState("");
  const [totais, setTotais] = useState<Totais | null>(null);
  const [totaisEncomenda, setTotaisEncomenda] = useState<Totais | null>(null);
  const [topItens, setTopItens] = useState<TopItem[]>([]);
  const [porMes, setPorMes] = useState<Mes[]>([]);
  const [porMesEncomenda, setPorMesEncomenda] = useState<MesEnc[]>([]);
  const [encomendasSemCusto, setEncomendasSemCusto] = useState(0);
  const [encomendasQtd, setEncomendasQtd] = useState(0);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function carregar() {
    setErro("");
    setCarregando(true);
    const q = new URLSearchParams({ tipo: "dash-mes", mesInicio, mesFim });
    if (unidade) q.set("unidade", unidade);
    const d = await fetch(`/api/unik?${q}`).then((r) => r.json());
    setCarregando(false);
    if (d?.error) {
      setErro(d.error);
      return;
    }
    setJanela(d.janela || d.janela12 || "");
    setTotais(d.totais || null);
    setTotaisEncomenda(d.totaisEncomenda || null);
    setTopItens(Array.isArray(d.topItens) ? d.topItens : []);
    setPorMes(Array.isArray(d.porMes) ? d.porMes : []);
    setPorMesEncomenda(Array.isArray(d.porMesEncomenda) ? d.porMesEncomenda : []);
    setEncomendasSemCusto(Number(d.encomendasSemCusto) || 0);
    setEncomendasQtd(Number(d.encomendasQtd) || 0);
  }

  useEffect(() => {
    carregar();
  }, []);

  const subtitulo = ["UNIK 3D", janela, unidade || "Todas as unidades"].filter(Boolean).join(" · ");
  const yMaxValores = Math.max(...porMes.flatMap((m) => [m.lucroUnik, m.lucro60]), 0.01);
  const custoUnikZerado = Boolean(totais && totais.custoUnik === 0 && totais.totalVendido > 0);

  return (
    <AppShell title="UNIK · Dashboard mês">
      <p className="muted">
        Dois mundos diferentes: <strong>Valores UNIK / 60</strong> = vendas UNIK 3D da loja (Meep).{" "}
        <strong>Encomenda 60</strong> = lançamentos com status Encomenda (mesmo cálculo do Relatório
        encomendas: maior entre custo e sugestão × quantidade). Encomenda não entra nos gráficos de
        venda.
      </p>

      <div className="filters">
        <div className="field">
          <label>Mês inicial</label>
          <input type="month" value={mesInicio} onChange={(e) => setMesInicio(e.target.value)} />
        </div>
        <div className="field">
          <label>Mês final</label>
          <input type="month" value={mesFim} onChange={(e) => setMesFim(e.target.value)} />
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
      <div className="btn-row">
        <button className="btn" onClick={carregar} disabled={carregando}>
          {carregando ? "Carregando…" : "Carregar dashboard"}
        </button>
        <ExportPdfButton
          titulo="UNIK · Dashboard mês"
          subtitulo={subtitulo}
          colunas={["Item", "SKU", "Qtd", "Total vendido", "Valores UNIK", "Valores 60"]}
          linhas={topItens.map((i) => [
            i.descricao,
            i.sku,
            i.quantidade,
            `R$ ${formatMoeda(i.totalVendido)}`,
            `R$ ${formatMoeda(i.lucroUnik)}`,
            `R$ ${formatMoeda(i.lucro60)}`,
          ])}
          extras={[
            {
              titulo: `Por mês${janela ? ` (${janela})` : ""}`,
              colunas: ["Mês", "Qtd", "Total vendido", "Valores UNIK", "Valores 60"],
              linhas: porMes.map((m) => [
                m.label,
                m.quantidade,
                `R$ ${formatMoeda(m.totalVendido)}`,
                `R$ ${formatMoeda(m.lucroUnik)}`,
                `R$ ${formatMoeda(m.lucro60)}`,
              ]),
            },
            {
              titulo: `Encomenda 60${janela ? ` (${janela})` : ""}`,
              colunas: ["Mês", "Qtd", "Encomenda 60"],
              linhas: porMesEncomenda.map((m) => [
                m.label,
                m.quantidade,
                `R$ ${formatMoeda(m.lucro60)}`,
              ]),
            },
          ]}
          rodape={
            totais
              ? `${janela || "Período"}: Qtd ${totais.quantidade} | Total R$ ${formatMoeda(totais.totalVendido)} | Custo UNIK R$ ${formatMoeda(totais.custoUnik)} | Custo 60 R$ ${formatMoeda(totais.custo60)} | Valores UNIK R$ ${formatMoeda(totais.lucroUnik)} | Valores 60 R$ ${formatMoeda(totais.lucro60)}${
                  totaisEncomenda
                    ? ` | Encomenda 60 R$ ${formatMoeda(totaisEncomenda.lucro60)}`
                    : ""
                }`
              : undefined
          }
          disabled={!totais}
        />
      </div>
      {erro && <p className="msg-erro">{erro}</p>}
      {custoUnikZerado && (
        <p className="aviso">
          Custo UNIK está R$ 0,00 no período. Por isso fev–jul os dois gráficos coincidem: custo 60 também é 0 e os dois viram metade da venda. Preencha o custo no cadastro ou no lançamento UNIK. Em agosto os 12% já deixam Valores 60 maior que Valores UNIK.
        </p>
      )}

      {totais && (
        <>
          <KpiGrid>
            <KpiCard
              label={`Total vendido${janela ? ` · ${janela}` : ""}`}
              value={totais.totalVendido}
              money
              tone="venda"
            />
            <KpiCard label="Itens vendidos" value={totais.quantidade} tone="default" />
            <KpiCard label="Custo UNIK" value={totais.custoUnik} money tone="custo" />
            <KpiCard label="Custo 60" value={totais.custo60} money tone="custo" />
            <KpiCard label="Valores UNIK" value={totais.lucroUnik} money tone="unik" />
            <KpiCard label="Valores 60" value={totais.lucro60} money tone="60" />
            <KpiCard label="Encomenda 60" value={totaisEncomenda?.lucro60 || 0} money tone="encomenda" />
          </KpiGrid>
          {encomendasSemCusto > 0 && (
            <p className="aviso">
              {encomendasSemCusto} lançamento(s) de encomenda ({encomendasQtd} un.) sem custo nem sugestão de
              venda — esses ficam fora do total Encomenda 60. Informe em{" "}
              <a href="/unik-editar-lancamento">Edição lançamento</a>.
            </p>
          )}

          <BarChart
            title="Itens que mais venderam"
            items={topItens.map((i) => ({
              label: i.descricao,
              value: i.quantidade,
              detailMoney: i.totalVendido,
            }))}
            money={false}
          />
          <TrendChart
            title="Vendas total por mês"
            labels={porMes.map((m) => m.label)}
            series={[{ name: "Vendas total", color: "#e11c24", values: porMes.map((m) => m.totalVendido) }]}
          />
          <TrendChart
            title="Valores 60 por mês"
            labels={porMes.map((m) => m.label)}
            series={[{ name: "Valores 60", color: "#e5b82e", values: porMes.map((m) => m.lucro60) }]}
            yMax={yMaxValores}
          />
          <TrendChart
            title="Valores UNIK por mês (vendas da loja · Meep)"
            labels={porMes.map((m) => m.label)}
            series={[{ name: "Valores UNIK", color: "#3fa34d", values: porMes.map((m) => m.lucroUnik) }]}
            yMax={yMaxValores}
          />
          <TrendChart
            title="Encomenda 60 (lançamentos Encomenda · igual ao relatório)"
            labels={porMesEncomenda.map((m) => m.label)}
            series={[{ name: "Encomenda 60", color: "#7c5cbf", values: porMesEncomenda.map((m) => m.lucro60) }]}
          />
        </>
      )}
    </AppShell>
  );
}
