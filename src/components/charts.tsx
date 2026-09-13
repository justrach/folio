"use client";

import { useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { trend, brands } from "@/lib/demo-data";

export function VisibilityChart({
  period,
  compare,
}: {
  period: string;
  compare: boolean;
}) {
  const data =
    period === "7d"
      ? trend.slice(-7)
      : period === "14d"
        ? trend.slice(-14)
        : trend;
  return (
    <div
      className="visibility-chart"
      role="img"
      aria-label="Sample visibility trend. AI visibility rises from 46 to 72.8 percent; SEO health from 68 to 86 out of 100."
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 15, right: 16, left: -23, bottom: 0 }}
        >
          <defs>
            <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#a9b38a" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#a9b38a" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid
            vertical={false}
            stroke="#e7e6dd"
            strokeDasharray="3 5"
          />
          <XAxis
            dataKey="date"
            axisLine={false}
            tickLine={false}
            minTickGap={48}
            tick={{ fill: "#818379", fontSize: 11 }}
            dy={9}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#818379", fontSize: 11 }}
            tickFormatter={(v) => `${v}%`}
          />
          <Tooltip
            contentStyle={{
              border: "1px solid #d9decf",
              borderRadius: 8,
              background: "#fffef8",
              fontSize: 12,
              boxShadow: "0 4px 24px #20382912",
            }}
            labelStyle={{ color: "#75806d", marginBottom: 5 }}
            formatter={(value, name) => [
              `${Number(value).toFixed(1)}${name === "SEO health" ? " / 100" : "%"}`,
              name,
            ]}
          />
          <Area
            type="monotone"
            dataKey="aeo"
            name="AI visibility"
            stroke="#435c38"
            fill="url(#chart-fill)"
            strokeWidth={2.8}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="seo"
            name="SEO health"
            stroke="#8c9971"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          {compare && (
            <Line
              type="monotone"
              dataKey="industry"
              name="Industry average"
              stroke="#b79c80"
              strokeDasharray="5 5"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Sparkline({
  variant = 0,
  light = false,
}: {
  variant?: number;
  light?: boolean;
}) {
  const d = [
    "0,36 8,34 16,35 24,28 32,30 40,22 48,24 56,17 64,19 72,10 80,12 88,5",
    "0,30 8,32 16,25 24,28 32,23 40,25 48,16 56,17 64,10 72,13 80,6 88,8",
    "0,37 8,29 16,32 24,20 32,24 40,15 48,18 56,10 64,14 72,4 80,9 88,3",
  ][variant % 3];
  return (
    <svg className="sparkline" viewBox="0 0 90 42" aria-hidden="true">
      <polyline
        points={d}
        fill="none"
        stroke={light ? "#d4dfa2" : "#7e9772"}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function RankChart({
  metric,
  category,
  onSelect,
}: {
  metric: string;
  category: string;
  onSelect: (name: string) => void;
}) {
  const [selected, setSelected] = useState<string>();
  const list = brands
    .filter((b) => category === "All industries" || b.category === category)
    .map((b) => ({
      ...b,
      value:
        metric === "SEO health"
          ? b.seo
          : metric === "Discovery"
            ? b.discovery
            : b.score,
    }))
    .sort((a, b) => b.value - a.value);
  return (
    <div
      className="rank-chart"
      aria-label={`Illustrative company ${metric} scores out of 100`}
    >
      <div className="rank-y-label">SCORE / 100</div>
      <div className="rank-bars">
        {list.map((brand, i) => (
          <button
            key={brand.name}
            className={`rank-column ${selected === brand.name ? "selected" : ""}`}
            onClick={() => {
              setSelected(brand.name);
              onSelect(brand.name);
            }}
            aria-label={`${brand.name}, ${brand.value} out of 100. View evaluation.`}
          >
            <span className="rank-bar-space">
              <span
                className={`rank-bar ${brand.name === "Acme" ? "is-you" : ""}`}
                style={{ height: `${brand.value}%` }}
              >
                <span className="bar-value">{brand.value}</span>
                {i < 3 && <span className="bar-rank">0{i + 1}</span>}
              </span>
            </span>
            <span className="brand-icon" style={{ color: brand.color }}>
              {brand.letter}
            </span>
            <span className="rank-brand-name">{brand.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
