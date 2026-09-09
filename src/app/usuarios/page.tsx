"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { asArray, UNIDADES } from "@/lib/client";
import { GRUPOS_PERMISSAO, PAGINAS_CHECKBOX, UNIK_HREFS } from "@/lib/roles";
import { REGRAS_SENHA_TEXTO } from "@/lib/senha-politica";

type User = {
  id: number;
  login: string;
  nome: string;
  paginas: string[] | "*";
  unidades: string[];
  ativo: boolean;
  email?: string;
  emailVerificado?: boolean;
  emailStatus?: "—" | "Pendente" | "Verificado";
};

const VAZIO = {
  id: 0,
  login: "",
  nome: "",
  email: "",
  senha: "",
  paginas: [] as string[],
  unidades: [] as string[],
  todas: false,
  ativo: true,
};

const UNIK_SET = new Set<string>(UNIK_HREFS);

function expandirPaginas(paginas: string[] | "*"): string[] {
  if (paginas === "*") return PAGINAS_CHECKBOX.map((l) => l.href);
  const lista = asArray<string>(paginas);
  const soEntregaUnik =
    lista.filter((p) => UNIK_SET.has(p)).length === 1 && lista.includes("/entrega-unik");
  if (soEntregaUnik) {
    return [...new Set([...lista.filter((p) => !UNIK_SET.has(p)), ...UNIK_HREFS])];
  }
  return lista;
}

