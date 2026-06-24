import requests
import mimetypes
import os
import json
import re
import html
import time
import numpy as np
from typing import List, Dict, Any, Optional, Tuple
from urllib.parse import urlparse, urlunparse, parse_qsl, urlencode

from dotenv import load_dotenv

from langchain_groq import ChatGroq
from langchain_core.prompts import PromptTemplate, ChatPromptTemplate
from langchain_core.documents import Document

from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough, RunnableLambda

from sarvamai import SarvamAI
from claim_storage import ClaimStorageManager
from sentence_transformers import SentenceTransformer
from blockchain_registry import (
    register_flagged_source,
    check_source_reputation,
    get_sources_by_publisher,
)

# Load environment variables from .env file
# Try loading from script directory first, then current directory
script_dir = os.path.dirname(os.path.abspath(__file__))
env_path = os.path.join(script_dir, '.env')
if os.path.exists(env_path):
    load_dotenv(dotenv_path=env_path)
    print(f"✓ Loaded .env from: {env_path}")
else:
    load_dotenv()
    print(f"⚠️  .env not found at {env_path}, trying current directory")

grok_api_key = os.getenv('GROQ_API_KEY')
serp_dev_api_key = os.getenv('SERP_DEV_API_KEY')
sarvam_api_key = os.getenv('SARVAM_API_KEY')

# Strip whitespace from API keys (common issue)
if grok_api_key:
    grok_api_key = grok_api_key.strip()
if serp_dev_api_key:
    serp_dev_api_key = serp_dev_api_key.strip()
if sarvam_api_key:
    sarvam_api_key = sarvam_api_key.strip()

model_multi_query = os.getenv('model_multi_query') or 'llama-3.1-8b-instant'
model_summarizer = os.getenv('model_summarizer') or 'llama-3.1-8b-instant'
model_judge = os.getenv('model_judge') or 'llama-3.1-8b-instant'

# Check if required API keys are present
if not grok_api_key or grok_api_key == 'your_grok_api_key_here':
    print("⚠️  Warning: GROQ_API_KEY not set. Please update your .env file with a valid Groq API key.")
else:
    print(f"✓ GROQ_API_KEY loaded (length: {len(grok_api_key)})")
if not serp_dev_api_key or serp_dev_api_key == 'your_serper_dev_api_key_here':
    print("⚠️  Warning: SERP_DEV_API_KEY not set. Please update your .env file with a valid Serper Dev API key.")
else:
    print(f"✓ SERP_DEV_API_KEY loaded (length: {len(serp_dev_api_key)})")
if not sarvam_api_key or sarvam_api_key == 'your_sarvam_api_key_here':
    print("⚠️  Warning: SARVAM_API_KEY not set. Please update your .env file with a valid Sarvam AI API key.")
else:
    print(f"✓ SARVAM_API_KEY loaded")

empty_search = None


def _serper_post(payload: Dict[str, Any], api_key: str, timeout: int = 10) -> Dict[str, Any]:
    """
    Post a Serper search request with small retries/backoff.

    Serper can occasionally timeout or return transient 5xx responses; a couple
    of quick retries dramatically reduces empty evidence results.
    """
    _SERPER_SEARCH_URL = "https://google.serper.dev/search"
    headers = {"X-API-KEY": api_key, "Content-Type": "application/json"}

    last_err: Optional[Exception] = None
    for attempt in range(3):
        try:
            resp = requests.post(_SERPER_SEARCH_URL, headers=headers, json=payload, timeout=timeout)
            if resp.status_code != 200:
                raise Exception(f"Serper API Error: {resp.status_code} {resp.text}")
            return resp.json() or {}
        except Exception as e:
            last_err = e
            # 0.5s, 1.0s, 2.0s
            time.sleep(0.5 * (2**attempt))
            continue

    raise last_err or Exception("Serper request failed")


def _fallback_queries_for_claim(claim_text: str, submitted_url: Optional[str] = None) -> List[str]:
    """
    Generate a small set of fallback search queries when the primary multi-query
    generation / retrieval returns no documents.
    """
    claim_text = (claim_text or "").strip()
    if not claim_text:
        return []

    # Keep queries short-ish for search engines.
    words = claim_text.split()
    first = " ".join(words[:10]) if words else claim_text
    last = " ".join(words[-10:]) if len(words) > 10 else ""

    queries: List[str] = []
    queries.append(claim_text)
    if first and first != claim_text:
        queries.append(first)
    if last and last != claim_text and last != first:
        queries.append(last)
    # Quoted claim can help for exact-match rumor phrases.
    if len(claim_text) <= 180:
        queries.append(f"\"{claim_text}\"")

    # If a URL was provided, searching for the domain + title-ish words often helps.
    if submitted_url:
        try:
            domain = urlparse(submitted_url).netloc
            if domain:
                queries.append(f"site:{domain} {first}")
        except Exception:
            pass

    # De-dup + strip empties
    out: List[str] = []
    for q in queries:
        q = (q or "").strip()
        if q and q not in out:
            out.append(q)
    return out[:6]


def _fallback_queries_for_bengali_claim(claim_text: str, submitted_url: Optional[str] = None) -> List[str]:
    """
    Fallback search queries for Bengali inputs (simple, deterministic).
    """
    claim_text = (claim_text or "").strip()
    if not claim_text:
        return []

    words = claim_text.split()
    first = " ".join(words[:8]) if words else claim_text
    last = " ".join(words[-8:]) if len(words) > 8 else ""

    queries: List[str] = []
    queries.append(claim_text)
    if first and first != claim_text:
        queries.append(first)
    if last and last not in {claim_text, first}:
        queries.append(last)
    if len(claim_text) <= 180:
        queries.append(f"\"{claim_text}\"")

    if submitted_url:
        try:
            domain = urlparse(submitted_url).netloc
            if domain:
                queries.append(f"site:{domain} {first}")
        except Exception:
            pass

    out: List[str] = []
    for q in queries:
        q = (q or "").strip()
        if q and q not in out:
            out.append(q)
    return out[:6]

# Initialize shared SentenceTransformer model for reuse
shared_embedding_model = SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')

# Initialize claim storage manager with shared model
claim_storage = ClaimStorageManager(embedding_model=shared_embedding_model)

BN_DIGIT_TABLE = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")
REAL_KEYWORDS_EN = ["REAL", "TRUE", "ACCURATE", "AUTHENTIC"]
FAKE_KEYWORDS_EN = ["FAKE", "FALSE", "MISLEADING", "HOAX"]
UNSURE_KEYWORDS_EN = ["UNSURE", "UNCERTAIN", "UNKNOWN", "INCONCLUSIVE"]
REAL_KEYWORDS_BN = ["সত্য", "সঠিক", "যথার্থ", "বাস্তব", "আসল", "প্রামাণিক"]
FAKE_KEYWORDS_BN = ["মিথ্যা", "ভুয়া", "ভুল", "অসত্য", "গুজব", "প্রতারণা"]
UNSURE_KEYWORDS_BN = ["অনিশ্চিত", "সন্দেহ", "নিশ্চিত নয়", "অস্পষ্ট", "অপর্যাপ্ত"]
MISINFO_KEYWORDS_EN = ["MISINFORMATION", "DISINFORMATION", "MISINFO"]
MISINFO_KEYWORDS_BN = ["ভুল তথ্য", "মিথ্যা প্রচার", "মিসইনফর্মেশন"]
MISLEADING_KEYWORDS_EN = ["MISLEADING"]
MISLEADING_KEYWORDS_BN = ["বিভ্রান্তিকর", "প্রসঙ্গবহির্ভূত", "আংশিক সত্য"]
SCORE_KEYWORDS_EN = ["credibility", "confidence", "score"]
SCORE_KEYWORDS_BN = ["বিশ্বাস", "আত্মবিশ্বাস", "স্কোর"]
TITLE_PATTERN = re.compile(r"<title[^>]*>(.*?)</title>", re.IGNORECASE | re.DOTALL)
REFUTE_KEYWORDS = [
    "debunk", "false", "hoax", "misleading", "refute", "not true", "ভুয়া", "মিথ্যা", "গুজব",
    "অসত্য", "ভুল দাবি", "আসল নয়"
]

