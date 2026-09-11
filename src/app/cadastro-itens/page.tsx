"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { formatMoeda, asArray, comprimirFoto, UNIDADES } from "@/lib/client";

type Item = {
  sku: string;
  descricao: string;
  categoriaDash: string;
  subcategoriaMeep: string;
  preco: number;
  custo: number;
  sugestaoVenda: number;
  nomeUnik: string;
  ativo: boolean;
  fotoUrl: string;
  ilimitado?: boolean;
  unidades?: string[];
  estoqueGeral?: number;
};

type PendenteUnik = {
  nome: string;
  quantidade: number;
  dataFmt: string;
  custo: number;
  sugestaoVenda: number;
  fotoUnik?: string;
};

const VAZIO = {
  sku: "",
  descricao: "",
  categoriaDash: "",
  subcategoriaMeep: "",
  preco: "",
  nomeUnik: "",
  ativo: true,
  fotoUrl: "",
  ilimitado: false,
  custo: 0,
  sugestaoVenda: 0,
  unidades: [] as string[],
  estoqueGeral: "",
  alocarAgora: {} as Record<string, string>,
};

function rotuloPhoto(s: string): boolean {
  const t = String(s || "")
    .trim()
    .toUpperCase();
  return t === "PHOTO" || t.startsWith("PHOTO ");
}

