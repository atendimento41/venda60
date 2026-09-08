"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { formatMoeda, asArray } from "@/lib/client";

type ItemUnik = { sku: string; descricao: string; unik3d: boolean; fotoUrl?: string; preco?: number };
type Pendente = {
  nome: string;
  quantidade: number;
  dataFmt: string;
  sugestaoNome: string;
  sugestaoSku: string;
  fotoUnik?: string;
};
type Vinculo = {
  nome: string;
  sku: string;
  descricaoItem: string;
  quantidade: number;
  dataFmt: string;
  encomenda: boolean;
  fotoUnik?: string;
  fotoItem?: string;
  fotoUrl?: string;
  custoLancamento?: number;
  sugestaoLancamento?: number;
  custoItem?: number;
  sugestaoItem?: number;
};

function SelectItem({
  itens,
  value,
  onChange,
}: {
  itens: ItemUnik[];
  value: string;
  onChange: (sku: string) => void;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Selecione o item</option>
      {itens.map((i) => (
        <option key={i.sku} value={i.sku}>
          {i.descricao} ({i.sku}) — R$ {formatMoeda(i.preco || 0)}
        </option>
      ))}
    </select>
  );
}

function FotoCell({ src, label }: { src?: string; label: string }) {
  if (!src) return <span className="muted">—</span>;
  return <img className="foto-thumb" src={src} alt={label} title={label} />;
}

