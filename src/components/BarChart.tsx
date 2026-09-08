"use client";

import { useId, useMemo, useState } from "react";
import { formatMoeda } from "@/lib/client";

export type BarItem = { label: string; value: number; detail?: string; detailMoney?: number };
export type TrendSeries = { name: string; color: string; values: number[] };

function MoneyInline({ value, className }: { value: number; className?: string }) {
  return (
    <span className={className}>
      <span className="rank-currency">R$</span>
      {formatMoeda(value)}
    </span>
  );
}

function formatCompact(n: number, money: boolean) {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  if (!money) return String(Math.round(v));
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(".", ",")} mi`;
  if (abs >= 10_000) return `${(v / 1000).toFixed(1).replace(".", ",")} mil`;
  return formatMoeda(v);
}

function formatCompactAxis(n: number, money: boolean) {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  if (!money) return String(Math.round(v));
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(".", ",")} mi`;
  if (abs >= 10_000) return `${(v / 1000).toFixed(1).replace(".", ",")} mil`;
  return formatMoeda(v);
}

function formatCompactTip(n: number, money: boolean) {
  if (!money) return String(Math.round(n));
  return formatMoeda(n);
}

function niceMax(n: number) {
  if (n <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(n)));
  const m = n / exp;
  const nice = m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10;
  return nice * exp;
}

