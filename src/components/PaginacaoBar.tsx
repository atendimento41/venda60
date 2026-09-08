type Props = {
  page: number;
  totalPages: number;
  total: number;
  onPage: (page: number) => void;
  disabled?: boolean;
};

export default function PaginacaoBar({ page, totalPages, total, onPage, disabled }: Props) {
  if (totalPages <= 1 && total <= 50) return null;
  return (
    <div className="filters" style={{ marginTop: "1rem", alignItems: "center" }}>
      <span className="muted">
        Página {page} de {totalPages} · {total} registro(s)
      </span>
      <button className="btn" type="button" disabled={disabled || page <= 1} onClick={() => onPage(page - 1)}>
        Anterior
      </button>
      <button
        className="btn"
        type="button"
        disabled={disabled || page >= totalPages}
        onClick={() => onPage(page + 1)}
      >
        Próxima
      </button>
    </div>
  );
}
