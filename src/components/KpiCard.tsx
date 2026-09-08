"use client";

import { formatMoeda } from "@/lib/client";

export function KpiCard({
  label,
  value,
  money = false,
  tone = "default",
}: {
  label: string;
  value: number;
  money?: boolean;
  tone?: "default" | "venda" | "custo" | "unik" | "60" | "encomenda";
}) {
  return (
    <div className={`kpi-card kpi-card--${tone}`}>
      <span className="kpi-card-label">{label}</span>
      {money ? (
        <strong className="kpi-card-value kpi-card-money">
          <span className="kpi-currency">R$</span>
          {formatMoeda(value)}
        </strong>
      ) : (
        <strong className="kpi-card-value">{value}</strong>
      )}
    </div>
  );
}

export function KpiGrid({ children }: { children: React.ReactNode }) {
  return <div className="kpi-grid">{children}</div>;
}
