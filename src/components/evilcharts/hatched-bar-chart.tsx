"use client";

// Adapted from EvilCharts (MIT — see ./LICENSE), upstream source:
// https://github.com/legions-developer/evilcharts/blob/844344cb/charts/bar-charts/hatched-bar-chart.tsx
// Adaptation: native wrapper with Folio theme tokens instead of shadcn Card/ChartContainer,
// pattern IDs namespaced with useId (upstream reuses fixed IDs), animation disabled for
// print/reduced-motion determinism.

import { useId, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface HatchedBarDatum {
  label: string;
  value: number;
  isTarget: boolean;
}

interface BarShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: HatchedBarDatum;
}

interface ChartTipProps {
  active?: boolean;
  label?: string;
  payload?: ReadonlyArray<{ value?: number }>;
  maxValue: number;
}

function ChartTip({ active, label, payload, maxValue }: ChartTipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="ob-chart-tip">
      {label}: {payload[0].value} of {maxValue} sample answers
    </div>
  );
}

export default function HatchedBarChart({
  data,
  maxValue,
  axisLabel,
}: {
  data: HatchedBarDatum[];
  maxValue: number;
  axisLabel: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const targetPattern = `hatched-bar-${uid}-target`;
  const otherPattern = `hatched-bar-${uid}-other`;
  const dotsId = `dots-${uid}`;
  const [axisWidth, setAxisWidth] = useState(150);
  const tickLimit = axisWidth < 110 ? 12 : 20;

  const hatchedBar = (props: BarShapeProps) => {
    const { x = 0, y = 0, width = 0, height = 0, payload } = props;
    if (!payload || payload.value <= 0 || width <= 0) return null;
    const pattern = payload.isTarget ? targetPattern : otherPattern;
    return (
      <rect
        className="ob-hatched-bar"
        rx={4}
        x={x}
        y={y}
        width={width}
        height={height}
        stroke="none"
        fill={`url(#${pattern})`}
      />
    );
  };

  const truncatedTick = (props: { x?: number | string; y?: number | string; payload?: { value?: string } }) => {
    const { x = 0, y = 0, payload } = props;
    const label = String(payload?.value ?? "");
    const shown = label.length > tickLimit ? `${label.slice(0, tickLimit - 1)}…` : label;
    return (
      <text x={x} y={y} dy={4} textAnchor="end" fill="var(--folio-ink)" fontSize={12}>
        {shown}
      </text>
    );
  };

  return (
    <div className="ob-chart-frame">
    <ResponsiveContainer
      width="100%"
      height={Math.max(160, data.length * 44 + 40)}
      onResize={(width) => setAxisWidth(Math.min(150, Math.max(72, Math.round(width * 0.28))))}
    >
      <BarChart
        data={data}
        layout="vertical"
        accessibilityLayer
        margin={{ left: 8, right: 24, top: 8, bottom: 24 }}
      >
        <defs>
          <pattern
            id={targetPattern}
            x="0"
            y="0"
            width="5"
            height="5"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(-45)"
          >
            <rect width="10" height="10" opacity={0.5} fill="var(--folio-accent)" />
            <rect width="1" height="10" fill="var(--folio-accent)" />
          </pattern>
          <pattern
            id={otherPattern}
            x="0"
            y="0"
            width="5"
            height="5"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(-45)"
          >
            <rect width="10" height="10" opacity={0.5} fill="var(--folio-ink)" />
            <rect width="1" height="10" fill="var(--folio-ink)" />
          </pattern>
          <pattern
            id={dotsId}
            x="0"
            y="0"
            width="10"
            height="10"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="2" cy="2" r="1" opacity={0.25} fill="var(--folio-text-faint)" />
          </pattern>
        </defs>
        <rect width="100%" height="85%" fill={`url(#${dotsId})`} />
        <XAxis
          type="number"
          domain={[0, maxValue]}
          allowDecimals={false}
          tick={{ fill: "var(--folio-text-muted)", fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: "var(--folio-edge)" }}
        />
        <YAxis
          type="category"
          dataKey="label"
          width={axisWidth}
          interval={0}
          tick={truncatedTick}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          cursor={{ fill: "var(--folio-surface-muted)" }}
          content={<ChartTip maxValue={maxValue} />}
        />
        <Bar dataKey="value" isAnimationActive={false} shape={hatchedBar} />
      </BarChart>
    </ResponsiveContainer>
    <p className="ob-report-axis-label">{axisLabel}</p>
    </div>
  );
}
