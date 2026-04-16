"""Extract structured chart data from raw Amazon scraping results for frontend visualizations."""
import math
import re
from typing import Any

MARKETPLACE_CURRENCIES = {
    "us": "USD", "uk": "GBP", "jp": "JPY",
    "es": "EUR", "au": "AUD", "br": "BRL",
}


def extract_chart_data(raw_data: dict) -> dict:
    """Return price_distribution, competitor scatter, and rating_distribution."""
    search_results = raw_data.get("search", [])
    detail_results = raw_data.get("details", [])
    marketplace = raw_data.get("marketplace", "us")
    currency = MARKETPLACE_CURRENCIES.get(marketplace, "USD")

    # Collect all products, deduplicate by ASIN (detail takes precedence over search)
    seen_asins: set[str] = set()
    products: list[dict] = []
    for r in (detail_results + search_results):
        if not isinstance(r, dict):
            continue
        product_list: list = (
            r.get("products")
            or r.get("data", {}).get("products", [])
            or []
        )
        for p in product_list:
            asin = p.get("asin", "")
            if not asin or asin in seen_asins:
                continue
            seen_asins.add(asin)
            products.append(p)

    prices: list[float] = []
    competitors: list[dict] = []

    for p in products:
        price = _safe_float(p.get("price"))
        rating = _safe_float(p.get("rating"))
        reviews = _safe_int(p.get("reviews"))
        asin = p.get("asin", "")
        title = (p.get("title") or "")[:50]
        if price:
            prices.append(price)

        if price and rating:
            competitors.append({
                "asin": asin,
                "title": title,
                "price": price,
                "rating": rating,
                "reviews": reviews or 0,
            })

    return {
        "competitors": competitors,
        "price_distribution": _build_price_dist(prices, currency),
        "rating_distribution": _aggregate_rating_distribution(products),
        "currency": currency,
        "marketplace": marketplace,
        "total_products": len(products),
    }


def _aggregate_rating_distribution(products: list[dict]) -> list[dict]:
    """Return the star breakdown from the first product that has ratingDistribution."""
    for p in products:
        rd = p.get("ratingDistribution") or {}
        if not rd:
            continue
        result = []
        for star in (5, 4, 3, 2, 1):
            raw = rd.get(f"{star}_star", rd.get(f"{star}star", ""))
            pct = _parse_pct(str(raw))
            if pct is not None:
                result.append({"star": star, "label": f"{star}★", "pct": pct})
        if result:
            return result
    return []


def _parse_pct(s: str) -> float | None:
    m = re.search(r"([\d.]+)\s*%", s)
    if m:
        return float(m.group(1))
    try:
        return float(s)
    except (ValueError, TypeError):
        return None


def _build_price_dist(prices: list[float], currency: str) -> list[dict]:
    if not prices:
        return []

    min_p, max_p = min(prices), max(prices)
    span = max_p - min_p

    if span < 1:
        return [{"range": _fmt_price(min_p, currency), "count": len(prices)}]

    bucket = max(1.0, _nice_number(span / 7))
    buckets: dict[float, int] = {}
    for p in prices:
        b = math.floor(p / bucket) * bucket
        buckets[b] = buckets.get(b, 0) + 1

    return [
        {"range": f"{_fmt_price(b, currency)}-{_fmt_price(b + bucket, currency)}", "count": cnt}
        for b, cnt in sorted(buckets.items())
    ]


def _fmt_price(value: float, currency: str) -> str:
    symbols = {"USD": "$", "GBP": "£", "EUR": "€", "AUD": "A$", "BRL": "R$", "JPY": "¥"}
    sym = symbols.get(currency, "")
    return f"{sym}{int(value)}" if currency == "JPY" else f"{sym}{value:.0f}"


def _nice_number(x: float) -> float:
    if x <= 0:
        return 1
    exp = math.floor(math.log10(x))
    base = 10 ** exp
    for factor in (1, 2, 5, 10):
        if base * factor >= x:
            return float(base * factor)
    return float(base * 10)


def _safe_float(v: Any) -> float | None:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _safe_int(v: Any) -> int | None:
    try:
        return int(str(v).replace(",", ""))
    except (TypeError, ValueError):
        return None
