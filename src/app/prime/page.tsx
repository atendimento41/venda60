"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { asArray, type VendedorClient, intersecaoUnidades } from "@/lib/client";

export default function PrimePage() {
  const [vendedores, setVendedores] = useState<VendedorClient[]>([]);
  const [vendedorId, setVendedorId] = useState("");
  const [unidadesDisp, setUnidadesDisp] = useState<string[]>([]);
  const [unidadesUsuario, setUnidadesUsuario] = useState<string[]>([]);
  const [unidade, setUnidade] = useState("");
  const [item, setItem] = useState("");
  const [qtd, setQtd] = useState("1");
  const [itensPrime, setItensPrime] = useState<{ nome: string; preco: number }[]>([]);
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");

  useEffect(() => {
    fetch("/api/vendedores")
      .then((r) => r.json())
      .then((d) => setVendedores(asArray(d)));
    fetch("/api/prime?itens=1")
      .then((r) => r.json())
      .then((d) => setItensPrime(asArray(d)));
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setUnidadesUsuario(asArray(d?.usuario?.unidades)));
  }, []);

  function onVendedorChange(id: string) {
    setVendedorId(id);
    const v = vendedores.find((x) => x.id === id);
    const disponiveis = v ? intersecaoUnidades(v.unidades, unidadesUsuario) : [];
    setUnidadesDisp(disponiveis);
    if (disponiveis.length === 1) setUnidade(disponiveis[0]);
    else setUnidade("");
  }

  async function registrar() {
    setMsg("");
    setErro("");
    const v = vendedores.find((x) => x.id === vendedorId);
    if (!v) {
      setErro("Selecione o vendedor.");
      return;
    }
    if (unidadesDisp.length === 0) {
      setErro("Sem unidade disponível para este usuário/vendedor.");
      return;
    }
    const res = await fetch("/api/prime", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vendedor: v.nome,
        id_vendedor: v.id,
        unidade,
        item,
        quantidade: Number(qtd) || 1,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErro(data.error);
      return;
    }
    setMsg(data.message);
  }

  const semUnidade = Boolean(vendedorId && unidadesDisp.length === 0);
  const unidadeTrancada = unidadesDisp.length === 1;

  return (
    <AppShell title="Lançamento PRIME">
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
            onChange={(e) => setUnidade(e.target.value)}
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
        <label>Item PRIME</label>
        <select value={item} onChange={(e) => setItem(e.target.value)}>
          <option value="">Selecione</option>
          {itensPrime.map((i) => (
            <option key={i.nome} value={i.nome}>
              {i.nome}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Quantidade</label>
        <input value={qtd} onChange={(e) => setQtd(e.target.value)} inputMode="numeric" />
      </div>
      <button className="btn" onClick={registrar} disabled={semUnidade || !unidade || !item}>
        Registrar PRIME
      </button>
      {msg && <p className="msg-ok">{msg}</p>}
      {erro && <p className="msg-erro">{erro}</p>}
    </AppShell>
  );
}
