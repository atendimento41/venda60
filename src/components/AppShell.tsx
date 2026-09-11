"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { GRUPOS_NAV } from "@/lib/roles";

type LinkItem = { href: string; label: string };
type Me = {
  usuario: { nome: string; login: string };
  links: LinkItem[];
};

function Icon({ d }: { d: string }) {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d={d} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function iconFor(href: string) {
  if (href === "/") return "M4 7h16M4 12h16M4 17h10";
  if (href === "/resumo-diario") return "M4 19V9m6 10V5m6 14v-8m6 8V7";
  if (href === "/comissao") return "M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6";
  if (href === "/ultimos-lancamentos") return "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01";
  if (href === "/venda-maluca") return "M12 2l2.4 7.2H22l-6 4.4 2.3 7.1L12 16.8 5.7 20.7 8 13.6 2 9.2h7.6z";
  if (href === "/prime") return "M12 3l2.2 6.6H21l-5.4 4 2.1 6.4L12 16.6 6.3 20l2.1-6.4L3 9.6h6.8z";
  if (href === "/estoque") return "M4 7l8-4 8 4v10l-8 4-8-4V7zM12 3v18";
  if (href.startsWith("/relatorio")) return "M5 19V5h14v14H5zm3-3h8M8 12h8M8 8h5";
  if (href === "/diario") return "M7 3v3M17 3v3M5 8h14M6 5h12a1 1 0 011 1v14H5V6a1 1 0 011-1z";
  if (href === "/cadastro-itens") return "M12 5v14M5 12h14";
  if (href === "/estoque-admin") return "M12 15a3 3 0 100-6 3 3 0 000 6zM4 12h2m12 0h2M6.5 6.5l1.5 1.5m8 8l1.5 1.5m0-11L16 8M8 16l-1.5 1.5";
  if (href === "/cancelamento-vendas") return "M6 6l12 12M18 6L6 18";
  if (href === "/editar-venda" || href === "/editar-data-venda")
    return "M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4 12.5-12.5z";
  if (href === "/entrega-unik") return "M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z";
  if (href === "/unik-editar-lancamento") return "M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4 12.5-12.5z";
  if (href === "/unik-vincular") return "M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71";
  if (href === "/unik-dash") return "M7 3v3M17 3v3M5 8h14M6 5h12a1 1 0 011 1v14H5V6a1 1 0 011-1z";
  if (href === "/unik-dash-mes") return "M4 19V9m6 10V5m6 14v-8m6 8V7";
  if (href === "/unik-relatorio") return "M4 7l8-4 8 4v10l-8 4-8-4V7zM12 3v18";
  if (href === "/unik-vendas") return "M5 19V5h14v14H5zm3-3h8M8 12h8M8 8h5";
  if (href === "/unik-encomendas") return "M5 19V5h14v14H5zm2 3h10M7 12h6M7 16h8";
  if (href === "/unik-x-itens") return "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01";
  if (href === "/unik-geral") return "M4 7l8-4 8 4v10l-8 4-8-4V7zM12 3v18M8 12h8";
  if (href === "/usuarios") return "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0";
  if (href === "/vendedores") return "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 7a4 4 0 108 0 4 4 0 00-8 0zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75";
  if (href === "/log") return "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8";
  return "M5 12h14";
}

export default function AppShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const [senhaAberta, setSenhaAberta] = useState(false);
  const [senhaAtual, setSenhaAtual] = useState("");
  const [senhaNova, setSenhaNova] = useState("");
  const [senhaConfirmacao, setSenhaConfirmacao] = useState("");
  const [senhaMsg, setSenhaMsg] = useState("");
  const [senhaErro, setSenhaErro] = useState("");
  const [senhaSalvando, setSenhaSalvando] = useState(false);

  useEffect(() => {
    let cached: Me | null = null;
    try {
      const raw = sessionStorage.getItem("cv_me");
      if (raw) {
        const parsed = JSON.parse(raw) as Me & { _ts?: number };
        if (parsed?.usuario && Date.now() - (parsed._ts || 0) < 5 * 60 * 1000) {
          cached = parsed;
          setMe(parsed);
        }
      }
    } catch {
      /* ignore */
    }

    fetch("/api/auth/me")
      .then((r) => {
        if (r.status === 401) {
          try {
            sessionStorage.removeItem("cv_me");
          } catch {
            /* ignore */
          }
          router.push("/login?motivo=sessao");
          router.refresh();
          return null;
        }
        return r.json();
      })
      .then((d) => {
        if (!d) return;
        if (d.logado) {
          setMe(d);
          try {
            sessionStorage.setItem("cv_me", JSON.stringify({ ...d, _ts: Date.now() }));
          } catch {
            /* ignore */
          }
        } else if (!cached) {
          setMe(null);
        }
      });
    try {
      setCollapsed(localStorage.getItem("sidebar_recolhida") === "1");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  function toggleSidebar() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem("sidebar_recolhida", next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  async function sair() {
    await fetch("/api/auth/logout", { method: "POST" });
    try {
      sessionStorage.removeItem("cv_me");
    } catch {
      /* ignore */
    }
    router.push("/login");
    router.refresh();
  }

  function abrirTrocarSenha() {
    setSenhaAberta(true);
    setSenhaAtual("");
    setSenhaNova("");
    setSenhaConfirmacao("");
    setSenhaMsg("");
    setSenhaErro("");
  }

  async function confirmarTrocarSenha() {
    setSenhaErro("");
    setSenhaMsg("");
    if (!senhaAtual || !senhaNova) {
      setSenhaErro("Preencha todos os campos.");
      return;
    }
    if (senhaNova !== senhaConfirmacao) {
      setSenhaErro("A confirmação não confere com a nova senha.");
      return;
    }
    setSenhaSalvando(true);
    const res = await fetch("/api/auth/trocar-senha", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        senhaAtual,
        senhaNova,
        senhaNovaConfirmacao: senhaConfirmacao,
      }),
    });
    const data = await res.json();
    setSenhaSalvando(false);
    if (!res.ok) {
      setSenhaErro(data.error || "Falha ao alterar senha.");
      return;
    }
    setSenhaMsg(data.message || "Senha alterada.");
    setSenhaAtual("");
    setSenhaNova("");
    setSenhaConfirmacao("");
    setTimeout(() => setSenhaAberta(false), 1500);
  }

  const links = me?.links || [];
  const grupos = useMemo(
    () =>
      GRUPOS_NAV.map((g) => ({
        ...g,
        items: g.hrefs
          .map((href) => links.find((l) => l.href === href))
          .filter((l): l is { href: string; label: string } => Boolean(l)),
      })).filter((g) => g.items.length > 0),
    [links]
  );
  const extra = links.filter((l) => !GRUPOS_NAV.some((g) => g.hrefs.includes(l.href)));
  const gruposComExtra =
    extra.length > 0
      ? [...grupos, { id: "mais", label: "Mais", hrefs: extra.map((l) => l.href), items: extra }]
      : grupos;

  useEffect(() => {
    if (!gruposComExtra.length) return;
    let salvo: Record<string, boolean> = {};
    try {
      salvo = JSON.parse(localStorage.getItem("sidebar_grupos") || "{}") as Record<string, boolean>;
    } catch {
      salvo = {};
    }
    const next: Record<string, boolean> = {};
    for (const g of gruposComExtra) {
      if (typeof salvo[g.id] === "boolean") next[g.id] = salvo[g.id];
      else next[g.id] = g.items.some((l) => l.href === pathname);
    }
    const ativo = gruposComExtra.find((g) => g.items.some((l) => l.href === pathname));
    if (ativo) next[ativo.id] = true;
    setAbertos(next);
  }, [pathname, links]);

  function toggleGrupo(id: string) {
    setAbertos((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem("sidebar_grupos", JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  return (
    <div className="app" id="app">
      {mobileOpen && (
        <div className="sidebar-backdrop" onClick={() => setMobileOpen(false)} />
      )}
      <aside
        id="sidebar"
        className={`sidebar${collapsed ? " collapsed" : ""}${mobileOpen ? " open" : ""}`}
      >
        <div className="sidebar-brand">
          <img className="brand-logo" src="/logo-60.png" alt="60 Minutos Escape the Game" />
          <div className="mark">
            60 <span>Vendas</span>
          </div>
          <div className="sub">Controle operacional</div>
        </div>

        <nav className="sidebar-nav">
          {gruposComExtra.map((g) => {
            const aberto = abertos[g.id] ?? g.items.some((l) => l.href === pathname);
            return (
              <div className={`nav-group${aberto ? " open" : ""}`} key={g.id}>
                <button
                  type="button"
                  className="nav-group-toggle"
                  aria-expanded={aberto}
                  onClick={() => toggleGrupo(g.id)}
                >
                  <span className="nav-label">{g.label}</span>
                  <Icon d="M6 9l6 6 6-6" />
                </button>
                {aberto &&
                  g.items.map((l) => (
                    <Link
                      key={l.href}
                      href={l.href}
                      className={`nav-item${pathname === l.href ? " active" : ""}`}
                    >
                      <Icon d={iconFor(l.href)} />
                      <span className="nav-text">{l.label}</span>
                    </Link>
                  ))}
              </div>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <button type="button" className="sidebar-toggle" onClick={toggleSidebar}>
            <span className="toggle-arrow" aria-hidden>
              <Icon d={collapsed ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"} />
            </span>
            <span className="toggle-text">{collapsed ? "Expandir menu" : "Recolher menu"}</span>
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="menu-mobile"
              onClick={() => setMobileOpen(true)}
              aria-label="Abrir menu"
            >
              ☰
            </button>
            <h1>{title}</h1>
          </div>
          {me && (
            <div className="topbar-controls user-chip">
              <span className="user-meta">
                <strong>{me.usuario.nome}</strong>
                <span className="user-login">· {me.usuario.login}</span>
              </span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={abrirTrocarSenha}>
                Trocar senha
              </button>
              <button type="button" className="btn btn-secondary btn-sm btn-sair" onClick={sair}>
                Sair
              </button>
            </div>
          )}
        </header>
        <div className="content">{children}</div>
      </div>

      {senhaAberta && (
        <div className="modal-backdrop" onClick={() => !senhaSalvando && setSenhaAberta(false)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <h2>Trocar senha</h2>
            <p className="muted" style={{ fontSize: "0.9rem" }}>
              Mínimo 8 caracteres, com 1 maiúscula, 1 número e 1 caractere especial.
            </p>
            <div className="field">
              <label>Senha atual</label>
              <input
                type="password"
                value={senhaAtual}
                onChange={(e) => setSenhaAtual(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div className="field">
              <label>Nova senha</label>
              <input
                type="password"
                value={senhaNova}
                onChange={(e) => setSenhaNova(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div className="field">
              <label>Confirmar nova senha</label>
              <input
                type="password"
                value={senhaConfirmacao}
                onChange={(e) => setSenhaConfirmacao(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            {senhaMsg && <p className="msg-ok">{senhaMsg}</p>}
            {senhaErro && <p className="msg-erro">{senhaErro}</p>}
            <div className="btn-row">
              <button className="btn" type="button" disabled={senhaSalvando} onClick={confirmarTrocarSenha}>
                {senhaSalvando ? "Salvando…" : "Salvar"}
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                disabled={senhaSalvando}
                onClick={() => setSenhaAberta(false)}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
