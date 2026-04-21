"use client";

import { useState, useCallback, useRef } from "react";

export type PhaseEvent = { type: "phase"; phase: string; message: string };
export type SectionEvent = { type: "section"; id: string; title: string; content: string };
export type ErrorEvent = { type: "error"; message: string };
export type PriceBucket = { range: string; count: number };
export type CompetitorPoint = { asin: string; title: string; price: number; rating: number; reviews: number };
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
export type ReportSection = { id: string; title: string; content: string };

export type AnalysisState = {
  status: "idle" | "running" | "done" | "error";
  phases: PhaseLog[];
  sections: ReportSection[];
  chartData: ChartData | null;
  errorMessage: string | null;
  errorCode: "quota_exhausted" | "unauthorized" | "generic" | null;
  currentPhase: string | null;
  cachedAt: number | null;
};

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
const CACHE_TTL_MS = 2 * 60 * 60 * 1000;

type CacheEntry = { sections: ReportSection[]; chartData: ChartData | null; cachedAt: number };

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
  } catch { return null; }
}

function writeCache(keyword: string, marketplace: string, entry: Omit<CacheEntry, "cachedAt">) {
  try {
    sessionStorage.setItem(cacheKey(keyword, marketplace), JSON.stringify({ ...entry, cachedAt: Date.now() }));
  } catch { /* full */ }
}

function clearCache(keyword: string, marketplace: string) {
  try { sessionStorage.removeItem(cacheKey(keyword, marketplace)); } catch { /* ignore */ }
}

const IDLE_STATE: AnalysisState = {
  status: "idle", phases: [], sections: [], chartData: null,
  errorMessage: null, errorCode: null, currentPhase: null, cachedAt: null,
};

export function useAnalysis() {
  const [state, setState] = useState<AnalysisState>(IDLE_STATE);
  const abortRef = useRef<AbortController | null>(null);
  // 缓存最后一次使用的 token，供 rerun 复用
  const tokenRef = useRef<string>("");

  // token 由调用方从服务端传入，start() 内部不再调用 getSession()
  // 彻底消除 Web Locks API 竞争导致的永久挂起问题
  const start = useCallback(async (keyword: string, marketplace: string, token: string) => {
    const cached = readCache(keyword, marketplace);
    if (cached) {
      setState({
        status: "done",
        phases: [{ phase: "cached", message: "已加载缓存报告", done: true }],
        sections: cached.sections,
        chartData: cached.chartData ? { rating_distribution: [], ...cached.chartData } : null,
        errorMessage: null, errorCode: null, currentPhase: null, cachedAt: cached.cachedAt,
      });
      return;
    }

    // 先 abort 上一个请求，再创建新 controller（必须在任何 await 之前）
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    tokenRef.current = token;

    setState({ ...IDLE_STATE, status: "running" });

    if (!token) {
      setState({ ...IDLE_STATE, status: "error", errorMessage: "未登录，请刷新页面重新登录", errorCode: "unauthorized" });
      return;
    }

    const url = `${BACKEND_URL}/api/analyze?keyword=${encodeURIComponent(keyword)}&marketplace=${encodeURIComponent(marketplace)}`;

    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
        signal: controller.signal,
      });
    } catch {
      if (!controller.signal.aborted) {
        setState({ ...IDLE_STATE, status: "error", errorMessage: "连接后端失败，请确认服务已启动", errorCode: "generic" });
      }
      return;
    }

    if (response.status === 401) {
      setState({ ...IDLE_STATE, status: "error", errorMessage: "登录已过期，请刷新页面重新登录", errorCode: "unauthorized" });
      return;
    }
    if (response.status === 402) {
      setState({ ...IDLE_STATE, status: "error", errorMessage: "报告次数已用完，请充值后继续", errorCode: "quota_exhausted" });
      return;
    }
    if (!response.ok || !response.body) {
      setState({ ...IDLE_STATE, status: "error", errorMessage: `服务器错误 (${response.status})`, errorCode: "generic" });
      return;
    }

    // 逐行解析 SSE
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const handleEvent = (event: AnalysisEvent) => {
      if (event.type === "phase" || event.type === "thinking") {
        const msg = event.message;
        setState((prev) => {
          const phases = [...prev.phases];
          if (phases.length > 0) phases[phases.length - 1] = { ...phases[phases.length - 1], done: true };
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
        setState((prev) => {
          // 防止 StrictMode 双触发导致同 id 重复插入
          if (prev.sections.some((s) => s.id === id)) return prev;
          return { ...prev, sections: [...prev.sections, { id, title, content }] };
        });
      }
      if (event.type === "error") {
        setState((prev) => ({ ...prev, status: "error", errorMessage: (event as ErrorEvent).message, errorCode: "generic" }));
      }
      if (event.type === "done") {
        setState((prev) => {
          const phases = prev.phases.map((p, i) => i === prev.phases.length - 1 ? { ...p, done: true } : p);
          writeCache(keyword, marketplace, { sections: prev.sections, chartData: prev.chartData });
          return { ...prev, status: "done", phases, cachedAt: null };
        });
      }
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop()!;
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try { handleEvent(JSON.parse(line.slice(6))); } catch { /* ignore */ }
          }
        }
      }
      // 流正常关闭：flush 剩余 buffer（处理末尾无换行的最后一行，如 "done" 事件）
      if (buffer.startsWith("data: ")) {
        try { handleEvent(JSON.parse(buffer.slice(6))); } catch { /* ignore */ }
      }
      // 安全兜底：流关闭后，确保 status=done 且所有 phase 都标记完成
      // 处理两种情况：
      // 1. "done" 事件从未收到（status 仍是 "running"）
      // 2. 后端在 "done" 之后又发了 phase 事件，导致最后一项 done:false
      setState((prev) => {
        const hasUndonePhase = prev.phases.some(p => !p.done);
        if (prev.status === "done" && !hasUndonePhase) return prev; // 已经干净，无需变更
        return {
          ...prev,
          status: "done",
          phases: prev.phases.map(p => ({ ...p, done: true })),
        };
      });
    } catch {
      if (!controller.signal.aborted) {
        setState((prev) => prev.status === "running"
          ? { ...prev, status: "error", errorMessage: "连接中断，请重试", errorCode: "generic" }
          : prev
        );
      }
    }
  }, []);

  const rerun = useCallback((keyword: string, marketplace: string = "us") => {
    abortRef.current?.abort();
    clearCache(keyword, marketplace);
    start(keyword, marketplace, tokenRef.current);
  }, [start]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState(IDLE_STATE);
  }, []);

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { state, start, rerun, reset, abort };
}