export default function BarChart({
  title,
  items,
  color = "#e11c24",
  money = true,
}: {
  title: string;
  items: BarItem[];
  color?: string;
  money?: boolean;
  layout?: "horizontal" | "vertical";
}) {
  const max = Math.max(...items.map((i) => Math.abs(i.value)), 0.01);

  return (
    <section className="dash-card">
      <h2>{title}</h2>
      {items.length === 0 ? (
        <p className="muted">Sem dados no período.</p>
      ) : (
        <div className="rank-chart">
          {items.map((i, idx) => {
            const pct = Math.max(4, Math.round((Math.abs(i.value) / max) * 100));
            return (
              <div className="rank-row" key={`${i.label}-${idx}`}>
                <span className="rank-idx">{String(idx + 1).padStart(2, "0")}</span>
                <div className="rank-body">
                  <div className="rank-head">
                    <span className="rank-label" title={i.label}>
                      {i.label}
                    </span>
                    <span className="rank-value">
                      {money ? <MoneyInline value={i.value} /> : `${i.value} un`}
                      {i.detailMoney != null && i.detailMoney > 0 ? (
                        <small className="rank-detail">
                          vendido <MoneyInline value={i.detailMoney} />
                        </small>
                      ) : i.detail ? (
                        <small className="rank-detail">{i.detail}</small>
                      ) : null}
                    </span>
                  </div>
                  <div className="rank-track">
                    <div
                      className="rank-fill"
                      style={{
                        width: `${pct}%`,
                        background: `linear-gradient(90deg, ${color} 0%, #f4c14a 100%)`,
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function TrendChart({
  title,
  labels,
  series,
  money = true,
  yMax,
}: {
  title: string;
  labels: string[];
  series: TrendSeries[];
  money?: boolean;
  yMax?: number;
}) {
  const uid = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);
  const w = 760;
  const h = 280;
  const pad = { top: 18, right: 18, bottom: 36, left: 64 };
  const innerW = w - pad.left - pad.right;
  const innerH = h - pad.top - pad.bottom;
  const n = Math.max(labels.length, 1);
  const totalSerie = series[0]?.values.reduce((s, v) => s + (Number(v) || 0), 0) || 0;

  const maxVal = useMemo(() => {
    const raw = Math.max(...series.flatMap((s) => s.values), yMax || 0, 0);
    return niceMax(raw);
  }, [series, yMax]);

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    y: pad.top + innerH * (1 - t),
    v: maxVal * t,
  }));

  const xAt = (i: number) => pad.left + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yAt = (v: number) => pad.top + innerH * (1 - v / maxVal);

  const paths = series.map((s) => {
    const pts = labels.map((_, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(1)} ${yAt(s.values[i] || 0).toFixed(1)}`);
    const line = pts.join(" ");
    const area = `${line} L ${xAt(n - 1).toFixed(1)} ${pad.top + innerH} L ${xAt(0).toFixed(1)} ${pad.top + innerH} Z`;
    return { ...s, line, area };
  });

  const labelStep = n > 16 ? 3 : n > 10 ? 2 : 1;
  const hi = hover ?? null;

  return (
    <section className="dash-card">
      <div className="chart-head">
        <h2>{title}</h2>
        <strong className="chart-total">
          {money ? (
            <>
              <span className="chart-total-currency">R$</span>
              {formatMoeda(totalSerie)}
            </>
          ) : (
            totalSerie
          )}
        </strong>
        {series.length > 1 && (
          <div className="chart-legend">
            {series.map((s) => (
              <span key={s.name} className="chart-legend-item">
                <i style={{ background: s.color }} />
                {s.name}
              </span>
            ))}
          </div>
        )}
      </div>
      {labels.length === 0 ? (
        <p className="muted">Sem dados no período.</p>
      ) : (
        <div className="trend-wrap">
          <svg viewBox={`0 0 ${w} ${h}`} className="trend-svg" role="img">
            <defs>
              {paths.map((s, i) => (
                <linearGradient id={`${uid}-g${i}`} key={s.name} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity="0.35" />
                  <stop offset="100%" stopColor={s.color} stopOpacity="0" />
                </linearGradient>
              ))}
            </defs>
            {ticks.map((t) => (
              <g key={t.v}>
                <line
                  x1={pad.left}
                  x2={w - pad.right}
                  y1={t.y}
                  y2={t.y}
                  stroke="rgba(244,241,234,0.08)"
                  strokeDasharray="4 6"
                />
                <text x={pad.left - 10} y={t.y + 4} textAnchor="end" className="chart-axis">
                  {money ? formatCompactAxis(t.v, true) : formatCompact(t.v, false)}
                </text>
              </g>
            ))}
            {paths.map((s, i) => (
              <g key={s.name}>
                <path d={s.area} fill={`url(#${uid}-g${i})`} />
                <path d={s.line} fill="none" stroke={s.color} strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
              </g>
            ))}
            {labels.map((lab, i) =>
              i % labelStep === 0 || i === n - 1 ? (
                <text key={lab + i} x={xAt(i)} y={h - 12} textAnchor="middle" className="chart-axis">
                  {lab}
                </text>
              ) : null
            )}
            {hi != null && (
              <g>
                <line
                  x1={xAt(hi)}
                  x2={xAt(hi)}
                  y1={pad.top}
                  y2={pad.top + innerH}
                  stroke="rgba(244,241,234,0.35)"
                  strokeDasharray="3 4"
                />
                {series.map((s) => (
                  <circle key={s.name} cx={xAt(hi)} cy={yAt(s.values[hi] || 0)} r="5" fill={s.color} stroke="#100e0c" strokeWidth="2" />
                ))}
              </g>
            )}
            {labels.map((_, i) => (
              <rect
                key={i}
                x={xAt(i) - innerW / n / 2}
                y={pad.top}
                width={Math.max(innerW / n, 12)}
                height={innerH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            ))}
          </svg>
          {hi != null && (
            <div
              className="chart-tip"
              style={{
                left: `${Math.min(86, Math.max(14, (xAt(hi) / w) * 100)).toFixed(1)}%`,
              }}
            >
              <strong>{labels[hi]}</strong>
              {series.map((s) => (
                <div key={s.name}>
                  <i style={{ background: s.color }} />
                  {s.name}:{" "}
                  {money ? (
                    <>
                      R$ {formatCompactTip(s.values[hi] || 0, true)}
                    </>
                  ) : (
                    formatCompact(s.values[hi] || 0, false)
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <p className="chart-hint">Passe o mouse para ver os valores de cada ponto.</p>
    </section>
  );
}
