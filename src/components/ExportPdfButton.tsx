"use client";

import { exportarRelatorioPdf, type PdfLinha } from "@/lib/pdf-export";

export default function ExportPdfButton({
  titulo,
  subtitulo,
  colunas,
  linhas,
  rodape,
  extras,
  disabled,
}: {
  titulo: string;
  subtitulo?: string;
  colunas: string[];
  linhas: PdfLinha[];
  rodape?: string;
  extras?: Array<{ titulo: string; colunas: string[]; linhas: PdfLinha[] }>;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="btn btn-secondary"
      disabled={disabled}
      onClick={() =>
        exportarRelatorioPdf({
          titulo,
          subtitulo,
          colunas,
          linhas,
          rodape,
          extras,
        })
      }
    >
      Exportar PDF
    </button>
  );
}
