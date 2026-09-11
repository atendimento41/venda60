export const NAV_LINKS: { href: string; label: string }[] = [
  { href: "/", label: "Lançar venda" },
  { href: "/prime", label: "PRIME" },
  { href: "/venda-maluca", label: "Corrida Maluca" },
  { href: "/resumo-diario", label: "Resumo diário" },
  { href: "/comissao", label: "Comissão" },
  { href: "/estoque-admin", label: "Alocação de item" },
  { href: "/cadastro-itens", label: "Cadastro de itens" },
  { href: "/cancelamento-vendas", label: "Cancelar venda / PRIME" },
  { href: "/editar-venda", label: "Editar venda" },
  { href: "/ultimos-lancamentos", label: "Últimos lançamentos" },
  { href: "/estoque", label: "Estoque" },
  { href: "/relatorio-detalhado", label: "Relatório detalhado" },
  { href: "/relatorio-prime", label: "Relatório PRIME" },
  { href: "/diario", label: "Diário" },
  { href: "/entrega-unik", label: "Lançar" },
  { href: "/unik-editar-lancamento", label: "Edição lançamento" },
  { href: "/unik-vincular", label: "Vincular" },
  { href: "/unik-dash", label: "Dashboard diário" },
  { href: "/unik-dash-mes", label: "Dashboard mês" },
  { href: "/unik-relatorio", label: "Controle itens" },
  { href: "/unik-vendas", label: "Relatório vendas" },
  { href: "/unik-encomendas", label: "Relatório encomendas" },
  { href: "/unik-x-itens", label: "UNIK × itens" },
  { href: "/unik-geral", label: "Movimentação estoque" },
  { href: "/relatorio-saidas-mensal", label: "Saídas mensais" },
  { href: "/usuarios", label: "Usuários" },
  { href: "/vendedores", label: "Vendedores" },
  { href: "/log", label: "Log" },
];

export const UNIK_HREFS = [
  "/entrega-unik",
  "/unik-editar-lancamento",
  "/unik-vincular",
  "/unik-dash",
  "/unik-dash-mes",
  "/unik-relatorio",
  "/unik-vendas",
  "/unik-encomendas",
  "/unik-x-itens",
  "/unik-geral",
] as const;

export const GRUPOS_NAV: { id: string; label: string; hrefs: string[] }[] = [
  {
    id: "operacional",
    label: "Operacional",
    hrefs: [
      "/",
      "/prime",
      "/venda-maluca",
      "/resumo-diario",
      "/comissao",
      "/estoque-admin",
      "/cadastro-itens",
      "/cancelamento-vendas",
      "/editar-venda",
      "/ultimos-lancamentos",
      "/estoque",
    ],
  },
  {
    id: "relatorios",
    label: "Relatórios",
    hrefs: ["/relatorio-detalhado", "/relatorio-prime", "/diario", "/relatorio-saidas-mensal"],
  },
  { id: "unik", label: "UNIK", hrefs: [...UNIK_HREFS] },
  {
    id: "gestao",
    label: "Gestão",
    hrefs: ["/usuarios", "/vendedores", "/log"],
  },
];

export const GRUPOS_PERMISSAO = GRUPOS_NAV.map((g) => ({
  id: g.id,
  label: g.label,
  hrefs: g.hrefs,
  itens: g.hrefs
    .map((href) => NAV_LINKS.find((l) => l.href === href))
    .filter((l): l is { href: string; label: string } => Boolean(l)),
}));

/** Lista plana das abas (inclui cada página UNIK). */
export const PAGINAS_CHECKBOX: { href: string; label: string }[] = NAV_LINKS;

export type PaginasPerm = string[] | "*";

export type SessaoUsuario = {
  id: number;
  login: string;
  nome: string;
  paginas: PaginasPerm;
  /**
   * Unidades em que o login pode lançar. Ausente ou [] = todas (legado / admin).
   * Se preenchido, só pode registrar venda/PRIME nessas lojas.
   */
  unidades?: string[];
  /** Vendedor vinculado ao usuário (pré-preenche lançamento). */
  vendedorId?: string | null;
  /** Versão da sessão — invalida token ao alterar permissões/senha. */
  sv?: number;
  exp: number;
};

export function parsePaginas(raw: unknown): PaginasPerm {
  if (raw === "*" || raw === "todas") return "*";
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") {
    const s = raw.trim();
    if (s === "*" || s === "todas") return "*";
    try {
      const j = JSON.parse(s);
      if (j === "*") return "*";
      if (Array.isArray(j)) return j.map(String);
    } catch {
      /* ignore */
    }
  }
  return [];
}

