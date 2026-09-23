"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type WebsitePoint = { domain: string; name: string; share: number };

/** Compact horizontal-bar chart, following EvilCharts' Recharts layout pattern. */
export function WebsiteSummaryChart({ rows, shareMax, selectedDomain }: {
  rows: WebsitePoint[];
  shareMax: number;
  selectedDomain?: string;
}) {
  const visible = rows.slice(0, 6);
  const selected = visible.find(row => row.domain === selectedDomain);
  if (!visible.length) return null;
  return <div className="website-summary-chart" role="img" aria-label={`Top websites by appearance rate${selected ? `; ${selected.name} selected` : ''}: ${visible.map(row => `${row.name} ${row.share.toFixed(1)} percent`).join(', ')}`}>
    <div className="website-summary-chart-title"><strong>Top websites</strong><span>{selected ? `${selected.name} selected · ` : ''}Appearance in saved answers</span></div>
    <div className="website-summary-chart-plot">
      <ResponsiveContainer width="100%" height={224}>
        <BarChart data={visible} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }} barCategoryGap="38%">
          <CartesianGrid horizontal={false} stroke="var(--folio-edge)" strokeDasharray="2 5" />
          <XAxis type="number" domain={[0, shareMax]} ticks={[0, shareMax / 2, shareMax]} tickFormatter={value => `${Number(value).toFixed(value % 1 ? 1 : 0)}%`} tick={{ fill: "var(--folio-text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" width={104} tick={{ fill: "var(--folio-ink)", fontSize: 12, fontWeight: 650 }} axisLine={false} tickLine={false} />
          <Tooltip formatter={value => `${Number(value).toFixed(1)}%`} labelFormatter={(_, payload) => payload?.[0]?.payload?.domain ?? ""} cursor={{ fill: "var(--folio-accent-soft)" }} contentStyle={{ background: "var(--folio-surface)", border: "1px solid var(--folio-edge)", color: "var(--folio-ink)" }} />
          <Bar dataKey="share" name="Appearance rate" radius={[0, 5, 5, 0]} isAnimationActive={false}>
            {visible.map(row => <Cell key={row.domain} fill={selectedDomain === row.domain ? "var(--folio-ink)" : "var(--folio-accent)"} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  </div>;
}
