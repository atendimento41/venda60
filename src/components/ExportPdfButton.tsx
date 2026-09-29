"use client";

import { exportarRelatorioPdf, type PdfLinha, type PdfTabelaExtra } from "@/lib/pdf-export";

export default function ExportPdfButton({
  titulo,
  subtitulo,
  colunas,
  linhas,
  totais,
  rodape,
  extras,
  disabled,
}: {
  titulo: string;
  subtitulo?: string;
  colunas: string[];
  linhas: PdfLinha[];
  totais?: PdfLinha;
  rodape?: string;
  extras?: PdfTabelaExtra[];
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
          totais,
          rodape,
          extras,
        })
      }
    >
      Exportar PDF
    </button>
  );
}
