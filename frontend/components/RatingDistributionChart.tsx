"use client";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { RatingBucket } from "@/hooks/useAnalysis";

interface Props {
  data: RatingBucket[];
}

// 5★ = green → 1★ = red
const STAR_COLORS: Record<number, string> = {
  5: "#22c55e",
  4: "#86efac",
  3: "#fbbf24",
  2: "#f97316",
  1: "#ef4444",
};

export default function RatingDistributionChart({ data }: Props) {
  if (!data || data.length === 0) return null;

  // Sort 5→1
  const sorted = [...data].sort((a, b) => b.star - a.star);

  return (
    <div className="w-full">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
        评分分布
      </h3>
      <ResponsiveContainer width="100%" height={170}>
        <BarChart
          data={sorted}
          layout="vertical"
          margin={{ top: 0, right: 50, bottom: 0, left: 10 }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
          <XAxis
            type="number"
            domain={[0, 100]}
            tick={{ fontSize: 11, fill: "#9ca3af" }}
            tickFormatter={(v) => `${v}%`}
          />
          <YAxis
            type="category"
            dataKey="label"
            tick={{ fontSize: 12, fill: "#6b7280" }}
            width={28}
          />
          <Tooltip
            formatter={(v: number) => [`${v.toFixed(1)}%`, "占比"]}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
          />
          <Bar dataKey="pct" radius={[0, 4, 4, 0]} maxBarSize={22}>
            <LabelList
              dataKey="pct"
              position="right"
              formatter={(v: number) => `${v.toFixed(0)}%`}
              style={{ fontSize: 11, fill: "#6b7280" }}
            />
            {sorted.map((entry) => (
              <Cell key={entry.star} fill={STAR_COLORS[entry.star] ?? "#9ca3af"} fillOpacity={0.8} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
