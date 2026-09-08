"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { asArray } from "@/lib/client";

type Linha = {
  sku: string;
  unidade: string;
  item: string;
  estoque: number;
  ilimitado?: boolean;
};

type ItemOpcao = { sku: string; descricao: string };

function nomeBate(nome: string, busca: string) {
  const n = String(nome || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  const q = String(busca || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
  if (!q) return true;
  return n.includes(q);
}

export default function EstoqueAdminPage() {
  const [opcoes, setOpcoes] = useState<{
    unidades: string[];
    itens: ItemOpcao[];
  }>({ unidades: [], itens: [] });
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [sku, setSku] = useState("");
  const [buscaItem, setBuscaItem] = useState("");
  const [unidade, setUnidade] = useState("");
  const [filtroUnidadeTabela, setFiltroUnidadeTabela] = useState("");
  const [qtdMovimento, setQtdMovimento] = useState("1");
  const [qtdExata, setQtdExata] = useState("");
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    fetch("/api/estoque?opcoes=admin")
      .then((r) => r.json())
      .then((d) => {
        if (d && !d.error) setOpcoes({ unidades: asArray(d.unidades), itens: asArray(d.itens) });
      });
    carregar();
  }, []);

  async function carregar() {
    const d = await fetch("/api/estoque?admin=1").then((r) => r.json());
    setLinhas(asArray(d));
  }

  const itemSel = useMemo(
    () => opcoes.itens.find((i) => i.sku === sku) || null,
    [opcoes.itens, sku]
  );

  const sugestoes = useMemo(() => {
    const q = buscaItem.trim();
    if (!q) return [];
    if (sku && itemSel && q === itemSel.descricao) return [];
    return opcoes.itens.filter((i) => nomeBate(i.descricao, q)).slice(0, 20);
  }, [opcoes.itens, buscaItem, sku, itemSel]);

  const atual = useMemo(
    () => linhas.find((l) => l.sku === sku && l.unidade === unidade) || null,
    [linhas, sku, unidade]
  );

  const linhasItem = useMemo(() => {
    if (!sku) return [];
    const porUnidade = new Map(linhas.filter((l) => l.sku === sku).map((l) => [l.unidade, l]));
    const nome = itemSel?.descricao || linhas.find((l) => l.sku === sku)?.item || sku;
    const unidades = opcoes.unidades.length
      ? opcoes.unidades
      : [...new Set(linhas.filter((l) => l.sku === sku).map((l) => l.unidade))];
    return unidades
      .filter((u) => !filtroUnidadeTabela || u === filtroUnidadeTabela)
      .map((u) => {
        const row = porUnidade.get(u);
        return {
          sku,
          unidade: u,
          item: row?.item || nome,
          estoque: row?.estoque ?? 0,
          ilimitado: row?.ilimitado,
          cadastrado: Boolean(row),
        };
      });
  }, [linhas, sku, itemSel, opcoes.unidades, filtroUnidadeTabela]);

  function escolherItem(i: ItemOpcao) {
    setSku(i.sku);
    setBuscaItem(i.descricao);
    setErro("");
    setMsg("");
  }

  async function enviar(acao: string, extra: Record<string, unknown>) {
    setErro("");
    setMsg("");
    if (!sku || !unidade) {
      setErro("Selecione o item e a unidade.");
      return;
    }
    setSalvando(true);
    const res = await fetch("/api/estoque", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao, sku, unidade, ...extra }),
    });
    const data = await res.json();
    setSalvando(false);
    if (!res.ok) {
      setErro(data.error || "Falha na operação");
      return;
    }
    setMsg(data.message);
    carregar();
  }

  function qtdOk(valor: string) {
    const n = Number(String(valor).replace(",", "."));
    return Number.isFinite(n) && n > 0;
  }

  return (
    <AppShell title="Alocação de item">
      <p className="muted">
        Aloque nas lojas digitando o nome do item. UNIK 3D não entra aqui — fica nas telas UNIK. A tabela de baixo
        mostra só o item selecionado.
      </p>

      <div className="filters">
        <div className="field" style={{ minWidth: 280, flex: 1 }}>
          <label>Item (busque pelo nome)</label>
          <input
            value={buscaItem}
            onChange={(e) => {
              setBuscaItem(e.target.value);
              if (sku) setSku("");
            }}
            placeholder="Digite o nome como está no cadastro"
            autoComplete="off"
          />
          {sugestoes.length > 0 && (
            <div
              style={{
                marginTop: 6,
                maxHeight: 220,
                overflowY: "auto",
                border: "1px solid var(--border)",
                borderRadius: 10,
                background: "var(--card)",
              }}
            >
              {sugestoes.map((i) => (
                <button
                  type="button"
                  key={i.sku}
                  onClick={() => escolherItem(i)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "8px 12px",
                    background: i.sku === sku ? "var(--red-soft)" : "transparent",
                    border: 0,
                    color: "inherit",
                    cursor: "pointer",
                  }}
                >
                  {i.descricao}
                </button>
              ))}
            </div>
          )}
          {buscaItem.trim() && sugestoes.length === 0 && !sku && (
            <p className="muted" style={{ marginTop: 6 }}>
              Nenhum item com esse nome (UNIK 3D não aparece nesta tela).
            </p>
          )}
          {itemSel && sku ? (
            <p className="muted" style={{ marginTop: 6 }}>
              Selecionado: <strong>{itemSel.descricao}</strong>
            </p>
          ) : null}
        </div>
        <div className="field">
          <label>Unidade para alocar</label>
          <select value={unidade} onChange={(e) => setUnidade(e.target.value)}>
            <option value="">Selecione</option>
            {opcoes.unidades.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
      </div>

      {sku && unidade && (
        <p className="muted">
          Estoque atual:{" "}
          <strong>
            {atual?.ilimitado ? "Ilimitado" : atual ? atual.estoque : "ainda não cadastrado nesta unidade"}
          </strong>
        </p>
      )}

      <div className="grid-2">
        <section>
          <h2>Adicionar ou retirar</h2>
          <p className="muted">Informa quantas unidades entram ou saem do estoque atual. Ex.: 5 para adicionar 5, ou 5 e clicar em Retirar.</p>
          <div className="field">
            <label>Quantas unidades</label>
            <input
              value={qtdMovimento}
              onChange={(e) => setQtdMovimento(e.target.value)}
              inputMode="numeric"
            />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              className="btn"
              disabled={salvando || atual?.ilimitado}
              onClick={() => {
                if (!qtdOk(qtdMovimento)) {
                  setErro("Informe uma quantidade maior que zero para adicionar.");
                  return;
                }
                enviar("ajustar", { delta: Number(String(qtdMovimento).replace(",", ".")) });
              }}
            >
              Adicionar
            </button>
            <button
              className="btn btn-secondary"
              disabled={salvando || atual?.ilimitado}
              onClick={() => {
                if (!qtdOk(qtdMovimento)) {
                  setErro("Informe uma quantidade maior que zero para retirar.");
                  return;
                }
                enviar("ajustar", { delta: -Math.abs(Number(String(qtdMovimento).replace(",", "."))) });
              }}
            >
              Retirar
            </button>
          </div>
        </section>

        <section>
          <h2>Definir quantidade exata</h2>
          <p className="muted">Substitui o estoque pelo valor informado. Ex.: se está 12 e você coloca 20, o estoque passa a ser 20.</p>
          <div className="field">
            <label>Nova quantidade</label>
            <input
              value={qtdExata}
              onChange={(e) => setQtdExata(e.target.value)}
              inputMode="numeric"
              placeholder={atual && !atual.ilimitado ? String(atual.estoque) : "0"}
            />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              className="btn"
              disabled={salvando || atual?.ilimitado}
              onClick={() => {
                const n = Number(String(qtdExata).replace(",", "."));
                if (!Number.isFinite(n) || n < 0) {
                  setErro("Informe a quantidade exata (0 ou mais).");
                  return;
                }
                enviar("definir", { quantidade: n });
              }}
            >
              Gravar quantidade
            </button>
            {!atual && (
              <button
                className="btn btn-secondary"
                disabled={salvando}
                onClick={() => {
                  const n = Number(String(qtdExata || qtdMovimento).replace(",", ".")) || 0;
                  if (n < 0) {
                    setErro("Quantidade inicial inválida.");
                    return;
                  }
                  enviar("cadastrar", { quantidade: n });
                }}
              >
                Cadastrar nesta unidade
              </button>
            )}
          </div>
        </section>
      </div>

      {msg && <p className="msg-ok">{msg}</p>}
      {erro && <p className="msg-erro">{erro}</p>}

      <h2 style={{ marginTop: 28 }}>Estoque por unidade</h2>
      <div className="filters">
        <div className="field">
          <label>Filtrar unidade</label>
          <select value={filtroUnidadeTabela} onChange={(e) => setFiltroUnidadeTabela(e.target.value)}>
            <option value="">Todas</option>
            {opcoes.unidades.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
      </div>
      {!sku ? (
        <p className="muted">Selecione um item acima para ver o estoque dele em cada loja.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Unidade</th>
              <th>Item</th>
              <th className="num">Estoque</th>
            </tr>
          </thead>
          <tbody>
            {linhasItem.length === 0 ? (
              <tr>
                <td colSpan={3} className="muted">
                  Nenhuma unidade neste filtro.
                </td>
              </tr>
            ) : (
              linhasItem.map((l) => (
                <tr
                  key={`${l.sku}-${l.unidade}`}
                  style={{ cursor: "pointer" }}
                  onClick={() => {
                    setUnidade(l.unidade);
                    if (!l.ilimitado) setQtdExata(String(l.estoque));
                  }}
                >
                  <td>{l.unidade}</td>
                  <td>{l.item}</td>
                  <td className="num">{l.ilimitado ? "Ilimitado" : l.estoque}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}
    </AppShell>
  );
}
