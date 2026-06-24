#!/usr/bin/env python3
"""
Focused tests for multi-source on-chain flagging logic.
These tests stub heavy runtime dependencies to keep execution local and fast.
"""

import importlib
import sys
import types
from dataclasses import dataclass

import numpy as np


def _install_import_stubs():
    langchain_groq = types.ModuleType("langchain_groq")
    langchain_groq.ChatGroq = type("ChatGroq", (), {})
    sys.modules["langchain_groq"] = langchain_groq

    langchain_core = types.ModuleType("langchain_core")
    sys.modules["langchain_core"] = langchain_core

    prompts = types.ModuleType("langchain_core.prompts")
    prompts.PromptTemplate = type("PromptTemplate", (), {})
    prompts.ChatPromptTemplate = type("ChatPromptTemplate", (), {})
    sys.modules["langchain_core.prompts"] = prompts

    @dataclass
    class _Doc:
        page_content: str = ""
        metadata: dict = None

        def __post_init__(self):
            if self.metadata is None:
                self.metadata = {}

    documents = types.ModuleType("langchain_core.documents")
    documents.Document = _Doc
    sys.modules["langchain_core.documents"] = documents

    output_parsers = types.ModuleType("langchain_core.output_parsers")
    output_parsers.StrOutputParser = type("StrOutputParser", (), {})
    sys.modules["langchain_core.output_parsers"] = output_parsers

    runnables = types.ModuleType("langchain_core.runnables")
    runnables.RunnablePassthrough = type("RunnablePassthrough", (), {})
    runnables.RunnableLambda = type("RunnableLambda", (), {})
    sys.modules["langchain_core.runnables"] = runnables

    sarvamai = types.ModuleType("sarvamai")
    sarvamai.SarvamAI = type("SarvamAI", (), {})
    sys.modules["sarvamai"] = sarvamai

    claim_storage = types.ModuleType("claim_storage")

    class _DummyClaimStorageManager:
        def __init__(self, embedding_model=None):
            self.embedding_model = embedding_model

        def save_claim_record(self, **kwargs):
            return "dummy-claim-id"

    claim_storage.ClaimStorageManager = _DummyClaimStorageManager
    sys.modules["claim_storage"] = claim_storage

    sentence_transformers = types.ModuleType("sentence_transformers")

    class _DummySentenceTransformer:
        def __init__(self, *args, **kwargs):
            pass

        def encode(self, texts):
            vectors = []
            for text in texts:
                length = float(len(text or ""))
                vectors.append(np.array([length, length + 1.0], dtype=float))
            return np.array(vectors)

    sentence_transformers.SentenceTransformer = _DummySentenceTransformer
    sys.modules["sentence_transformers"] = sentence_transformers

    blockchain_registry = types.ModuleType("blockchain_registry")
    blockchain_registry.register_flagged_source = lambda *args, **kwargs: {"status": "success"}
    blockchain_registry.check_source_reputation = lambda *args, **kwargs: {"known": False}
    blockchain_registry.get_sources_by_publisher = lambda *args, **kwargs: {"count": 0, "urls": []}
    sys.modules["blockchain_registry"] = blockchain_registry


def _load_fact_check_llm():
    _install_import_stubs()
    if "fact_check_llm" in sys.modules:
        del sys.modules["fact_check_llm"]
    return importlib.import_module("fact_check_llm")


def test_aggregate_sources_dedup_and_false_support_filter():
    fact_check_llm = _load_fact_check_llm()

    submitted_url = "https://news.example.com/a-story/?utm_source=foo"
    evidence_sources = [
        {"url": "https://news.example.com/a-story", "title": "A"},
        {"url": "https://other.example.org/claim-1", "title": "B"},
        {"url": "https://other.example.org/claim-2", "title": "C"},
    ]
    flagged_sources = [
        {
            "url": "https://other.example.org/claim-1",
            "title": "Supports false claim",
            "snippet": "matched",
            "similarity": 0.91,
            "overlap": 0.33,
            "stance": "assert",
        },
        {
            "url": "https://other.example.org/claim-2",
            "title": "Refutes claim",
            "snippet": "debunk",
            "similarity": 0.92,
            "overlap": 0.33,
            "stance": "refute",
        },
    ]

    aggregated = fact_check_llm._aggregate_onchain_sources(
        submitted_url=submitted_url,
        evidence_sources=evidence_sources,
        flagged_sources=flagged_sources,
        claim_text="",
    )

    urls = {item["url"] for item in aggregated}
    assert "https://news.example.com/a-story" in urls
    assert "https://other.example.org/claim-1" in urls
    assert "https://other.example.org/claim-2" not in urls
    assert len(aggregated) == 2


def test_build_onchain_metadata_multi_handles_partial_failures_non_fatal():
    fact_check_llm = _load_fact_check_llm()
    calls = {"register": []}

    def fake_check_source_reputation(url):
        if "broken" in url:
            raise RuntimeError("reputation down")
        return {"known": True, "url": url}

    def fake_get_sources_by_publisher(publisher):
        return {"status": "success", "publisher": publisher, "count": 1, "urls": ["x"]}

    def fake_register_flagged_source(url, publisher=None, title=None, content=None):
        calls["register"].append((url, publisher, title, content))
        if "broken" in url:
            raise RuntimeError("register failed")
        return {"status": "success", "tx_hash": "0x123"}

    fact_check_llm.check_source_reputation = fake_check_source_reputation
    fact_check_llm.get_sources_by_publisher = fake_get_sources_by_publisher
    fact_check_llm.register_flagged_source = fake_register_flagged_source

    sources = [
        {"url": "https://site.one/fake", "domain": "site.one", "title": "T1", "snippet": "S1", "source_type": "rag"},
        {"url": "https://site.two/broken", "domain": "site.two", "title": "T2", "snippet": "S2", "source_type": "rag"},
    ]

    metadata = fact_check_llm._build_onchain_metadata_multi(
        sources=sources,
        classification="MISLEADING",
        title="fallback-title",
        content="fallback-content",
    )

    assert metadata["flagging_triggered"] is True
    assert len(metadata["registrations"]) == 2
    assert any("error" in item for item in metadata["registrations"])
    assert len(calls["register"]) == 2
    assert metadata.get("classification") == "MISLEADING"


def test_build_onchain_metadata_multi_skips_non_trigger_class():
    fact_check_llm = _load_fact_check_llm()
    metadata = fact_check_llm._build_onchain_metadata_multi(
        sources=[{"url": "https://a.example/x", "domain": "a.example", "source_type": "submitted"}],
        classification="REAL",
    )
    assert metadata["flagging_triggered"] is False
    assert metadata["skipped"] == "classification_not_flaggable"


if __name__ == "__main__":
    test_aggregate_sources_dedup_and_false_support_filter()
    test_build_onchain_metadata_multi_handles_partial_failures_non_fatal()
    test_build_onchain_metadata_multi_skips_non_trigger_class()
    print("✓ fact_check flagging tests passed")
