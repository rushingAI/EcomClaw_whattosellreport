"use client";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CompetitorPoint } from "@/hooks/useAnalysis";

interface Props {
  data: CompetitorPoint[];
  currency: string;
}

function linearRegression(pts: { x: number; y: number }[]): { slope: number; intercept: number } | null {
  const n = pts.length;
  if (n < 2) return null;
  const sx = pts.reduce((s, p) => s + p.x, 0);
  const sy = pts.reduce((s, p) => s + p.y, 0);
  const sxy = pts.reduce((s, p) => s + p.x * p.y, 0);
  const sx2 = pts.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sx2 - sx * sx;
  if (denom === 0) return null;
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  return { slope, intercept };
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { payload: CompetitorPoint }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  if (!d?.asin) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs max-w-[200px]">
      <p className="font-semibold text-gray-800 truncate mb-1">{d.title || d.asin}</p>
      <div className="space-y-1">
        <div className="flex justify-between gap-3">
          <span className="text-gray-500">价格</span>
          <span className="font-medium">{d.price}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-gray-500">评分</span>
          <span className="font-medium">⭐ {d.rating}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-gray-500">评论数</span>
          <span className="font-medium">{d.reviews.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}

export default function RatingPriceChart({ data, currency }: Props) {
  if (!data || data.length < 2) return null;

  const reg = linearRegression(data.map((d) => ({ x: d.price, y: d.rating })));
  const prices = data.map((d) => d.price);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);

  const trendLine = reg
    ? [
        { price: minP, trend: parseFloat((reg.slope * minP + reg.intercept).toFixed(2)) },
        { price: maxP, trend: parseFloat((reg.slope * maxP + reg.intercept).toFixed(2)) },
      ]
    : [];

  const trendLabel =
    reg && Math.abs(reg.slope) > 0.0001
      ? reg.slope > 0
        ? "↗ 价格↑ 评分也略高"
        : "↘ 价格↑ 评分略低"
      : "→ 价格与评分无明显相关";

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          价格 vs 评分趋势
        </h3>
        {reg && (
          <span className="text-xs text-gray-400 font-normal">{trendLabel}</span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart margin={{ top: 8, right: 16, bottom: 20, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="price"
            type="number"
            domain={["auto", "auto"]}
            tick={{ fontSize: 11, fill: "#6b7280" }}
            label={{ value: `价格 (${currency})`, position: "insideBottom", offset: -8, fontSize: 11, fill: "#9ca3af" }}
          />
          <YAxis
            dataKey="rating"
            type="number"
            domain={[3, 5]}
            tick={{ fontSize: 11, fill: "#6b7280" }}
            tickFormatter={(v) => `${v}★`}
          />
          <Tooltip content={<CustomTooltip />} />
          <Scatter
            data={data}
            fill="#6366f1"
            fillOpacity={0.7}
            stroke="white"
            strokeWidth={1.5}
            r={5}
          />
          {trendLine.length === 2 && (
            <Line
              data={trendLine}
              type="linear"
              dataKey="trend"
              stroke="#f59e0b"
              strokeWidth={2}
              strokeDasharray="5 3"
              dot={false}
              activeDot={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
