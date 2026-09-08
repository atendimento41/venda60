"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { formatMoeda, asArray } from "@/lib/client";

type Loja = { unidade: string; quantidade: number; enviado: boolean; lancado: boolean };
type Linha = {
  sku: string;
  descricao: string;
  nomeUnik: string;
  categoria: string;
  fotoUrl: string;
  preco: number;
  custo: number;
  sugestaoVenda?: number;
  geral: number;
  qtdLancada: number;
  qtdJaEnviada: number;
  restanteLancamento: number;
  podeEnviar: number;
  lojas: Loja[];
};

function numInput(s: string) {
  return Number(String(s || "").replace(",", ".")) || 0;
}

export default function UnikGeralPage() {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [lojas, setLojas] = useState<string[]>([]);
  const [destinos, setDestinos] = useState<Record<string, Record<string, string>>>({});
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [salvando, setSalvando] = useState("");
  const [editSku, setEditSku] = useState("");
  const [custos, setCustos] = useState<Record<string, string>>({});
  const [sugestoes, setSugestoes] = useState<Record<string, string>>({});
  const [retUnidade, setRetUnidade] = useState("GERAL");
  const [retQtd, setRetQtd] = useState("");
  const [trOrigem, setTrOrigem] = useState("");
  const [trDestino, setTrDestino] = useState("");
  const [trQtd, setTrQtd] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [filtroPreco, setFiltroPreco] = useState("nao");
  const [filtroSugestao, setFiltroSugestao] = useState("");
  const [filtroCusto, setFiltroCusto] = useState("");
  const [filtroEstoque, setFiltroEstoque] = useState("gt0");
  const [buscaItem, setBuscaItem] = useState("");
  const [buscaUnik, setBuscaUnik] = useState("");

  async function carregar() {
    const d = await fetch("/api/unik?tipo=geral").then((r) => r.json());
    if (d?.error) {
      setErro(d.error);
      return;
    }
    const lista = asArray(d.linhas) as Linha[];
    setLinhas(lista);
    setLojas(asArray(d.lojas) as string[]);
    setCustos((prev) => {
      const next: Record<string, string> = {};
      for (const l of lista) {
        next[l.sku] =
          prev[l.sku] !== undefined
            ? prev[l.sku]
            : l.custo > 0
              ? formatMoeda(l.custo)
              : "";
      }
      return next;
    });
    setSugestoes((prev) => {
      const next: Record<string, string> = {};
      for (const l of lista) {
        next[l.sku] =
          prev[l.sku] !== undefined
            ? prev[l.sku]
            : (l.sugestaoVenda || 0) > 0
              ? formatMoeda(l.sugestaoVenda || 0)
              : "";
      }
      return next;
    });
    setDestinos((prev) => {
      const next: Record<string, Record<string, string>> = {};
      for (const l of lista) {
        next[l.sku] = Object.fromEntries(
          (asArray(d.lojas) as string[]).map((u) => [u, prev[l.sku]?.[u] || ""])
        );
      }
      return next;
    });
  }

  useEffect(() => {
    carregar();
  }, []);

  const categorias = useMemo(() => {
    const set = new Set(linhas.map((l) => l.categoria).filter(Boolean));
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [linhas]);

  const filtradas = useMemo(() => {
    const qItem = buscaItem.trim().toUpperCase();
    const qUnik = buscaUnik.trim().toUpperCase();
    return linhas.filter((l) => {
      if (filtroCategoria && l.categoria !== filtroCategoria) return false;
      if (filtroPreco === "nao" && l.preco > 0) return false;
      if (filtroPreco === "sim" && !(l.preco > 0)) return false;
      if (filtroSugestao === "nao" && (l.sugestaoVenda || 0) > 0) return false;
      if (filtroSugestao === "sim" && !((l.sugestaoVenda || 0) > 0)) return false;
      if (filtroCusto === "nao" && l.custo > 0) return false;
      if (filtroCusto === "sim" && !(l.custo > 0)) return false;
      if (filtroEstoque === "gt0" && !(l.geral > 0)) return false;
      if (filtroEstoque === "eq0" && l.geral > 0) return false;
      if (qItem && !(l.descricao || "").toUpperCase().includes(qItem)) return false;
      if (qUnik && !(l.nomeUnik || "").toUpperCase().includes(qUnik)) return false;
      return true;
    });
  }, [linhas, filtroCategoria, filtroPreco, filtroSugestao, filtroCusto, filtroEstoque, buscaItem, buscaUnik]);

  async function post(body: Record<string, unknown>, fechar = false) {
    setErro("");
    setMsg("");
    const res = await fetch("/api/unik", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const dataRes = await res.json();
    if (!res.ok) {
      setErro(dataRes.error || "Falha");
      return false;
    }
    setMsg(dataRes.message);
    await carregar();
    if (fechar) setEditSku("");
    return true;
  }

  async function salvarCustoSugestao(sku: string) {
    setSalvando(`cs:${sku}`);
    const ok = await post({
      acao: "custo-sugestao",
      sku,
      custo: custos[sku] ?? "",
      sugestaoVenda: sugestoes[sku] ?? "",
    });
    setSalvando("");
    if (ok) {
      setCustos((p) => {
        const n = { ...p };
        delete n[sku];
        return n;
      });
      setSugestoes((p) => {
        const n = { ...p };
        delete n[sku];
        return n;
      });
    }
  }

  async function distribuir(l: Linha) {
    const dest = destinos[l.sku] || {};
    const lista = lojas
      .map((u) => ({ unidade: u, quantidade: Math.floor(numInput(dest[u])) }))
      .filter((d) => d.quantidade > 0);
    const total = lista.reduce((s, d) => s + d.quantidade, 0);
    if (total > l.podeEnviar) {
      setErro(
        `Lançado: ${l.qtdLancada}. Já enviado: ${l.qtdJaEnviada}. Só pode enviar mais ${l.podeEnviar}.`
      );
      return;
    }
    setSalvando(`dist:${l.sku}`);
    await post({ acao: "distribuir", sku: l.sku, destinos: lista }, true);
    setSalvando("");
  }

  async function toggleStatus(sku: string, unidade: string, campo: "enviado" | "lancado", valor: boolean) {
    setSalvando(`st:${sku}:${unidade}`);
    await post({ acao: "loja-status", sku, unidade, [campo]: valor });
    setSalvando("");
  }

  function saldoUnidade(l: Linha, unidade: string) {
    if (unidade === "GERAL") return l.geral;
    return l.lojas.find((j) => j.unidade === unidade)?.quantidade || 0;
  }

  async function retirar(l: Linha) {
    const qtd = Math.floor(numInput(retQtd));
    if (qtd <= 0) {
      setErro("Informe a quantidade retirada do 60.");
      return;
    }
    if (qtd > saldoUnidade(l, retUnidade)) {
      setErro("A retirada não pode ser maior que o estoque dessa unidade.");
      return;
    }
    setSalvando(`ret:${l.sku}`);
    const ok = await post({ acao: "retirar", sku: l.sku, unidade: retUnidade, quantidade: qtd });
    setSalvando("");
    if (ok) setRetQtd("");
  }

  async function transferir(l: Linha) {
    const qtd = Math.floor(numInput(trQtd));
    if (!trOrigem || !trDestino) {
      setErro("Informe de onde sai e para onde vai.");
      return;
    }
    if (qtd <= 0) {
      setErro("Informe a quantidade a transferir.");
      return;
    }
    if (qtd > saldoUnidade(l, trOrigem)) {
      setErro("A transferência não pode ser maior que o estoque da origem.");
      return;
    }
    setSalvando(`tr:${l.sku}`);
    const ok = await post({
      acao: "transferir",
      sku: l.sku,
      origem: trOrigem,
      destino: trDestino,
      quantidade: qtd,
    });
    setSalvando("");
    if (ok) setTrQtd("");
  }

  const locais = ["GERAL", ...lojas];
  function nomeLocal(u: string) {
    return u === "GERAL" ? "Depósito" : u;
  }

  return (
    <AppShell title="Movimentação estoque">
      <p className="muted">
        O lançamento vinculado entra no depósito. Clique em Editar para enviar às lojas,
        retirar do 60 ou transferir de uma unidade para outra. O preço final é definido no
        Cadastro de itens.
      </p>

      <div className="filters">
        <div className="field">
          <label>Categoria</label>
          <select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)}>
            <option value="">Todas</option>
            {categorias.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Preço do item</label>
          <select value={filtroPreco} onChange={(e) => setFiltroPreco(e.target.value)}>
            <option value="nao">Sem preço</option>
            <option value="sim">Com preço</option>
            <option value="">Todos</option>
          </select>
        </div>
        <div className="field">
          <label>Sugestão de preço</label>
          <select value={filtroSugestao} onChange={(e) => setFiltroSugestao(e.target.value)}>
            <option value="">Todas</option>
            <option value="nao">Sem sugestão</option>
            <option value="sim">Com sugestão</option>
          </select>
        </div>
        <div className="field">
          <label>Custo</label>
          <select value={filtroCusto} onChange={(e) => setFiltroCusto(e.target.value)}>
            <option value="">Todos</option>
            <option value="nao">Sem custo</option>
            <option value="sim">Com custo</option>
          </select>
        </div>
        <div className="field">
          <label>Depósito</label>
          <select value={filtroEstoque} onChange={(e) => setFiltroEstoque(e.target.value)}>
            <option value="gt0">Maior que 0</option>
            <option value="eq0">Igual a 0</option>
            <option value="">Todos</option>
          </select>
        </div>
        <div className="field">
          <label>Nome item</label>
          <input value={buscaItem} onChange={(e) => setBuscaItem(e.target.value)} placeholder="Buscar item" />
        </div>
        <div className="field">
          <label>Nome UNIK</label>
          <input value={buscaUnik} onChange={(e) => setBuscaUnik(e.target.value)} placeholder="Buscar UNIK" />
        </div>
      </div>

      {msg && <p className="msg-ok">{msg}</p>}
      {erro && <p className="msg-erro">{erro}</p>}

      {filtradas.length === 0 ? (
        <p className="muted">
          {linhas.length === 0
            ? "Nenhum UNIK 3D lançado ou no depósito."
            : "Nenhum item neste filtro. Troque depósito, preço, sugestão ou custo."}
        </p>
      ) : (
        filtradas.map((l) => {
          const aberto = editSku === l.sku;
          const semPreco = !(l.preco > 0);
          const dest = destinos[l.sku] || {};
          const totalDigitado = lojas.reduce((s, u) => s + Math.floor(numInput(dest[u])), 0);
          const estoura = totalDigitado > l.podeEnviar;
          return (
            <section key={l.sku} className="dash-card" style={{ marginBottom: 12 }}>
              <div className="btn-row" style={{ alignItems: "flex-start" }}>
                {l.fotoUrl ? <img className="foto-thumb" src={l.fotoUrl} alt="" /> : null}
                <div style={{ flex: 1 }}>
                  <h2 style={{ margin: 0 }}>{l.descricao}</h2>
                  <p className="muted" style={{ margin: "6px 0 0" }}>
                    {l.nomeUnik ? <span>UNIK: {l.nomeUnik} · </span> : null}
                    Depósito: <strong>{l.geral}</strong>
                    {` · Lançado: ${l.qtdLancada}`}
                    {l.categoria ? ` · ${l.categoria}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  className={aberto ? "btn btn-secondary" : "btn"}
                  onClick={() => {
                    setEditSku(aberto ? "" : l.sku);
                    setRetUnidade("GERAL");
                    setRetQtd("");
                    setTrOrigem(l.lojas.find((j) => j.quantidade > 0)?.unidade || "GERAL");
                    setTrDestino("");
                    setTrQtd("");
                  }}
                >
                  {aberto ? "Fechar" : "Editar"}
                </button>
              </div>

              <div className="filters" style={{ marginTop: 12 }}>
                <div className="field">
                  <label>Custo</label>
                  <input
                    value={custos[l.sku] ?? ""}
                    onChange={(e) => setCustos((p) => ({ ...p, [l.sku]: e.target.value }))}
                    inputMode="decimal"
                    placeholder="0,00"
                  />
                </div>
                <div className="field">
                  <label>Sugestão de preço</label>
                  <input
                    value={sugestoes[l.sku] ?? ""}
                    onChange={(e) => setSugestoes((p) => ({ ...p, [l.sku]: e.target.value }))}
                    inputMode="decimal"
                    placeholder="0,00"
                  />
                </div>
                <div className="field">
                  <label>Preço final</label>
                  <input value={l.preco > 0 ? `R$ ${formatMoeda(l.preco)}` : "—"} readOnly />
                </div>
                <button
                  type="button"
                  className="btn"
                  disabled={salvando === `cs:${l.sku}`}
                  onClick={() => salvarCustoSugestao(l.sku)}
                >
                  {salvando === `cs:${l.sku}` ? "…" : "Salvar custo / sugestão"}
                </button>
              </div>
              {semPreco && (
                <p className="aviso">
                  Cadastre o preço final no Cadastro de itens antes de enviar às lojas.
                </p>
              )}

              {aberto && (
                <>
                  <p className="muted">
                    Lançado: <strong>{l.qtdLancada}</strong> · Já enviado: <strong>{l.qtdJaEnviada}</strong> · Pode
                    enviar agora: <strong>{l.podeEnviar}</strong>
                    {totalDigitado > 0 ? ` · Digitado: ${totalDigitado}` : ""}
                  </p>
                  {estoura && (
                    <p className="msg-erro">
                      O total digitado ({totalDigitado}) passa do limite do lançamento ({l.podeEnviar}).
                    </p>
                  )}

                  <div style={{ overflowX: "auto", marginTop: 12 }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Unidade</th>
                          <th className="num">Estoque</th>
                          <th className="num">Qtd enviada</th>
                          <th>Enviado</th>
                          <th>Lançado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {l.lojas.map((j) => (
                          <tr key={j.unidade}>
                            <td>{j.unidade}</td>
                            <td className="num">{j.quantidade}</td>
                            <td>
                              <input
                                className="table-input"
                                value={dest[j.unidade] || ""}
                                onChange={(e) =>
                                  setDestinos((p) => ({
                                    ...p,
                                    [l.sku]: { ...(p[l.sku] || {}), [j.unidade]: e.target.value },
                                  }))
                                }
                                inputMode="numeric"
                                placeholder="0"
                                disabled={semPreco || l.podeEnviar <= 0}
                              />
                            </td>
                            <td>
                              <input
                                type="checkbox"
                                checked={j.enviado}
                                disabled={salvando.startsWith(`st:${l.sku}`)}
                                onChange={(e) => toggleStatus(l.sku, j.unidade, "enviado", e.target.checked)}
                              />
                            </td>
                            <td>
                              <input
                                type="checkbox"
                                checked={j.lancado}
                                disabled={salvando.startsWith(`st:${l.sku}`)}
                                onChange={(e) => toggleStatus(l.sku, j.unidade, "lancado", e.target.checked)}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="btn-row" style={{ marginTop: 10 }}>
                    <button
                      className="btn"
                      disabled={semPreco || estoura || totalDigitado <= 0 || salvando === `dist:${l.sku}`}
                      onClick={() => distribuir(l)}
                    >
                      {salvando === `dist:${l.sku}` ? "Enviando…" : "Enviar para as lojas"}
                    </button>
                  </div>

                  <div className="grid-2" style={{ marginTop: 18 }}>
                    <section>
                      <h2>Retirar do 60</h2>
                      <p className="muted">O item saiu da 60 (UNIK retirou). Não volta para o depósito nem para outra loja.</p>
                      <div className="field">
                        <label>De onde sai</label>
                        <select value={retUnidade} onChange={(e) => setRetUnidade(e.target.value)}>
                          {locais.map((u) => (
                            <option key={u} value={u}>
                              {nomeLocal(u)} ({saldoUnidade(l, u)})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="field">
                        <label>Quantidade</label>
                        <input value={retQtd} onChange={(e) => setRetQtd(e.target.value)} inputMode="numeric" placeholder="0" />
                      </div>
                      <button
                        className="btn btn-secondary"
                        disabled={salvando === `ret:${l.sku}` || saldoUnidade(l, retUnidade) <= 0}
                        onClick={() => retirar(l)}
                      >
                        {salvando === `ret:${l.sku}` ? "…" : "Retirar do 60"}
                      </button>
                    </section>
                    <section>
                      <h2>Mudar de unidade</h2>
                      <p className="muted">O item continua na 60, só troca de loja ou volta ao depósito.</p>
                      <div className="field">
                        <label>De</label>
                        <select value={trOrigem} onChange={(e) => setTrOrigem(e.target.value)}>
                          <option value="">Selecione</option>
                          {locais.map((u) => (
                            <option key={u} value={u}>
                              {nomeLocal(u)} ({saldoUnidade(l, u)})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="field">
                        <label>Para</label>
                        <select value={trDestino} onChange={(e) => setTrDestino(e.target.value)}>
                          <option value="">Selecione</option>
                          {locais
                            .filter((u) => u !== trOrigem)
                            .map((u) => (
                              <option key={u} value={u}>
                                {nomeLocal(u)} ({saldoUnidade(l, u)})
                              </option>
                            ))}
                        </select>
                      </div>
                      <div className="field">
                        <label>Quantidade</label>
                        <input value={trQtd} onChange={(e) => setTrQtd(e.target.value)} inputMode="numeric" placeholder="0" />
                      </div>
                      <button
                        className="btn"
                        disabled={salvando === `tr:${l.sku}` || !trOrigem || !trDestino}
                        onClick={() => transferir(l)}
                      >
                        {salvando === `tr:${l.sku}` ? "…" : "Transferir"}
                      </button>
                    </section>
                  </div>
                </>
              )}
            </section>
          );
        })
      )}
    </AppShell>
  );
}
