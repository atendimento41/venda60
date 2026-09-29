"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type OpcaoItem = { valor: string; rotulo: string };

/**
 * Carrega as opções do filtro de itens sempre que a URL (com unidade/categoria/subcategoria)
 * mudar e descarta da seleção os itens que deixaram de existir nas opções.
 */
export function useOpcoesItens(
  url: string | null,
  selecionados: string[],
  setSelecionados: (v: string[]) => void
) {
  const [opcoes, setOpcoes] = useState<OpcaoItem[]>([]);
  const [carregando, setCarregando] = useState(false);
  const selRef = useRef(selecionados);
  useEffect(() => {
    selRef.current = selecionados;
  }, [selecionados]);

  useEffect(() => {
    if (!url) {
      setOpcoes([]);
      return;
    }
    let ativo = true;
    setCarregando(true);
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        if (!ativo) return;
        const lista: OpcaoItem[] = Array.isArray(d) ? d : [];
        setOpcoes(lista);
        const validos = new Set(lista.map((o) => o.valor));
        const atual = selRef.current;
        const mantidos = atual.filter((v) => validos.has(v));
        if (mantidos.length !== atual.length) setSelecionados(mantidos);
      })
      .catch(() => {
        if (ativo) setOpcoes([]);
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  return { opcoes, carregando };
}

/** Acrescenta os itens escolhidos como parâmetros `item` repetidos. */
export function anexarItensQuery(q: URLSearchParams, selecionados: string[]) {
  for (const v of selecionados) q.append("item", v);
}

export default function FiltroItens({
  label = "Itens",
  opcoes,
  selecionados,
  onChange,
  carregando = false,
}: {
  label?: string;
  opcoes: OpcaoItem[];
  /** Vazio = todos os itens. */
  selecionados: string[];
  onChange: (v: string[]) => void;
  carregando?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [rascunho, setRascunho] = useState<Set<string>>(new Set());
  const caixaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    function fora(e: MouseEvent) {
      if (caixaRef.current && !caixaRef.current.contains(e.target as Node)) setAberto(false);
    }
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape") setAberto(false);
    }
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return opcoes;
    return opcoes.filter(
      (o) => o.rotulo.toLowerCase().includes(termo) || o.valor.toLowerCase().includes(termo)
    );
  }, [opcoes, busca]);

  const marcadosVisiveis = visiveis.filter((o) => rascunho.has(o.valor)).length;
  const todosVisiveis = visiveis.length > 0 && marcadosVisiveis === visiveis.length;
  const algunsVisiveis = marcadosVisiveis > 0 && !todosVisiveis;

  function abrir() {
    setBusca("");
    setRascunho(new Set(selecionados.length ? selecionados : opcoes.map((o) => o.valor)));
    setAberto(true);
  }

  function alternar(valor: string) {
    setRascunho((prev) => {
      const novo = new Set(prev);
      if (novo.has(valor)) novo.delete(valor);
      else novo.add(valor);
      return novo;
    });
  }

  function alternarTodos() {
    setRascunho((prev) => {
      const novo = new Set(prev);
      if (todosVisiveis) visiveis.forEach((o) => novo.delete(o.valor));
      else visiveis.forEach((o) => novo.add(o.valor));
      return novo;
    });
  }

  function confirmar() {
    const escolhidos = busca.trim()
      ? visiveis.filter((o) => rascunho.has(o.valor)).map((o) => o.valor)
      : opcoes.filter((o) => rascunho.has(o.valor)).map((o) => o.valor);
    onChange(escolhidos.length === opcoes.length ? [] : escolhidos);
    setAberto(false);
  }

  const resumo = (() => {
    if (!selecionados.length) return "Todos";
    if (selecionados.length === 1) {
      return opcoes.find((o) => o.valor === selecionados[0])?.rotulo || selecionados[0];
    }
    return `${selecionados.length} selecionados`;
  })();

  const escolhidosRascunho = busca.trim() ? marcadosVisiveis : rascunho.size;

  return (
    <div className="field filtro-itens" ref={caixaRef}>
      <label>{label}</label>
      <button
        type="button"
        className={`filtro-itens-botao${selecionados.length ? " ativo" : ""}`}
        onClick={() => (aberto ? setAberto(false) : abrir())}
        disabled={carregando && !opcoes.length}
        title={resumo}
      >
        <span>{carregando && !opcoes.length ? "Carregando…" : resumo}</span>
        <span aria-hidden>▾</span>
      </button>
      {aberto && (
        <div className="filtro-itens-painel">
          <input
            autoFocus
            placeholder="Pesquisar item ou SKU"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && escolhidosRascunho > 0) confirmar();
            }}
          />
          <div className="filtro-itens-lista">
            {visiveis.length === 0 ? (
              <p className="muted">Nenhum item para os filtros atuais.</p>
            ) : (
              <>
                <label className="filtro-itens-opcao filtro-itens-todos">
                  <input
                    type="checkbox"
                    checked={todosVisiveis}
                    ref={(el) => {
                      if (el) el.indeterminate = algunsVisiveis;
                    }}
                    onChange={alternarTodos}
                  />
                  {busca.trim() ? "(Selecionar todos os resultados)" : "(Selecionar tudo)"}
                </label>
                {visiveis.map((o) => (
                  <label key={o.valor} className="filtro-itens-opcao" title={o.valor}>
                    <input
                      type="checkbox"
                      checked={rascunho.has(o.valor)}
                      onChange={() => alternar(o.valor)}
                    />
                    {o.rotulo}
                  </label>
                ))}
              </>
            )}
          </div>
          <div className="filtro-itens-rodape">
            <span className="muted">
              {escolhidosRascunho} de {busca.trim() ? visiveis.length : opcoes.length}
            </span>
            <button
              type="button"
              className="btn btn-sm"
              onClick={confirmar}
              disabled={escolhidosRascunho === 0}
            >
              OK
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAberto(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
