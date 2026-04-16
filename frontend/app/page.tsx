"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

const EXAMPLES = ["log splitter", "standing desk mat", "cat water fountain", "travel pillow"];

export default function HomePage() {
  const [keyword, setKeyword] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = keyword.trim();
    if (!q) return;
    router.push(`/report?keyword=${encodeURIComponent(q)}`);
  };

  return (
    <main className="min-h-screen bg-white flex flex-col items-center justify-center px-4">
      {/* Logo / Hero */}
      <div className="mb-10 text-center">
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span className="text-2xl font-bold tracking-tight text-gray-900">EcomClaw</span>
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 leading-tight">
          Amazon 品类分析
        </h1>
        <p className="mt-3 text-lg text-gray-500 max-w-md mx-auto">
          输入关键词，获取基于实测数据的竞争分析报告
        </p>
        <div className="mt-3 inline-flex items-center gap-1.5 text-sm text-gray-400">
          <span>🇺🇸</span>
          <span>amazon.com</span>
        </div>
      </div>

      {/* Search Form */}
      <form onSubmit={handleSubmit} className="w-full max-w-xl">
        <div
          className={`flex items-center border-2 rounded-2xl px-5 py-3 transition-all duration-200 bg-white shadow-sm ${
            focused ? "border-black shadow-md" : "border-gray-200 hover:border-gray-300"
          }`}
        >
          <svg className="w-5 h-5 text-gray-400 mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="在 amazon.com 搜索产品..."
            className="flex-1 outline-none text-base text-gray-900 placeholder-gray-400 bg-transparent"
            autoFocus
          />
          <button
            type="submit"
            disabled={!keyword.trim()}
            className="ml-3 px-5 py-2 bg-black text-white text-sm font-semibold rounded-xl transition-all duration-150 hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95"
          >
            分析
          </button>
        </div>
      </form>

      {/* Example keywords */}
      <div className="mt-4 flex flex-wrap gap-2 justify-center">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            onClick={() => router.push(`/report?keyword=${encodeURIComponent(ex)}`)}
            className="px-3 py-1.5 text-sm text-gray-500 border border-gray-200 rounded-full hover:border-gray-400 hover:text-gray-800 transition-colors duration-150"
          >
            {ex}
          </button>
        ))}
      </div>

      {/* Feature hints */}
      <div className="mt-14 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-2xl w-full">
        {[
          { icon: "🔍", title: "实测数据", desc: "直接抓取搜索结果、竞品详情、精选评论" },
          { icon: "🤖", title: "AI 深度分析", desc: "6个维度：快照、竞品、评论、定价、机会、清单" },
          { icon: "📊", title: "数据可视化", desc: "价格分布、竞品气泡图、评分趋势图" },
        ].map((f) => (
          <div key={f.title} className="text-center p-4">
            <div className="text-2xl mb-2">{f.icon}</div>
            <div className="font-semibold text-gray-800 text-sm mb-1">{f.title}</div>
            <div className="text-gray-500 text-xs leading-relaxed">{f.desc}</div>
          </div>
        ))}
      </div>
    </main>
  );
}
