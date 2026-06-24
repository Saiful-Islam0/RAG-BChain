#!/usr/bin/env python3
"""
Unit test for blockchain_registry helper using simple request monkeypatching.
No network calls are made.
"""

import requests
import blockchain_registry as br


class _DummyResponse:
    def __init__(self, status_code, json_data=None, text=""):
        self.status_code = status_code
        self._json = json_data or {}
        self.text = text

    def json(self):
        return self._json


def test_helper_functions():
    original_post = requests.post
    original_get = requests.get
    calls = {}

    def fake_post(url, json=None, timeout=0):
        calls["post"] = {"url": url, "json": json, "timeout": timeout}
        return _DummyResponse(200, {"status": "success", "source_id": 1, "tx_hash": "0xabc"})

    def fake_get(url, params=None, timeout=0):
        calls.setdefault("get", []).append({"url": url, "params": params, "timeout": timeout})
        if "/publisherhistory" in url:
            return _DummyResponse(
                200,
                {
                    "status": "success",
                    "publisher": params.get("publisher"),
                    "count": 2,
                    "articles": [{"url": "u1"}, {"url": "u2"}],
                },
            )
        if "/getNewsByPublisher" in url:
            return _DummyResponse(200, {"status": "success", "publisher": params.get("publisher"), "urls": ["u1", "u2"]})
        if "/getNews" in url:
            return _DummyResponse(200, {"status": "success", "url": params.get("url"), "publisher": "Tester"})
        return _DummyResponse(404, text="Not Found")

    try:
        requests.post = fake_post
        requests.get = fake_get

        rep = br.check_source_reputation("https://example.com")
        assert rep["known"] is True
        assert rep["url"] == "https://example.com"

        reg = br.register_flagged_source(
            "https://example.com",
            publisher="Tester",
            title="Fake headline",
            content="This source repeatedly publishes false claims.",
        )
        assert reg["status"] == "success"
        assert calls["post"]["json"]["title"] == "Fake headline"
        assert calls["post"]["json"]["content"].startswith("This source")
        pub = br.get_sources_by_publisher("Tester")
        assert pub["urls"] == ["u1", "u2"]
        assert pub["count"] == 2

        print("✓ blockchain_registry helper tests passed")
        return True
    finally:
        requests.post = original_post
        requests.get = original_get


if __name__ == "__main__":
    ok = test_helper_functions()
    if not ok:
        raise SystemExit(1)