def _contains_bengali(text: str) -> bool:
    if not isinstance(text, str) or not text:
        return False
    return any("\u0980" <= ch <= "\u09FF" for ch in text)

def _normalize_digits(text: str) -> str:
    if not isinstance(text, str):
        return ""
    return text.translate(BN_DIGIT_TABLE)

def _infer_classification(label_text: str) -> str:
    if not isinstance(label_text, str):
        return "UNSURE"
    text_upper = label_text.upper()
    text_bn = label_text

    if any(word in text_upper for word in MISLEADING_KEYWORDS_EN) or any(word in text_bn for word in MISLEADING_KEYWORDS_BN):
        return "MISLEADING"
    if any(word in text_upper for word in MISINFO_KEYWORDS_EN) or any(word in text_bn for word in MISINFO_KEYWORDS_BN):
        return "MISINFORMATION"
    if any(word in text_upper for word in FAKE_KEYWORDS_EN) or any(word in text_bn for word in FAKE_KEYWORDS_BN):
        return "FAKE"
    if any(word in text_upper for word in REAL_KEYWORDS_EN) or any(word in text_bn for word in REAL_KEYWORDS_BN):
        return "REAL"
    if any(word in text_upper for word in UNSURE_KEYWORDS_EN) or any(word in text_bn for word in UNSURE_KEYWORDS_BN):
        return "UNSURE"
    return "UNSURE"

def _extract_score_from_text(text: str) -> int:
    if not isinstance(text, str):
        return 0
    normalized = _normalize_digits(text)
    patterns = [
        r'(100|\d{1,2})\s*/\s*100',
        r'(100|\d{1,2})\s*%',
        r'\b(100|\d{1,2})\b',
    ]
    for pattern in patterns:
        match = re.search(pattern, normalized)
        if match:
            try:
                score = int(match.group(1))
                return max(0, min(score, 100))
            except ValueError:
                continue
    return 0


def _normalize_url(source_url: Optional[str]) -> Optional[str]:
    """Canonicalize URL for deterministic on-chain checks."""
    if not source_url or not isinstance(source_url, str):
        return None
    source_url = source_url.strip()
    if not source_url:
        return None
    if not source_url.startswith(("http://", "https://")):
        return None
    try:
        parsed = urlparse(source_url)
        if not parsed.netloc:
            return None
        host = parsed.netloc.lower()
        path = parsed.path or "/"
        if path != "/" and path.endswith("/"):
            path = path.rstrip("/")
        filtered_query = []
        for key, value in parse_qsl(parsed.query, keep_blank_values=True):
            lower_key = key.lower()
            if lower_key.startswith("utm_") or lower_key in {"fbclid", "gclid"}:
                continue
            filtered_query.append((key, value))
        query = urlencode(filtered_query, doseq=True)
        return urlunparse((parsed.scheme.lower(), host, path, "", query, ""))
    except Exception:
        return source_url


def _extract_first_url(text: Optional[str]) -> Optional[str]:
    if not text or not isinstance(text, str):
        return None
    match = re.search(r"https?://[^\s<>\"]+", text)
    if not match:
        return None
    return _normalize_url(match.group(0))


def _pick_source_url(
    submitted_url: Optional[str],
    evidence_sources: Optional[List[Dict[str, Any]]],
    claim_text: Optional[str],
) -> Optional[str]:
    """Pick closest available source in deterministic order."""
    if isinstance(evidence_sources, list):
        for item in evidence_sources:
            if not isinstance(item, dict):
                continue
            candidate = _normalize_url(item.get("url"))
            if candidate:
                return candidate
    candidate = _normalize_url(submitted_url)
    if candidate:
        return candidate
    return _extract_first_url(claim_text)


def _extract_domain_from_url(source_url: Optional[str]) -> Optional[str]:
    normalized_url = _normalize_url(source_url)
    if not normalized_url:
        return None
    try:
        parsed = urlparse(normalized_url)
        return parsed.netloc.lower() if parsed.netloc else None
    except Exception:
        return None


def _is_trigger_classification(classification: Optional[str]) -> bool:
    return classification in {"FAKE", "MISINFORMATION", "MISLEADING"}


def _is_false_supporting_source(source: Dict[str, Any], sim_threshold: float = 0.7) -> bool:
    if not isinstance(source, dict):
        return False
    stance = (source.get("stance") or "").strip().lower()
    if stance != "assert":
        return False
    similarity = source.get("similarity")
    overlap = source.get("overlap")
    try:
        sim = float(similarity) if similarity is not None else 0.0
    except (TypeError, ValueError):
        sim = 0.0
    try:
        ov = float(overlap) if overlap is not None else 0.0
    except (TypeError, ValueError):
        ov = 0.0
    return sim >= sim_threshold and (ov >= 0.2 or sim >= 0.8)


def _aggregate_onchain_sources(
    submitted_url: Optional[str],
    evidence_sources: Optional[List[Dict[str, Any]]],
    flagged_sources: Optional[List[Dict[str, Any]]],
    claim_text: Optional[str],
) -> List[Dict[str, Any]]:
    """
    Build canonical, deduped source list for on-chain operations.
    - submitted source is always included when available
    - RAG sources are filtered to false-supporting entries only
    - dedupe happens by canonical URL while retaining domain identity
    """
    evidence_sources = evidence_sources or []
    flagged_sources = flagged_sources or []
    deduped: Dict[str, Dict[str, Any]] = {}
    evidence_by_url: Dict[str, Dict[str, Any]] = {}

    for item in evidence_sources:
        if not isinstance(item, dict):
            continue
        normalized_url = _normalize_url(item.get("url"))
        if not normalized_url:
            continue
        evidence_by_url[normalized_url] = item

    submitted_candidate = _normalize_url(submitted_url) or _extract_first_url(claim_text)
    if submitted_candidate:
        submitted_domain = _extract_domain_from_url(submitted_candidate)
        deduped[submitted_candidate] = {
            "url": submitted_candidate,
            "domain": submitted_domain,
            "title": "",
            "snippet": "",
            "source_type": "submitted",
            "similarity": None,
            "overlap": None,
            "stance": "assert",
        }

    allowed_rag_urls = set()
    for item in flagged_sources:
        if not _is_false_supporting_source(item):
            continue
        normalized_url = _normalize_url(item.get("url"))
        if normalized_url:
            allowed_rag_urls.add(normalized_url)
            domain = item.get("domain") or _extract_domain_from_url(normalized_url)
            deduped[normalized_url] = {
                "url": normalized_url,
                "domain": domain,
                "title": item.get("title", ""),
                "snippet": item.get("snippet", ""),
                "source_type": "rag",
                "similarity": item.get("similarity"),
                "overlap": item.get("overlap"),
                "stance": item.get("stance", ""),
            }

    for normalized_url in allowed_rag_urls:
        evidence = evidence_by_url.get(normalized_url, {})
        if normalized_url not in deduped:
            deduped[normalized_url] = {
                "url": normalized_url,
                "domain": _extract_domain_from_url(normalized_url),
                "title": evidence.get("title", ""),
                "snippet": evidence.get("snippet", ""),
                "source_type": "rag",
                "similarity": None,
                "overlap": None,
                "stance": "assert",
            }
        else:
            if not deduped[normalized_url].get("title"):
                deduped[normalized_url]["title"] = evidence.get("title", "")
            if not deduped[normalized_url].get("snippet"):
                deduped[normalized_url]["snippet"] = evidence.get("snippet", "")

    return list(deduped.values())


