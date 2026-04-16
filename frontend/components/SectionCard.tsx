"use client";

import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Props = {
  id: string;
  title: string;
  content: string;
  index: number;
};

const SECTION_META: Record<string, { icon: string; color: string; bg: string; border: string }> = {
  snapshot:    { icon: "📊", color: "text-blue-700",   bg: "bg-blue-50",   border: "border-blue-200" },
  competitors: { icon: "🔬", color: "text-violet-700", bg: "bg-violet-50", border: "border-violet-200" },
  reviews:     { icon: "💬", color: "text-rose-700",   bg: "bg-rose-50",   border: "border-rose-200" },
  pricing:     { icon: "💰", color: "text-emerald-700",bg: "bg-emerald-50",border: "border-emerald-200" },
  opportunity: { icon: "💡", color: "text-amber-700",  bg: "bg-amber-50",  border: "border-amber-200" },
  actions:     { icon: "✅", color: "text-green-700",  bg: "bg-green-50",  border: "border-green-200" },
};

function getDisplayContent(content: string): string {
  // If content is a JSON object, format it nicely as markdown
  try {
    const obj = JSON.parse(content);
    if (typeof obj === "object" && obj !== null) {
      return jsonToMarkdown(obj);
    }
  } catch {
    // Not JSON, use as-is
  }
  return content;
}

function jsonToMarkdown(obj: unknown, depth = 0): string {
  if (typeof obj === "string") return obj;
  if (typeof obj === "number" || typeof obj === "boolean") return String(obj);
  if (Array.isArray(obj)) {
    return obj.map((item) => `- ${jsonToMarkdown(item, depth + 1)}`).join("\n");
  }
  if (typeof obj === "object" && obj !== null) {
    return Object.entries(obj as Record<string, unknown>)
      .map(([k, v]) => {
        const val = jsonToMarkdown(v, depth + 1);
        if (val.includes("\n")) {
          return `**${k}**\n${val}`;
        }
        return `**${k}**: ${val}`;
      })
      .join("\n\n");
  }
  return "";
}

export default function SectionCard({ id, title, content, index }: Props) {
  const meta = SECTION_META[id] ?? { icon: "📋", color: "text-gray-700", bg: "bg-gray-50", border: "border-gray-200" };
  const displayContent = getDisplayContent(content);

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
      className={`rounded-2xl border ${meta.border} overflow-hidden`}
    >
      {/* Card header */}
      <div className={`${meta.bg} px-5 py-3.5 flex items-center gap-2.5 border-b ${meta.border}`}>
        <span className="text-xl">{meta.icon}</span>
        <span className={`font-bold text-base ${meta.color}`}>{title}</span>
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.6, delay: index * 0.08 + 0.2 }}
          className={`ml-auto h-1.5 w-16 rounded-full ${meta.bg} border ${meta.border} origin-left`}
          style={{ background: "currentColor", opacity: 0.25 }}
        />
      </div>

      {/* Card body */}
      <div className="bg-white px-5 py-4">
        <div className="prose max-w-none text-sm">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayContent}</ReactMarkdown>
        </div>
      </div>
    </motion.div>
  );
}
