"use client";

export type PdfColuna = string;
export type PdfLinha = Array<string | number>;

export function exportarRelatorioPdf(opts: {
  titulo: string;
  subtitulo?: string;
  colunas: PdfColuna[];
  linhas: PdfLinha[];
  rodape?: string;
  extras?: Array<{ titulo: string; colunas: PdfColuna[]; linhas: PdfLinha[] }>;
}) {
  const esc = (v: string | number) =>
    String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const tabela = (colunas: PdfColuna[], linhas: PdfLinha[]) => {
    const head = colunas.map((c) => `<th>${esc(c)}</th>`).join("");
    const body = linhas
      .map((row) => `<tr>${row.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`)
      .join("");
    return `<table>
    <thead><tr>${head}</tr></thead>
    <tbody>${body || `<tr><td colspan="${colunas.length}">Sem dados.</td></tr>`}</tbody>
  </table>`;
  };

  const extrasHtml = (opts.extras || [])
    .map((t) => `<h2>${esc(t.titulo)}</h2>${tabela(t.colunas, t.linhas)}`)
    .join("");
  const agora = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date());

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${esc(opts.titulo)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500&display=swap" rel="stylesheet" />
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    html, body { margin: 0; padding: 0; }
    body { font-family: "Montserrat", Arial, sans-serif; font-weight: 500; color: #1a1a1a; }
    .head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #e11c24; padding-bottom: 8px; margin-bottom: 14px; }
    h1 { font-size: 18px; margin: 0; font-weight: 500; }
    h2 { font-size: 13px; margin: 18px 0 8px; font-weight: 500; }
    .sub { color: #555; font-size: 12px; margin-top: 4px; }
    .brand { font-weight: 500; color: #e11c24; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { border: 1px solid #ccc; padding: 5px 6px; text-align: left; }
    th { background: #1c1915; color: #fff; font-weight: 500; }
    tr:nth-child(even) td { background: #f7f5f1; }
    td.num, th.num { text-align: right; }
    .foot { margin-top: 12px; font-size: 11px; color: #444; }
  </style>
</head>
<body>
  <div class="head">
    <div>
      <div class="brand">60 Minutos Escape · Controle de Vendas</div>
      <h1>${esc(opts.titulo)}</h1>
      ${opts.subtitulo ? `<div class="sub">${esc(opts.subtitulo)}</div>` : ""}
    </div>
    <div class="sub">Gerado em ${esc(agora)}</div>
  </div>
  ${tabela(opts.colunas, opts.linhas)}
  ${extrasHtml}
  ${opts.rodape ? `<div class="foot">${esc(opts.rodape)}</div>` : ""}
  <script>
    window.addEventListener("load", function () {
      setTimeout(function () {
        window.focus();
        window.print();
      }, 300);
    });
  <\/script>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (!w) {
    URL.revokeObjectURL(url);
    window.alert("Permita pop-ups para exportar o PDF.");
    return;
  }
  w.addEventListener("load", () => {
    setTimeout(() => URL.revokeObjectURL(url), 120_000);
  });
}
