"""
Amazon FBA Fulfillment Fee Calculator — 2025 US fee table.
Uses product dimensions and weight from scraped `details` field.
All results are estimates; labelled accordingly.

Reference: https://sellercentral.amazon.com/help/hub/reference/GPDC3KPYAGDTVDJP
"""
import re
from dataclasses import dataclass
from typing import Optional


@dataclass
class FBAEstimate:
    size_tier: str
    fulfillment_fee: float
    note: str
    source: str = "[估算：基于产品尺寸，误差±15%]"


# ── Size tier thresholds ─────────────────────────────────────────────────────
# Weight in oz, dimensions in inches

def _parse_weight_oz(weight_str: str) -> Optional[float]:
    """Parse weight string like '2.5 pounds', '8 ounces', '1.2 lbs' → oz."""
    if not weight_str:
        return None
    s = weight_str.lower().strip()
    m = re.search(r"([\d.]+)\s*(pound|lb)", s)
    if m:
        return float(m.group(1)) * 16
    m = re.search(r"([\d.]+)\s*(ounce|oz)", s)
    if m:
        return float(m.group(1))
    m = re.search(r"([\d.]+)\s*(kilogram|kg)", s)
    if m:
        return float(m.group(1)) * 35.274
    m = re.search(r"([\d.]+)\s*(gram|g)\b", s)
    if m:
        return float(m.group(1)) * 0.03527
    # bare number fallback — assume oz
    m = re.search(r"^([\d.]+)$", s)
    if m:
        return float(m.group(1))
    return None


def _parse_dimensions_in(dim_str: str) -> Optional[tuple[float, float, float]]:
    """Parse '12 x 8 x 4 inches' → (L, W, H) in inches."""
    if not dim_str:
        return None
    s = dim_str.lower()
    nums = re.findall(r"[\d.]+", s)
    if len(nums) >= 3:
        dims = sorted([float(n) for n in nums[:3]], reverse=True)
        # Convert cm → inches if 'cm' present
        if "cm" in s:
            dims = [d / 2.54 for d in dims]
        return tuple(dims)  # (longest, median, shortest)
    return None


def _dimensional_weight(l: float, w: float, h: float) -> float:
    """Dimensional weight in oz (Amazon uses 139 cu in per lb)."""
    return (l * w * h / 139) * 16


def calculate_fba_fee(details: dict) -> FBAEstimate:
    """
    Given a product's `details` dict (from scraper), estimate the FBA
    fulfillment fee in USD.
    """
    # Extract raw strings from common detail keys
    weight_keys = ["Item Weight", "Package Weight", "Shipping Weight", "Weight"]
    dim_keys = [
        "Product Dimensions", "Item Dimensions", "Package Dimensions",
        "Item Dimensions  LxWxH", "Product Dimensions  LxWxH"
    ]

    weight_str = next((details[k] for k in weight_keys if k in details), None)
    dim_str = next((details[k] for k in dim_keys if k in details), None)

    weight_oz = _parse_weight_oz(weight_str) if weight_str else None
    dims = _parse_dimensions_in(dim_str) if dim_str else None

    if weight_oz is None and dims is None:
        return FBAEstimate(
            size_tier="未知",
            fulfillment_fee=0.0,
            note="无法从爬取数据中解析尺寸/重量，无法计算FBA费用",
        )

    # Use dimensional weight if heavier
    if dims:
        l, w, h = dims
        dim_w_oz = _dimensional_weight(l, w, h)
        billable_oz = max(weight_oz or 0, dim_w_oz)
    else:
        billable_oz = weight_oz or 0
        l, w, h = 0, 0, 0

    longest = l or 0
    median = w or 0
    shortest = h or 0

    # ── Size tier determination ──────────────────────────────────────────────
    # Small Standard: ≤15"×12"×0.75", ≤16oz
    if (longest <= 15 and median <= 12 and shortest <= 0.75 and billable_oz <= 16):
        tier = "Small Standard"
        if billable_oz <= 4:    fee = 3.22
        elif billable_oz <= 8:  fee = 3.40
        elif billable_oz <= 12: fee = 3.58
        else:                   fee = 3.77

    # Large Standard: ≤18"×14"×8", ≤20 lbs
    elif (longest <= 18 and median <= 14 and shortest <= 8 and billable_oz <= 320):
        tier = "Large Standard"
        lbs = billable_oz / 16
        if lbs <= 0.25:    fee = 3.86
        elif lbs <= 0.5:   fee = 4.08
        elif lbs <= 0.75:  fee = 4.24
        elif lbs <= 1.0:   fee = 4.75
        elif lbs <= 1.5:   fee = 5.40
        elif lbs <= 2.0:   fee = 5.69
        elif lbs <= 2.5:   fee = 6.10
        elif lbs <= 3.0:   fee = 6.39
        elif lbs <= 20.0:  fee = 6.39 + (lbs - 3.0) * 0.16
        else:              fee = 6.39 + 17 * 0.16  # cap at 20 lbs

    # Large Bulky: up to 96"×30"×30", ≤50 lbs
    elif (longest <= 96 and (2 * (median + shortest)) + longest <= 165 and billable_oz <= 800):
        tier = "Large Bulky"
        lbs = billable_oz / 16
        if lbs <= 1:       fee = 9.73
        elif lbs <= 2:     fee = 10.46
        elif lbs <= 4:     fee = 11.43
        elif lbs <= 10:    fee = 13.22
        elif lbs <= 50:    fee = 13.22 + (lbs - 10) * 0.38
        else:              fee = 13.22 + 40 * 0.38

    # Extra Large
    else:
        tier = "Extra Large"
        lbs = billable_oz / 16
        fee = 26.33 + max(0, lbs - 90) * 0.38

    weight_display = f"{billable_oz:.1f}oz ({billable_oz/16:.2f}lbs)"
    dim_display = f"{longest:.1f}\"×{median:.1f}\"×{shortest:.1f}\"" if dims else "未知"

    return FBAEstimate(
        size_tier=tier,
        fulfillment_fee=round(fee, 2),
        note=f"尺寸: {dim_display} | 计费重量: {weight_display} | 尺寸级别: {tier}",
    )


def enrich_details_with_fba(products: list[dict]) -> list[dict]:
    """Add `fba_estimate` field to each product that has a `details` dict."""
    enriched = []
    for p in products:
        details = p.get("details", {})
        if details:
            est = calculate_fba_fee(details)
            p = dict(p)
            p["fba_estimate"] = {
                "fee": est.fulfillment_fee,
                "size_tier": est.size_tier,
                "note": est.note,
                "source": est.source,
            }
        enriched.append(p)
    return enriched
