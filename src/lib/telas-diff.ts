/**
 * Texto legível de "o que mudou nas telas liberadas" para o log de usuários (puro, sem banco).
 * Acesso "*" = todas as telas. Hrefs sem rótulo conhecido aparecem como o próprio href.
 */
export type AcessoTelas = string[] | "*";
export type LinkTela = { href: string; label: string };

export function rotuloTela(links: LinkTela[], href: string): string {
  return links.find((l) => l.href === href)?.label ?? href;
}

export function descreverAcesso(links: LinkTela[], acesso: AcessoTelas): string {
  if (acesso === "*") return "todas as telas";
  const unicos = [...new Set(acesso)];
  if (unicos.length === 0) return "nenhuma tela";
  return unicos.map((h) => rotuloTela(links, h)).join(", ");
}

/** null = nada mudou. */
export function descreverMudancaTelas(
  links: LinkTela[],
  antes: AcessoTelas,
  depois: AcessoTelas
): string | null {
  if (antes === "*" && depois === "*") return null;
  if (depois === "*") return "passou a ter todas as telas";
  if (antes === "*") return `deixou de ter todas as telas; ficou com: ${descreverAcesso(links, depois)}`;
  const a = new Set(antes);
  const d = new Set(depois);
  const ganhou = [...d].filter((h) => !a.has(h));
  const perdeu = [...a].filter((h) => !d.has(h));
  if (ganhou.length === 0 && perdeu.length === 0) return null;
  const partes: string[] = [];
  if (ganhou.length) partes.push(`ganhou: ${ganhou.map((h) => rotuloTela(links, h)).join(", ")}`);
  if (perdeu.length) partes.push(`perdeu: ${perdeu.map((h) => rotuloTela(links, h)).join(", ")}`);
  return partes.join("; ");
}
