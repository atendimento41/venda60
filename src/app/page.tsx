"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import {
  apiGet,
  apiPost,
  asArray,
  formatMoeda,
  type VendedorClient,
  intersecaoUnidades,
} from "@/lib/client";
import { useSubmitLock } from "@/lib/use-submit-lock";

type ItemUnidade = {
  sku: string;
  descricao: string;
  categoria: string;
  subcategoria: string;
  preco: number;
  estoque: number | null;
  ilimitado?: boolean;
  fotoUrl?: string;
};

const SEM_CAT = "(sem categoria)";
const SEM_SUB = "(sem subcategoria)";

function normalizarFiltro(s: string): string {
  return String(s || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[`´'']/g, "'")
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function rotuloCat(s: string): string {
  return String(s || "").trim() || SEM_CAT;
}

function rotuloSub(s: string): string {
  return String(s || "").trim() || SEM_SUB;
}

function mesmaCat(a: string, b: string): boolean {
  return normalizarFiltro(rotuloCat(a)) === normalizarFiltro(rotuloCat(b));
}

function mesmaSub(a: string, b: string): boolean {
  return normalizarFiltro(rotuloSub(a)) === normalizarFiltro(rotuloSub(b));
}

export default function HomePage() {
  const [vendedores, setVendedores] = useState<VendedorClient[]>([]);
  const [vendedorNome, setVendedorNome] = useState("");
  const [vendedorId, setVendedorId] = useState("");
  const [unidadesDisp, setUnidadesDisp] = useState<string[]>([]);
  const [unidade, setUnidade] = useState("");
  const [itens, setItens] = useState<ItemUnidade[]>([]);
  const [categoria, setCategoria] = useState("");
  const [subcategoria, setSubcategoria] = useState("");
  const [sku, setSku] = useState("");
  const [descricao, setDescricao] = useState("");
  const [preco, setPreco] = useState("");
  const [fotoUrl, setFotoUrl] = useState("");
  const [ilimitado, setIlimitado] = useState(false);
  const [quantidade, setQuantidade] = useState("1");
  const [desconto, setDesconto] = useState("0");
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");
  const [build, setBuild] = useState("");
  const [unidadesUsuario, setUnidadesUsuario] = useState<string[]>([]);
  const { busy, run } = useSubmitLock();

  const categorias = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of itens) {
      const r = rotuloCat(i.categoria);
      const k = normalizarFiltro(r);
      if (!map.has(k)) map.set(k, r);
    }
    return [...map.values()].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [itens]);

  const subcategorias = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of itens) {
      if (categoria && !mesmaCat(i.categoria, categoria)) continue;
      const r = rotuloSub(i.subcategoria);
      const k = normalizarFiltro(r);
      if (!map.has(k)) map.set(k, r);
    }
    return [...map.values()].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [itens, categoria]);

  const itensFiltrados = useMemo(
    () =>
      itens.filter(
        (i) =>
          (!categoria || mesmaCat(i.categoria, categoria)) &&
          (!subcategoria || mesmaSub(i.subcategoria, subcategoria))
      ),
    [itens, categoria, subcategoria]
  );

  function limparSelecaoItem() {
    setSku("");
    setDescricao("");
    setPreco("");
    setFotoUrl("");
    setIlimitado(false);
  }

  function limparItem() {
    limparSelecaoItem();
    setCategoria("");
    setSubcategoria("");
    setItens([]);
  }

  async function carregarVendedores() {
    const [v, b, me] = await Promise.all([
      apiGet<VendedorClient[]>("/api/vendedores"),
      apiGet<{ build: string }>("/api/build"),
      apiGet<{ usuario?: { unidades?: string[] } }>("/api/auth/me"),
    ]);
    if (v.error) setErro(v.error);
    const uu = asArray(me.data?.usuario?.unidades);
    const lista = asArray(v.data);
    setUnidadesUsuario(uu);
    setBuild(b.data?.build || "");
    // Usuário com unidade vinculada (ex.: tgs_venda → TGS) só vê vendedores dessa loja.
    setVendedores(
      uu.length === 0
        ? lista
        : lista.filter((vend) => intersecaoUnidades(vend.unidades, uu).length > 0)
    );
  }

  useEffect(() => {
    carregarVendedores();
  }, []);

  async function carregarItens(u: string) {
    setUnidade(u);
    if (!u) {
      limparItem();
      return;
    }
    const res = await apiGet<ItemUnidade[]>(`/api/vendas?unidade=${encodeURIComponent(u)}`);
    if (res.error) {
      setErro(res.error);
      setItens([]);
      return;
    }
    setItens(asArray(res.data));
    setCategoria("");
    setSubcategoria("");
    limparSelecaoItem();
  }

  function onVendedorChange(id: string) {
    setVendedorId(id);
    setErro("");
    const v = vendedores.find((x) => x.id === id);
    setVendedorNome(v?.nome || "");
    const disponiveis = v ? intersecaoUnidades(v.unidades, unidadesUsuario) : [];
    setUnidadesDisp(disponiveis);
    if (disponiveis.length === 1) {
      carregarItens(disponiveis[0]);
    } else {
      setUnidade("");
      limparItem();
    }
  }

  function onCategoriaChange(c: string) {
    setCategoria(c);
    setSubcategoria("");
    limparSelecaoItem();
  }

  function onSubcategoriaChange(s: string) {
    setSubcategoria(s);
    limparSelecaoItem();
  }

  function onSkuChange(s: string) {
    setSku(s);
    const item = itens.find((i) => i.sku === s);
    if (item) {
      setDescricao(item.descricao);
      setPreco(formatMoeda(item.preco));
      setFotoUrl(item.fotoUrl || "");
      setIlimitado(Boolean(item.ilimitado));
    } else {
      limparSelecaoItem();
    }
  }

  async function registrar() {
    await run(async () => {
      setErro("");
      setMsg("");
      if (!vendedorId) {
        setErro("Selecione o vendedor.");
        return;
      }
      if (unidadesDisp.length === 0) {
        setErro("Sem unidade disponível para este usuário/vendedor.");
        return;
      }
      if (!unidade) {
        setErro("Selecione a unidade.");
        return;
      }
      const item = itens.find((i) => i.sku === sku);
      if (!item) {
        setErro("Selecione um item.");
        return;
      }
      const res = await apiPost<{ message: string }>("/api/vendas", {
        vendedor: vendedorNome,
        id_vendedor: vendedorId,
        unidade,
        desconto: Number(String(desconto).replace(",", ".")) || 0,
        itens: [
          {
            sku: item.sku,
            descricao: item.descricao,
            categoria: item.categoria,
            subcategoria: item.subcategoria,
            preco: item.preco,
            quantidade: Number(quantidade) || 1,
          },
        ],
      });
      if (res.error || !res.data) {
        setErro(res.error || "Erro ao registrar");
        return;
      }
      setMsg(res.data.message);
      carregarItens(unidade);
    });
  }

  const semUnidade = Boolean(vendedorId && unidadesDisp.length === 0);
  const unidadeTrancada = unidadesDisp.length === 1;

  return (
    <AppShell title="Lançar venda">
      <section>
        <h2>Registrar venda</h2>
        <div className="field">
          <label>Vendedor</label>
          <select value={vendedorId} onChange={(e) => onVendedorChange(e.target.value)}>
            <option value="">Selecione</option>
            {vendedores.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nome}
              </option>
            ))}
          </select>
        </div>
        {semUnidade && (
          <p className="aviso">
            Sem unidade disponível (usuário ou vendedor sem loja em comum). Peça à gestão para ajustar.
          </p>
        )}
        <div className="field">
          <label>Unidade</label>
          {unidadeTrancada ? (
            <input value={unidadesDisp[0]} readOnly />
          ) : (
            <select
              value={unidade}
              disabled={!vendedorId || semUnidade}
              onChange={(e) => carregarItens(e.target.value)}
            >
              <option value="">Selecione</option>
              {unidadesDisp.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="field">
          <label>Categoria (opcional)</label>
          <select
            value={categoria}
            onChange={(e) => onCategoriaChange(e.target.value)}
            disabled={!unidade}
          >
            <option value="">Todas</option>
            {categorias.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Subcategoria (opcional)</label>
          <select
            value={subcategoria}
            onChange={(e) => onSubcategoriaChange(e.target.value)}
            disabled={!unidade}
          >
            <option value="">Todas</option>
            {subcategorias.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Item</label>
          <select value={sku} onChange={(e) => onSkuChange(e.target.value)} disabled={!unidade}>
            <option value="">Selecione</option>
            {itensFiltrados.map((i) => (
              <option key={i.sku} value={i.sku}>
                {i.descricao}
                {i.subcategoria ? ` · ${i.subcategoria}` : ""}
                {i.ilimitado ? " (ilimitado)" : ` (est: ${i.estoque})`}
              </option>
            ))}
          </select>
        </div>
        {fotoUrl && (
          <div className="venda-foto">
            <img src={fotoUrl} alt={descricao || "Foto do item"} />
          </div>
        )}
        {ilimitado && <p className="muted">Este item não controla estoque (quantidade ilimitada).</p>}
        <div className="field">
          <label>Descrição</label>
          <input value={descricao} readOnly />
        </div>
        <div className="field">
          <label>Preço</label>
          <input value={preco} readOnly />
        </div>
        <div className="field">
          <label>Quantidade</label>
          <input
            type="number"
            min={1}
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Desconto total (R$)</label>
          <input value={desconto} onChange={(e) => setDesconto(e.target.value)} />
        </div>
        <button className="btn btn-block" onClick={registrar} disabled={busy}>
          {busy ? "Registrando…" : "Registrar venda"}
        </button>
        {msg && <p className="msg-ok">{msg}</p>}
        {erro && <p className="msg-erro">{erro}</p>}
      </section>
      <p className="build-info">Versão: {build}</p>
    </AppShell>
  );
}
