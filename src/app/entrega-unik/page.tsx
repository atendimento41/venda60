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
};

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
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");
  const [ultimaDataFmt, setUltimaDataFmt] = useState("");
  const [lancamentos, setLancamentos] = useState<Mov[]>([]);
  const { busy, run } = useSubmitLock();

  async function carregarLancamentos() {
    const d = await fetch("/api/unik?tipo=lancamentos").then((r) => r.json());
    if (d?.error) {
      setErro(d.error);
      return;
    }
    setUltimaDataFmt(d.dataFmt || "");
    setLancamentos(asArray(d.lancamentos) as Mov[]);
  }

  useEffect(() => {
    carregarLancamentos();
  }, []);

  const nCustoZero = useMemo(
    () => lancamentos.filter((m) => !(Number(m.custo) > 0)).length,
    [lancamentos]
  );

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

  async function lancar() {
    await run(async () => {
      setErro("");
      setMsg("");
      if (!nome.trim()) {
        setErro("Informe o nome como veio da UNIK.");
        return;
      }
      const res = await fetch("/api/unik", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: nome.trim(),
          unidade,
          quantidade: Number(String(quantidade).replace(",", ".")),
          status,
          data,
          fotoUrl,
          custo,
          sugestaoVenda,
          recebidoPor,
        }),
      });
      const dataRes = await res.json();
      if (!res.ok) {
        setErro(dataRes.error || "Falha ao lançar");
        return;
      }
      setMsg(dataRes.message);
      setQuantidade("1");
      setFotoUrl("");
      setCusto("");
      setSugestaoVenda("");
      carregarLancamentos();
    });
  }

  return (
    <AppShell title="UNIK · Lançar">
      <p className="muted">
        Só para registrar o lançamento. Para alterar quem recebeu, custo, sugestão, foto ou excluir, use{" "}
        <Link href="/unik-editar-lancamento">Edição lançamento</Link>.
      </p>

      <section>
        <h2>Entrega ou retirada</h2>
        <div className="grid-2">
          <div>
            <div className="field">
              <label>Nome UNIK</label>
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome como veio na entrega"
              />
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
                  : "Se deixar vazio, o custo fica 0."}
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
                <td colSpan={9} className="muted">
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