export default function UnikVincularPage() {
  const [itens, setItens] = useState<ItemUnik[]>([]);
  const [pendentes, setPendentes] = useState<Pendente[]>([]);
  const [vinculos, setVinculos] = useState<Vinculo[]>([]);
  const [skuVinculo, setSkuVinculo] = useState<Record<string, string>>({});
  const [marcados, setMarcados] = useState<Record<string, boolean>>({});
  const [skuLote, setSkuLote] = useState("");
  const [encomenda, setEncomenda] = useState(false);
  const [custoEncomenda, setCustoEncomenda] = useState("");
  const [skuCorrigir, setSkuCorrigir] = useState<Record<string, string>>({});
  const [filtro, setFiltro] = useState<"pendentes" | "vinculados">("pendentes");
  const [buscaUnik, setBuscaUnik] = useState("");
  const [buscaItem, setBuscaItem] = useState("");
  const [pagina, setPagina] = useState(1);
  const [vinculando, setVinculando] = useState("");
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");
  const POR_PAGINA = 20;

  async function carregar() {
    const [itensRes, pendRes, vincRes] = await Promise.all([
      fetch("/api/unik?tipo=itens").then((r) => r.json()),
      fetch("/api/unik?tipo=pendentes").then((r) => r.json()),
      fetch("/api/unik?tipo=vinculos").then((r) => r.json()),
    ]);
    if (itensRes?.error) {
      setErro(itensRes.error);
      return;
    }
    if (pendRes?.error) {
      setErro(pendRes.error);
      return;
    }
    if (vincRes?.error) {
      setErro(vincRes.error);
      return;
    }
    setItens(asArray(itensRes));
    const lista = asArray(pendRes.nomesPendentes) as Pendente[];
    setPendentes(lista);
    setSkuVinculo((prev) => {
      const next = { ...prev };
      for (const p of lista) {
        if (p.sugestaoSku) next[p.nome] = p.sugestaoSku;
      }
      return next;
    });
    const ligados = asArray(vincRes.vinculos) as Vinculo[];
    setVinculos(ligados);
    setSkuCorrigir(Object.fromEntries(ligados.map((v) => [v.nome, v.sku])));
    setMarcados({});
  }

  useEffect(() => {
    carregar();
  }, []);

  useEffect(() => {
    setPagina(1);
  }, [filtro, buscaUnik, buscaItem]);

  const qUnik = buscaUnik.trim().toUpperCase();
  const qItem = buscaItem.trim().toUpperCase();

  const pendentesFiltrados = useMemo(() => {
    return pendentes.filter((p) => {
      if (qUnik && !p.nome.toUpperCase().includes(qUnik)) return false;
      if (qItem) {
        const sku = skuVinculo[p.nome] || p.sugestaoSku || "";
        const item = itens.find((i) => i.sku === sku);
        const hay = `${p.sugestaoNome || ""} ${item?.descricao || ""} ${sku}`.toUpperCase();
        if (!hay.includes(qItem)) return false;
      }
      return true;
    });
  }, [pendentes, qUnik, qItem, skuVinculo, itens]);

  const vinculosFiltrados = useMemo(() => {
    return vinculos.filter((v) => {
      if (qUnik && !v.nome.toUpperCase().includes(qUnik)) return false;
      if (qItem) {
        const hay = `${v.descricaoItem || ""} ${v.sku || ""}`.toUpperCase();
        if (!hay.includes(qItem)) return false;
      }
      return true;
    });
  }, [vinculos, qUnik, qItem]);

  const listaAtual = filtro === "pendentes" ? pendentesFiltrados : vinculosFiltrados;
  const totalPaginas = Math.max(1, Math.ceil(listaAtual.length / POR_PAGINA));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const inicio = (paginaSegura - 1) * POR_PAGINA;
  const pendentesPagina = filtro === "pendentes" ? pendentesFiltrados.slice(inicio, inicio + POR_PAGINA) : [];
  const vinculosPagina = filtro === "vinculados" ? vinculosFiltrados.slice(inicio, inicio + POR_PAGINA) : [];

  const nomesMarcados = useMemo(
    () => pendentes.filter((p) => marcados[p.nome]).map((p) => p.nome),
    [pendentes, marcados]
  );

  async function postVincular(body: Record<string, unknown>) {
    setErro("");
    setMsg("");
    const res = await fetch("/api/unik", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const dataRes = await res.json();
    if (!res.ok) {
      setErro(dataRes.error || "Falha ao vincular");
      return false;
    }
    setMsg(dataRes.message);
    await carregar();
    return true;
  }

  async function vincular(nomeItem: string) {
    if (encomenda) {
      setVinculando(nomeItem);
      await postVincular({
        acao: "vincular",
        nome: nomeItem,
        encomenda: true,
        custo: custoEncomenda,
      });
      setVinculando("");
      return;
    }
    const sku = skuVinculo[nomeItem];
    if (!sku) {
      setErro("Escolha o item do estoque para vincular.");
      return;
    }
    setVinculando(nomeItem);
    await postVincular({ acao: "vincular", nome: nomeItem, sku, encomenda: false });
    setVinculando("");
  }

  async function vincularSelecionados() {
    if (!nomesMarcados.length) {
      setErro("Marque pelo menos um nome.");
      return;
    }
    if (encomenda) {
      if (nomesMarcados.length > 1) {
        setErro("Para encomenda, marque um nome por vez e informe o custo total dele (se houver).");
        return;
      }
      setVinculando("__lote__");
      await postVincular({
        acao: "vincular",
        nomes: nomesMarcados,
        encomenda: true,
        custo: custoEncomenda,
      });
      setVinculando("");
      return;
    }
    if (!skuLote) {
      setErro("Escolha o item do estoque para os marcados.");
      return;
    }
    setVinculando("__lote__");
    await postVincular({ acao: "vincular", nomes: nomesMarcados, sku: skuLote, encomenda: false });
    setVinculando("");
    setSkuLote("");
  }

  async function corrigir(nome: string) {
    const sku = skuCorrigir[nome];
    if (!sku) {
      setErro("Escolha o item correto para consertar o vínculo.");
      return;
    }
    setVinculando(`corr:${nome}`);
    await postVincular({ acao: "vincular", nome, sku });
    setVinculando("");
  }

  async function desvincular(nome: string) {
    if (!confirm(`Desfazer o vínculo de “${nome}”? O nome volta para pendentes.`)) return;
    setVinculando(`off:${nome}`);
    await postVincular({ acao: "desvincular", nome });
    setVinculando("");
  }

  const itemSel = (sku: string) => itens.find((i) => i.sku === sku);
  const todosPagina =
    pendentesPagina.length > 0 && pendentesPagina.every((p) => marcados[p.nome]);

  function Pager() {
    if (listaAtual.length <= POR_PAGINA) {
      return (
        <p className="muted">
          {listaAtual.length} {listaAtual.length === 1 ? "item" : "itens"}
        </p>
      );
    }
    return (
      <div className="btn-row" style={{ margin: "12px 0" }}>
        <button className="btn btn-secondary" disabled={paginaSegura <= 1} onClick={() => setPagina(paginaSegura - 1)}>
          Anterior
        </button>
        <span className="muted">
          Página {paginaSegura} de {totalPaginas} · {listaAtual.length} itens
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
    <AppShell title="UNIK · Vincular">
      <p className="muted">
        Marque vários nomes para o mesmo item. Encomenda: 60 paga a UNIK o custo total, sem 50% de venda e sem mexer no
        estoque — preço do item não é necessário.
      </p>
      {msg && <p className="msg-ok">{msg}</p>}
      {erro && <p className="msg-erro">{erro}</p>}

      <div className="filters">
        <div className="field">
          <label>Situação</label>
          <select
            value={filtro}
            onChange={(e) => setFiltro(e.target.value as "pendentes" | "vinculados")}
          >
            <option value="pendentes">Não vinculados ({pendentes.length})</option>
            <option value="vinculados">Vinculados ({vinculos.length})</option>
          </select>
        </div>
        <div className="field">
          <label>Nome UNIK</label>
          <input
            value={buscaUnik}
            onChange={(e) => setBuscaUnik(e.target.value)}
            placeholder="Buscar nome UNIK"
          />
        </div>
        <div className="field">
          <label>Nome item</label>
          <input
            value={buscaItem}
            onChange={(e) => setBuscaItem(e.target.value)}
            placeholder="Buscar nome do item"
          />
        </div>
      </div>

      {filtro === "pendentes" ? (
        pendentesFiltrados.length === 0 ? (
          <p className="muted">
            {qUnik || qItem ? "Nenhum pendente com essa busca." : "Nenhum nome pendente de vínculo."}
          </p>
        ) : (
          <>
            <div className="vincular-toolbar">
              {!encomenda && (
                <div className="field" style={{ minWidth: 280, flex: 1 }}>
                  <label>Item para os marcados</label>
                  <SelectItem itens={itens} value={skuLote} onChange={setSkuLote} />
                </div>
              )}
              {encomenda && (
                <div className="field" style={{ minWidth: 180 }}>
                  <label>Custo total da encomenda (opcional)</label>
                  <input
                    value={custoEncomenda}
                    onChange={(e) => setCustoEncomenda(e.target.value)}
                    inputMode="decimal"
                    placeholder="0,00"
                  />
                </div>
              )}
              <label className="check-inline">
                <input type="checkbox" checked={encomenda} onChange={(e) => setEncomenda(e.target.checked)} />
                Encomenda (custo total, 60 paga)
              </label>
              <button className="btn" disabled={vinculando === "__lote__"} onClick={vincularSelecionados}>
                {vinculando === "__lote__"
                  ? "Vinculando…"
                  : encomenda
                    ? `Marcar encomenda (${nomesMarcados.length})`
                    : `Vincular selecionados (${nomesMarcados.length})`}
              </button>
            </div>
            {encomenda && (
              <p className="aviso">
                Encomenda não liga a nenhum item do estoque — preço de venda não é necessário. O{" "}
                <strong>custo total</strong> (valor que a 60 paga à UNIK) é opcional; sem custo o gráfico Encomenda 60
                fica em R$ 0. Marque um nome por vez. Estoque não é alterado.
              </p>
            )}
            <Pager />
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        checked={todosPagina}
                        onChange={(e) => {
                          const on = e.target.checked;
                          setMarcados((prev) => {
                            const next = { ...prev };
                            for (const p of pendentesPagina) next[p.nome] = on;
                            return next;
                          });
                        }}
                        aria-label="Marcar esta página"
                      />
                    </th>
                    <th>Foto UNIK</th>
                    <th>Nome UNIK</th>
                    <th className="num">Quantidade</th>
                    <th>Dia da entrega</th>
                    {!encomenda && <th>Foto item</th>}
                    {!encomenda && <th>Item do estoque</th>}
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {pendentesPagina.map((p) => {
                    const skuSel = skuVinculo[p.nome] || p.sugestaoSku || "";
                    const sel = itemSel(skuSel);
                    return (
                      <tr key={p.nome} className="mov-sem-sku">
                        <td>
                          <input
                            type="checkbox"
                            checked={Boolean(marcados[p.nome])}
                            onChange={(e) => setMarcados((prev) => ({ ...prev, [p.nome]: e.target.checked }))}
                            aria-label={`Marcar ${p.nome}`}
                          />
                        </td>
                        <td>
                          <FotoCell src={p.fotoUnik} label={`UNIK ${p.nome}`} />
                        </td>
                        <td>{p.nome}</td>
                        <td className="num">{p.quantidade}</td>
                        <td>{p.dataFmt || "—"}</td>
                        {!encomenda && (
                          <td>
                            <FotoCell src={sel?.fotoUrl} label={sel?.descricao || "Item"} />
                          </td>
                        )}
                        {!encomenda && (
                          <td>
                            <SelectItem
                              itens={itens}
                              value={skuSel}
                              onChange={(sku) => setSkuVinculo((prev) => ({ ...prev, [p.nome]: sku }))}
                            />
                            {sel ? (
                              <small className="muted" style={{ display: "block", marginTop: 6 }}>
                                Preço de venda do item: R$ {formatMoeda(sel.preco || 0)}
                              </small>
                            ) : null}
                          </td>
                        )}
                        <td>
                          <button className="btn" disabled={vinculando === p.nome} onClick={() => vincular(p.nome)}>
                            {vinculando === p.nome ? "Vinculando…" : encomenda ? "Encomenda" : "Vincular"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pager />
          </>
        )
      ) : vinculosFiltrados.length === 0 ? (
        <p className="muted">
          {qUnik || qItem ? "Nenhum vinculado com essa busca." : "Nenhum vínculo encontrado."}
        </p>
      ) : (
        <>
          <p className="muted">
            Se o vínculo estiver errado, troque o item e salve, ou desfaça para o nome voltar aos pendentes. Custo e
            sugestão do lançamento vs. cadastro do item — quando vários nomes UNIK apontam ao mesmo item, o cadastro usa o
            maior valor.
          </p>
          <Pager />
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Foto UNIK</th>
                  <th>Nome UNIK</th>
                  <th className="num">Quantidade</th>
                  <th>Dia da entrega</th>
                  <th>Foto item</th>
                  <th>Item do estoque</th>
                  <th className="num">Custo lanç.</th>
                  <th className="num">Sugestão lanç.</th>
                  <th className="num">Custo cadastro</th>
                  <th className="num">Sugestão cadastro</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {vinculosPagina.map((v) => {
                  const skuAtual = skuCorrigir[v.nome] || v.sku;
                  const sel = itemSel(skuAtual);
                  const fotoItem = v.encomenda ? "" : sel?.fotoUrl || v.fotoItem || v.fotoUrl || "";
                  return (
                    <tr key={v.nome}>
                      <td>
                        <FotoCell src={v.fotoUnik} label={`UNIK ${v.nome}`} />
                      </td>
                      <td>
                        {v.nome}
                        {v.encomenda ? (
                          <small className="muted" style={{ display: "block" }}>
                            Encomenda · sem item · custo total
                          </small>
                        ) : null}
                      </td>
                      <td className="num">{v.quantidade}</td>
                      <td>{v.dataFmt}</td>
                      <td>
                        {v.encomenda ? (
                          <span className="muted">—</span>
                        ) : (
                          <FotoCell src={fotoItem} label={sel?.descricao || v.descricaoItem || "Item"} />
                        )}
                      </td>
                      <td>
                        {v.encomenda ? (
                          <span className="muted">Sem item</span>
                        ) : (
                          <>
                            <SelectItem
                              itens={itens}
                              value={skuAtual}
                              onChange={(sku) => setSkuCorrigir((prev) => ({ ...prev, [v.nome]: sku }))}
                            />
                            {sel ? (
                              <small className="muted" style={{ display: "block", marginTop: 6 }}>
                                {sel.descricao} ({sel.sku})
                              </small>
                            ) : null}
                          </>
                        )}
                      </td>
                      <td className="num">
                        {v.encomenda ? "—" : `R$ ${formatMoeda(v.custoLancamento || 0)}`}
                      </td>
                      <td className="num">
                        {v.encomenda ? "—" : `R$ ${formatMoeda(v.sugestaoLancamento || 0)}`}
                      </td>
                      <td className="num">
                        {v.encomenda ? (
                          "—"
                        ) : (
                          <span
                            className={
                              (v.custoItem || 0) > 0 &&
                              (v.custoLancamento || 0) > 0 &&
                              Math.abs((v.custoItem || 0) - (v.custoLancamento || 0)) > 0.01
                                ? "msg-erro"
                                : undefined
                            }
                          >
                            R$ {formatMoeda(v.custoItem || 0)}
                          </span>
                        )}
                      </td>
                      <td className="num">
                        {v.encomenda ? "—" : `R$ ${formatMoeda(v.sugestaoItem || 0)}`}
                      </td>
                      <td>
                        <div className="btn-row">
                          {!v.encomenda && (
                            <button
                              className="btn"
                              disabled={vinculando === `corr:${v.nome}` || skuAtual === v.sku}
                              onClick={() => corrigir(v.nome)}
                            >
                              {vinculando === `corr:${v.nome}` ? "Salvando…" : "Corrigir"}
                            </button>
                          )}
                          <button
                            className="btn btn-secondary"
                            disabled={vinculando === `off:${v.nome}`}
                            onClick={() => desvincular(v.nome)}
                          >
                            {vinculando === `off:${v.nome}` ? "…" : "Desfazer"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pager />
        </>
      )}
    </AppShell>
  );
}
