"use client";

import { useState, useCallback, useRef } from "react";

export type PhaseEvent = {
  type: "phase";
  phase: string;
  message: string;
};

export type SectionEvent = {
  type: "section";
  id: string;
  title: string;
  content: string;
};

export type ErrorEvent = {
  type: "error";
  message: string;
};

export type PriceBucket = { range: string; count: number };
export type CompetitorPoint = {
  asin: string;
  title: string;
  price: number;
  rating: number;
  reviews: number;
};
export type RatingBucket = { star: number; label: string; pct: number };

export type ChartData = {
  price_distribution: PriceBucket[];
  competitors: CompetitorPoint[];
  rating_distribution: RatingBucket[];
  currency: string;
  marketplace: string;
  total_products: number;
};

export type ChartDataEvent = { type: "chart_data" } & ChartData;

export type AnalysisEvent =
  | PhaseEvent
  | SectionEvent
  | ErrorEvent
  | { type: "thinking"; message: string }
  | ChartDataEvent
  | { type: "done" };

export type PhaseLog = { phase: string; message: string; done: boolean };

export type ReportSection = {
  id: string;
  title: string;
  content: string;
};

export type AnalysisState = {
  status: "idle" | "running" | "done" | "error";
  phases: PhaseLog[];
  sections: ReportSection[];
  chartData: ChartData | null;
  errorMessage: string | null;
  currentPhase: string | null;
};

const BACKEND_URL = "http://localhost:8000";
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

type CacheEntry = {
  sections: ReportSection[];
  chartData: ChartData | null;
  cachedAt: number; // unix ms
};

function cacheKey(keyword: string, marketplace: string) {
  return `ecom:${keyword.trim().toLowerCase()}:${marketplace}`;
}

function readCache(keyword: string, marketplace: string): CacheEntry | null {
  try {
    const raw = sessionStorage.getItem(cacheKey(keyword, marketplace));
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
      sessionStorage.removeItem(cacheKey(keyword, marketplace));
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

function writeCache(keyword: string, marketplace: string, entry: Omit<CacheEntry, "cachedAt">) {
  try {
    sessionStorage.setItem(
      cacheKey(keyword, marketplace),
      JSON.stringify({ ...entry, cachedAt: Date.now() })
    );
  } catch {
    // sessionStorage full or unavailable — silently skip
  }
}

function clearCache(keyword: string, marketplace: string) {
  try {
    sessionStorage.removeItem(cacheKey(keyword, marketplace));
  } catch {
    // ignore
  }
}

export type AnalysisState = {
  status: "idle" | "running" | "done" | "error";
  phases: PhaseLog[];
  sections: ReportSection[];
  chartData: ChartData | null;
  errorMessage: string | null;
  currentPhase: string | null;
  cachedAt: number | null; // non-null when result was loaded from cache
};

export function useAnalysis() {
  const [state, setState] = useState<AnalysisState>({
    status: "idle",
    phases: [],
    sections: [],
    chartData: null,
    errorMessage: null,
    currentPhase: null,
    cachedAt: null,
  });

  const abortRef = useRef<(() => void) | null>(null);

  const start = useCallback((keyword: string, marketplace: string = "us") => {
    // Check sessionStorage cache first
    const cached = readCache(keyword, marketplace);
    if (cached) {
      setState({
        status: "done",
        phases: [{ phase: "cached", message: "已加载缓存报告", done: true }],
        sections: cached.sections,
        chartData: cached.chartData
          ? { rating_distribution: [], ...cached.chartData }
          : null,
        errorMessage: null,
        currentPhase: null,
        cachedAt: cached.cachedAt,
      });
      return;
    }

    // No cache — run fresh analysis
    setState({
      status: "running",
      phases: [],
      sections: [],
      chartData: null,
      errorMessage: null,
      currentPhase: null,
      cachedAt: null,
    });

    const url = `${BACKEND_URL}/api/analyze?keyword=${encodeURIComponent(keyword)}&marketplace=${encodeURIComponent(marketplace)}`;
    const eventSource = new EventSource(url);
    abortRef.current = () => eventSource.close();

    eventSource.onmessage = (e) => {
      try {
        const event: AnalysisEvent = JSON.parse(e.data);

        if (event.type === "phase" || event.type === "thinking") {
          const msg = event.message;
          setState((prev) => {
            const phases = [...prev.phases];
            if (phases.length > 0) {
              phases[phases.length - 1] = { ...phases[phases.length - 1], done: true };
            }
            phases.push({ phase: (event as PhaseEvent).phase ?? "thinking", message: msg, done: false });
            return { ...prev, phases, currentPhase: msg };
          });
        }

        if (event.type === "chart_data") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const ev = event as any;
          setState((prev) => ({
            ...prev,
            chartData: {
              price_distribution: ev.price_distribution ?? [],
              competitors: ev.competitors ?? [],
              rating_distribution: ev.rating_distribution ?? [],
              currency: ev.currency ?? "USD",
              marketplace: ev.marketplace ?? "us",
              total_products: ev.total_products ?? 0,
            } satisfies ChartData,
          }));
        }

        if (event.type === "section") {
          const { id, title, content } = event as SectionEvent;
          setState((prev) => ({
            ...prev,
            sections: [...prev.sections, { id, title, content }],
          }));
        }

        if (event.type === "error") {
          setState((prev) => ({
            ...prev,
            status: "error",
            errorMessage: (event as ErrorEvent).message,
          }));
          eventSource.close();
        }

        if (event.type === "done") {
          setState((prev) => {
            const phases = prev.phases.map((p, i) =>
              i === prev.phases.length - 1 ? { ...p, done: true } : p
            );
            // Save to sessionStorage
            writeCache(keyword, marketplace, {
              sections: prev.sections,
              chartData: prev.chartData,
            });
            return { ...prev, status: "done", phases, cachedAt: null };
          });
          eventSource.close();
        }
      } catch {
        // Ignore parse errors
      }
    };

    eventSource.onerror = () => {
      setState((prev) =>
        prev.status === "running"
          ? { ...prev, status: "error", errorMessage: "连接后端失败，请确认后端服务已启动（localhost:8000）" }
          : prev
      );
      eventSource.close();
    };
  }, []);

  // Force a fresh re-run, bypassing cache
  const rerun = useCallback((keyword: string, marketplace: string = "us") => {
    abortRef.current?.();
    clearCache(keyword, marketplace);
    start(keyword, marketplace);
  }, [start]);

  const reset = useCallback(() => {
    abortRef.current?.();
    setState({
      status: "idle",
      phases: [],
      sections: [],
      chartData: null,
      errorMessage: null,
      currentPhase: null,
      cachedAt: null,
    });
  }, []);

  return { state, start, rerun, reset };
}
