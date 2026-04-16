"""
Calls Claude API with scraped Amazon data and streams the analysis report.
Sections: snapshot / competitors / reviews / pricing / opportunity / actions
"""
import os
from typing import AsyncGenerator

import anthropic

MARKETPLACE_NAMES = {
    "us": "美国站 (amazon.com, USD)",
    "uk": "英国站 (amazon.co.uk, GBP)",
    "jp": "日本站 (amazon.co.jp, JPY)",
    "es": "西班牙站 (amazon.es, EUR)",
    "au": "澳大利亚站 (amazon.com.au, AUD)",
    "br": "巴西站 (amazon.com.br, BRL)",
}

SYSTEM_PROMPT = """你是亚马逊品类研究专家。收到爬取数据和关键词后，输出6个部分的分析报告。

核心原则：
- 只基于爬取到的真实数据分析，禁止编造数字
- 来自爬取的数据标注[实测]；推断/估算的标注[估算]并说明方法
- 产品标题/ASIN/品牌保留英文，分析用中文
- 每部分给出洞察和可执行建议，不只罗列数据
- 【空数据规则】：若某字段/子项的数据为空（空数组、null、空字符串），整个该字段/子项直接跳过，禁止输出"无数据"、"未能爬取"等占位文字；若整个部分的核心数据都为空，则连分隔符也不输出

输出格式：每部分前写分隔符（单独占一行），然后写Markdown内容。

---DIM:snapshot---
## 市场快照

**价格分布**[实测]：所有产品价格列表；最低/最高/中位价；价格密集区间；若有空白区间但有销量支撑则标注"价格机会区"。

**竞争结构**[实测]：徽章数量（Best Seller/AC）、广告位占比（前16位中sponsored数量）。

**市场年龄**[实测]：基于dateFirstAvailable判断成熟度（新兴/成长/成熟）。

末尾：2句核心结论（引用具体数字）。

---DIM:competitors---
## 竞品深度解剖

对每个有详情数据的竞品（最多5个）：

**#排名 [英文标题≤80字符]**
- ASIN/品牌/上架时间 | 价格 | 评分/评论数[实测] | BSR[实测]
- FBA费: $x.xx（[尺寸级别]）[估算：基于产品尺寸±15%]（若无fba_estimate则跳过此行）

**评论增速**[估算]：总评论数 ÷ 上架月数 ≈ X条/月（判断：快速增长/平稳/停滞）（无dateFirstAvailable则跳过）

**卖点定位**（从bullets提炼，限3句，无bullets则跳过）

**关键词**（从标题提炼3-5个核心词，无标题则跳过）

竞品间用`---`分隔。

末尾输出：

**竞品关键词词频表**（汇总所有竞品标题+bullets高频词，按频次排序，Top 15，仅有数据时输出）：
| 关键词 | 出现次数 | 出现在哪些产品 |
|---|---|---|

**关键词空白分析**（用户搜索关键词分词后，哪些词没出现在任何竞品标题中 = 差异化机会，仅有数据时输出）：
- 搜索词拆解：[keyword的分词]
- 未被竞品覆盖的词：[列出] → 这些词可以作为标题差异化切入点

**规格差异对比**（来自details字段，仅有数据时输出）：
| ASIN | 材质 | 尺寸 | 重量 | 产地 |
|---|---|---|---|---|

---DIM:reviews---
## 精选评论分析

【空数据规则】：若featuredReviews为空数组，整个此部分（包括分隔符）不输出。

有数据时输出：

**评分分布**（来自ratingDistribution，仅有数据时输出）：
| 星级 | 占比 |
|---|---|

**评论总览**：X条精选评论，低分（1-2★）X条，高分（4-5★）X条。

**低分评论痛点**（rating <= 2的评论，逐条分析，无则跳过整个子项）：
- **X★ | [日期]** [verified则标注已验证购买]
  > "[英文原文]"
  - 核心问题：（中文解读）
  - 差异化机会：（如何针对此痛点改进）

**高分评论亮点**（rating >= 4，提炼2-3个共性，无则跳过）：
用户最称赞的点（附原文片段）。

**用户语言挖掘**（有低分评论时输出）：从评论提取用户描述体验的独特表达，可用于Listing文案。

---DIM:pricing---
## 价格分布分析

**竞品价格全景**[实测]：
| 产品(ASIN) | 价格 | 评论数 | FBA费[估算] |
|---|---|---|---|---|---|

**价格段分析**：低/中/高三段，每段：产品数、评分均值、竞争激烈度。

**甜蜜点**：哪个价格段销量/竞争比最佳（数据支撑）。

**价格-评分关系**：贵的是否评分更高，消费者是否愿意为质量溢价。

注意：本节不做利润计算，采购成本用户自行测算。

---DIM:opportunity---
## 进入机会评估

**综合评分**：🔴不建议 / 🟡谨慎 / 🟢建议进入
一句话核心理由（引用至少2个具体实测数字）。

**三大机会点**（每条必须有实测数据支撑）：
1. [机会名称]：[数据依据] → [具体差异化方向]

**三大风险点**（同上）：
1. [风险名称]：[数据依据] → [应对建议]

**最佳切入角度**：目标价格带+核心差异化+目标用户（全部基于实测数据）。

---DIM:actions---
## 可执行清单

**Listing关键词建议**（来自词频表+关键词空白，有则输出）：
建议标题必包含的词（按频次排序，附来源竞品）。

**定价策略**（来自实测价格分布）：
建议进入价格区间+理由（引用具体数据）。

**差异化产品方向**（来自差评痛点+规格对比，有则输出）：
2-3条产品改进方向，每条对应差评主题或规格空白。

**优先级清单**：
| 优先级 | 行动 | 数据依据 |
|---|---|---|
| P0（本周） | ... | ... |
| P1（两周内） | ... | ... |
"""

