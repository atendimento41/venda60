"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { apiGet, apiPost, asArray, UNIDADES, type VendedorClient } from "@/lib/client";

const VAZIO = {
  id: "",
  nome: "",
  unidades: [] as string[],
  ativo: true,
};

export default function VendedoresPage() {
  const [lista, setLista] = useState<VendedorClient[]>([]);
  const [form, setForm] = useState(VAZIO);
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");

  async function carregar() {
    const res = await apiGet<VendedorClient[]>("/api/vendedores?todos=1");
    if (res.error) setErro(res.error);
    setLista(asArray(res.data));
  }

  useEffect(() => {
    carregar();
  }, []);

  function toggleUnidade(u: string) {
    setForm((f) => ({
      ...f,
      unidades: f.unidades.includes(u) ? f.unidades.filter((x) => x !== u) : [...f.unidades, u],
    }));
  }

  async function salvar() {
    setMsg("");
    setErro("");
    if (!form.nome.trim()) {
      setErro("Informe o nome do vendedor.");
      return;
    }
    const res = await apiPost<{ message: string }>("/api/vendedores", {
      id: form.id || undefined,
      nome: form.nome.trim(),
      unidades: form.unidades,
      ativo: form.ativo,
    });
    if (res.error || !res.data) {
      setErro(res.error || "Falha ao salvar");
      return;
    }
    setMsg(res.data.message);
    setForm(VAZIO);
    carregar();
  }

  async function desativar(id: string) {
    setMsg("");
    setErro("");
    const res = await apiPost<{ message: string }>("/api/vendedores", { id, desativar: true });
    if (res.error || !res.data) {
      setErro(res.error || "Falha ao desativar");
      return;
    }
    setMsg(res.data.message);
    if (form.id === id) setForm(VAZIO);
    carregar();
  }

  function rotuloUnidades(unidades: string[]) {
    if (!unidades.length) return "Todas (legado)";
    return unidades.join(", ");
  }

  return (
    <AppShell title="Vendedores">
      <div className="grid-2">
        <section>
          <h2 style={{ fontSize: 16 }}>{form.id ? "Editar vendedor" : "Novo vendedor"}</h2>
          <div className="field">
            <label>Nome</label>
            <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          </div>
          <p style={{ fontWeight: "bold", marginBottom: 8 }}>Unidades</p>
          <p className="muted">
            Nenhuma marcada: o vendedor lança em todas as lojas (até a gestão atribuir).
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
          {form.id ? (
            <label className="check-inline" style={{ marginTop: 12 }}>
              <input
                type="checkbox"
                checked={form.ativo}
                onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
              />
              Ativo
            </label>
          ) : null}
          <button className="btn btn-block" onClick={salvar} style={{ marginTop: 12 }}>
            Salvar
          </button>
          {form.id ? (
            <button className="btn btn-secondary btn-block" onClick={() => setForm(VAZIO)} style={{ marginTop: 8 }}>
              Cancelar edição
            </button>
          ) : null}
          {msg && <p className="msg-ok">{msg}</p>}
          {erro && <p className="msg-erro">{erro}</p>}
        </section>
        <section>
          <h2 style={{ fontSize: 16 }}>Cadastrados</h2>
          <p className="muted">Clique na linha para editar.</p>
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Unidades</th>
                <th>Ativo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((v) => (
                <tr
                  key={v.id}
                  style={{ cursor: "pointer" }}
                  onClick={() =>
                    setForm({
                      id: v.id,
                      nome: v.nome,
                      unidades: v.unidades || [],
                      ativo: v.ativo,
                    })
                  }
                >
                  <td>{v.nome}</td>
                  <td>{rotuloUnidades(v.unidades || [])}</td>
                  <td>{v.ativo ? "Sim" : "Não"}</td>
                  <td>
                    {v.ativo ? (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          desativar(v.id);
                        }}
                      >
                        Desativar
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </AppShell>
  );
}