export default function UsuariosPage() {
  const [lista, setLista] = useState<User[]>([]);
  const [form, setForm] = useState(VAZIO);
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");

  async function carregar() {
    const d = await fetch("/api/usuarios").then((r) => r.json());
    setLista(asArray(d));
  }

  useEffect(() => {
    carregar();
  }, []);

  function temPagina(href: string) {
    return form.todas || form.paginas.includes(href);
  }

  function grupoCompleto(hrefs: string[]) {
    return hrefs.every((h) => temPagina(h));
  }

  function grupoParcial(hrefs: string[]) {
    return hrefs.some((h) => temPagina(h)) && !grupoCompleto(hrefs);
  }

  function setPaginas(paginas: string[], todas = false) {
    setForm((f) => ({ ...f, paginas, todas }));
  }

  function toggleTodas(marcar: boolean) {
    setPaginas(marcar ? PAGINAS_CHECKBOX.map((l) => l.href) : [], marcar);
  }

  function toggleGrupo(hrefs: string[]) {
    if (form.todas) return;
    const completo = hrefs.every((h) => form.paginas.includes(h));
    if (completo) {
      setPaginas(form.paginas.filter((p) => !hrefs.includes(p)));
    } else {
      setPaginas([...new Set([...form.paginas, ...hrefs])]);
    }
  }

  function togglePagina(href: string) {
    if (form.todas) return;
    const tem = form.paginas.includes(href);
    setPaginas(tem ? form.paginas.filter((p) => p !== href) : [...form.paginas, href]);
  }

  function toggleUnidade(u: string) {
    setForm((f) => ({
      ...f,
      unidades: f.unidades.includes(u) ? f.unidades.filter((x) => x !== u) : [...f.unidades, u],
    }));
  }

  async function salvar() {
    setMsg("");
    setErro("");
    if (!form.todas && form.paginas.length === 0) {
      setErro("Marque pelo menos uma aba.");
      return;
    }
    const res = await fetch("/api/usuarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: form.id || undefined,
        login: form.login,
        nome: form.nome,
        email: form.email,
        senha: form.senha,
        paginas: form.paginas,
        unidades: form.unidades,
        todas: form.todas,
        ativo: form.ativo,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErro(data.error || "Falha ao salvar");
      return;
    }
    setMsg(data.message);
    setForm(VAZIO);
    carregar();
  }

  return (
    <AppShell title="Usuários e permissões">
      <div className="grid-2">
        <section>
          <h2 style={{ fontSize: 16 }}>{form.id ? "Editar usuário" : "Novo usuário"}</h2>
          <div className="field">
            <label>Nome</label>
            <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          </div>
          <div className="field">
            <label>Usuário (login)</label>
            <input
              value={form.login}
              disabled={!!form.id}
              placeholder="ex: joao"
              onChange={(e) => setForm({ ...form, login: e.target.value })}
            />
          </div>
          <div className="field">
            <label>E-mail pessoal (opcional)</label>
            <input
              type="email"
              value={form.email}
              placeholder="ex: joao@gmail.com"
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <p className="muted" style={{ fontSize: "0.85rem", marginTop: 4 }}>
              Se informado, enviamos um link para confirmar o e-mail (não bloqueia o login).
            </p>
          </div>
          <div className="field">
            <label>Senha {form.id ? "(vazio = manter)" : ""}</label>
            <input
              type="password"
              value={form.senha}
              onChange={(e) => setForm({ ...form, senha: e.target.value })}
            />
            <p className="muted" style={{ fontSize: "0.85rem", marginTop: 4 }}>
              {REGRAS_SENHA_TEXTO}
            </p>
          </div>

          <p style={{ fontWeight: "bold", marginBottom: 8 }}>Vincular a unidade(s)</p>
          <p className="muted">
            Marque a loja deste login. Sem marca = todas. Com marca (ex.: só PKS), ele só lança
            venda/PRIME nessa unidade.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 8 }}>
            {UNIDADES.map((u) => (
              <label className="check-inline" key={u} style={{ minWidth: 100 }}>
                <input
                  type="checkbox"
                  checked={form.unidades.includes(u)}
                  onChange={() => toggleUnidade(u)}
                />
                {u}
              </label>
            ))}
          </div>
          {form.unidades.length > 0 && (
            <p className="msg-ok" style={{ marginTop: 0 }}>
              Restrito a: {form.unidades.join(", ")}
            </p>
          )}

          <p style={{ fontWeight: "bold", marginBottom: 8, marginTop: 16 }}>Abas liberadas</p>
          <label className="check-inline" style={{ marginBottom: 12 }}>
            <input type="checkbox" checked={form.todas} onChange={(e) => toggleTodas(e.target.checked)} />
            Todas as abas
          </label>

          {GRUPOS_PERMISSAO.map((g) => (
            <div className="perm-grupo" key={g.id}>
              <label className="check-inline">
                <input
                  type="checkbox"
                  checked={grupoCompleto(g.hrefs)}
                  ref={(el) => {
                    if (el) el.indeterminate = !form.todas && grupoParcial(g.hrefs);
                  }}
                  disabled={form.todas}
                  onChange={() => toggleGrupo(g.hrefs)}
                />
                <strong>{g.label}</strong>
              </label>
              <div className="perm-grupo-filhos">
                {g.itens.map((l) => (
                  <label className="check-inline" key={l.href}>
                    <input
                      type="checkbox"
                      checked={temPagina(l.href)}
                      disabled={form.todas}
                      onChange={() => togglePagina(l.href)}
                    />
                    {l.label}
                  </label>
                ))}
              </div>
            </div>
          ))}

          {form.id > 0 && (
            <label className="check-inline" style={{ marginTop: 12 }}>
              <input
                type="checkbox"
                checked={form.ativo}
                onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
              />
              Ativo
            </label>
          )}
          <button className="btn btn-block" onClick={salvar}>
            Salvar
          </button>
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
                <th>Usuário</th>
                <th>E-mail</th>
                <th>Unidades</th>
                <th>Abas</th>
                <th>Ativo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((u) => (
                <tr
                  key={u.id}
                  style={{ cursor: "pointer" }}
                  onClick={() =>
                    setForm({
                      id: u.id,
                      login: u.login,
                      nome: u.nome,
                      email: u.email || "",
                      senha: "",
                      paginas: expandirPaginas(u.paginas),
                      unidades: u.unidades || [],
                      todas: u.paginas === "*",
                      ativo: u.ativo,
                    })
                  }
                >
                  <td>{u.nome}</td>
                  <td>{u.login}</td>
                  <td>
                    {u.email ? (
                      <>
                        {u.email}
                        <br />
                        <span
                          className="muted"
                          style={{
                            color:
                              u.emailStatus === "Verificado"
                                ? "#3fa34d"
                                : u.emailStatus === "Pendente"
                                  ? "#c9a227"
                                  : undefined,
                          }}
                        >
                          {u.emailStatus || "—"}
                        </span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    {!u.unidades?.length ? "Todas" : u.unidades.join(", ")}
                  </td>
                  <td>{u.paginas === "*" ? "Todas" : expandirPaginas(u.paginas).length}</td>
                  <td>{u.ativo ? "Sim" : "Não"}</td>
                  <td>
                    {u.email && u.emailStatus === "Pendente" && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ fontSize: 12, padding: "4px 8px" }}
                        onClick={async (e) => {
                          e.stopPropagation();
                          setMsg("");
                          setErro("");
                          const res = await fetch("/api/usuarios/reenviar-verificacao", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ id: u.id }),
                          });
                          const data = await res.json();
                          if (!res.ok) setErro(data.error || "Falha ao reenviar");
                          else setMsg(data.message);
                        }}
                      >
                        Reenviar
                      </button>
                    )}
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
