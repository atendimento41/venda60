"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import ExportPdfButton from "@/components/ExportPdfButton";
import { UNIDADES, asArray, comprimirFoto } from "@/lib/client";

type Resumo = {
  sku: string;
  unidade: string;
  descricao: string;
  nomeUnik?: string;
  fotoUrl: string;
  estoque: number;
  saidasParceiro: number;
  qtdVendida: number;
  estoqueAtual: number;
};

export default function UnikRelatorioPage() {
  const [filtroUnidade, setFiltroUnidade] = useState("");
  const [filtroEstoque, setFiltroEstoque] = useState("gt0");
  const [resumo, setResumo] = useState<Resumo[] | null>(null);
  const [formula, setFormula] = useState("");
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [fotoSku, setFotoSku] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function carregar() {
    setErro("");
    setCarregando(true);
    const q = new URLSearchParams({ tipo: "relatorio" });
    if (filtroUnidade) q.set("unidade", filtroUnidade);
    if (filtroEstoque) q.set("estoqueAtual", filtroEstoque);
    const d = await fetch(`/api/unik?${q}`).then((r) => r.json());
    setCarregando(false);
    if (d?.error) {
      setErro(d.error);
      return;
    }
    setResumo(asArray(d.resumo));
    setFormula(d.formula || "");
  }

  useEffect(() => {
    carregar();
  }, []);

  async function onFotoRelatorio(sku: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setErro("");
    setMsg("");
    setFotoSku(sku);
    try {
      const dataUrl = await comprimirFoto(file);
      const res = await fetch("/api/unik", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "foto", sku, fotoUrl: dataUrl }),
      });
      const dataRes = await res.json();
      if (!res.ok) {
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

  return (
    <AppShell title="UNIK · Controle itens">
      <p className="muted">
        Uma linha por unidade da loja. Sem SKU. Nome UNIK vem do lançamento ou do vínculo. Estoque = atual + vendidos +
        retiradas nesta unidade.
      </p>

      <div className="filters">
        <div className="field">
          <label>Unidade</label>
          <select value={filtroUnidade} onChange={(e) => setFiltroUnidade(e.target.value)}>
            <option value="">Todas as lojas</option>
            {UNIDADES.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Estoque atual</label>
          <select value={filtroEstoque} onChange={(e) => setFiltroEstoque(e.target.value)}>
            <option value="">Todos</option>
            <option value="gt0">Na loja (maior que 0)</option>
            <option value="eq0">Igual a 0</option>
            <option value="lt0">Menor que 0</option>
          </select>
        </div>
      </div>
      <div className="btn-row">
        <button className="btn" onClick={carregar} disabled={carregando}>
          {carregando ? "Carregando…" : "Carregar estoque"}
        </button>
        <ExportPdfButton
          titulo="UNIK · Controle itens"
          subtitulo={filtroUnidade || "Todas as lojas"}
          colunas={["Nome estoque", "Nome UNIK", "Unidade", "Estoque", "Retirada", "Vendidos", "Estoque atual"]}
          linhas={(resumo || []).map((r) => [
            r.descricao,
            r.nomeUnik || "",
            r.unidade,
            r.estoque,
            r.saidasParceiro,
            r.qtdVendida,
            r.estoqueAtual,
          ])}
          rodape={formula}
          disabled={!resumo || resumo.length === 0}
        />
      </div>
      {msg && <p className="msg-ok">{msg}</p>}
      {erro && <p className="msg-erro">{erro}</p>}

      {resumo && (
        <div style={{ overflowX: "auto", marginTop: 16 }}>
          <table>
            <thead>
              <tr>
                <th>Foto</th>
                <th>Nome estoque</th>
                <th>Nome UNIK</th>
                <th>Unidade</th>
                <th className="num">Estoque</th>
                <th className="num">Retirada</th>
                <th className="num">Vendidos</th>
                <th className="num">Estoque atual</th>
              </tr>
            </thead>
            <tbody>
              {resumo.length === 0 ? (
                <tr>
                  <td colSpan={8} className="muted">
                    Nenhum item neste filtro.
                  </td>
                </tr>
              ) : (
                resumo.map((r) => (
                  <tr key={`${r.sku}-${r.unidade}`}>
                    <td>
                      {r.fotoUrl ? <img className="foto-thumb" src={r.fotoUrl} alt="" /> : <span className="muted">—</span>}
                      <label className="btn-file">
                        {fotoSku === r.sku ? "Enviando…" : r.fotoUrl ? "Trocar" : "Anexar"}
                        <input
                          type="file"
                          accept="image/*"
                          disabled={fotoSku === r.sku}
                          onChange={(e) => onFotoRelatorio(r.sku, e)}
                        />
                      </label>
                    </td>
                    <td>{r.descricao}</td>
                    <td>{r.nomeUnik || "—"}</td>
                    <td>{r.unidade}</td>
                    <td className="num">{r.estoque}</td>
                    <td className="num">{r.saidasParceiro}</td>
                    <td className="num">{r.qtdVendida}</td>
                    <td className="num">{r.estoqueAtual}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
