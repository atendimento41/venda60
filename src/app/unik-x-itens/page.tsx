"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import ExportPdfButton from "@/components/ExportPdfButton";
import { asArray } from "@/lib/client";

type Linha = {
  nomeUnik: string;
  nomeItem: string;
  sku: string;
  fotoUrl: string;
  qtdUnik: number;
  qtdUnikItem: number;
  qtdVendida: number;
  estoqueAtual: number;
  estoque60: number;
  diferenca: number;
  divergente: boolean;
  outrosNomes: string[];
  ultimaEntrega: string;
  datasEntrega: string[];
  dataFmt: string;
};

export default function UnikXItensPage() {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [formula, setFormula] = useState("");
  const [buscaUnik, setBuscaUnik] = useState("");
  const [buscaItem, setBuscaItem] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [soDivergencia, setSoDivergencia] = useState(false);
  const [filtroVinculo, setFiltroVinculo] = useState<"" | "com" | "sem">("");
  const [pagina, setPagina] = useState(1);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const POR_PAGINA = 15;

  async function carregar() {
    setErro("");
    setCarregando(true);
    const d = await fetch("/api/unik?tipo=x-itens").then((r) => r.json());
    setCarregando(false);
    if (d?.error) {
      setErro(d.error);
      return;
    }
    setLinhas(asArray(d.linhas) as Linha[]);
    setFormula(d.formula || "");
  }

  useEffect(() => {
    carregar();
  }, []);

  useEffect(() => {
    setPagina(1);
  }, [buscaUnik, buscaItem, dataInicio, dataFim, soDivergencia, filtroVinculo]);

  const qUnik = buscaUnik.trim().toUpperCase();
  const qItem = buscaItem.trim().toUpperCase();

  const filtradas = useMemo(() => {
    return linhas.filter((l) => {
      if (qUnik && !l.nomeUnik.toUpperCase().includes(qUnik)) return false;
      if (qItem && !(l.nomeItem || "").toUpperCase().includes(qItem) && !(l.sku || "").toUpperCase().includes(qItem)) {
        return false;
      }
      if (soDivergencia && !l.divergente) return false;
      const vinculado = Boolean(l.sku && l.nomeItem);
      if (filtroVinculo === "com" && !vinculado) return false;
      if (filtroVinculo === "sem" && vinculado) return false;
      if (dataInicio || dataFim) {
        const datas = Array.isArray(l.datasEntrega) ? l.datasEntrega : [];
        const noPeriodo = datas.some((d) => {
          if (dataInicio && d < dataInicio) return false;
          if (dataFim && d > dataFim) return false;
          return true;
        });
        if (!noPeriodo) return false;
      }
      return true;
    });
  }, [linhas, qUnik, qItem, dataInicio, dataFim, soDivergencia, filtroVinculo]);

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const inicio = (paginaSegura - 1) * POR_PAGINA;
  const paginaAtual = filtradas.slice(inicio, inicio + POR_PAGINA);
  const nDiv = filtradas.filter((l) => l.divergente).length;

  function Pager() {
    if (filtradas.length <= POR_PAGINA) {
      return (
        <p className="muted">
          {filtradas.length} {filtradas.length === 1 ? "linha" : "linhas"}
          {nDiv ? ` · ${nDiv} com divergência` : ""}
        </p>
      );
    }
    return (
      <div className="btn-row" style={{ margin: "12px 0" }}>
        <button className="btn btn-secondary" disabled={paginaSegura <= 1} onClick={() => setPagina(paginaSegura - 1)}>
          Anterior
        </button>
        <span className="muted">
          Página {paginaSegura} de {totalPaginas} · {filtradas.length} linhas
          {nDiv ? ` · ${nDiv} com divergência` : ""}
        </span>
        <button
          className="btn btn-secondary"
          disabled={paginaSegura >= totalPaginas}
          onClick={() => setPagina(paginaSegura + 1)}
        >
          Próxima
        </button>
      </div>
    );
  }

  return (
    <AppShell title="UNIK · UNIK × itens">
      <p className="muted">
        Compara o nome UNIK com o item do estoque. Encomenda não entra. Qtd UNIK = entregas − retiradas. Estoque 60 =
        vendidos + saldo atual. Diferença = qtd UNIK − estoque 60. Abre pelos lançamentos mais recentes, 15 por página.
      </p>
      {formula && <p className="muted">{formula}</p>}

      <div className="filters">
        <div className="field">
          <label>Nome UNIK</label>
          <input value={buscaUnik} onChange={(e) => setBuscaUnik(e.target.value)} placeholder="Buscar nome UNIK" />
        </div>
        <div className="field">
          <label>Nome item</label>
          <input value={buscaItem} onChange={(e) => setBuscaItem(e.target.value)} placeholder="Buscar nome do item" />
        </div>
        <div className="field">
          <label>Entrega de</label>
          <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
        </div>
        <div className="field">
          <label>Entrega até</label>
          <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
        </div>
        <div className="field">
          <label>Vínculo</label>
          <select
            value={filtroVinculo}
            onChange={(e) => setFiltroVinculo(e.target.value as "" | "com" | "sem")}
          >
            <option value="">Todos</option>
            <option value="com">Com vínculo</option>
            <option value="sem">Sem vínculo</option>
          </select>
        </div>
        <div className="field">
          <label>Divergência</label>
          <select value={soDivergencia ? "sim" : ""} onChange={(e) => setSoDivergencia(e.target.value === "sim")}>
            <option value="">Todas</option>
            <option value="sim">Só onde qtd UNIK ≠ estoque 60</option>
          </select>
        </div>
      </div>
      <div className="btn-row">
        <button className="btn" onClick={carregar} disabled={carregando}>
          {carregando ? "Carregando…" : "Atualizar"}
        </button>
        <ExportPdfButton
          titulo="UNIK × itens"
          subtitulo={[
            qUnik && `UNIK: ${buscaUnik}`,
            qItem && `Item: ${buscaItem}`,
            dataInicio || dataFim ? `${dataInicio || "…"} a ${dataFim || "…"}` : "",
            filtroVinculo === "com" ? "Com vínculo" : filtroVinculo === "sem" ? "Sem vínculo" : "",
            soDivergencia ? "Só divergência" : "",
          ]
            .filter(Boolean)
            .join(" · ")}
          colunas={[
            "Data entrega",
            "Nome UNIK",
            "Nome item",
            "SKU",
            "Qtd vendida",
            "Qtd estoque",
            "Estoque 60",
            "Qtd UNIK",
            "Diferença",
          ]}
          linhas={filtradas.map((l) => [
            l.dataFmt,
            l.nomeUnik,
            l.nomeItem || "—",
            l.sku,
            l.qtdVendida,
            l.estoqueAtual,
            l.estoque60,
            l.qtdUnik,
            l.diferenca,
          ])}
          disabled={filtradas.length === 0}
        />
      </div>
      {erro && <p className="msg-erro">{erro}</p>}

      {linhas.length === 0 && !carregando ? (
        <p className="muted">Nenhum lançamento UNIK (fora encomenda) para comparar.</p>
      ) : filtradas.length === 0 ? (
        <p className="muted">Nenhuma linha com esse filtro.</p>
      ) : (
        <>
          <Pager />
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Foto</th>
                  <th>Data entrega</th>
                  <th>Nome UNIK</th>
                  <th>Nome item</th>
                  <th className="num">Qtd vendida</th>
                  <th className="num">Qtd estoque</th>
                  <th className="num">Estoque 60</th>
                  <th className="num">Qtd UNIK</th>
                  <th className="num">Diferença</th>
                </tr>
              </thead>
              <tbody>
                {paginaAtual.map((l) => (
                  <tr key={`${l.nomeUnik}-${l.sku}`} className={l.divergente ? "div-warn" : "div-ok"}>
                    <td>
                      {l.fotoUrl ? <img className="foto-thumb" src={l.fotoUrl} alt="" /> : <span className="muted">—</span>}
                    </td>
                    <td>{l.dataFmt}</td>
                    <td>
                      {l.nomeUnik}
                      {l.outrosNomes.length > 0 ? (
                        <small className="muted" style={{ display: "block" }}>
                          Também neste item: {l.outrosNomes.join(" · ")}
                        </small>
                      ) : null}
                    </td>
                    <td>
                      {l.nomeItem || <span className="muted">Sem vínculo</span>}
                      {l.sku ? (
                        <small className="muted" style={{ display: "block" }}>
                          {l.sku}
                        </small>
                      ) : null}
                    </td>
                    <td className="num">{l.qtdVendida}</td>
                    <td className="num">{l.estoqueAtual}</td>
                    <td className="num">{l.estoque60}</td>
                    <td className="num">{l.qtdUnik}</td>
                    <td className="num">{l.diferenca}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager />
        </>
      )}
    </AppShell>
  );
}