function unicos(valores: string[]) {
  return [...new Set(valores.map((v) => v.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "pt-BR")
  );
}

function ValorLeitura({ valor }: { valor: number }) {
  return (
    <div className="valor-leitura">
      R$ {formatMoeda(valor || 0)}
    </div>
  );
}

function normalizarBusca(s: string): string {
  return String(s || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toUpperCase();
}

export default function CadastroItensPage() {
  const [lista, setLista] = useState<Item[]>([]);
  const [pendentesUnik, setPendentesUnik] = useState<PendenteUnik[]>([]);
  const [form, setForm] = useState(VAZIO);
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");
  const [filtroNome, setFiltroNome] = useState("");
  const [filtroCat, setFiltroCat] = useState("");
  const [filtroSub, setFiltroSub] = useState("");
  const [filtroUnidade, setFiltroUnidade] = useState("");

  async function carregar() {
    const [itensRes, unikRes] = await Promise.all([
      fetch("/api/itens").then((r) => r.json()),
      fetch("/api/unik?tipo=pendentes&todos=1").then((r) => r.json()),
    ]);
    setLista(asArray(itensRes));
    setPendentesUnik(asArray(unikRes?.nomesPendentes) as PendenteUnik[]);
  }

  useEffect(() => {
    carregar();
  }, []);

  /** SKU-0007 > SKU-0006 — proxy de “mais recentemente adicionado”. */
  function ordemSku(sku: string): number {
    const m = /^SKU-(\d+)$/i.exec(sku);
    return m ? Number(m[1]) : 0;
  }

  const categorias = useMemo(() => {
    const vals = unicos(lista.map((i) => i.categoriaDash));
    if (form.categoriaDash && !vals.includes(form.categoriaDash)) vals.push(form.categoriaDash);
    return vals;
  }, [lista, form.categoriaDash]);

  const editando = Boolean(form.sku && lista.some((i) => i.sku === form.sku));

  const subcategorias = useMemo(() => {
    const daCat = lista
      .filter((i) => !form.categoriaDash || i.categoriaDash === form.categoriaDash)
      .map((i) => i.subcategoriaMeep);
    const vals = unicos(daCat.length ? daCat : lista.map((i) => i.subcategoriaMeep));
    if (form.subcategoriaMeep && !vals.includes(form.subcategoriaMeep)) {
      vals.push(form.subcategoriaMeep);
    }
    return vals;
  }, [lista, form.categoriaDash, form.subcategoriaMeep]);

  const categoriasFiltro = useMemo(
    () => unicos(lista.map((i) => i.categoriaDash)),
    [lista]
  );

  const subcategoriasFiltro = useMemo(() => {
    const base = lista.filter((i) => !filtroCat || i.categoriaDash === filtroCat);
    return unicos(base.map((i) => i.subcategoriaMeep));
  }, [lista, filtroCat]);

  const listaFiltrada = useMemo(() => {
    const nome = normalizarBusca(filtroNome);
    return lista
      .filter((i) => {
        if (nome) {
          const hay = normalizarBusca(
            [i.descricao, i.sku, i.nomeUnik, i.categoriaDash, i.subcategoriaMeep].join(" ")
          );
          if (!hay.includes(nome)) return false;
        }
        if (filtroCat && i.categoriaDash !== filtroCat) return false;
        if (filtroSub && i.subcategoriaMeep !== filtroSub) return false;
        if (filtroUnidade) {
          const u = i.unidades || [];
          // sem unidade marcada = todas as lojas → entra em qualquer filtro de unidade
          if (u.length > 0 && !u.includes(filtroUnidade)) return false;
        }
        return true;
      })
      .slice()
      .sort((a, b) => {
        const diff = ordemSku(b.sku) - ordemSku(a.sku);
        if (diff !== 0) return diff;
        return b.sku.localeCompare(a.sku, "pt-BR");
      });
  }, [lista, filtroNome, filtroCat, filtroSub, filtroUnidade]);

  const listaTabela = useMemo(() => listaFiltrada.slice(0, 20), [listaFiltrada]);
  const temMais = listaFiltrada.length > listaTabela.length;

  const opcoesUnik = useMemo(() => {
    const map = new Map<string, PendenteUnik>();
    for (const p of pendentesUnik) map.set(p.nome, p);
    if (form.nomeUnik && !map.has(form.nomeUnik)) {
      map.set(form.nomeUnik, {
        nome: form.nomeUnik,
        quantidade: 0,
        dataFmt: "",
        custo: form.custo,
        sugestaoVenda: form.sugestaoVenda,
      });
    }
    return [...map.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [pendentesUnik, form.nomeUnik, form.custo, form.sugestaoVenda]);

  const pendenteSelecionado = useMemo(
    () => opcoesUnik.find((p) => p.nome === form.nomeUnik),
    [opcoesUnik, form.nomeUnik]
  );

  const custoExibido = pendenteSelecionado?.custo ?? form.custo ?? 0;
  const sugestaoExibida = pendenteSelecionado?.sugestaoVenda ?? form.sugestaoVenda ?? 0;
  const photoIlimitado =
    rotuloPhoto(form.categoriaDash) || rotuloPhoto(form.subcategoriaMeep);

  function textoUnik3d(s: string): boolean {
    const t = String(s || "")
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();
    if (!t.includes("UNIK")) return false;
    return t.includes("3D") || /\b3\s*D\b/.test(t);
  }

  const ehItemUnik =
    Boolean(form.nomeUnik) ||
    textoUnik3d(form.subcategoriaMeep) ||
    textoUnik3d(form.categoriaDash);

  function selecionarUnik(nome: string) {
    const p = opcoesUnik.find((x) => x.nome === nome);
    setForm((f) => ({
      ...f,
      nomeUnik: nome,
      custo: p?.custo ?? 0,
      sugestaoVenda: p?.sugestaoVenda ?? 0,
      fotoUrl: f.fotoUrl || p?.fotoUnik || f.fotoUrl,
      descricao: f.descricao || nome,
      // só exibe saldo atual do depósito; UNIK não edita GERAL no cadastro
      estoqueGeral: p && p.quantidade > 0 ? String(p.quantidade) : f.estoqueGeral,
    }));
  }

  async function salvar() {
    setErro("");
    setMsg("");
    if (!form.categoriaDash || !form.subcategoriaMeep) {
      setErro("Selecione categoria e subcategoria.");
      return;
    }
    if (!form.descricao.trim()) {
      setErro("Informe a descrição do item.");
      return;
    }
    const alocacoes = Object.entries(form.alocarAgora)
      .map(([unidade, q]) => ({
        unidade,
        quantidade: Number(String(q).replace(",", ".")) || 0,
      }))
      .filter((a) => a.quantidade > 0);

    const estoqueGeralRaw = String(form.estoqueGeral || "").trim();
    const estoqueGeral =
      estoqueGeralRaw === "" ? undefined : Number(estoqueGeralRaw.replace(",", "."));

    const res = await fetch("/api/itens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sku: form.sku || undefined,
        descricao: form.descricao,
        categoriaDash: form.categoriaDash,
        subcategoriaMeep: form.subcategoriaMeep,
        preco: Number(String(form.preco).replace(",", ".")) || 0,
        ativo: form.ativo,
        fotoUrl: form.fotoUrl,
        ilimitado: form.ilimitado,
        nomeUnik: form.nomeUnik || undefined,
        unidades: form.unidades,
        estoqueGeral:
          form.ilimitado || photoIlimitado || ehItemUnik ? undefined : estoqueGeral,
        alocacoes:
          form.ilimitado || photoIlimitado || ehItemUnik ? undefined : alocacoes,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErro(data.error || "Falha ao salvar");
      return;
    }
    setMsg(data.message || "Item salvo.");
    setForm(VAZIO);
    carregar();
  }

  async function desativar(sku: string) {
    setErro("");
    setMsg("");
    const res = await fetch("/api/itens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sku, desativar: true }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErro(data.error || "Falha ao desativar");
      return;
    }
    setMsg(data.message || "Item desativado.");
    if (form.sku === sku) setForm(VAZIO);
    carregar();
  }

  async function excluir(sku: string) {
    if (
      !confirm(
        "Excluir este item definitivamente?\n\nSó funciona se não houver venda com esse SKU. Caso contrário, use Desativar."
      )
    ) {
      return;
    }
    setErro("");
    setMsg("");
    const res = await fetch("/api/itens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sku, excluir: true }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErro(data.error || "Falha ao excluir");
      return;
    }
    setMsg(data.message || "Item excluído.");
    if (form.sku === sku) setForm(VAZIO);
    carregar();
  }

  async function onFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setErro("");
    try {
      const dataUrl = await comprimirFoto(file);
      setForm((f) => ({ ...f, fotoUrl: dataUrl }));
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao anexar foto");
    }
  }

  function abrirItem(i: Item) {
    setForm({
      sku: i.sku,
      descricao: i.descricao,
      categoriaDash: i.categoriaDash,
      subcategoriaMeep: i.subcategoriaMeep,
      preco: String(i.preco),
      nomeUnik: i.nomeUnik || "",
      ativo: i.ativo,
      fotoUrl: i.fotoUrl || "",
      ilimitado: Boolean(i.ilimitado),
      custo: i.custo ?? 0,
      sugestaoVenda: i.sugestaoVenda ?? 0,
      unidades: i.unidades || [],
      estoqueGeral: i.estoqueGeral != null ? String(i.estoqueGeral) : "",
      alocarAgora: {},
    });
    setErro("");
    setMsg("");
  }

  function toggleUnidade(u: string) {
    setForm((f) => ({
      ...f,
      unidades: f.unidades.includes(u) ? f.unidades.filter((x) => x !== u) : [...f.unidades, u],
    }));
  }

  return (
    <AppShell title="Cadastro de Itens">
      <div className="grid-2">
        <section>
          <h2>{editando ? "Editar item" : "Novo item"}</h2>
          <div className="field">
            <label>Item UNIK</label>
            <select value={form.nomeUnik} onChange={(e) => selecionarUnik(e.target.value)}>
              <option value="">Sem vínculo UNIK</option>
              {opcoesUnik.map((p) => (
                <option key={p.nome} value={p.nome}>
                  {p.nome}
                  {p.quantidade > 0 ? ` · qtd ${p.quantidade}` : ""}
                  {p.dataFmt ? ` · ${p.dataFmt}` : ""}
                </option>
              ))}
            </select>
            <p className="muted">
              Selecione um nome UNIK para vincular ao salvar. Lista todos os nomes já lançados.
            </p>
          </div>
          <div className="field">
            <label>Descrição</label>
            <input
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Categoria</label>
            <select
              value={form.categoriaDash}
              onChange={(e) =>
                setForm({
                  ...form,
                  categoriaDash: e.target.value,
                  subcategoriaMeep: "",
                  ilimitado: rotuloPhoto(e.target.value) || form.ilimitado,
                })
              }
            >
              <option value="">Selecione</option>
              {categorias.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Subcategoria</label>
            <select
              value={form.subcategoriaMeep}
              onChange={(e) =>
                setForm({
                  ...form,
                  subcategoriaMeep: e.target.value,
                  ilimitado: rotuloPhoto(form.categoriaDash) || rotuloPhoto(e.target.value) || form.ilimitado,
                })
              }
            >
              <option value="">Selecione</option>
              {subcategorias.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Sugestão UNIK</label>
            <ValorLeitura valor={sugestaoExibida} />
          </div>
          <div className="field">
            <label>Custo UNIK</label>
            <ValorLeitura valor={custoExibido} />
          </div>
          <div className="field">
            <label>Preço de venda</label>
            <input
              value={form.preco}
              onChange={(e) => setForm({ ...form, preco: e.target.value })}
              inputMode="decimal"
              placeholder="0,00"
            />
          </div>
          <label className="check-inline">
            <input
              type="checkbox"
              checked={form.ilimitado || photoIlimitado}
              disabled={photoIlimitado}
              onChange={(e) => setForm({ ...form, ilimitado: e.target.checked })}
            />
            Estoque ilimitado (sem quantidade)
            {photoIlimitado ? " · PHOTO" : ""}
          </label>

          {!form.ilimitado && !photoIlimitado ? (
            <>
              <div className="field" style={{ marginTop: 12 }}>
                <label>Estoque geral (depósito)</label>
                <input
                  value={form.estoqueGeral}
                  onChange={(e) => setForm({ ...form, estoqueGeral: e.target.value })}
                  inputMode="numeric"
                  readOnly={ehItemUnik}
                  disabled={ehItemUnik}
                  placeholder={ehItemUnik ? "Somente leitura (UNIK)" : "0"}
                />
                <p className="muted">
                  {ehItemUnik
                    ? "Item UNIK: o geral não se edita aqui. Ele diminui ao alocar nas unidades (Movimentação estoque)."
                    : "Quantidade no depósito antes de ir às lojas."}
                </p>
              </div>
              {ehItemUnik ? (
                <p className="aviso" style={{ marginTop: 8 }}>
                  Para alocar UNIK nas lojas, use a aba <strong>Movimentação estoque</strong> (UNIK).
                  O estoque geral cai conforme a distribuição.
                </p>
              ) : (
                <>
                  <p style={{ fontWeight: "bold", margin: "12px 0 8px" }}>Alocar agora nas unidades</p>
                  <p className="muted">
                    Opcional: ao salvar, move do geral para a loja (ou cria estoque na loja se o geral
                    não cobrir).
                  </p>
                  {UNIDADES.map((u) => (
                    <div className="field" key={`aloc-${u}`} style={{ marginBottom: 6 }}>
                      <label>{u}</label>
                      <input
                        value={form.alocarAgora[u] || ""}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            alocarAgora: { ...f.alocarAgora, [u]: e.target.value },
                          }))
                        }
                        inputMode="numeric"
                        placeholder="0"
                      />
                    </div>
                  ))}
                </>
              )}
            </>
          ) : null}

          {editando && (
            <label className="check-inline" style={{ marginTop: 12 }}>
              <input
                type="checkbox"
                checked={form.ativo}
                onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
              />
              Ativo (desmarque ou use Desativar para tirar da venda)
            </label>
          )}

          <p style={{ fontWeight: "bold", margin: "12px 0 8px" }}>Unidades do item</p>
          <p className="muted">
            Padrão: nenhuma marcada = disponível em todas as lojas. Marque só se quiser restringir
            (ex.: só TGS). Na venda, o item só aparece na unidade escolhida e se houver estoque (ou
            for ilimitado).
          </p>
          {UNIDADES.map((u) => (
            <label className="check-inline" key={u}>
              <input
                type="checkbox"
                checked={form.unidades.includes(u)}
                onChange={() => toggleUnidade(u)}
              />
              {u}
            </label>
          ))}

          <div className="field">
            <label>Foto do item</label>
            <input type="file" accept="image/*" onChange={onFoto} />
            <p className="muted">A foto é redimensionada e gravada no banco (não precisa de pasta de arquivos).</p>
          </div>
          {form.fotoUrl && (
            <div className="foto-preview">
              <img src={form.fotoUrl} alt="Prévia do item" />
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setForm({ ...form, fotoUrl: "" })}
              >
                Remover foto
              </button>
            </div>
          )}
          <button className="btn btn-block" onClick={salvar}>
            {editando ? "Salvar alterações" : "Salvar item"}
          </button>
          {editando && (
            <>
              <div className="btn-row" style={{ marginTop: 10 }}>
                {form.ativo ? (
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => desativar(form.sku)}
                  >
                    Desativar
                  </button>
                ) : null}
                <button
                  className="btn btn-secondary"
                  type="button"
                  style={{ borderColor: "#c45c5c", color: "#f0b4b4" }}
                  onClick={() => excluir(form.sku)}
                >
                  Excluir
                </button>
              </div>
              <button className="btn btn-secondary btn-block" type="button" onClick={() => setForm(VAZIO)}>
                Novo item
              </button>
            </>
          )}
          {msg && <p className="msg-ok">{msg}</p>}
          {erro && <p className="msg-erro">{erro}</p>}
        </section>
        <section>
          <h2>
            Itens cadastrados{" "}
            <span className="muted" style={{ fontWeight: 400, fontSize: "0.9rem" }}>
              ({listaTabela.length}
              {temMais ? ` de ${listaFiltrada.length}` : ""}
              {listaFiltrada.length !== lista.length ? ` · filtro` : ""} · {lista.length} no total)
            </span>
          </h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Lista geral: 20 últimos. Digite o nome para filtrar na hora.
          </p>
          <div className="field" style={{ marginBottom: 10 }}>
            <label>Buscar por nome</label>
            <input
              value={filtroNome}
              onChange={(e) => setFiltroNome(e.target.value)}
              placeholder="Digite descrição, SKU ou UNIK…"
              autoComplete="off"
            />
          </div>
          <div className="filters" style={{ marginBottom: 12 }}>
            <div className="field">
              <label>Categoria</label>
              <select
                value={filtroCat}
                onChange={(e) => {
                  setFiltroCat(e.target.value);
                  setFiltroSub("");
                }}
              >
                <option value="">Todas</option>
                {categoriasFiltro.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Subcategoria</label>
              <select value={filtroSub} onChange={(e) => setFiltroSub(e.target.value)}>
                <option value="">Todas</option>
                {subcategoriasFiltro.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Unidade</label>
              <select value={filtroUnidade} onChange={(e) => setFiltroUnidade(e.target.value)}>
                <option value="">Todas</option>
                {UNIDADES.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
            {(filtroNome || filtroCat || filtroSub || filtroUnidade) && (
              <button
                type="button"
                className="btn btn-secondary"
                style={{ alignSelf: "flex-end" }}
                onClick={() => {
                  setFiltroNome("");
                  setFiltroCat("");
                  setFiltroSub("");
                  setFiltroUnidade("");
                }}
              >
                Limpar filtros
              </button>
            )}
          </div>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>Descrição</th>
                  <th>Ativo</th>
                  <th>Unidades</th>
                  <th>UNIK</th>
                  <th>Categoria</th>
                  <th>Subcategoria</th>
                  <th className="num">Preço</th>
                  <th className="num">Sugestão</th>
                  <th className="num">Custo</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {listaTabela.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="muted">
                      Nenhum item com esses filtros.
                    </td>
                  </tr>
                ) : (
                  listaTabela.map((i) => (
                    <tr
                      key={i.sku}
                      style={{
                        cursor: "pointer",
                        opacity: i.ativo === false ? 0.55 : 1,
                      }}
                      onClick={() => abrirItem(i)}
                    >
                      <td>
                        {i.fotoUrl ? (
                          <img className="foto-thumb" src={i.fotoUrl} alt="" />
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>
                        {i.descricao}
                        {i.ilimitado ? <span className="muted"> · ilimitado</span> : ""}
                      </td>
                      <td>{i.ativo === false ? "Não" : "Sim"}</td>
                      <td>
                        {!i.unidades?.length ? (
                          <span className="muted">Todas</span>
                        ) : (
                          i.unidades.join(", ")
                        )}
                      </td>
                      <td>{i.nomeUnik || <span className="muted">—</span>}</td>
                      <td>{i.categoriaDash}</td>
                      <td>{i.subcategoriaMeep}</td>
                      <td className="num">R$ {formatMoeda(i.preco)}</td>
                      <td className="num">R$ {formatMoeda(i.sugestaoVenda || 0)}</td>
                      <td className="num">R$ {formatMoeda(i.custo || 0)}</td>
                      <td>
                        <div className="btn-row" style={{ marginTop: 0, gap: 6 }}>
                          {i.ativo !== false ? (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                desativar(i.sku);
                              }}
                            >
                              Desativar
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ borderColor: "#c45c5c", color: "#f0b4b4" }}
                            onClick={(e) => {
                              e.stopPropagation();
                              excluir(i.sku);
                            }}
                          >
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {temMais && (
            <p className="muted" style={{ marginTop: 8 }}>
              + {listaFiltrada.length - listaTabela.length} item(ns) não exibidos — refine o filtro
              para localizar.
            </p>
          )}
        </section>
      </div>
    </AppShell>
  );
}
