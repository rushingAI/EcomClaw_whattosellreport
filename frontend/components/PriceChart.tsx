"use client";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface PriceBucket {
  range: string;
  count: number;
}

interface Props {
  data: PriceBucket[];
  currency: string;
}

const GRADIENT_COLORS = [
  "#6366f1", "#7c3aed", "#8b5cf6", "#a78bfa",
  "#818cf8", "#60a5fa", "#38bdf8", "#22d3ee",
];

export default function PriceChart({ data, currency }: Props) {
  if (!data || data.length === 0) return null;

  const maxCount = Math.max(...data.map((d) => d.count));

  return (
    <div className="w-full">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
        价格分布 · {currency}
      </h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: -10, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
          <XAxis
            dataKey="range"
            tick={{ fontSize: 11, fill: "#6b7280" }}
            angle={-35}
            textAnchor="end"
            interval={0}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#6b7280" }}
            allowDecimals={false}
            label={{ value: "产品数", angle: -90, position: "insideLeft", fontSize: 11, fill: "#9ca3af" }}
          />
          <Tooltip
            formatter={(v) => [`${Number(v ?? 0)} 个产品`, "数量"]}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={56}>
            {data.map((entry, idx) => (
              <Cell
                key={idx}
                fill={GRADIENT_COLORS[idx % GRADIENT_COLORS.length]}
                fillOpacity={0.6 + (entry.count / maxCount) * 0.4}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
