"""
FastAPI backend for EcomClaw.
Endpoint: GET /api/analyze?keyword=...&marketplace=us
Streams Server-Sent Events back to the client.
"""
import asyncio
import json
import os
from typing import AsyncGenerator

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

load_dotenv()

from analyzer import stream_analysis
from auth import CurrentUser, check_and_consume_quota, get_current_user
from chart_data import extract_chart_data
from scraper import (
    MARKETPLACES,
    extract_top_asins,
    scrape_product,
    scrape_search,
)

app = FastAPI(title="EcomClaw API", version="1.0.0")

_cors_raw = os.environ.get(
    "CORS_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000",
)
_cors_origins = [o.strip() for o in _cors_raw.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def sse_event(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


MARKETPLACE_LABELS = {
    "us": "🇺🇸 美国",
    "uk": "🇬🇧 英国",
    "jp": "🇯🇵 日本",
    "es": "🇪🇸 西班牙",
    "au": "🇦🇺 澳大利亚",
    "br": "🇧🇷 巴西",
}


async def analysis_stream(keyword: str, marketplace: str) -> AsyncGenerator[str, None]:
    raw_data: dict = {"marketplace": marketplace}
    label = MARKETPLACE_LABELS.get(marketplace, marketplace.upper())

    # ── Phase 1: Search ──────────────────────────────────────────────────────
    yield sse_event({"type": "phase", "phase": "search",
                     "message": f'正在搜索 {label} "{keyword}"...'})
    search_results = await asyncio.to_thread(scrape_search, keyword, marketplace, 2)

    if not search_results:
        yield sse_event({"type": "phase", "phase": "search_done",
                         "message": "搜索结果为空，进入 AI 估算模式"})
    else:
        raw_data["search"] = search_results
        yield sse_event({"type": "phase", "phase": "search_done",
                         "message": "搜索结果获取完成 ✓"})

    # ── Phase 2: Product details ─────────────────────────────────────────────
    top_asins = extract_top_asins(search_results)
    yield sse_event({"type": "phase", "phase": "details",
                     "message": f"正在抓取 Top {len(top_asins)} 竞品详情（含精选评论）..."})

    detail_results = []
    for i, asin in enumerate(top_asins[:5]):
        yield sse_event({"type": "phase", "phase": "detail_item",
                         "message": f"竞品 {i+1}/{min(len(top_asins), 5)}: {asin}"})
        details = await asyncio.to_thread(scrape_product, asin, marketplace)
        detail_results.extend(details)

    raw_data["details"] = detail_results
    yield sse_event({"type": "phase", "phase": "details_done",
                     "message": "竞品详情采集完成 ✓"})

    # ── Phase 2.5: Emit chart data (instant, before AI) ──────────────────────
    try:
        chart = extract_chart_data(raw_data)
        yield sse_event({"type": "chart_data", **chart})
    except Exception as e:
        import traceback; traceback.print_exc()
        print(f"[chart_data] error: {e}")

    # ── Phase 3: AI analysis ─────────────────────────────────────────────────
    yield sse_event({"type": "phase", "phase": "analyzing",
                     "message": "正在生成品类分析报告..."})

    async for event in stream_analysis(keyword, marketplace, raw_data):
        yield sse_event(event)

    yield sse_event({"type": "phase", "phase": "complete",
                     "message": "报告生成完成！"})


@app.get("/api/analyze")
async def analyze(
    keyword: str = Query(..., min_length=1, max_length=200),
    marketplace: str = Query("us"),
    user: CurrentUser = Depends(get_current_user),
):
    if marketplace not in MARKETPLACES:
        marketplace = "us"
    # 先消费配额（原子操作，配额耗尽返回 402）
    await check_and_consume_quota(user)
    return StreamingResponse(
        analysis_stream(keyword, marketplace),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "1.0.0", "marketplaces": list(MARKETPLACES.keys())}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
