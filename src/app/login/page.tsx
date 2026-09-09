"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState(params.get("erro") || "");
  const [loading, setLoading] = useState(false);

  const motivo = params.get("motivo");
  const next = params.get("next") || "";

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setLoading(true);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login, senha }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setErro(data.error || "Falha no login");
      return;
    }
    router.push(next || data.next || "/");
    router.refresh();
  }

  const googleHref =
    "/api/auth/google" + (next ? `?next=${encodeURIComponent(next)}` : "");

  return (
    <div className="page-wrap">
      <div className="container login-card">
        <div className="sidebar-brand">
          <img className="brand-logo" src="/logo-60.png" alt="60 Minutos Escape the Game" />
          <div className="mark">
            60 <span>Vendas</span>
          </div>
          <div className="sub">Controle operacional</div>
        </div>
        <h1>Entrar</h1>
        <p className="muted">Controle operacional de vendas das unidades.</p>
        {motivo === "sessao" && (
          <p className="msg-erro">
            Sessão encerrada. Faça login novamente (permissões ou senha foram alteradas).
          </p>
        )}
        <a
          className="btn btn-block"
          href={googleHref}
          style={{
            display: "block",
            textAlign: "center",
            textDecoration: "none",
            background: "#fff",
            color: "#222",
            border: "1px solid #ccc",
            marginBottom: 16,
          }}
        >
          Entrar com Google
        </a>
        <p className="muted" style={{ textAlign: "center", marginTop: -8, marginBottom: 16 }}>
          ou com usuário e senha
        </p>
        <form onSubmit={entrar}>
          <div className="field">
            <label>Usuário</label>
            <input
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              autoComplete="username"
              placeholder="ex: joao"
            />
          </div>
          <div className="field">
            <label>Senha</label>
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <button className="btn btn-block" disabled={loading} type="submit">
            {loading ? "Entrando..." : "Entrar"}
          </button>
          {erro && <p className="msg-erro">{erro}</p>}
        </form>
        <p className="muted" style={{ fontSize: 12, marginTop: 16 }}>
          Google só funciona se o admin cadastrou seu e-mail pessoal neste sistema.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="page-wrap">
          <div className="container login-card">Carregando…</div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
