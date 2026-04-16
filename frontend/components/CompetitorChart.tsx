"use client";
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import type { CompetitorPoint } from "@/hooks/useAnalysis";

interface Props {
  data: CompetitorPoint[];
  currency: string;
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { payload: CompetitorPoint }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs max-w-[200px]">
      <p className="font-semibold text-gray-800 truncate mb-1">{d.title || d.asin}</p>
      <p className="text-gray-400 mb-2">{d.asin}</p>
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

export default function CompetitorChart({ data, currency }: Props) {
  if (!data || data.length === 0) return null;

  return (
    <div className="w-full">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
        竞品评分 vs 评论数
        <span className="normal-case font-normal ml-1 text-gray-400">（气泡大小 = 价格）</span>
      </h3>
      <ResponsiveContainer width="100%" height={260}>
        <ScatterChart margin={{ top: 8, right: 24, bottom: 20, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="rating"
            type="number"
            domain={[3, 5]}
            tick={{ fontSize: 11, fill: "#6b7280" }}
            label={{ value: "评分", position: "insideBottom", offset: -8, fontSize: 11, fill: "#9ca3af" }}
          />
          <YAxis
            dataKey="reviews"
            type="number"
            scale="log"
            domain={["auto", "auto"]}
            tick={{ fontSize: 11, fill: "#6b7280" }}
            tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
            label={{ value: "评论数", angle: -90, position: "insideLeft", fontSize: 11, fill: "#9ca3af" }}
          />
          <ZAxis dataKey="price" range={[40, 400]} name={`价格(${currency})`} />
          <Tooltip content={<CustomTooltip />} />
          <Scatter data={data} fill="#6366f1" fillOpacity={0.7} stroke="white" strokeWidth={1.5} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
