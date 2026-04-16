"use client";

import { useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useAnalysis, type ChartData } from "@/hooks/useAnalysis";
import PhaseTimeline from "@/components/PhaseTimeline";
import SectionCard from "@/components/SectionCard";
import PriceChart from "@/components/PriceChart";
import CompetitorChart from "@/components/CompetitorChart";
import RatingDistributionChart from "@/components/RatingDistributionChart";
import RatingPriceChart from "@/components/RatingPriceChart";

// Inline chart block that appears immediately after a section card
function InlineCharts({ sectionId, chartData }: { sectionId: string; chartData: ChartData }) {
  const hasPriceDist = (chartData.price_distribution?.length ?? 0) > 0;
  const hasCompetitors = (chartData.competitors?.length ?? 0) > 0;
  const hasRatingDist = (chartData.rating_distribution?.length ?? 0) > 0;

  const charts: React.ReactNode[] = [];

  if (sectionId === "snapshot" && hasPriceDist) {
    charts.push(
      <PriceChart
        key="price"
        data={chartData.price_distribution}
        currency={chartData.currency}
      />
    );
  }

  if (sectionId === "competitors" && hasCompetitors) {
    charts.push(
      <CompetitorChart
        key="bubble"
        data={chartData.competitors}
        currency={chartData.currency}
      />
    );
    charts.push(
      <div key="divider" className="border-t border-gray-100 pt-6" />
    );
    charts.push(
      <RatingPriceChart
        key="trend"
        data={chartData.competitors}
        currency={chartData.currency}
      />
    );
  }

  if (sectionId === "reviews" && hasRatingDist) {
    charts.push(
      <RatingDistributionChart
        key="stars"
        data={chartData.rating_distribution}
      />
    );
  }

  if (charts.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="rounded-2xl border border-gray-100 bg-white px-5 py-5 space-y-6"
    >
      {charts}
    </motion.div>
  );
}

function ReportContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const keyword = searchParams.get("keyword") ?? "";
  const marketplace = "us";
  const { state, start, rerun, reset } = useAnalysis();

  useEffect(() => {
    if (!keyword) {
      router.replace("/");
      return;
    }
    start(keyword, marketplace);
    return () => reset();
  }, [keyword]); // eslint-disable-line react-hooks/exhaustive-deps

  const isRunning = state.status === "running";
  const isDone = state.status === "done";
  const isError = state.status === "error";

  return (
    <div className="min-h-screen bg-white">
      {/* Top nav */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-5 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-gray-900 hover:text-gray-600 transition-colors">
            <div className="w-7 h-7 bg-black rounded-lg flex items-center justify-center">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="font-bold text-sm">EcomClaw</span>
          </Link>

          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500 max-w-xs truncate hidden sm:block">
              &ldquo;{keyword}&rdquo;
            </span>
            {isRunning && (
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <motion.div
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 1.2, repeat: Infinity }}
                  className="w-2 h-2 rounded-full bg-black"
                />
                分析中
              </div>
            )}
            {isDone && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-xs text-green-600 font-medium flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                完成
              </motion.div>
            )}
            <Link
              href="/"
              className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors"
            >
              新分析
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-5 py-8">
        {/* Page title */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            <span className="text-gray-400 font-normal text-xl mr-2">品类分析</span>
            {keyword}
          </h1>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full font-medium">
              🇺🇸 amazon.com
            </span>
            {state.cachedAt ? (
              <>
                <span className="text-xs px-2 py-0.5 bg-amber-50 text-amber-600 border border-amber-200 rounded-full font-medium">
                  缓存 · {new Date(state.cachedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
                <button
                  onClick={() => rerun(keyword, "us")}
                  className="text-xs px-2.5 py-0.5 border border-gray-200 rounded-full text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition-colors"
                >
                  重新分析
                </button>
              </>
            ) : (
              <p className="text-gray-400 text-sm">
                {new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" })}
              </p>
            )}
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-8 items-start">
          {/* Left sidebar: progress */}
          <div className="lg:sticky lg:top-20">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="border border-gray-100 rounded-2xl p-5 bg-gray-50"
            >
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">
                进度
              </div>
              <PhaseTimeline phases={state.phases} currentPhase={state.currentPhase} />

              {isDone && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 pt-4 border-t border-gray-200"
                >
                  <div className="text-xs text-gray-500 text-center">
                    {state.sections.length} 个维度 · 分析完成
                  </div>
                </motion.div>
              )}

              {isError && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl"
                >
                  <p className="text-xs text-red-700 leading-relaxed">{state.errorMessage}</p>
                </motion.div>
              )}
            </motion.div>
          </div>

          {/* Right: sections with inline charts */}
          <div className="space-y-5">
            <AnimatePresence>
              {state.sections.map((section, i) => (
                <div key={section.id}>
                  <SectionCard
                    id={section.id}
                    title={section.title}
                    content={section.content}
                    index={i}
                  />
                  {/* Chart block appears immediately after its corresponding section */}
                  {state.chartData && (
                    <div className="mt-3">
                      <InlineCharts sectionId={section.id} chartData={state.chartData} />
                    </div>
                  )}
                </div>
              ))}
            </AnimatePresence>

            {/* Loading skeleton */}
            {isRunning && state.sections.length === 0 && (
              <div className="space-y-5">
                {[1, 2, 3].map((i) => (
                  <motion.div
                    key={i}
                    animate={{ opacity: [0.4, 0.7, 0.4] }}
                    transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
                    className="rounded-2xl border border-gray-100 overflow-hidden"
                  >
                    <div className="bg-gray-50 px-5 py-3.5 border-b border-gray-100">
                      <div className="h-4 bg-gray-200 rounded w-40" />
                    </div>
                    <div className="bg-white px-5 py-4 space-y-2">
                      <div className="h-3 bg-gray-100 rounded w-full" />
                      <div className="h-3 bg-gray-100 rounded w-4/5" />
                      <div className="h-3 bg-gray-100 rounded w-3/5" />
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            {/* Error state */}
            {isError && state.sections.length === 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center"
              >
                <div className="text-3xl mb-3">😔</div>
                <p className="text-red-700 font-medium mb-2">分析失败</p>
                <p className="text-red-600 text-sm mb-4">{state.errorMessage}</p>
                <Link
                  href="/"
                  className="inline-block px-4 py-2 bg-black text-white text-sm rounded-xl hover:bg-gray-800 transition-colors"
                >
                  返回重试
                </Link>
              </motion.div>
            )}

            {/* Done footer */}
            {isDone && state.sections.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="border border-gray-100 rounded-2xl p-6 text-center bg-gray-50"
              >
                <div className="text-2xl mb-2">✅</div>
                <p className="text-gray-600 text-sm mb-4">报告生成完毕</p>
                <Link
                  href="/"
                  className="inline-block px-5 py-2 bg-black text-white text-sm font-semibold rounded-xl hover:bg-gray-800 transition-colors"
                >
                  分析新关键词
                </Link>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ReportPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-gray-400">加载中...</div>
      </div>
    }>
      <ReportContent />
    </Suspense>
  );
}
