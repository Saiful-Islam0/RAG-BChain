"""Lightweight client for the hosted blockchain backend."""

import os
import time

import requests

BASE_URL = os.getenv("BLOCKCHAIN_API_BASE_URL", "https://fakensethfa.onrender.com").rstrip("/")
# Hosted bridges (e.g. Render free tier) often cold-start well beyond 15s; short timeouts
# caused silent registration failures while the UI showed placeholder hashes.
DEFAULT_TIMEOUT = int(os.getenv("BLOCKCHAIN_API_TIMEOUT_SEC", "120"))
REGISTER_MAX_ATTEMPTS = int(os.getenv("BLOCKCHAIN_REGISTER_RETRIES", "3"))
REGISTER_RETRY_DELAY_SEC = float(os.getenv("BLOCKCHAIN_REGISTER_RETRY_DELAY_SEC", "3"))


def register_flagged_source(
    url: str,
    publisher: str = "FakeNewsDetector",
    title: str | None = None,
    content: str | None = None,
    timeout: int = DEFAULT_TIMEOUT,
) -> dict:
    """Register a flagged source on-chain via the Render bridge."""
    payload = {"url": url, "publisher": publisher}
    if title:
        payload["title"] = title
    if content:
        payload["content"] = content

    last_error: Exception | None = None
    for attempt in range(REGISTER_MAX_ATTEMPTS):
        try:
            resp = requests.post(f"{BASE_URL}/register", json=payload, timeout=timeout)
            if resp.status_code in (502, 503, 504) and attempt < REGISTER_MAX_ATTEMPTS - 1:
                time.sleep(REGISTER_RETRY_DELAY_SEC * (attempt + 1))
                continue
            if resp.status_code != 200:
                raise RuntimeError(f"Register failed: {resp.status_code} {resp.text}")
            return resp.json()
        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as e:
            last_error = e
            if attempt < REGISTER_MAX_ATTEMPTS - 1:
                time.sleep(REGISTER_RETRY_DELAY_SEC * (attempt + 1))
            continue

    raise RuntimeError(
        f"Register failed after {REGISTER_MAX_ATTEMPTS} attempts (bridge unreachable or timed out): {last_error}"
    ) from last_error


def check_source_reputation(url: str, timeout: int = DEFAULT_TIMEOUT) -> dict:
    """Return metadata if URL exists in registry; otherwise {"known": False}."""
    resp = requests.get(f"{BASE_URL}/getNews", params={"url": url}, timeout=timeout)
    if resp.status_code == 200:
        data = resp.json()
        data["known"] = True
        return data
    if resp.status_code == 404:
        return {"known": False}
    raise RuntimeError(f"Lookup failed: {resp.status_code} {resp.text}")


def _normalize_publisher_history(data: dict) -> dict:
    """Normalize different publisher-history shapes into one stable format."""
    if not isinstance(data, dict):
        return {"status": "unknown", "count": 0, "urls": [], "articles": []}

    articles = data.get("articles")
    if isinstance(articles, list):
        normalized_urls = []
        for item in articles:
            if isinstance(item, dict) and item.get("url"):
                normalized_urls.append(item["url"])
            elif isinstance(item, str):
                normalized_urls.append(item)
        return {
            "status": data.get("status", "success"),
            "publisher": data.get("publisher"),
            "count": data.get("count", len(articles)),
            "articles": articles,
            "urls": normalized_urls,
            "raw": data,
        }

    urls = data.get("urls")
    if isinstance(urls, list):
        return {
            "status": data.get("status", "success"),
            "publisher": data.get("publisher"),
            "count": data.get("count", len(urls)),
            "articles": [],
            "urls": urls,
            "raw": data,
        }

    return {
        "status": data.get("status", "unknown"),
        "publisher": data.get("publisher"),
        "count": data.get("count", 0),
        "articles": [],
        "urls": [],
        "raw": data,
    }


def get_sources_by_publisher(publisher: str, timeout: int = DEFAULT_TIMEOUT) -> dict:
    """Fetch all URLs registered for a publisher."""
    resp = requests.get(
        f"{BASE_URL}/publisherhistory",
        params={"publisher": publisher},
        timeout=timeout,
    )
    if resp.status_code == 200:
        return _normalize_publisher_history(resp.json())
    if resp.status_code == 404:
        # Temporary migration fallback for older bridge contract.
        fallback = requests.get(
            f"{BASE_URL}/getNewsByPublisher",
            params={"publisher": publisher},
            timeout=timeout,
        )
        if fallback.status_code == 200:
            return _normalize_publisher_history(fallback.json())
        raise RuntimeError(f"Publisher lookup failed: {fallback.status_code} {fallback.text}")
    raise RuntimeError(f"Publisher lookup failed: {resp.status_code} {resp.text}")
