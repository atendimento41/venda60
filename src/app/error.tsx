"use client";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="page-wrap">
      <div className="container login-card">
        <div className="sidebar-brand" style={{ alignItems: "center", border: "none", padding: 0 }}>
          <img className="brand-logo" src="/logo-60.png" alt="60 Minutos" style={{ width: 88, height: 88, margin: "0 auto 12px" }} />
          <div className="mark">
            60 <span>Vendas</span>
          </div>
        </div>
        <h1>Erro ao carregar</h1>
        <p className="msg-erro">{error.message || "Falha inesperada no navegador."}</p>
        <p className="muted">
          Confira <a href="/api/health">/api/health</a>. Se o banco não conectar,
          configure <code>DATABASE_URL</code> na Vercel e faça Redeploy.
        </p>
        <button className="btn" onClick={() => reset()}>
          Tentar de novo
        </button>
      </div>
    </div>
  );
}