SECTION_TITLES = {
    "snapshot":    "市场快照",
    "competitors": "竞品深度解剖",
    "reviews":     "精选评论分析",
    "pricing":     "价格分布分析",
    "opportunity": "进入机会评估",
    "actions":     "可执行清单",
}


_CURRENCY_SYMBOLS = {
    "us": ("USD", "$"),
    "uk": ("GBP", "£"),
    "jp": ("JPY", "¥"),
    "es": ("EUR", "€"),
    "au": ("AUD", "A$"),
    "br": ("BRL", "R$"),
}


def _normalize_prices(obj: object, sym: str) -> object:
    """Recursively replace priceStr with correctly-formatted price using marketplace symbol."""
    if isinstance(obj, dict):
        if "price" in obj and obj["price"] is not None:
            obj = dict(obj)
            try:
                obj["priceStr"] = f"{sym}{float(obj['price']):.2f}"
            except (TypeError, ValueError):
                pass
        return {k: _normalize_prices(v, sym) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_normalize_prices(item, sym) for item in obj]
    return obj


def _build_user_prompt(keyword: str, marketplace: str, raw_data: dict) -> str:
    import json, copy
    mkt_name = MARKETPLACE_NAMES.get(marketplace, marketplace)
    currency_code, sym = _CURRENCY_SYMBOLS.get(marketplace, ("USD", "$"))

    # Normalize all priceStr fields to the correct marketplace currency
    cleaned = _normalize_prices(copy.deepcopy(raw_data), sym)

    data_json = json.dumps(cleaned, ensure_ascii=False, indent=2)
    if len(data_json) > 80_000:
        data_json = data_json[:80_000] + "\n... [数据已截断] ..."
    return f"""关键词：{keyword}
站点：{mkt_name}
货币：{currency_code}（{sym}）—— 报告中所有价格必须使用此货币，禁止使用SGD或其他货币符号

重要字段说明：
- details：产品规格（尺寸/重量/材质/产地）
- bullets：卖点文案（用于关键词/定位分析）
- featuredReviews：精选评论列表，rating为星级（1-5），body为评论正文
- ratingDistribution：各星级百分比
- fba_estimate：后端FBA费用估算结果

Amazon 实测爬取数据：
{data_json}

请按6个分隔符格式输出报告（---DIM:snapshot--- / ---DIM:competitors--- / ---DIM:reviews--- / ---DIM:pricing--- / ---DIM:opportunity--- / ---DIM:actions---）。
核心要求：数据为空的字段/子项直接跳过，不写任何占位说明文字。若整个reviews部分的featuredReviews为空，连---DIM:reviews---分隔符也不输出。"""


async def stream_analysis(
    keyword: str,
    marketplace: str,
    raw_data: dict,
) -> AsyncGenerator[dict, None]:
    client = anthropic.AsyncAnthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

    yield {"type": "thinking", "message": "正在调用 AI 分析引擎..."}

    full_text = ""
    try:
        async with client.messages.stream(
            model="claude-haiku-4-5",
            max_tokens=8000,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": _build_user_prompt(keyword, marketplace, raw_data)}],
        ) as stream:
            async for text in stream.text_stream:
                full_text += text

    except Exception as e:
        yield {"type": "error", "message": f"AI 分析失败: {str(e)}"}
        return

    sections = _parse_sections(full_text)
    if not sections:
        yield {"type": "section", "id": "snapshot", "title": "分析报告",
               "content": full_text or "未能生成报告内容，请重试。"}
    else:
        for section in sections:
            yield {"type": "section", **section}

    yield {"type": "done"}


def _parse_sections(text: str) -> list[dict]:
    import re
    text = text.replace("\r\n", "\n")
    parts = re.split(r"\n?---DIM:(\w+)---\n?", text)
    sections = []
    i = 1
    while i + 1 < len(parts):
        dim_id = parts[i].strip()
        content = parts[i + 1].strip()
        i += 2
        if not content:
            continue
        sections.append({
            "id": dim_id,
            "title": SECTION_TITLES.get(dim_id, dim_id),
            "content": content,
        })
    return sections
