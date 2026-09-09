"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function Conteudo() {
  const params = useSearchParams();
  const token = params.get("token") || "";
  const [status, setStatus] = useState<"loading" | "ok" | "erro">("loading");
  const [message, setMessage] = useState("Confirmando e-mail…");

  useEffect(() => {
    if (!token) {
      setStatus("erro");
      setMessage("Link inválido: token ausente.");
      return;
    }
    let cancel = false;
    (async () => {
      try {
        const res = await fetch(`/api/auth/verificar-email?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (cancel) return;
        setStatus(data.ok ? "ok" : "erro");
        setMessage(data.message || (data.ok ? "E-mail confirmado." : "Não foi possível confirmar."));
      } catch {
        if (cancel) return;
        setStatus("erro");
        setMessage("Falha de rede ao confirmar o e-mail.");
      }
    })();
    return () => {
      cancel = true;
    };
  }, [token]);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "#0f1115",
        color: "#eee",
        fontFamily: "Segoe UI, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 440,
          width: "100%",
          background: "#1a1d24",
          borderRadius: 8,
          padding: 28,
          border: "1px solid #2a2f3a",
        }}
      >
        <h1 style={{ fontSize: 20, marginTop: 0 }}>Confirmação de e-mail</h1>
        <p
          style={{
            color: status === "ok" ? "#3fa34d" : status === "erro" ? "#e11c24" : "#aaa",
            lineHeight: 1.5,
          }}
        >
          {message}
        </p>
        <p style={{ marginTop: 24 }}>
          <Link href="/login" style={{ color: "#e11c24" }}>
            Ir para o login
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function VerificarEmailPage() {
  return (
    <Suspense fallback={<main style={{ padding: 24 }}>Confirmando…</main>}>
      <Conteudo />
    </Suspense>
  );
}
