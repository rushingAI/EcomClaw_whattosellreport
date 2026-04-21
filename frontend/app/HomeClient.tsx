"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

const EXAMPLES = ["log splitter", "standing desk mat", "cat water fountain", "travel pillow"];

type Props = {
  userEmail: string;
  quotaRemaining: number;
  quotaTotal: number;
};

export default function HomeClient({ userEmail, quotaRemaining, quotaTotal }: Props) {
  const [keyword, setKeyword] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { signOut } = useAuth();

  const noQuota = quotaRemaining <= 0;

  // hydration 后强制 focus，防止 autoFocus 被 React 清除
  useEffect(() => {
    if (!noQuota) inputRef.current?.focus();
  }, [noQuota]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = keyword.trim();
    if (!q || noQuota) return;
    router.push(`/report?keyword=${encodeURIComponent(q)}`);
  };

  const handleSignOut = async () => {
    await signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <main className="min-h-screen bg-white flex flex-col items-center justify-center px-4">
      {/* 顶部用户栏 */}
      <div className="fixed top-0 right-0 left-0 flex items-center justify-end px-5 py-3 border-b border-gray-100 bg-white/90 backdrop-blur-sm z-10">
        <div className="flex items-center gap-3">
          {/* 配额徽章 */}
          <span
            className={`text-xs px-2.5 py-1 rounded-full font-medium ${
              noQuota
                ? "bg-red-50 text-red-600 border border-red-200"
                : quotaRemaining <= 1
                ? "bg-amber-50 text-amber-700 border border-amber-200"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            剩余 {quotaRemaining}/{quotaTotal} 次
          </span>
          <span className="text-xs text-gray-400 hidden sm:block">{userEmail}</span>
          <button
            onClick={handleSignOut}
            className="text-xs text-gray-500 hover:text-black transition-colors"
          >
            退出
          </button>
        </div>
      </div>

      {/* Logo / Hero */}
      <div className="mb-10 text-center mt-14">
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
      </div>

      {/* 配额耗尽提示 */}
      {noQuota ? (
        <div className="w-full max-w-xl bg-amber-50 border border-amber-200 rounded-2xl px-6 py-5 text-center">
          <div className="text-2xl mb-2">⚡</div>
          <p className="font-semibold text-amber-900 mb-1">报告次数已用完</p>
          <p className="text-sm text-amber-700 mb-4">
            免费账号包含 {quotaTotal} 次分析。升级 Pro 版本获得更多次数。
          </p>
          <button
            onClick={() => alert("充值功能即将上线，请联系客服")}
            className="px-6 py-2.5 bg-amber-500 text-white text-sm font-semibold rounded-xl hover:bg-amber-600 transition-colors"
          >
            升级获取更多次数
          </button>
        </div>
      ) : (
        <>
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
        </>
      )}

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
