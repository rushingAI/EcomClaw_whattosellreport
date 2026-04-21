"""
Amazon scraper — two execution modes:

1) Docker（默认，本地调试）：宿主机执行 `docker run clawd-crawlee`，挂载 patched handler。
2) Node 内联（生产 / 单镜像）：设置 ECOMCLAW_USE_NODE_SCRAPER=1，在同一容器内用
   xvfb-run + node 运行 /usr/src/app 下的 Crawlee 脚本（Railway 等无 Docker socket 场景）。

Patched handler 支持：多 marketplace、featuredReviews、ratingDistribution 等。
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import urllib.parse

from fba_calculator import enrich_details_with_fba

DOCKER_IMAGE = "clawd-crawlee"

_HERE = os.path.dirname(os.path.abspath(__file__))
PATCHED_HANDLER = os.path.join(_HERE, "amazon_handler_patched.js")

# Crawlee 项目根（Dockerfile 中 node_modules 所在目录）
_DEFAULT_NODE_CWD = "/usr/src/app"
_HANDLER_REL = "assets/amazon_handler.js"

# Supported marketplaces: code → base domain
MARKETPLACES = {
    "us": "amazon.com",
    "uk": "amazon.co.uk",
    "jp": "amazon.co.jp",
    "es": "amazon.es",
    "au": "amazon.com.au",
    "br": "amazon.com.br",
}


def _env_truthy(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in ("1", "true", "yes", "on")


def _use_node_scraper() -> bool:
    """True → 使用 xvfb-run + node；False → 使用 docker run。"""
    if _env_truthy("ECOMCLAW_USE_NODE_SCRAPER"):
        return True
    if _env_truthy("ECOMCLAW_USE_DOCKER_SCRAPER"):
        return False
    # 无 Docker 且存在 Crawlee 目录时，自动走 node（例如合并镜像内）
    if shutil.which("docker") is None and os.path.isdir(os.path.join(_DEFAULT_NODE_CWD, "node_modules")):
        return True
    return False


def _debug_log(msg: str, data: dict) -> None:
    import time as _time
    entry = json.dumps({"sessionId": "9dcbc6", "timestamp": int(_time.time() * 1000), "message": msg, **data}, ensure_ascii=False)
    # stdout → Railway Logs 面板可见
    print(f"[DEBUG] {entry}", flush=True)
    # 本地文件（Railway 上静默失败）
    try:
        log_path = "/Users/gaochang/openclaw_e-commercial/.cursor/debug-9dcbc6.log"
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(entry + "\n")
    except Exception:
        pass


def _parse_success_lines(stdout: str) -> list[dict]:
    results: list[dict] = []
    for line in stdout.splitlines():
        line = line.strip()
        if '"status":"SUCCESS"' in line:
            try:
                results.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    return results


def _run_docker(url: str, marketplace: str = "us", extra_args: list[str] | None = None) -> list[dict]:
    """Run clawd-crawlee via docker on the host."""
    extra_args = extra_args or []
    cmd = [
        "docker", "run", "-t", "--rm",
        "-v", f"{PATCHED_HANDLER}:/usr/src/app/assets/amazon_handler.js:ro",
        DOCKER_IMAGE,
        "node", "assets/amazon_handler.js",
        url,
        "--marketplace", marketplace,
        *extra_args,
    ]
    # #region agent log
    _debug_log("docker_start", {"location": "scraper.py:_run_docker", "hypothesisId": "B", "url": url, "marketplace": marketplace, "cmd": " ".join(cmd)})
    # #endregion
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=120,
        )
        results = _parse_success_lines(proc.stdout)
        # #region agent log
        stdout_lower = proc.stdout.lower()
        has_captcha = "captcha" in stdout_lower or "robot check" in stdout_lower or "enter the characters" in stdout_lower or "api-services.amazon" in stdout_lower
        _debug_log("docker_result", {
            "location": "scraper.py:_run_docker",
            "hypothesisId": "A,B,C,D",
            "returncode": proc.returncode,
            "stderr_snippet": proc.stderr[:1200],
            "stdout_snippet": proc.stdout[:3000],
            "stdout_len": len(proc.stdout),
            "success_count": len(results),
            "has_captcha": has_captcha,
        })
        # #endregion
        return results
    except subprocess.TimeoutExpired:
        # #region agent log
        _debug_log("docker_timeout", {"location": "scraper.py:_run_docker", "hypothesisId": "B", "url": url})
        # #endregion
        return []
    except Exception as e:
        # #region agent log
        _debug_log("docker_exception", {"location": "scraper.py:_run_docker", "hypothesisId": "B", "error": str(e), "url": url})
        # #endregion
        return []


def _run_node(url: str, marketplace: str = "us", extra_args: list[str] | None = None) -> list[dict]:
    """Run handler with node + xvfb inside the same container (no Docker socket)."""
    extra_args = extra_args or []
    node_cwd = os.environ.get("ECOMCLAW_SCRAPER_NODE_CWD", _DEFAULT_NODE_CWD).rstrip("/")
    handler_rel = os.environ.get("ECOMCLAW_NODE_HANDLER_REL", _HANDLER_REL).lstrip("/")
    handler_fs = os.path.join(node_cwd, handler_rel)

    if not os.path.isfile(handler_fs):
        # #region agent log
        _debug_log("node_handler_missing", {"location": "scraper.py:_run_node", "hypothesisId": "B", "handler_fs": handler_fs})
        # #endregion
        return []

    # 与 clawd-crawlee 镜像 entrypoint 中 xvfb 参数一致
    xvfb_args = "-ac -screen 0 1920x1080x24+32 -nolisten tcp"
    cmd = [
        "xvfb-run", "-a", "-s", xvfb_args,
        "node", handler_rel,
        url,
        "--marketplace", marketplace,
        *extra_args,
    ]
    # #region agent log
    _debug_log("node_start", {"location": "scraper.py:_run_node", "hypothesisId": "B", "url": url, "marketplace": marketplace, "node_cwd": node_cwd})
    # #endregion
    try:
        proc = subprocess.run(
            cmd,
            cwd=node_cwd,
            capture_output=True,
            text=True,
            timeout=120,
        )
        results = _parse_success_lines(proc.stdout)
        # #region agent log
        stdout_lower = proc.stdout.lower()
        has_captcha = "captcha" in stdout_lower or "robot check" in stdout_lower or "enter the characters" in stdout_lower or "api-services.amazon" in stdout_lower
        _debug_log("node_result", {
            "location": "scraper.py:_run_node",
            "hypothesisId": "A,B,C,D",
            "returncode": proc.returncode,
            "stderr_snippet": proc.stderr[:1200],
            "stdout_snippet": proc.stdout[:3000],
            "stdout_len": len(proc.stdout),
            "success_count": len(results),
            "has_captcha": has_captcha,
        })
        # #endregion
        return results
    except subprocess.TimeoutExpired:
        # #region agent log
        _debug_log("node_timeout", {"location": "scraper.py:_run_node", "hypothesisId": "B", "url": url})
        # #endregion
        return []
    except FileNotFoundError:
        # #region agent log
        _debug_log("node_not_found", {"location": "scraper.py:_run_node", "hypothesisId": "B", "url": url})
        # #endregion
        return []
    except Exception as e:
        # #region agent log
        _debug_log("node_exception", {"location": "scraper.py:_run_node", "hypothesisId": "B", "error": str(e), "url": url})
        # #endregion
        return []


def _run_scraper(url: str, marketplace: str = "us", extra_args: list[str] | None = None) -> list[dict]:
    if _use_node_scraper():
        return _run_node(url, marketplace, extra_args)
    return _run_docker(url, marketplace, extra_args)


def _base_url(marketplace: str) -> str:
    domain = MARKETPLACES.get(marketplace, "amazon.com")
    return f"https://www.{domain}"


def scrape_search(keyword: str, marketplace: str = "us", pages: int = 2) -> list[dict]:
    encoded = urllib.parse.quote_plus(keyword)
    url = f"{_base_url(marketplace)}/s?k={encoded}"
    return _run_scraper(url, marketplace, ["--pages", str(pages)])


def scrape_product(asin: str, marketplace: str = "us") -> list[dict]:
    url = f"{_base_url(marketplace)}/dp/{asin}"
    results = _run_scraper(url, marketplace)
    enriched = []
    for result in results:
        products = result.get("products", [])
        result = dict(result)
        result["products"] = enrich_details_with_fba(products)
        enriched.append(result)
    return enriched


def scrape_bestsellers(category_path: str, marketplace: str = "us") -> list[dict]:
    url = f"{_base_url(marketplace)}/zgbs/{category_path}"
    return _run_scraper(url, marketplace)


def extract_top_asins(search_results: list[dict], n: int = 5) -> list[str]:
    asins: list[str] = []
    for result in search_results:
        products = result.get("data", {}).get("products", [])
        if not products:
            products = result.get("products", [])
        for p in products:
            if p.get("sponsored"):
                continue
            asin = p.get("asin") or p.get("id")
            if asin and asin not in asins:
                asins.append(asin)
            if len(asins) >= n:
                return asins
    # #region agent log
    _debug_log("extract_top_asins", {
        "location": "scraper.py:extract_top_asins",
        "hypothesisId": "E",
        "search_results_count": len(search_results),
        "top_level_keys": [list(r.keys()) for r in search_results[:2]],
        "asins_found": asins,
    })
    # #endregion
    return asins
