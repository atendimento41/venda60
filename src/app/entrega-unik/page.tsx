"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { formatMoeda, hojeISO, UNIDADES, asArray, comprimirFoto } from "@/lib/client";
import { useSubmitLock } from "@/lib/use-submit-lock";

type Mov = {
  id: number;
  dataFmt: string;
  status: string;
  tipo: string;
  unidade: string;
  nomeEntrega: string;
  descricaoItem: string;
  quantidade: number;
  fotoUrl?: string;
  custo?: number;
  sugestaoVenda?: number;
  recebidoPor?: string;
  categoria?: string;
};

type NomeAnterior = {
  nome: string;
  ultimaDataFmt: string;
  lancamentos: number;
  custo: number;
  sugestaoVenda: number;
  categoria: string;
  sku: string;
  descricaoItem: string;
  temFoto: boolean;
};

function chaveNome(s: string) {
  return s.toUpperCase().replace(/\s+/g, " ").trim();
}

function moneyInput(n: number | undefined) {
  const v = Number(n) || 0;
  return v ? formatMoeda(v) : "";
}

export default function EntregaUnikPage() {
  const [nome, setNome] = useState("");
  const [unidade, setUnidade] = useState("");
  const [quantidade, setQuantidade] = useState("1");
  const [status, setStatus] = useState("Entregue");
  const [data, setData] = useState(hojeISO());
  const [fotoUrl, setFotoUrl] = useState("");
  const [custo, setCusto] = useState("");
  const [sugestaoVenda, setSugestaoVenda] = useState("");
  const [recebidoPor, setRecebidoPor] = useState("");
  const [categoria, setCategoria] = useState("");
  const [novaCategoria, setNovaCategoria] = useState("");
  const [categorias, setCategorias] = useState<string[]>([]);
  const [hintDefaults, setHintDefaults] = useState("");
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");
  const [ultimaDataFmt, setUltimaDataFmt] = useState("");
  const [lancamentos, setLancamentos] = useState<Mov[]>([]);
  const [sugestoes, setSugestoes] = useState<NomeAnterior[]>([]);
  const [listaAberta, setListaAberta] = useState(false);
  const [ativoIdx, setAtivoIdx] = useState(0);
  const [escolhido, setEscolhido] = useState<NomeAnterior | null>(null);
  const [novoConfirmado, setNovoConfirmado] = useState(false);
  const { busy, run } = useSubmitLock();

  useEffect(() => {
    const q = nome.trim();
    if (escolhido || q.length < 2) {
      setSugestoes([]);
      return;
    }
    let cancelado = false;
    const t = setTimeout(async () => {
      const d = await fetch(`/api/unik?tipo=buscar-nome&q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .catch(() => null);
      if (cancelado) return;
      setSugestoes(asArray(d?.nomes) as NomeAnterior[]);
      setAtivoIdx(0);
    }, 250);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [nome, escolhido]);

  const existeIgual = sugestoes.some((s) => chaveNome(s.nome) === chaveNome(nome));
  const opcoesLista = nome.trim().length >= 2 ? sugestoes.length + (existeIgual ? 0 : 1) : 0;

  async function escolherAnterior(n: NomeAnterior) {
    setNome(n.nome);
    setEscolhido(n);
    setNovoConfirmado(false);
    setListaAberta(false);
    setHintDefaults("");
    setCusto(moneyInput(n.custo));
    setSugestaoVenda(moneyInput(n.sugestaoVenda));
    if (n.categoria) {
      setCategorias((prev) =>
        prev.includes(n.categoria)
          ? prev
          : [...prev, n.categoria].sort((a, b) => a.localeCompare(b, "pt-BR"))
      );
      setCategoria(n.categoria);
    }
    setFotoUrl("");
    if (n.temFoto) {
      const d = await fetch(`/api/unik?tipo=foto-nome&nome=${encodeURIComponent(n.nome)}`)
        .then((r) => r.json())
        .catch(() => null);
      if (d?.fotoUrl) setFotoUrl(String(d.fotoUrl));
    }
  }

  function escolherNovo() {
    setEscolhido(null);
    setNovoConfirmado(true);
    setListaAberta(false);
  }

  function escolherIdx(i: number) {
    if (i < sugestoes.length) void escolherAnterior(sugestoes[i]);
    else escolherNovo();
  }

  function onNomeKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!listaAberta || !opcoesLista) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAtivoIdx((i) => (i + 1) % opcoesLista);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAtivoIdx((i) => (i - 1 + opcoesLista) % opcoesLista);
    } else if (e.key === "Enter") {
      e.preventDefault();
      escolherIdx(ativoIdx);
    } else if (e.key === "Escape") {
      setListaAberta(false);
    }
  }

  async function carregarLancamentos() {
    const d = await fetch("/api/unik?tipo=lancamentos").then((r) => r.json());
    if (d?.error) {
      setErro(d.error);
      return;
    }
    setUltimaDataFmt(d.dataFmt || "");
    setLancamentos(asArray(d.lancamentos) as Mov[]);
    if (Array.isArray(d.categorias)) setCategorias(d.categorias as string[]);
  }

  useEffect(() => {
    carregarLancamentos();
  }, []);

  const nCustoZero = useMemo(
    () => lancamentos.filter((m) => !(Number(m.custo) > 0)).length,
    [lancamentos]
  );

  async function puxarDefaultsPorNome(nomeRaw: string) {
    const n = nomeRaw.trim();
    if (!n) {
      setHintDefaults("");
      return;
    }
    const d = await fetch(`/api/unik?tipo=defaults-nome&nome=${encodeURIComponent(n)}`).then((r) =>
      r.json()
    );
    if (d?.error || !d?.encontrou) {
      setHintDefaults("");
      return;
    }
    const c = Number(d.custo) || 0;
    const s = Number(d.sugestaoVenda) || 0;
    setCusto((prev) => (prev.trim() ? prev : moneyInput(c)));
    setSugestaoVenda((prev) => (prev.trim() ? prev : moneyInput(s)));
    setHintDefaults(
      `Pré-preenchido com custo/sugestão de outros lançamentos com o mesmo nome. Confirme ao registrar.`
    );
  }

  async function onFotoLancamento(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setErro("");
    try {
      setFotoUrl(await comprimirFoto(file));
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao anexar foto");
    }
  }

  async function criarCategoriaAgora() {
    const n = novaCategoria.trim();
    if (!n) {
      setErro("Informe o nome da nova categoria.");
      return;
    }
    setErro("");
    const res = await fetch("/api/unik", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "criar-categoria", nome: n }),
    });
    const dataRes = await res.json();
    if (!res.ok) {
      setErro(dataRes.error || "Falha ao criar categoria");
      return;
    }
    const nomeCriado = String(dataRes.nome || n);
    setCategorias((prev) =>
      prev.includes(nomeCriado) ? prev : [...prev, nomeCriado].sort((a, b) => a.localeCompare(b, "pt-BR"))
    );
    setCategoria(nomeCriado);
    setNovaCategoria("");
    setMsg(dataRes.message || `Categoria “${nomeCriado}” pronta.`);
  }

  async function lancar() {
    await run(async () => {
      setErro("");
      setMsg("");
      if (!nome.trim()) {
        setErro("Informe o nome como veio da UNIK.");
        return;
      }
      let cat = categoria.trim();
      if (!cat && novaCategoria.trim()) {
        const resCat = await fetch("/api/unik", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ acao: "criar-categoria", nome: novaCategoria.trim() }),
        });
        const dataCat = await resCat.json();
        if (!resCat.ok) {
          setErro(dataCat.error || "Falha ao criar categoria");
          return;
        }
        cat = String(dataCat.nome || novaCategoria.trim());
      }
      const res = await fetch("/api/unik", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: nome.trim(),
          sku: escolhido?.sku || undefined,
          unidade,
          quantidade: Number(String(quantidade).replace(",", ".")),
          status,
          data,
          fotoUrl,
          custo,
          sugestaoVenda,
          recebidoPor,
          categoria: cat,
        }),
      });
      const dataRes = await res.json();
      if (!res.ok) {
        setErro(dataRes.error || "Falha ao lançar");
        return;
      }
      setMsg(dataRes.message);
      setNome("");
      setEscolhido(null);
      setNovoConfirmado(false);
      setQuantidade("1");
      setFotoUrl("");
      setCusto("");
      setSugestaoVenda("");
      setHintDefaults("");
      setNovaCategoria("");
      carregarLancamentos();
    });
  }

  return (
    <AppShell title="UNIK · Lançar">
      <p className="muted">
        Só para registrar o lançamento. Para alterar quem recebeu, custo, sugestão, foto, categoria ou excluir, use{" "}
        <Link href="/unik-editar-lancamento">Edição lançamento</Link>.
      </p>

      <section>
        <h2>Entrega ou retirada</h2>
        <div className="grid-2">
          <div>
            <div className="field busca-nome">
              <label>Nome UNIK</label>
              <input
                value={nome}
                onChange={(e) => {
                  setNome(e.target.value);
                  setEscolhido(null);
                  setNovoConfirmado(false);
                  setHintDefaults("");
                  setListaAberta(true);
                }}
                onFocus={() => setListaAberta(true)}
                onKeyDown={onNomeKeyDown}
                onBlur={() => {
                  setListaAberta(false);
                  if (escolhido) return;
                  const igual = sugestoes.find((s) => chaveNome(s.nome) === chaveNome(nome));
                  if (igual) void escolherAnterior(igual);
                  else void puxarDefaultsPorNome(nome);
                }}
                placeholder="Digite para buscar um item já entregue ou cadastrar novo"
                autoComplete="off"
              />
              {listaAberta && opcoesLista > 0 && (
                <ul className="busca-nome-lista" role="listbox">
                  {sugestoes.map((s, i) => (
                    <li
                      key={s.nome}
                      role="option"
                      aria-selected={i === ativoIdx}
                      className={i === ativoIdx ? "ativo" : ""}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        void escolherAnterior(s);
                      }}
                      onMouseEnter={() => setAtivoIdx(i)}
                    >
                      <strong>{s.nome}</strong>
                      <small>
                        {s.sku ? `${s.sku} · ${s.descricaoItem}` : "sem item vinculado"} · {s.lancamentos} lanç. · último{" "}
                        {s.ultimaDataFmt || "—"} · custo R$ {formatMoeda(s.custo)} · sugestão R${" "}
                        {formatMoeda(s.sugestaoVenda)}
                      </small>
                    </li>
                  ))}
                  {!existeIgual && (
                    <li
                      role="option"
                      aria-selected={ativoIdx === sugestoes.length}
                      className={`novo${ativoIdx === sugestoes.length ? " ativo" : ""}`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        escolherNovo();
                      }}
                      onMouseEnter={() => setAtivoIdx(sugestoes.length)}
                    >
                      + Novo item: “{nome.trim()}”
                    </li>
                  )}
                </ul>
              )}
              {escolhido ? (
                <p className="busca-nome-escolhido">
                  Já entregue antes ({escolhido.lancamentos} lanç., último {escolhido.ultimaDataFmt || "—"}). Custo,
                  sugestão, categoria e foto vieram do lançamento anterior — confira e ajuste a quantidade.{" "}
                  {escolhido.sku ? (
                    <>
                      Entra no item <strong>{escolhido.sku} · {escolhido.descricaoItem}</strong> e o estoque atualiza ao
                      registrar.
                    </>
                  ) : (
                    <>
                      Ainda sem item vinculado: depois vincule em <Link href="/unik-vincular">Vincular</Link>.
                    </>
                  )}
                  {status === "Encomenda" ? " Na encomenda o custo é o total do lançamento (o preenchido é por unidade)." : ""}
                </p>
              ) : novoConfirmado ? (
                <p className="busca-nome-escolhido">
                  Item novo. Depois de registrar, vincule este nome a um item do estoque em{" "}
                  <Link href="/unik-vincular">Vincular</Link>.
                </p>
              ) : null}
              {hintDefaults ? <p className="muted">{hintDefaults}</p> : null}
            </div>
            <div className="field">
              <label>Quem recebeu</label>
              <input
                value={recebidoPor}
                onChange={(e) => setRecebidoPor(e.target.value)}
                placeholder="Nome de quem recebeu"
              />
            </div>
            <div className="field">
              <label>Categoria UNIK</label>
              <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                <option value="">Sem categoria</option>
                {categorias.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Nova categoria (só UNIK)</label>
              <div className="btn-row">
                <input
                  value={novaCategoria}
                  onChange={(e) => setNovaCategoria(e.target.value)}
                  placeholder="Ex.: Chaveiros"
                  style={{ flex: 1 }}
                />
                <button type="button" className="btn btn-secondary" onClick={() => void criarCategoriaAgora()}>
                  Criar
                </button>
              </div>
            </div>
            <div className="field">
              <label>Unidade</label>
              <select value={unidade} onChange={(e) => setUnidade(e.target.value)}>
                <option value="">Selecione</option>
                {UNIDADES.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Data</label>
              <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
            <div className="field">
              <label>Quantidade</label>
              <input value={quantidade} onChange={(e) => setQuantidade(e.target.value)} inputMode="numeric" />
            </div>
          </div>
          <div>
            <div className="field">
              <label>Custo UNIK</label>
              <input
                value={custo}
                onChange={(e) => setCusto(e.target.value)}
                inputMode="decimal"
                placeholder="0,00"
              />
              <p className="muted">
                {status === "Encomenda"
                  ? "Opcional na encomenda: custo total que a 60 paga à UNIK (entra no gráfico Encomenda 60). Sem custo o gráfico fica em R$ 0."
                  : "Se deixar vazio, o custo fica 0. Com o mesmo nome de outro lançamento, preenche sozinho ao sair do campo nome."}
              </p>
            </div>
            <div className="field">
              <label>Sugestão de preço</label>
              <input
                value={sugestaoVenda}
                onChange={(e) => setSugestaoVenda(e.target.value)}
                inputMode="decimal"
                placeholder="0,00"
              />
              <p className="muted">Não é o preço final. O preço do item se define na Movimentação estoque.</p>
            </div>
            <div className="field">
              <label>Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="Entregue">Entregue (depois do vínculo, vai ao depósito)</option>
                <option value="Retirado">Retirado (depois do vínculo, sai do depósito)</option>
                <option value="Encomenda">Encomenda (não mexe no estoque)</option>
              </select>
            </div>
            <div className="field">
              <label>Foto</label>
              <input type="file" accept="image/*" onChange={onFotoLancamento} />
            </div>
            {fotoUrl && (
              <div className="foto-preview">
                <img src={fotoUrl} alt="Prévia" />
                <button type="button" className="btn btn-secondary" onClick={() => setFotoUrl("")}>
                  Remover foto
                </button>
              </div>
            )}
          </div>
        </div>
        <button className="btn" onClick={lancar} disabled={busy}>
          {busy ? "Registrando…" : "Registrar"}
        </button>
        {msg && <p className="msg-ok">{msg}</p>}
        {erro && <p className="msg-erro">{erro}</p>}
      </section>

      <h2 style={{ marginTop: 28 }}>Lançamentos de {ultimaDataFmt || "hoje"}</h2>
      <p className="muted">
        Somente conferência da última data.{nCustoZero ? ` ${nCustoZero} com custo 0.` : ""} Para editar ou excluir, abra{" "}
        <Link href="/unik-editar-lancamento">Edição lançamento</Link>.
      </p>
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Foto</th>
              <th>Data</th>
              <th>Unidade</th>
              <th>Status</th>
              <th>Categoria</th>
              <th>Nome UNIK</th>
              <th>Quem recebeu</th>
              <th className="num">Custo</th>
              <th className="num">Sugestão preço</th>
              <th className="num">Qtd</th>
            </tr>
          </thead>
          <tbody>
            {lancamentos.length === 0 ? (
              <tr>
                <td colSpan={10} className="muted">
                  Nenhum lançamento nesta data.
                </td>
              </tr>
            ) : (
              lancamentos.map((m) => (
                <tr key={m.id} className={!(Number(m.custo) > 0) ? "mov-sem-sku" : ""}>
                  <td>{m.fotoUrl ? <img className="foto-thumb" src={m.fotoUrl} alt="" /> : "—"}</td>
                  <td>{m.dataFmt}</td>
                  <td>{m.unidade || "—"}</td>
                  <td>{m.status || m.tipo}</td>
                  <td>{m.categoria || "—"}</td>
                  <td>
                    {m.nomeEntrega}
                    {m.descricaoItem ? (
                      <small className="muted" style={{ display: "block" }}>
                        {m.descricaoItem}
                      </small>
                    ) : null}
                  </td>
                  <td>{m.recebidoPor || "—"}</td>
                  <td className="num">R$ {formatMoeda(m.custo || 0)}</td>
                  <td className="num">R$ {formatMoeda(m.sugestaoVenda || 0)}</td>
                  <td className="num">{m.quantidade}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