export function temTodasPaginas(paginas: PaginasPerm): boolean {
  return paginas === "*";
}

function ehHrefUnik(path: string): boolean {
  return UNIK_HREFS.includes(path as (typeof UNIK_HREFS)[number]);
}

/** Cadastro antigo gravava só /entrega-unik para liberar o bloco UNIK inteiro. */
function temUnikCompleto(lista: string[]): boolean {
  const unikSalvos = lista.filter((p) => ehHrefUnik(p));
  if (unikSalvos.length === 1 && unikSalvos[0] === "/entrega-unik") return true;
  return UNIK_HREFS.every((h) => lista.includes(h));
}

export function temPagina(paginas: PaginasPerm, path: string): boolean {
  if (paginas === "*") return true;
  const clean = (path.split("?")[0] || "/") as string;
  if (paginas.includes(clean)) return true;
  // alias: permissão antiga da aba "Editar data da venda"
  if (clean === "/editar-venda" && paginas.includes("/editar-data-venda")) return true;
  if (clean === "/editar-data-venda" && paginas.includes("/editar-venda")) return true;
  if (ehHrefUnik(clean) && temUnikCompleto(paginas)) return true;
  return false;
}

export function linksPermitidos(paginas: PaginasPerm) {
  return NAV_LINKS.filter((l) => temPagina(paginas, l.href));
}

export function primeiraPagina(paginas: PaginasPerm): string {
  const links = linksPermitidos(paginas);
  return links[0]?.href || "/login";
}

export function podeAcessarPagina(paginas: PaginasPerm, path: string): boolean {
  return temPagina(paginas, path);
}

/** Libera API se o usuário tiver a aba correspondente. */
export function podeAcessarApi(paginas: PaginasPerm, method: string, pathname: string): boolean {
  const m = method.toUpperCase();
  if (pathname.startsWith("/api/auth")) return true;
  if (pathname.startsWith("/api/health") || pathname.startsWith("/api/build")) return true;

  const tem = (href: string) => temPagina(paginas, href);
  const alguma = (...hrefs: string[]) => hrefs.some((h) => tem(h));

  if (pathname.startsWith("/api/usuarios")) return tem("/usuarios");

  if (pathname.startsWith("/api/vendedores")) {
    if (m === "GET") {
      return alguma(
        "/",
        "/prime",
        "/resumo-diario",
        "/comissao",
        "/ultimos-lancamentos",
        "/editar-venda",
        "/editar-data-venda",
        "/venda-maluca",
        "/vendedores"
      );
    }
    return tem("/vendedores");
  }

  if (pathname.startsWith("/api/vendas/editar") || pathname.startsWith("/api/vendas/data")) {
    return alguma("/editar-venda", "/editar-data-venda");
  }

  if (pathname.startsWith("/api/vendas")) {
    if (m === "GET") return alguma("/", "/ultimos-lancamentos", "/editar-venda", "/editar-data-venda");
    return tem("/");
  }

  if (pathname.startsWith("/api/logs")) {
    return tem("/log");
  }

  if (pathname.startsWith("/api/foto")) {
    return alguma(
      "/cadastro-itens",
      "/estoque",
      "/estoque-admin",
      "/entrega-unik",
      "/unik-editar-lancamento",
      "/unik-vincular",
      "/unik-relatorio",
      "/unik-vendas",
      "/unik-encomendas",
      "/unik-x-itens",
      "/unik-geral"
    );
  }

  if (pathname.startsWith("/api/gestao/")) {
    return tem("/log");
  }

  if (pathname.startsWith("/api/prime")) {
    return alguma("/prime", "/relatorio-prime");
  }

  if (pathname.startsWith("/api/cancelamento")) {
    return tem("/cancelamento-vendas");
  }

  if (pathname.startsWith("/api/itens")) {
    if (m === "GET") return alguma("/cadastro-itens", "/estoque", "/estoque-admin", "/");
    return tem("/cadastro-itens");
  }

  if (pathname.startsWith("/api/estoque")) {
    if (m === "GET") return alguma("/estoque", "/estoque-admin", "/", "/relatorio-saidas-mensal");
    return tem("/estoque-admin");
  }

  if (pathname.startsWith("/api/unik")) {
    return alguma(...UNIK_HREFS, "/estoque", "/estoque-admin", "/cadastro-itens");
  }

  if (pathname.startsWith("/api/relatorios")) {
    return alguma(
      "/resumo-diario",
      "/comissao",
      "/venda-maluca",
      "/relatorio-detalhado",
      "/relatorio-prime",
      "/diario",
      "/relatorio-saidas-mensal"
    );
  }

  return paginas === "*";
}
