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
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            textDecoration: "none",
            background: "#ffffff",
            color: "#1f1f1f",
            border: "1px solid #dadce0",
            marginBottom: 12,
            fontWeight: 600,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z" />
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16.1 19 13 24 13c3.1 0 5.8 1.1 8 3l5.7-5.7C34.2 6.1 29.4 4 24 4 16.3 4 9.5 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.2C29.2 35.3 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.4 39.6 16.1 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-1.1 3.1-3.5 5.6-6.6 7l6.3 5.2C38.7 37.3 44 31.5 44 24c0-1.3-.1-2.7-.4-3.5z" />
          </svg>
          Entrar com Google
        </a>
        <p className="muted" style={{ textAlign: "center", marginBottom: 16, fontSize: 13 }}>
          ou com usuário / e-mail e senha
        </p>
        <form onSubmit={entrar}>
          <div className="field">
            <label>Usuário ou e-mail</label>
            <input
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              autoComplete="username"
              placeholder="ex: felipe ou felipe@gmail.com"
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
