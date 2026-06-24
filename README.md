# Fake News Detection Platform

Multilingual, multimodal fact-checking system with retrieval‑augmented reasoning, on‑chain reputation, and a React + FastAPI UI. Supports Bangla and English text, URLs, and images (OCR/caption → text).

## Features
- **Unified pipeline (text + image):** OCR/captioned images flow into the same verifier as text/URLs.
- **Retrieval‑augmented reasoning:** Multi-query search, evidence deduplication, factual summarization, LLM judgment (REAL/FAKE/MISINFORMATION/UNSURE) with credibility score and short rationale.
- **Reputation ledger:** URL and publisher lookups, publisher flag count, and on‑chain registration for flagged cases; transaction hash surfaced in UI.
- **Local traceability:** Claim records stored as JSON with evidence, flagged sources, and on‑chain metadata.
- **React UI:** Bengali-first interface showing verdict, score, evidence list, publisher reputation count, and blockchain hash.
- **FastAPI backend:** REST API (`code/api.py`) wrapping the verification pipeline for the React frontend.
- **Legacy Gradio UI:** Still available via `code/app.py` for quick testing.

## High-Level Flow
1) **Input:** User submits text/URL or image.  
2) **Prep:** Clean/normalize text; fetch URL content; OCR/caption images.  
3) **Retrieve:** Generate multiple queries; collect and deduplicate evidence.  
4) **Summarize:** Reduce evidence to short factual notes.  
5) **Judge:** LLM produces label, score (0–100), and explanation.  
6) **Reputation:** For FAKE/MISINFO, flag sources; check URL/publisher history; register on-chain; capture tx hash and publisher count.  
7) **Store & Display:** Persist JSON record; render UI cards with verdict, evidence, reputation, and hash.

## Key Modules
- `code/fact_check_llm.py`: Core verification pipeline (text + image via shared flow), retrieval, summarization, judgment, storage, on‑chain metadata.
- `code/image_fact_checker.py`: Image ingestion, OCR, captioning, and handoff to verifier.
- `code/blockchain_registry.py`: Lightweight client for ledger interactions (register, lookup URL, lookup publisher).
- `code/claim_storage.py`: JSON storage for claims, evidence, flagged sources, and on‑chain data.
- `code/api.py`: FastAPI REST backend (`POST /api/verify/text`, `POST /api/verify/image`, `GET /api/claims/recent`).
- `code/app.py`: Legacy Gradio UI wiring.
- `bangla-fact-check-main/`: React 19 + Vite + Tailwind frontend (Bengali fact-check interface).
- `code/architecture_diagram.py` / `code/architecture.mmd`: Mermaid architecture diagram generator/output.

## Tests
- `code/test_blockchain_registry.py`: Mocks ledger client calls.
- `code/test_claim_storage.py`: Validates storage, embeddings, snapshots, and on‑chain metadata field.
- `code/test_image_verification.py` / others: Cover image/text verification helpers.

## Quick Start (Clone & Run in One Command)

This is the fastest way for anyone to run the complete platform. It builds and runs a single, unified container containing both the React frontend and FastAPI backend, served on port `8000`.

1. **Clone the repository:**
   ```bash
   git clone <your-repo-url>
   cd Fake_news_detection
   ```

2. **Set up API keys:**
   Copy the example environment file and fill in your keys:
   ```bash
   cp .env.example .env
   ```
   Open the `.env` file and insert your respective Groq, Serper, Sarvam AI, Sightengine, and ImgBB keys.

3. **Start the application:**
   ```bash
   docker compose up --build
   ```

Once built, open **`http://localhost:8000`** in your browser to use the interface.

---

## Alternative Deployment Methods

### Direct Docker Run (Single Container)

If you want to build and run the unified image directly via the Docker CLI without compose:

**Build:**
```bash
docker build -t fake-news-platform:latest .
```

**Run:**
```bash
docker run -p 8000:8000 --env-file .env \
  -v claim_metadata:/app/claim_metadata \
  -v claim_snapshots:/app/claim_snapshots \
  -v flagged_sources:/app/flagged_sources \
  -v uploaded_images:/app/uploaded_images \
  -v image_metadata:/app/image_metadata \
  -v model_cache:/root/.cache \
  -v easyocr_cache:/root/.EasyOCR \
  fake-news-platform:latest
```

Notes:
- First startup can take longer because OCR and transformer models download into Docker volumes.
- Persistent data is stored in Docker volumes for claims, snapshots, uploaded images, and model caches.

### React + FastAPI (recommended)

Start the backend and frontend in two separate terminals:

```bash
# Terminal 1 — FastAPI backend (from project root)
pip install -r code/requirements.txt
python code/api.py
```

```bash
# Terminal 2 — React frontend
cd bangla-fact-check-main
npm install
npm run dev
```

The Vite dev server proxies `/api` requests to `http://localhost:8000`. Open the URL shown by Vite (typically `http://localhost:5173`).

### Legacy Gradio UI

```bash
python code/app.py
```

## Environment Notes
- Configure required model and key settings via `.env` alongside code (LLM, translation, search, ledger settings).
- For blockchain bridge integration in `code/`, set:
  - `BLOCKCHAIN_API_BASE_URL` (example: `https://fakensethfa.onrender.com`)
  - The client expects `POST /register` and `GET /publisherhistory?publisher=...`.
  - URL-level checks still try `GET /getNews?url=...` when available.
- `POST /register` payload supports: `url`, `publisher`, optional `title`, optional `content`.
- Keep RPC, contract address, and signing key only in the blockchain backend service (not in the FastAPI app).

## Architecture Snapshot
Mermaid: see `code/architecture.mmd`. Generate fresh via:
```bash
python code/architecture_diagram.py
```