def _build_onchain_metadata_multi(
    sources: List[Dict[str, Any]],
    classification: str,
    title: Optional[str] = None,
    content: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Check and register every canonical source; continue on partial failures.
    """
    onchain: Dict[str, Any] = {
        "flagging_triggered": _is_trigger_classification(classification),
        "classification": classification,
        "sources_evaluated": [],
        "reputation_checks": [],
        "publisher_checks": [],
        "registrations": [],
        "warnings": [],
    }

    if sources:
        onchain["sources_evaluated"] = sources
        onchain["source_url"] = sources[0].get("url")
        onchain["publisher"] = sources[0].get("domain")
    else:
        onchain["source_url"] = None

    if not onchain["flagging_triggered"]:
        onchain["skipped"] = "classification_not_flaggable"
        return onchain

    if not sources:
        onchain["skipped"] = "no_sources"
        onchain["warnings"].append("no_sources_to_register")
        return onchain

    checked_publishers = set()
    for source in sources:
        source_url = source.get("url")
        domain = source.get("domain") or _extract_domain_from_url(source_url)
        source_type = source.get("source_type", "rag")

        rep_entry: Dict[str, Any] = {"url": source_url, "domain": domain, "source_type": source_type}
        try:
            rep_entry["result"] = check_source_reputation(source_url)
            if "reputation" not in onchain:
                onchain["reputation"] = rep_entry["result"]
        except Exception as e:
            rep_entry["error"] = str(e)
            onchain["warnings"].append(f"source_reputation_unavailable:{source_url}")
        onchain["reputation_checks"].append(rep_entry)

        if domain and domain not in checked_publishers:
            checked_publishers.add(domain)
            pub_entry: Dict[str, Any] = {"publisher": domain}
            try:
                pub_entry["result"] = get_sources_by_publisher(domain)
                if "publisher_reputation" not in onchain:
                    onchain["publisher_reputation"] = pub_entry["result"]
            except Exception as e:
                pub_entry["error"] = str(e)
                onchain["warnings"].append(f"publisher_reputation_unavailable:{domain}")
            onchain["publisher_checks"].append(pub_entry)

        reg_entry: Dict[str, Any] = {"url": source_url, "domain": domain, "source_type": source_type}
        try:
            reg_entry["result"] = register_flagged_source(
                source_url,
                publisher=domain or "FakeNewsDetector",
                title=(source.get("title") or title),
                content=(source.get("snippet") or content),
            )
            if "registration" not in onchain:
                onchain["registration"] = reg_entry["result"]
        except Exception as e:
            reg_entry["error"] = str(e)
            onchain["warnings"].append(f"registration_unavailable:{source_url}")
        onchain["registrations"].append(reg_entry)

    if not onchain["warnings"]:
        onchain.pop("warnings", None)
    return onchain


def _build_onchain_metadata(
    source_url: Optional[str],
    publisher: Optional[str],
    classification: str,
    title: Optional[str] = None,
    content: Optional[str] = None,
) -> Dict[str, Any]:
    """Check reputation and register flagged/misleading sources on-chain."""
    normalized_url = _normalize_url(source_url)
    onchain: Dict[str, Any] = {"source_url": normalized_url}
    if not normalized_url:
        onchain["skipped"] = "no_source_url"
        return onchain

    if not publisher:
        try:
            parsed = urlparse(normalized_url)
            publisher = parsed.netloc or None
        except Exception:
            publisher = None
    if publisher:
        onchain["publisher"] = publisher

    try:
        onchain["reputation"] = check_source_reputation(normalized_url)
    except Exception as e:
        onchain["reputation_error"] = str(e)
        onchain.setdefault("warnings", []).append("source_reputation_unavailable")

    if publisher:
        try:
            onchain["publisher_reputation"] = get_sources_by_publisher(publisher)
        except Exception as e:
            onchain["publisher_reputation_error"] = str(e)
            onchain.setdefault("warnings", []).append("publisher_reputation_unavailable")

    if classification in {"FAKE", "MISINFORMATION", "MISLEADING"}:
        try:
            onchain["registration"] = register_flagged_source(
                normalized_url,
                publisher=publisher or "FakeNewsDetector",
                title=title,
                content=content,
            )
        except Exception as e:
            onchain["registration_error"] = str(e)
            onchain.setdefault("warnings", []).append("registration_unavailable")

    return onchain

class BengaliSemanticRetriever:
    """Bengali-specific semantic search for news articles"""
    
    def __init__(self, api_key: str, num_results: int = 5):
        self.api_key = api_key
        self.num_results = num_results
        self.bengali_sources = [
            'site:prothomalo.com',
            'site:bdnews24.com', 
            'site:jugantor.com',
            'site:ittefaq.com.bd',
            'site:samakal.com',
            'site:kalerkantho.com',
            'site:amadershomoy.com',
            'site:dailynayadiganta.com',
            'site:manabzamin.com',
            'site:banglanews24.com'
        ]
        
    def search_bengali_news(self, query: str) -> List[Document]:
        """Search for Bengali news articles using direct Serper API"""
        try:
            # Get raw search results from Serper API directly
            raw_results = self._get_bengali_search_results(query)
            if not raw_results:
                return []
            
            # Convert results to documents without semantic processing
            documents = []
            for result in raw_results[:self.num_results]:
                content = f"{result.get('title', '')}\n{result.get('snippet', '')}"
                documents.append(Document(
                    page_content=content, 
                    metadata={
                        "source": result.get("link", ""),
                        "title": result.get('title', ''),
                        "language": "bengali",
                        "date": result.get("date", "")  # Capture publication date if available
                    }
                ))
            
            print(f"Found {len(documents)} Bengali documents")
            return documents
            
        except Exception as e:
            print(f"Bengali search error: {e}")
            return []
    
    def _get_bengali_search_results(self, query: str) -> List[Dict]:
        """Get Bengali news search results"""
        try:
            # Use the exact same format as your working JavaScript code
            payload = {
                "q": query,  # Use Bengali query directly like in your working example
                "gl": "bd",  # Bangladesh
                "hl": "bn"   # Bengali language
            }
            
            print(f"Searching with Bengali query: {query}")

            results = _serper_post(payload=payload, api_key=self.api_key, timeout=10)
            return (results or {}).get("organic", [])
            
        except Exception as e:
            print(f"Bengali search error: {e}")
            return []
    
    def _extract_english_keywords(self, bengali_text: str) -> str:
        """Extract English keywords from Bengali text for search"""
        # Common Bengali-English word mappings for news
        keyword_mappings = {
            'সেনাবাহিনী': 'army military',
            'বিরুদ্ধে': 'against',
            'পরিকল্পিত': 'planned',
            'ষড়যন্ত্র': 'conspiracy',
            'রুখতে': 'stop prevent',
            'হবে': 'will',
            'খবর': 'news',
            'রাজনীতি': 'politics',
            'অর্থনীতি': 'economy',
            'শিক্ষা': 'education',
            'স্বাস্থ্য': 'health',
            'ক্রীড়া': 'sports',
            'বিনোদন': 'entertainment',
            'প্রযুক্তি': 'technology',
            'পরিবেশ': 'environment',
            'আইন': 'law',
            'নিরাপত্তা': 'security',
            'দুর্নীতি': 'corruption',
            'চুরি': 'theft',
            'হত্যা': 'murder',
            'দুর্ঘটনা': 'accident',
            'বন্যা': 'flood',
            'ভূমিকম্প': 'earthquake',
            'আগুন': 'fire',
            'বোমা': 'bomb',
            'আত্মঘাতী': 'suicide',
            'সন্ত্রাস': 'terrorism'
        }
        
        keywords = []
        for bengali_word, english_words in keyword_mappings.items():
            if bengali_word in bengali_text:
                keywords.extend(english_words.split())
        
        return ' '.join(keywords) if keywords else ''
    
    def generate_bengali_search_queries(self, claim: str) -> List[str]:
        """Generate Bengali search query variations"""
        try:
            # Create simple Bengali query variations manually to avoid API issues
            queries = []
            
            # Original claim - keep it as is
            queries.append(claim)
            
            # Extract key words from the claim for better search
            # Split by spaces, not by characters
            words = claim.split()
            if len(words) > 1:
                # Use first few words
                if len(words) >= 3:
                    queries.append(' '.join(words[:3]))
                # Use last few words  
                if len(words) >= 3:
                    queries.append(' '.join(words[-3:]))
                # Use middle words
                if len(words) > 4:
                    queries.append(' '.join(words[1:-1]))
            
            # Remove duplicates and empty queries
            unique_queries = []
            for q in queries:
                q = q.strip()
                if q and q not in unique_queries and len(q) > 2:
                    unique_queries.append(q)
            
            print(f"Generated Bengali queries: {unique_queries}")
            return unique_queries[:3]  # Limit to 3 queries
            
        except Exception as e:
            print(f"Error generating Bengali queries: {e}")
            return [claim]  # Fallback to original claim

class SemanticNewsRetriever:
    """Semantic search for news articles using embeddings"""
    
    def __init__(self, api_key: str, num_results: int = 20, embedding_model: SentenceTransformer = None):
        self.api_key = api_key
        self.num_results = num_results
        # Reuse shared embedding model if provided, otherwise create new one
        if embedding_model is not None:
            self.model = embedding_model
        else:
            self.model = SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')
        self.index = None
        self.documents = []
        
    def search_news(self, query: str) -> List[Document]:
        """Search for news articles using semantic similarity"""
        try:
            # First, get raw search results from Serper
            raw_results = self._get_raw_search_results(query)
            if not raw_results:
                return []
            
            # Create embeddings for the query and documents
            query_embedding = self.model.encode([query])
            doc_texts = [f"{result['title']} {result['snippet']}" for result in raw_results]
            doc_embeddings = self.model.encode(doc_texts)
            
            # Calculate similarities
            similarities = np.dot(query_embedding, doc_embeddings.T).flatten()
            
            # Sort by similarity and get top results
            top_indices = np.argsort(similarities)[::-1][:self.num_results]
            
            documents = []
            for idx in top_indices:
                if similarities[idx] > 0.3:  # Threshold for relevance
                    result = raw_results[idx]
                    content = f"{result.get('title', '')}\n{result.get('snippet', '')}"
                    documents.append(Document(
                        page_content=content, 
                        metadata={
                            "source": result.get("link", ""),
                            "similarity": float(similarities[idx]),
                            "title": result.get('title', ''),
                            "date": result.get("date", "")  # Capture publication date if available
                        }
                    ))
            
            print(f"Found {len(documents)} semantically relevant documents")
            return documents
            
        except Exception as e:
            print(f"Semantic search error: {e}")
            return []
    
    def _get_raw_search_results(self, query: str) -> List[Dict]:
        """Get raw search results from Serper API"""
        try:
            payload = {
                "q": f'"{query}" (news OR article OR report) -opinion -editorial',
                "num": 50,  # Get more results for better semantic filtering
            }

            results = _serper_post(payload=payload, api_key=self.api_key, timeout=10)
            return (results or {}).get("organic", [])
            
        except Exception as e:
            print(f"Raw search error: {e}")
            return []

class SerperRetrieverWrapper:
    #Class to use Serper as retriver agent for the RAG framework
    def __init__(self, api_key: str, num_results: int = 15):
        self.api_key = api_key
        self.num_results = num_results
    
    def get_relevant_documents(self, query: str):
        """
        Query Serper.dev and return up to `num_results` organic search hits.
        Each hit is a dict: { "title": str, "link": str, "snippet": str }.
        """
        try:
            payload = {
                "q": f'"{query}" (news OR article OR report) -opinion -editorial',
                "num": self.num_results,
            }
            
            results = _serper_post(payload=payload, api_key=self.api_key, timeout=10)
            
            documents = []
            for result in results.get("organic", [])[:self.num_results]:
                content = f"{result.get('title', '')}\n{result.get('snippet', '')}"
                documents.append(Document(
                    page_content=content, 
                    metadata={
                        "source": result.get("link", ""),
                        "title": result.get('title', ''),
                        "date": result.get("date", "")  # Capture publication date if available
                    }
                ))
            
            if not documents:
                empty_search = Exception("No result found")
                raise empty_search
            
            return documents
        except Exception as e:
            if e is empty_search:
                print('serper main exception1')
                raise empty_search
            else:
                print('serper main exception2')
                raise e

def _extract_text_from_html(html_content: str, max_length: int = 1500) -> str:
    """
    Convert HTML to plain text by dropping script/style tags and stripping markup.
    Truncates to avoid oversized context.
    """
    if not html_content:
        return ""

    try:
        # Remove script/style blocks first (often huge + not useful)
        cleaned = re.sub(
            r"<(script|style)[^>]*>.*?</\1>",
            " ",
            html_content,
            flags=re.DOTALL | re.IGNORECASE,
        )
        # Strip all remaining tags
        cleaned = re.sub(r"<[^>]+>", " ", cleaned)
        cleaned = html.unescape(cleaned)
        # Collapse whitespace
        cleaned = " ".join(cleaned.split())
        if max_length and len(cleaned) > max_length:
            return cleaned[:max_length]
        return cleaned
    except Exception as e:
        print(f"HTML extraction error: {e}")
        return ""

def _extract_title_from_html(html_content: str) -> str:
    """
    Pull page title from HTML. Returns empty string if not found.
    """
    if not html_content:
        return ""
    try:
        match = TITLE_PATTERN.search(html_content)
        if match:
            raw_title = html.unescape(match.group(1))
            return ' '.join(raw_title.split())
    except Exception as e:
        print(f"Title extraction error: {e}")
    return ""

def _extract_meta_description(html_content: str) -> str:
    """
    Extract meta description content if available.
    """
    if not html_content:
        return ""
    try:
        desc_match = re.search(
            r'<meta[^>]+name=["\\\']description["\\\'][^>]*content=["\\\'](.*?)["\\\']',
            html_content,
            flags=re.IGNORECASE | re.DOTALL
        )
        if desc_match:
            raw_desc = html.unescape(desc_match.group(1))
            return ' '.join(raw_desc.split())
    except Exception as e:
        print(f"Meta description extraction error: {e}")
    return ""

def _keyword_overlap(a: str, b: str) -> float:
    """Simple token overlap ratio between two strings."""
    if not a or not b:
        return 0.0
    tokens_a = {t for t in re.findall(r"[\\w]+", a.lower()) if len(t) > 3}
    tokens_b = {t for t in re.findall(r"[\\w]+", b.lower()) if len(t) > 3}
    if not tokens_a or not tokens_b:
        return 0.0
    inter = tokens_a.intersection(tokens_b)
    return len(inter) / max(len(tokens_a), 1)

def _is_refuting(text: str) -> bool:
    if not text:
        return False
    lower = text.lower()
    return any(k in lower for k in REFUTE_KEYWORDS)

def _compute_flagged_sources(claim_text: str, documents: List[Document], embedding_model: SentenceTransformer, sim_threshold: float = 0.7) -> List[Dict]:
    """Flag sources that closely match a fake/misinfo claim."""
    if not claim_text or not documents or embedding_model is None:
        return []
    valid_docs = []
    doc_texts = []
    for doc in documents:
        source = (doc.metadata or {}).get("source", "")
        if source in {"submitted_article", "submitted_url"}:
            continue
        title = (doc.metadata or {}).get("title", "")
        content = (doc.page_content or "").strip()
        if not content and not title:
            continue
        combined = (title + "\n" + content).strip()
        if not combined:
            continue
        valid_docs.append((doc, combined, title, content))
        doc_texts.append(combined)

    if not valid_docs:
        return []

    try:
        claim_vec = embedding_model.encode([claim_text])[0]
        doc_vecs = embedding_model.encode(doc_texts)
    except Exception as e:
        print(f"Error computing similarity for flagged sources: {e}")
        return []

    flagged = []
    for idx, (doc, combined, title, content) in enumerate(valid_docs):
        doc_vec = doc_vecs[idx]
        sim = float(np.dot(claim_vec, doc_vec) / (np.linalg.norm(claim_vec) * np.linalg.norm(doc_vec) + 1e-8))
        overlap = _keyword_overlap(claim_text, combined)
        stance = "refute" if _is_refuting(combined) else "assert"
        if stance == "refute":
            continue
        if sim >= sim_threshold and (overlap >= 0.2 or sim >= 0.8):
            snippet = content[:240] if content else combined[:240]
            normalized_url = _normalize_url((doc.metadata or {}).get("source", ""))
            flagged.append({
                "url": normalized_url or (doc.metadata or {}).get("source", ""),
                "domain": _extract_domain_from_url(normalized_url),
                "title": title,
                "snippet": snippet,
                "similarity": round(sim, 3),
                "overlap": round(overlap, 3),
                "stance": stance,
                "reason": "High similarity match to flagged claim"
            })
    return flagged

def _fetch_url_snapshot(url: str, timeout: int = 10) -> Tuple[Optional[str], Optional[str]]:
    """
    Fetch URL content and return raw HTML plus a cleaned text version.
    """
    if not url:
        return None, None
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (compatible; FactCheckBot/1.0; +https://example.com/bot)"
        }
        resp = requests.get(url, headers=headers, timeout=timeout)
        if resp.status_code != 200:
            print(f"URL fetch failed ({resp.status_code}) for {url}")
            return None, None
        html_content = resp.text
        text_content = _extract_text_from_html(html_content, max_length=1500)
        return html_content, text_content
    except Exception as e:
        print(f"URL fetch error for {url}: {e}")
        return None, None

def _extract_evidence_from_documents(documents: List[Document]) -> List[Dict]:
    """
    Extract evidence sources from document list
    
    Args:
        documents: List of Document objects with metadata
        
    Returns:
        List of dicts with url, title, snippet, and date (limited to top 10)
    """
    evidence_sources = []
    for doc in documents[:10]:  # Limit to top 10 sources
        evidence_sources.append({
            "url": doc.metadata.get("source", ""),
            "title": doc.metadata.get("title", ""),
            "snippet": doc.page_content[:200] if doc.page_content else "",  # First 200 chars
            "date": doc.metadata.get("date", "")  # Publication date if available
        })
    return evidence_sources
        
def verify_news(user_claim, submitted_url: str = None, input_lang = 'auto'):
    """
       Description: This function is used to verify the claim provided by the user and output as REAL or FAKE or UNSURE based on the context with a short explanation
       INPUT: user_claim --> The news user wish to verify
       OUTPUT: (claim, verdict_orig, verdict_trans, credibility_score) - 4-tuple with credibility score (0-100 for FAKE, 0 otherwise)
    """
    try:
       print('here1: ', user_claim)

       # If claim text is missing OR is just the URL, fetch and build claim from page content
       url_only_input = submitted_url and user_claim and user_claim.strip() == submitted_url.strip()
       if ((not user_claim or not user_claim.strip()) or url_only_input) and submitted_url:
           url_raw_html, url_text_content = _fetch_url_snapshot(submitted_url)
           if url_raw_html is None:
               error_msg = 'URL fetch failed. Please try again after some time.'
               return (error_msg, error_msg, error_msg, 0, 'UNSURE', [], {})

           # Fallbacks: try meta description if cleaned body is empty
           if not url_text_content:
               meta_desc = _extract_meta_description(url_raw_html)
               page_title_only = _extract_title_from_html(url_raw_html)
               if meta_desc:
                   url_text_content = meta_desc
               elif page_title_only:
                   url_text_content = page_title_only
               else:
                   error_msg = 'The fetched article seems empty. Please provide a different link.'
                   return (error_msg, error_msg, error_msg, 0, 'UNSURE', [], {})

           page_title = _extract_title_from_html(url_raw_html)
           combined_claim = f"{page_title}\n\n{url_text_content}".strip()
           user_claim = combined_claim if combined_claim else url_text_content

       claim1 = user_claim.replace("'","")
       claim1 = claim1.replace("\n"," ")
       print('here2: ', claim1)
       
       # Detect input language
       is_bengali = any('\u0980' <= char <= '\u09FF' for char in claim1)
       
       if is_bengali:
           print("Detected Bengali input - using Bengali-specific search")
           claim, verdict_orig, verdict_trans, credibility_score, claim_id, classification, evidence_sources, onchain_metadata = verify_bengali_news(
               claim1,
               submitted_url=submitted_url,
               article_text=user_claim
           )
       else:
           print("Non-Bengali input - using English search with translation")
           claim, verdict_orig, verdict_trans, credibility_score, claim_id, classification, evidence_sources, onchain_metadata = verify_english_news(
               claim1,
               submitted_url=submitted_url,
               article_text=user_claim,
               input_lang=input_lang
           )
       return (claim, verdict_orig, verdict_trans, credibility_score, classification, evidence_sources, onchain_metadata)
    except Exception as e:
        print('Error in main verification: ', e)
        error_msg = 'Something went wrong. Please try after some time'
        return(error_msg, error_msg, error_msg, 0, 'UNSURE', [], {})

def verify_bengali_news(claim: str, submitted_url: str = None, article_text: str = None):
    """
    Verify Bengali news claims using Bengali-specific search
    Returns: (claim, verdict_orig, verdict_trans, credibility_score, claim_id) - 5-tuple
    """
    try:
        # Use Bengali semantic retriever
        bengali_retriever = BengaliSemanticRetriever(api_key=serp_dev_api_key, num_results=5)
        
        # Generate Bengali search queries
        queries = bengali_retriever.generate_bengali_search_queries(claim)
        
        # Search directly with the generated queries instead of using RunnableLambda
        all_documents = []
        print(f"Generated Bengali search queries: {queries}")
        
        url_raw_html, url_text_content = _fetch_url_snapshot(submitted_url) if submitted_url else (None, None)

        for query in queries:
            try:
                docs = bengali_retriever.search_bengali_news(query.strip())
                print(f"Found {len(docs)} Bengali results for query: {query}")
                all_documents.extend(docs)
            except Exception as e:
                print(f"Bengali search failed for query '{query}': {e}")
                continue
        
        # Remove duplicates based on source URL
        seen_sources = set()
        unique_docs = []
        for doc in all_documents:
            source = doc.metadata.get('source', '')
            if source not in seen_sources:
                seen_sources.add(source)
                unique_docs.append(doc)

        # Only inject fetched URL content (not the raw claim) to avoid circular evidence
        if url_text_content and url_text_content.strip() != claim.strip() and len(url_text_content) > len(claim) + 50:
            unique_docs.insert(0, Document(
                page_content=url_text_content[:1200],
                metadata={"source": submitted_url or "submitted_url", "title": "Fetched URL Content", "language": "bengali"}
            ))
        if article_text and article_text.strip() != claim.strip() and len(article_text) > len(claim) + 50:
            unique_docs.insert(0, Document(
                page_content=article_text[:4000],
                metadata={"source": "submitted_article", "title": "Submitted Article Text", "language": "bengali"}
            ))
        
        print(f"Total unique Bengali documents found: {len(unique_docs)}")
        
        # Limit to top 5 documents to stay within token limits
        limited_docs = unique_docs[:5]
        print(f"Using {len(limited_docs)} documents for processing")
        
        # Create a simple context retriever that returns the documents
        def simple_context_retriever(input_data):
            return limited_docs
        
        context_retriever = RunnableLambda(simple_context_retriever)
        
        # Bengali-specific summarizer
        bengali_summarizer_template = '''
           তুমি একজন বাংলা ভাষার বিশেষজ্ঞ। তোমার কাজ হলো খবরের নিবন্ধ থেকে মূল ঘটনা বের করা।
       
           দাবি: {question}
           
           নিবন্ধসমূহ:
           {context}
           
           শুধুমাত্র ঘটনামূলক তথ্য বের করো। সংক্ষিপ্ত সারসংক্ষেপ দাও।
        '''
        
        summarizer_prompt = PromptTemplate.from_template(bengali_summarizer_template)
        llm_summarizer = ChatGroq(api_key = grok_api_key, model_name = model_summarizer)
        
        summarizer_chain = (
            {
                "context": context_retriever,
                "question": RunnablePassthrough()
            }
            | summarizer_prompt
            | llm_summarizer
            | StrOutputParser()
        )
        
        # Bengali fact-checker
        bengali_fact_checker_template = '''
           তুমি একজন সত্যতা যাচাইকারী সহায়ক।
           
           দাবি: {question}
           
           প্রমাণ:
           {evidence}
           
           গুরুত্বপূর্ণ: তোমার সিদ্ধান্ত শুধুমাত্র উপরে দেওয়া প্রমাণের ভিত্তিতে নাও। তোমার পূর্ব জ্ঞান ব্যবহার কোরো না। প্রমাণে যা আছে শুধু তার ভিত্তিতে যাচাই করো।
           
           নির্দেশনা:
           - প্রমাণ দাবিকে সমর্থন করলে REAL
           - প্রমাণ দাবির বিপরীত বা মিথ্যা তথ্য প্রমাণ করলে FAKE
           - প্রমাণ দাবিকে আংশিক সত্য বা প্রসঙ্গ-বহির্ভূত হিসেবে দেখালে MISINFORMATION
           - প্রমাণ অপর্যাপ্ত বা দাবির সাথে সম্পর্কহীন হলে UNSURE
           - REAL/FAKE/MISINFORMATION এর জন্য 0-100 স্কেলে বিশ্বাসযোগ্যতা স্কোর দাও (100 = সম্পূর্ণ নিশ্চিত)
           - ব্যাখ্যায় নির্দিষ্ট প্রমাণ উদ্ধৃত করো যা তোমার সিদ্ধান্ত সমর্থন করে
           - ব্যাখ্যা (Explanation) অবশ্যই বাংলা ভাষায় লিখবে
           
           উত্তর (ঠিক এই ফরম্যাটে):
           Classification: REAL or FAKE or MISINFORMATION or UNSURE
           Credibility Score: <0-100 for REAL or FAKE or MISINFORMATION, N/A for UNSURE>
           Explanation: <প্রমাণ-ভিত্তিক সংক্ষিপ্ত যুক্তি>
        '''
        
        fact_checker_prompt = PromptTemplate.from_template(bengali_fact_checker_template)
        llm_fact_checker = ChatGroq(api_key = grok_api_key, model_name = model_judge)
        
        fact_checker_chain = (
            {
                "question": RunnablePassthrough(),
                "evidence": summarizer_chain 
            }
            | fact_checker_prompt
            | llm_fact_checker
            | StrOutputParser()
        )
        
        verdict_orig = fact_checker_chain.invoke(claim)
        
        # Parse verdict output to extract classification, credibility score, and explanation
        lines = verdict_orig.split('\n')

        # Robustly find the classification line (LLMs often emit leading blank lines)
        verdict_class = ""
        for line in lines:
            if 'classification' in line.lower() and ':' in line:
                verdict_class = line.strip()
                break
        if not verdict_class:
            for line in lines:
                stripped = line.strip()
                if stripped:
                    verdict_class = stripped
                    break
            if not verdict_class:
                verdict_class = "Classification: UNSURE"

        credibility_score = 0
        
        # Extract credibility score using helper
        for line in lines:
            lower_line = line.lower()
            if any(keyword in lower_line for keyword in SCORE_KEYWORDS_EN) or any(keyword in line for keyword in SCORE_KEYWORDS_BN):
                credibility_score = _extract_score_from_text(line)
                break
        if credibility_score == 0:
            credibility_score = _extract_score_from_text(verdict_orig)
        
        # Extract explanation (everything after classification and score)
        explanation_lines = []
        found_class = False
        found_score = False
        for line in lines:
            if 'classification' in line.lower() and ':' in line:
                found_class = True
                continue
            if 'Credibility Score:' in line or 'credibility' in line.lower():
                found_score = True
                continue
            if found_class and (found_score or 'Explanation:' in line or 'explanation' in line.lower() or len(explanation_lines) > 0):
                if 'Explanation:' in line or 'explanation:' in line.lower():
                    explanation_lines.append(line.split(':', 1)[-1].strip())
                else:
                    explanation_lines.append(line.strip())
        
        verdict_explan = '\n'.join(l for l in explanation_lines if l) if explanation_lines else verdict_orig.split('\n')[-1]

        # Safety net: if the model responded in English, translate explanation to Bangla.
        if verdict_explan and not _contains_bengali(verdict_explan) and sarvam_api_key:
            try:
                client = SarvamAI(api_subscription_key=sarvam_api_key)
                translated = client.text.translate(
                    input=verdict_explan,
                    source_language_code="auto",
                    target_language_code="bn-IN",
                )
                verdict_explan = translated.translated_text or verdict_explan
            except Exception as e:
                print(f"Error translating Bengali explanation: {e}")
        
        # Extract classification text
        classification_text = verdict_class.replace('Classification', '').replace('classification', '').replace(':', '').strip()
        classification = _infer_classification(classification_text)
        
        # Only set credibility score to 0 for UNSURE (others keep their scores)
        if classification == 'UNSURE':
            credibility_score = 0
        
        verdict_orig = verdict_class + '\n\n' + verdict_explan
        verdict_trans = verdict_orig  # Already in Bengali
        
        # Extract evidence sources and save for all classifications
        claim_id = None
        evidence_sources = _extract_evidence_from_documents(limited_docs)
        flagged_sources = []
        if _is_trigger_classification(classification):
            # If we flagged it but still have no sources, try one last retrieval pass.
            if not evidence_sources:
                try:
                    extra_queries = _fallback_queries_for_bengali_claim(claim, submitted_url=submitted_url)
                    for q in extra_queries:
                        try:
                            docs = bengali_retriever.search_bengali_news(q.strip())
                            if docs:
                                all_documents.extend(docs)
                        except Exception as extra_e:
                            print(f"Bengali extra fallback failed for query '{q}': {extra_e}")

                    seen_sources = set()
                    unique_docs = []
                    for doc in all_documents:
                        source = doc.metadata.get("source", "")
                        if source and source not in seen_sources:
                            seen_sources.add(source)
                            unique_docs.append(doc)
                    limited_docs = unique_docs[:5]
                    evidence_sources = _extract_evidence_from_documents(limited_docs)
                except Exception as e:
                    print(f"Final Bengali evidence fallback failed: {e}")

            flagged_sources = _compute_flagged_sources(claim, limited_docs, shared_embedding_model)
        onchain_sources = _aggregate_onchain_sources(
            submitted_url=submitted_url,
            evidence_sources=evidence_sources,
            flagged_sources=flagged_sources,
            claim_text=claim,
        )
        onchain_metadata = _build_onchain_metadata_multi(
            onchain_sources,
            classification=classification,
            title=claim[:180] if claim else None,
            content=(article_text or claim)[:5000] if (article_text or claim) else None,
        )
        # Expose what was flagged and what will be registered on-chain.
        onchain_metadata["flagged_sources"] = flagged_sources or []
        onchain_metadata["onchain_sources"] = onchain_sources or []
        if _is_trigger_classification(classification) and not flagged_sources:
            onchain_metadata.setdefault("warnings", []).append("no_flagged_sources_found")
        if _is_trigger_classification(classification) and not evidence_sources:
            onchain_metadata.setdefault("warnings", []).append("no_sources_found")
        try:
            claim_id = claim_storage.save_claim_record(
                claim_text=claim,
                claim_text_original=claim,
                classification=classification,
                credibility_score=credibility_score,
                explanation=verdict_explan,
                evidence_sources=evidence_sources,
                language='bengali',
                submitted_url=submitted_url,
                article_text=article_text or claim,
                url_snapshot_html=url_raw_html,
                flagged_sources=flagged_sources,
                onchain_metadata=onchain_metadata
            )
        except Exception as storage_error:
            print(f"Error saving claim to storage: {storage_error}")
            # Continue even if storage fails
        
        return(claim, verdict_orig, verdict_trans, credibility_score, claim_id, classification, evidence_sources, onchain_metadata)
        
    except Exception as e:
        print('Error in Bengali verification: ', e)
        error_msg = 'কিছু সমস্যা হয়েছে। দয়া করে আবার চেষ্টা করুন'
        return(error_msg, error_msg, error_msg, 0, None, 'UNSURE', [], {})

def verify_english_news(claim: str, submitted_url: str = None, article_text: str = None, input_lang = 'auto'):
    """
    Verify non-Bengali news claims using English search with translation
    Returns: (claim, verdict_orig, verdict_trans, credibility_score, claim_id) - 5-tuple
    """
    try:
       print('here1: ', claim)
       claim1 = claim.replace("'","")
       claim1 = claim.replace("\n"," ")
       print('here2: ', claim1)
        
       # Use semantic search instead of keyword search (with shared embedding model)
       semantic_retriever = SemanticNewsRetriever(api_key=serp_dev_api_key, num_results=20, embedding_model=shared_embedding_model)
       
       # Store documents reference for evidence extraction
       retrieved_documents = []
       url_raw_html, url_text_content = _fetch_url_snapshot(submitted_url) if submitted_url else (None, None)
       submitted_article_text = article_text or claim1
       
       def semantic_search_multiple_queries(queries):
           """Search for multiple query variations using semantic similarity"""
           nonlocal retrieved_documents
           all_documents = []
           print(f"Generated search queries: {queries}")
           
           # Fallback to old search method if semantic search fails
           fallback_retriever = SerperRetrieverWrapper(api_key=serp_dev_api_key)
           
           for query in queries:
               try:
                   docs = semantic_retriever.search_news(query.strip())
                   print(f"Found {len(docs)} semantically relevant results for query: {query}")
                   if docs:
                       all_documents.extend(docs)
                   else:
                       # Semantic search can return 0 without raising; try keyword-based fallback.
                       try:
                           kw_docs = fallback_retriever.get_relevant_documents(query.strip())
                           print(f"Fallback: Found {len(kw_docs)} keyword-based results for query: {query}")
                           all_documents.extend(kw_docs)
                       except Exception as fallback_e:
                           print(f"Keyword fallback failed for query '{query}': {fallback_e}")
               except Exception as e:
                   print(f"Semantic search failed for query '{query}': {e}")
                   # Fallback to keyword search
                   try:
                       docs = fallback_retriever.get_relevant_documents(query.strip())
                       print(f"Fallback: Found {len(docs)} keyword-based results for query: {query}")
                       all_documents.extend(docs)
                   except Exception as fallback_e:
                       print(f"Both semantic and keyword search failed for query '{query}': {fallback_e}")
                       continue

           # Final fallback: if everything came back empty, try additional query variants.
           if not all_documents:
               extra_queries = _fallback_queries_for_claim(claim1, submitted_url=submitted_url)
               for q in extra_queries:
                   try:
                       kw_docs = fallback_retriever.get_relevant_documents(q)
                       print(f"Extra fallback: Found {len(kw_docs)} results for query: {q}")
                       all_documents.extend(kw_docs)
                   except Exception as extra_e:
                       print(f"Extra fallback failed for query '{q}': {extra_e}")
           
           # Remove duplicates based on source URL
           seen_sources = set()
           unique_docs = []
           for doc in all_documents:
               source = doc.metadata.get('source', '')
               if source not in seen_sources:
                   seen_sources.add(source)
                   unique_docs.append(doc)
           
           # Only inject fetched URL content (not the raw claim) to avoid circular evidence
           if url_text_content and url_text_content.strip() != claim1.strip() and len(url_text_content) > len(claim1) + 50:
               unique_docs.insert(0, Document(
                   page_content=url_text_content[:1200],
                   metadata={"source": submitted_url or "submitted_url", "title": "Fetched URL Content"}
               ))
           if submitted_article_text and submitted_article_text.strip() != claim1.strip() and len(submitted_article_text) > len(claim1) + 50:
               unique_docs.insert(0, Document(
                   page_content=submitted_article_text[:4000],
                   metadata={"source": "submitted_article", "title": "Submitted Article Text"}
               ))
           
           print(f"Total unique documents found (including submitted content): {len(unique_docs)}")
           retrieved_documents = unique_docs[:20]  # Store for evidence extraction
           return unique_docs[:20]  # Limit to top 20 results
       
       context_retriever = RunnableLambda(semantic_search_multiple_queries)
       
       #Multi Query Generation
       multi_query_template = """You are an AI language model assistant. Your task is to generate three 
       different search queries for fact-checking the given news claim. Create variations that will help 
       find relevant news articles and reports about this topic. Focus on different aspects like:
       1. The main event/claim
       2. Key people or organizations mentioned
       3. Location or time period if relevant
       
       Provide these alternative search queries separated by newlines. Original claim: {question}"""
       perspectives_prompt = ChatPromptTemplate.from_template(multi_query_template)
       
       llm_multi_query = ChatGroq(api_key = grok_api_key, model_name = model_multi_query)
       
       generate_queries = (
           perspectives_prompt 
           | llm_multi_query
           | StrOutputParser() 
           | (lambda x: x.split("\n"))
       )
       
       #Summarization using multi query
       summarizer_template = '''
          You are an assistant summarizing factual evidence from multiple news articles.
       
          Based on the following documents, extract the key facts relevant to the claim.
          Focus on factual information that directly supports or contradicts the claim.
          
          Claim: {question}
          
          Documents:
          {context}
          
          Instructions:
          - Extract only factual information, not opinions
          - Note the source and date when available
          - Identify any contradictions between sources
          - Focus on verifiable facts related to the claim
          
          Return a concise summary of the key facts found.
       '''
       summarizer_prompt = PromptTemplate.from_template(summarizer_template)
       
       llm_summarizer = ChatGroq(api_key = grok_api_key, model_name = model_summarizer)
       retrieval_chain = generate_queries | context_retriever
       summarizer_chain = (
           {
               "context": retrieval_chain,
               "question": RunnablePassthrough()
           }
           | summarizer_prompt
           | llm_summarizer
           | StrOutputParser()
       )
       
       #Final Judgement 
       fact_checker_template = '''
          You are a fact-checking assistant. Your job is to determine if a news claim is accurate.
          
          Claim: {question}
          
          Evidence:
          {evidence}
          
          IMPORTANT: Base your classification ONLY on the evidence provided above. Do NOT use any prior knowledge or training data. If the evidence does not address the claim, classify as UNSURE.
          
          Instructions:
          - If the evidence supports the claim from reliable news sources, classify as REAL
          - If the evidence contradicts the claim from reliable sources, classify as FAKE  
          - If the evidence shows the claim is misleading, incomplete, or out-of-context, classify as MISINFORMATION
          - If the evidence is insufficient, unclear, or does not address the claim, classify as UNSURE
          - Provide a credibility score (0-100) indicating confidence (100 = completely certain)
          - In your explanation, cite specific pieces of evidence that support your classification
          
          Respond in EXACTLY this format (start with Classification on the first line):
          Classification: REAL or FAKE or MISINFORMATION or UNSURE
          Credibility Score: <0-100 for REAL or FAKE or MISINFORMATION, N/A for UNSURE>
          Explanation: <your detailed reasoning citing specific evidence>
       '''
       
       fact_checker_prompt = PromptTemplate.from_template(fact_checker_template)
       
       llm_fact_checker = ChatGroq(api_key = grok_api_key, model_name = model_judge)
       fact_checker_chain = (
           {
               "question": RunnablePassthrough(),
               "evidence": summarizer_chain 
           }
           | fact_checker_prompt
           | llm_fact_checker
           | StrOutputParser()
       )
   
       claim = claim1
       
       #Calling SARVAM API to translate Indic languages to English
       client = SarvamAI(api_subscription_key = sarvam_api_key)
       
       try:
           translation = client.text.translate(
           input=claim,
           source_language_code="auto",
           target_language_code="en-IN"
           )
       except Exception as e:
           print(f"Error during translation: {e}")
           error_msg = 'It appears you have provided input in an alien language. Please try again with some other language'
           return error_msg, error_msg, error_msg, 0, None, 'UNSURE', [], {}
       
       claim_final = translation.translated_text if translation else claim
       claim_orig_lang = translation.source_language_code
       print(f"Translated claim: {claim_final}")
       
       verdict_orig = fact_checker_chain.invoke(claim_final)
       
       # Parse verdict output to extract classification, credibility score, and explanation
       lines = verdict_orig.split('\n')

       # Robustly find the classification line (LLMs often emit leading blank lines)
       verdict_class = ""
       for line in lines:
           if 'classification' in line.lower() and ':' in line:
               verdict_class = line.strip()
               break
       if not verdict_class:
           for line in lines:
               stripped = line.strip()
               if stripped:
                   verdict_class = stripped
                   break
           if not verdict_class:
               verdict_class = "Classification: UNSURE"

       credibility_score = 0
       
       # Extract credibility score using regex
       for line in lines:
           lower_line = line.lower()
           if any(keyword in lower_line for keyword in SCORE_KEYWORDS_EN) or any(keyword in line for keyword in SCORE_KEYWORDS_BN):
               credibility_score = _extract_score_from_text(line)
               break
       if credibility_score == 0:
           credibility_score = _extract_score_from_text(verdict_orig)
       
       # Extract explanation (everything after classification and score)
       explanation_lines = []
       found_class = False
       found_score = False
       for line in lines:
           if 'classification' in line.lower() and ':' in line:
               found_class = True
               continue
           if 'Credibility Score:' in line or 'credibility' in line.lower():
               found_score = True
               continue
           if found_class and (found_score or 'Explanation:' in line or 'explanation' in line.lower() or len(explanation_lines) > 0):
               if 'Explanation:' in line or 'explanation:' in line.lower():
                   explanation_lines.append(line.split(':', 1)[-1].strip())
               else:
                   explanation_lines.append(line.strip())
       
       verdict_explan = '\n'.join(l for l in explanation_lines if l) if explanation_lines else verdict_orig.split('\n')[-1]
       
       # Extract classification text
       classification_text = verdict_class.replace('Classification', '').replace('classification', '').replace(':', '').strip()
       classification = _infer_classification(classification_text)
       
       # Only set credibility score to 0 for UNSURE (others keep their scores)
       if classification == 'UNSURE':
           credibility_score = 0
       
       if input_lang == 'auto':
           trans_lang = claim_orig_lang
       else:
           trans_lang = input_lang
   
       if claim_orig_lang != 'en-IN':
           try:
               translation_class = client.text.translate(
               input=verdict_class,
               source_language_code='en-IN',
               target_language_code=claim_orig_lang
               )
           except Exception as e:
               print(f"Error during verdict translation: {e}")  
               error_msg = 'Something went wrong while translating the verdict. Please try again'
               return error_msg, error_msg, error_msg, 0, None, 'UNSURE', [], {}
               
           try:
               translation_explan = client.text.translate(
               input=verdict_explan,
               source_language_code='en-IN',
               target_language_code=claim_orig_lang
               )
           except Exception as e:
               print(f"Error during verdict translation: {e}")  
               error_msg = 'Something went wrong while translating the verdict. Please try again'
               return error_msg, error_msg, error_msg, 0, None, 'UNSURE', [], {}
           
           verdict_trans_class = translation_class.translated_text
           verdict_trans_explan = translation_explan.translated_text
           verdict_trans = verdict_trans_class + '\n\n' + verdict_trans_explan
           
           verdict_orig = verdict_class + '\n\n' + verdict_explan
       else:
           verdict_orig = verdict_class + '\n\n' + verdict_explan
           verdict_trans = verdict_orig
       
       # Extract evidence sources and save for all classifications
       claim_id = None
       evidence_sources = _extract_evidence_from_documents(retrieved_documents)
       flagged_sources = []
       if _is_trigger_classification(classification):
           # If we flagged it but still have no sources, try one last retrieval pass.
           if not evidence_sources:
               try:
                   extra_queries = _fallback_queries_for_claim(claim_final, submitted_url=submitted_url)
                   semantic_search_multiple_queries(extra_queries)
                   evidence_sources = _extract_evidence_from_documents(retrieved_documents)
               except Exception as e:
                   print(f"Final evidence fallback failed: {e}")

           if not evidence_sources:
               # Surface an explicit reason for downstream UI/storage.
               # On-chain code also records `no_sources_to_register` when sources list is empty.
               onchain_metadata = {"warnings": ["no_sources_found"]}
           flagged_sources = _compute_flagged_sources(claim_final, retrieved_documents, shared_embedding_model)
       onchain_sources = _aggregate_onchain_sources(
           submitted_url=submitted_url,
           evidence_sources=evidence_sources,
           flagged_sources=flagged_sources,
           claim_text=claim_final,
       )
       onchain_metadata = _build_onchain_metadata_multi(
           onchain_sources,
           classification=classification,
           title=claim_final[:180] if claim_final else None,
           content=(article_text or claim)[:5000] if (article_text or claim) else None,
       )
       # Expose what was flagged and what will be registered on-chain.
       onchain_metadata["flagged_sources"] = flagged_sources or []
       onchain_metadata["onchain_sources"] = onchain_sources or []
       if _is_trigger_classification(classification) and not flagged_sources:
           onchain_metadata.setdefault("warnings", []).append("no_flagged_sources_found")
       if _is_trigger_classification(classification) and not evidence_sources:
           onchain_metadata.setdefault("warnings", []).append("no_sources_found")
       try:
           claim_id = claim_storage.save_claim_record(
               claim_text=claim_final,
               claim_text_original=claim,
               classification=classification,
               credibility_score=credibility_score,
               explanation=verdict_explan,
               evidence_sources=evidence_sources,
               language=claim_orig_lang,
               submitted_url=submitted_url,
               article_text=article_text or claim,
               url_snapshot_html=url_raw_html,
               flagged_sources=flagged_sources,
               onchain_metadata=onchain_metadata
           )
       except Exception as storage_error:
           print(f"Error saving claim to storage: {storage_error}")
           # Continue even if storage fails
       
       return(claim_final, verdict_orig, verdict_trans, credibility_score, claim_id, classification, evidence_sources, onchain_metadata)
    except Exception as e:
        if str(e) == 'No result found':
            print('Error in main proc1. Error is ', e)
            error_msg = 'The search for this claim came back empty. Please rephrase the claim or try with a new one'
            return('UNSURE' ,error_msg,error_msg,0, None, 'UNSURE', [], {})
        else:
            print('Error in main proc2. Error is ', e)
            error_msg = 'Something went wrong. Please try after some time'
            return(error_msg,error_msg,error_msg,0, None, 'UNSURE', [], {})
    
def transcribe_audio(audio):
    """
       Description: This function trascibes audio using SarvamAI STT model 
    """
    try:
        client = SarvamAI(api_subscription_key = sarvam_api_key)
        mime_type, _ = mimetypes.guess_type(audio)
        
        with open(audio, "rb") as f:
            response = client.speech_to_text.transcribe(
                file=("audio.mp3", f, mime_type or "audio/mpeg"),
                model="saarika:v2.5",
                language_code="unknown"
            )
        ret_var = response.transcript
        ret_lang = response.language_code
    except Exception as e:
        print(f"Error during translation: {e}")
        ret_var = ''

    return ret_var, ret_lang
    
def verify_news_audio(audio):
    """
       Description: This function verifies the news where input method is Audio
    """
    
    claim, orig_lang = transcribe_audio(audio)
    if claim == '':
        error_msg = 'I could not understand your message. Please try recording again'
        return(error_msg,error_msg,error_msg)
    
    final_claim, verdict, verdict_trans, _, _, evidence_sources, _ = verify_news(claim, input_lang=orig_lang)
    return final_claim, verdict, verdict_trans
    
if __name__ == '__main__':
    print('helllo')
