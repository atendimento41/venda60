"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import ExportPdfButton from "@/components/ExportPdfButton";
import { formatMoeda, asArray, comprimirFoto } from "@/lib/client";

type Linha = {
  unidade: string;
  sku: string;
  item: string;
  categoria: string;
  subcategoria: string;
  precoI: number;
  fotoUrl?: string;
  estoque: number;
  retirada: number;
  vendidos: number;
  estoqueAtual: number;
  estoqueGeral?: number;
  ilimitado?: boolean;
};

export default function EstoquePage() {
  const [opcoes, setOpcoes] = useState<{ unidades: string[]; categoriasRaw: Record<string, string[]> }>({
    unidades: [],
    categoriasRaw: {},
  });
  const [unidade, setUnidade] = useState("");
  const [categoria, setCategoria] = useState("");
  const [subcategoria, setSubcategoria] = useState("");
  const [filtroEstoque, setFiltroEstoque] = useState("gt0");
  const [filtroGeral, setFiltroGeral] = useState("");
  const [filtroFoto, setFiltroFoto] = useState("");
  const [res, setRes] = useState<{ linhas: Linha[]; totalSkus: number; totalEstoque: number; formula?: string } | null>(
    null
  );
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [fotoSku, setFotoSku] = useState("");
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    fetch("/api/estoque?opcoes=1")
      .then((r) => r.json())
      .then((d) => {
        if (d && !d.error) setOpcoes(d);
      });
  }, []);

  async function carregar() {
    setErro("");
    setCarregando(true);
    const q = new URLSearchParams();
    if (unidade) q.set("unidade", unidade);
    if (categoria) q.set("categoria", categoria);
    if (subcategoria) q.set("subcategoria", subcategoria);
    if (filtroEstoque) q.set("estoqueAtual", filtroEstoque);
    if (filtroGeral) q.set("estoqueGeral", filtroGeral);
    if (filtroFoto) q.set("foto", filtroFoto);
    const d = await fetch(`/api/estoque?${q}`).then((r) => r.json());
    setCarregando(false);
    if (d?.error) {
      setErro(d.error);
      return;
    }
    if (Array.isArray(d.linhas)) setRes(d);
  }

  useEffect(() => {
    carregar();
  }, []);

  async function onFoto(sku: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setErro("");
    setMsg("");
    setFotoSku(sku);
    try {
      const dataUrl = await comprimirFoto(file);
      const resFoto = await fetch("/api/unik", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "foto", sku, fotoUrl: dataUrl }),
      });
      const dataRes = await resFoto.json();
      if (!resFoto.ok) {
        setErro(dataRes.error || "Falha ao anexar foto");
        return;
      }
      setMsg(dataRes.message);
      carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao anexar foto");
    } finally {
      setFotoSku("");
    }
  }

  const subs = categoria ? opcoes.categoriasRaw[categoria] || [] : [];
  const linhas = asArray<Linha>(res?.linhas);

  return (
    <AppShell title="Consulta de Estoque">
      <p className="muted">
        Uma linha por unidade da loja. Estoque geral = depósito (itens ainda não enviados às lojas).
        Para alocar, use Alocação de item.
      </p>
      <div className="filters">
        <div className="field">
          <label>Unidade</label>
          <select value={unidade} onChange={(e) => setUnidade(e.target.value)}>
            <option value="">Todas as lojas</option>
            <option value="GERAL">GERAL (depósito)</option>
            {opcoes.unidades
              .filter((u) => u.toUpperCase() !== "GERAL")
              .map((u) => (
                <option key={u} value={u}>
                  {u}
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
            {Object.keys(opcoes.categoriasRaw).map((c) => (
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
        <div className="field">
          <label>Estoque na loja</label>
          <select value={filtroEstoque} onChange={(e) => setFiltroEstoque(e.target.value)}>
            <option value="">Todos</option>
            <option value="gt0">Maior que 0</option>
            <option value="eq0">Igual a 0</option>
            <option value="lt0">Menor que 0</option>
          </select>
        </div>
        <div className="field">
          <label>Estoque geral</label>
          <select value={filtroGeral} onChange={(e) => setFiltroGeral(e.target.value)}>
            <option value="">Todos</option>
            <option value="gt0">Maior que 0</option>
            <option value="eq0">Igual a 0</option>
          </select>
        </div>
        <div className="field">
          <label>Foto</label>
          <select value={filtroFoto} onChange={(e) => setFiltroFoto(e.target.value)}>
            <option value="">Todas</option>
            <option value="sem">Sem foto</option>
            <option value="com">Com foto</option>
          </select>
        </div>
      </div>
      <div className="btn-row">
        <button className="btn" onClick={carregar} disabled={carregando}>
          {carregando ? "Carregando…" : "Carregar estoque"}
        </button>
        <ExportPdfButton
          titulo="Estoque operacional"
          subtitulo={unidade || "Todas as lojas"}
          colunas={[
            "Unidade",
            "Nome estoque",
            "Categoria",
            "Sub",
            "Preço",
            "Estoque",
            "Retirada",
            "Vendidos",
            "Estoque atual",
            "Estoque geral",
          ]}
          linhas={linhas.map((l) => [
            l.unidade,
            l.item,
            l.categoria,
            l.subcategoria,
            formatMoeda(l.precoI),
            l.ilimitado ? "Ilimitado" : l.estoque,
            l.ilimitado ? "—" : l.retirada,
            l.ilimitado ? "—" : l.vendidos,
            l.ilimitado ? "Ilimitado" : l.estoqueAtual,
            l.ilimitado ? "—" : l.estoqueGeral ?? 0,
          ])}
          rodape={res?.formula}
          disabled={!res || linhas.length === 0}
        />
      </div>
      {msg && <p className="msg-ok">{msg}</p>}
      {erro && <p className="msg-erro">{erro}</p>}
      {res && (
        <>
          <div style={{ overflowX: "auto", marginTop: 16 }}>
            <table>
              <thead>
                <tr>
                  <th>Unidade</th>
                  <th>Foto</th>
                  <th>Nome estoque</th>
                  <th>Categoria</th>
                  <th>Sub</th>
                  <th className="num">Preço</th>
                  <th className="num">Estoque</th>
                  <th className="num">Retirada</th>
                  <th className="num">Vendidos</th>
                  <th className="num">Estoque atual</th>
                  <th className="num">Estoque geral</th>
                </tr>
              </thead>
              <tbody>
                {linhas.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="muted">
                      Nenhum item neste filtro.
                    </td>
                  </tr>
                ) : (
                  linhas.map((l, i) => (
                    <tr key={`${l.sku}-${l.unidade}-${i}`}>
                      <td>{l.unidade}</td>
                      <td>
                        {l.fotoUrl ? <img className="foto-thumb" src={l.fotoUrl} alt="" /> : <span className="muted">—</span>}
                        <label className="btn-file">
                          {fotoSku === l.sku ? "Enviando…" : l.fotoUrl ? "Trocar" : "Anexar"}
                          <input
                            type="file"
                            accept="image/*"
                            disabled={fotoSku === l.sku}
                            onChange={(e) => onFoto(l.sku, e)}
                          />
                        </label>
                      </td>
                      <td>{l.item}</td>
                      <td>{l.categoria}</td>
                      <td>{l.subcategoria}</td>
                      <td className="num">R$ {formatMoeda(l.precoI)}</td>
                      <td className="num">{l.ilimitado ? "Ilimitado" : l.estoque}</td>
                      <td className="num">{l.ilimitado ? "—" : l.retirada}</td>
                      <td className="num">{l.ilimitado ? "—" : l.vendidos}</td>
                      <td className="num">{l.ilimitado ? "Ilimitado" : l.estoqueAtual}</td>
                      <td className="num">{l.ilimitado ? "—" : l.estoqueGeral ?? 0}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="totals">
            Linhas: {res.totalSkus} | Estoque atual (exceto ilimitados): {res.totalEstoque}
          </div>
        </>
      )}
    </AppShell>
  );
}
