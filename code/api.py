import os
import sys
import base64
import tempfile
import shutil
from urllib.parse import quote_plus

import requests as http_requests
from PIL import Image, ExifTags

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional

from fact_check_llm import verify_news
from image_fact_checker import verify_image_news, image_fact_checker
from claim_storage import ClaimStorageManager

app = FastAPI(title="Fake News Detection API")


def _as_float(value):
    try:
        return float(value)
    except Exception:
        return None


def _dms_to_decimal(dms, ref):
    try:
        deg = _as_float(dms[0]) or 0
        minute = _as_float(dms[1]) or 0
        sec = _as_float(dms[2]) or 0
        decimal = deg + (minute / 60.0) + (sec / 3600.0)
        if ref in ("S", "W"):
            decimal *= -1
        return round(decimal, 8)
    except Exception:
        return None


def _extract_structured_metadata(image_path: str) -> dict:
    with Image.open(image_path) as img:
        width, height = img.size
        megapixels = round((width * height) / 1_000_000, 2)
        info_keys = list((img.info or {}).keys())
        exif = img.getexif()

        exif_map = {}
        for tag_id, value in exif.items():
            tag_name = ExifTags.TAGS.get(tag_id, str(tag_id))
            exif_map[tag_name] = value

        taken_at = (
            exif_map.get("DateTimeOriginal")
            or exif_map.get("DateTimeDigitized")
            or exif_map.get("DateTime")
        )
        orientation = exif_map.get("Orientation")

        gps_block = {}
        if hasattr(exif, "get_ifd"):
            try:
                gps_block = exif.get_ifd(ExifTags.IFD.GPSInfo) or {}
            except Exception:
                gps_block = {}

        gps_named = {}
        for key, val in gps_block.items():
            gps_named[ExifTags.GPSTAGS.get(key, str(key))] = val

        latitude = None
        longitude = None
        altitude = None
        if gps_named.get("GPSLatitude") and gps_named.get("GPSLatitudeRef"):
            latitude = _dms_to_decimal(gps_named.get("GPSLatitude"), gps_named.get("GPSLatitudeRef"))
        if gps_named.get("GPSLongitude") and gps_named.get("GPSLongitudeRef"):
            longitude = _dms_to_decimal(gps_named.get("GPSLongitude"), gps_named.get("GPSLongitudeRef"))
        if gps_named.get("GPSAltitude") is not None:
            altitude = _as_float(gps_named.get("GPSAltitude"))

        raw_exif = {}
        for k, v in exif_map.items():
            try:
                raw_exif[k] = str(v)
            except Exception:
                raw_exif[k] = "<unserializable>"

        return {
            "basic": {
                "width": width,
                "height": height,
                "megapixels": megapixels,
                "format": img.format,
                "mode": img.mode,
                "file_size_bytes": os.path.getsize(image_path),
                "orientation": orientation,
                "has_exif": len(exif_map) > 0,
                "info_keys": info_keys,
            },
            "capture": {
                "taken_at": str(taken_at) if taken_at else None,
                "make": str(exif_map.get("Make")) if exif_map.get("Make") else None,
                "model": str(exif_map.get("Model")) if exif_map.get("Model") else None,
                "software": str(exif_map.get("Software")) if exif_map.get("Software") else None,
                "lens_model": str(exif_map.get("LensModel")) if exif_map.get("LensModel") else None,
            },
            "camera_settings": {
                "exposure_time": str(exif_map.get("ExposureTime")) if exif_map.get("ExposureTime") else None,
                "f_number": str(exif_map.get("FNumber")) if exif_map.get("FNumber") else None,
                "iso": exif_map.get("ISOSpeedRatings") or exif_map.get("PhotographicSensitivity"),
                "focal_length": str(exif_map.get("FocalLength")) if exif_map.get("FocalLength") else None,
                "flash": exif_map.get("Flash"),
            },
            "location": {
                "latitude": latitude,
                "longitude": longitude,
                "altitude": altitude,
                "has_gps": latitude is not None and longitude is not None,
            },
            "raw_exif": raw_exif,
        }

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TextVerifyRequest(BaseModel):
    claim: str = ""
    url: str = ""


def _safe_serialize(obj):
    """Ensure the object is JSON-serializable."""
    if isinstance(obj, dict):
        return {k: _safe_serialize(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_safe_serialize(i) for i in obj]
    if isinstance(obj, (int, float, bool, str)) or obj is None:
        return obj
    return str(obj)


@app.post("/api/verify/text")
async def verify_text(req: TextVerifyRequest):
    claim_input = req.claim.strip() or req.url.strip()
    submitted_url = req.url.strip() or None

    if not claim_input:
        raise HTTPException(status_code=400, detail="Provide a claim or URL.")

    try:
        result = verify_news(claim_input, submitted_url=submitted_url)

        if len(result) >= 7:
            claim, verdict_orig, verdict_trans, credibility_score, classification, evidence_sources, onchain_metadata = result[:7]
        else:
            claim = result[0] if len(result) > 0 else ""
            verdict_orig = result[1] if len(result) > 1 else ""
            verdict_trans = result[2] if len(result) > 2 else ""
            credibility_score = result[3] if len(result) > 3 else 0
            classification = result[4] if len(result) > 4 else "UNSURE"
            evidence_sources = result[5] if len(result) > 5 else []
            onchain_metadata = {}

        warnings = []
        if isinstance(onchain_metadata, dict):
            raw_warnings = onchain_metadata.get("warnings")
            if isinstance(raw_warnings, list):
                warnings = [str(w) for w in raw_warnings if w]
        flagged_sources = []
        onchain_sources = []
        if isinstance(onchain_metadata, dict):
            if isinstance(onchain_metadata.get("flagged_sources"), list):
                flagged_sources = onchain_metadata.get("flagged_sources") or []
            if isinstance(onchain_metadata.get("onchain_sources"), list):
                onchain_sources = onchain_metadata.get("onchain_sources") or []

        return _safe_serialize({
            "claim": claim,
            "verdict_original": verdict_orig,
            "verdict_translated": verdict_trans,
            "credibility_score": credibility_score,
            "classification": classification,
            "evidence_sources": evidence_sources,
            "flagged_sources": flagged_sources,
            "onchain_sources": onchain_sources,
            "warnings": warnings,
            "onchain_metadata": onchain_metadata if isinstance(onchain_metadata, dict) else {},
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/verify/image")
async def verify_image(file: UploadFile = File(...)):
    suffix = os.path.splitext(file.filename or "img.jpg")[1] or ".jpg"
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    try:
        shutil.copyfileobj(file.file, tmp)
        tmp.close()

        result = verify_image_news(tmp.name)

        # Backward/forward compatible unpacking
        if len(result) >= 10:
            (
                claim,
                verdict_english,
                verdict_original,
                ocr_text,
                caption,
                visual_summary,
                credibility_score,
                classification,
                evidence_sources,
                onchain_metadata,
            ) = result[:10]
        else:
            claim, verdict_english, verdict_original, ocr_text, caption, visual_summary, credibility_score, classification = result
            evidence_sources = []
            onchain_metadata = {}

        warnings = []
        if isinstance(onchain_metadata, dict):
            raw_warnings = onchain_metadata.get("warnings")
            if isinstance(raw_warnings, list):
                warnings = [str(w) for w in raw_warnings if w]
        flagged_sources = []
        onchain_sources = []
        if isinstance(onchain_metadata, dict):
            if isinstance(onchain_metadata.get("flagged_sources"), list):
                flagged_sources = onchain_metadata.get("flagged_sources") or []
            if isinstance(onchain_metadata.get("onchain_sources"), list):
                onchain_sources = onchain_metadata.get("onchain_sources") or []

        return _safe_serialize(
            {
                "claim": claim,
                "verdict_english": verdict_english,
                "verdict_original": verdict_original,
                "verdict_translated": verdict_original,
                "ocr_text": ocr_text,
                "caption": caption,
                "visual_summary": visual_summary,
                "credibility_score": credibility_score,
                "classification": classification,
                "evidence_sources": evidence_sources,
                "flagged_sources": flagged_sources,
                "onchain_sources": onchain_sources,
                "warnings": warnings,
                "onchain_metadata": onchain_metadata if isinstance(onchain_metadata, dict) else {},
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(tmp.name):
            os.unlink(tmp.name)


@app.get("/api/claims/recent")
async def recent_claims():
    try:
        manager = ClaimStorageManager()
        claims = manager.list_recent_claims(limit=10)
        return _safe_serialize(claims)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/claims/trending")
async def trending_claims():
    try:
        manager = ClaimStorageManager()
        trending = manager.get_trending_claims()
        return _safe_serialize(trending)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/claims/breaking")
async def breaking_feed(limit: int = 24):
    """Distinct claims for home breaking-news carousel (trending clusters + recent)."""
    try:
        manager = ClaimStorageManager()
        lim = min(max(limit, 8), 40)
        feed = manager.get_breaking_feed(limit=lim)
        return _safe_serialize(feed)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/claims/{claim_id}")
async def get_claim(claim_id: str):
    try:
        manager = ClaimStorageManager()
        record = manager.get_claim_by_id(claim_id)
        if record is None:
            raise HTTPException(status_code=404, detail="Claim not found.")
        record.pop("embedding", None)
        record.pop("article_text", None)
        return _safe_serialize(record)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _build_search_urls(public_url: str) -> dict:
    encoded = quote_plus(public_url)
    return {
        "google_lens": f"https://lens.google.com/uploadbyurl?url={encoded}",
        "google_images": f"https://www.google.com/searchbyimage?image_url={encoded}&client=app",
        "tineye": f"https://tineye.com/search?url={encoded}",
        "yandex": f"https://yandex.com/images/search?rpt=imageview&url={encoded}",
    }


class UrlSearchRequest(BaseModel):
    url: str


def _collect_image_metadata(image_input: str) -> dict:
    metadata = image_fact_checker.process_image_upload(image_input)
    stored_path = metadata.get("stored_path")

    if not stored_path:
        return metadata

    structured_meta = _extract_structured_metadata(stored_path)
    metadata["image_metadata"] = structured_meta

    image_fact_checker._save_image_metadata(metadata, metadata["image_id"])
    return metadata


@app.post("/api/tools/reverse-image-search-url")
async def reverse_image_search_by_url(req: UrlSearchRequest):
    """Build reverse-image-search links from an already-public image URL."""
    image_url = req.url.strip()
    if not image_url:
        raise HTTPException(status_code=400, detail="Provide an image URL.")
    return {"url": image_url, "search_urls": _build_search_urls(image_url)}


@app.post("/api/tools/reverse-image-upload")
async def reverse_image_upload(file: UploadFile = File(...)):
    """Upload image to imgbb, return public URL + reverse-search links."""
    imgbb_key = os.getenv("IMGBB_API_KEY", "").strip()
    if not imgbb_key:
        raise HTTPException(
            status_code=500,
            detail="IMGBB_API_KEY is not configured on the server.",
        )

    contents = await file.read()
    b64 = base64.b64encode(contents).decode("utf-8")

    try:
        resp = http_requests.post(
            "https://api.imgbb.com/1/upload",
            data={"key": imgbb_key, "image": b64},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"imgbb upload failed: {e}")

    if not data.get("success"):
        raise HTTPException(status_code=502, detail="imgbb returned an error.")

    public_url = data["data"]["url"]
    return {"url": public_url, "search_urls": _build_search_urls(public_url)}


@app.post("/api/tools/image-metadata-url")
async def image_metadata_by_url(req: UrlSearchRequest):
    image_url = req.url.strip()
    if not image_url:
        raise HTTPException(status_code=400, detail="Provide an image URL.")
    try:
        metadata = _collect_image_metadata(image_url)
        return _safe_serialize(metadata)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Metadata extraction failed: {e}")


@app.post("/api/tools/image-metadata-upload")
async def image_metadata_upload(file: UploadFile = File(...)):
    suffix = os.path.splitext(file.filename or "img.jpg")[1] or ".jpg"
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    try:
        shutil.copyfileobj(file.file, tmp)
        tmp.close()
        metadata = _collect_image_metadata(tmp.name)
        return _safe_serialize(metadata)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Metadata extraction failed: {e}")
    finally:
        if os.path.exists(tmp.name):
            os.unlink(tmp.name)


# ── Sightengine AI detection helpers ──────────────────────────────

SIGHTENGINE_CHECK_URL = "https://api.sightengine.com/1.0/check.json"
SIGHTENGINE_VIDEO_SYNC_URL = "https://api.sightengine.com/1.0/video/check-sync.json"


def _sightengine_creds() -> tuple[str, str]:
    api_user = os.getenv("SIGHTENGINE_API_USER", "").strip()
    api_secret = os.getenv("SIGHTENGINE_API_SECRET", "").strip()
    if not api_user or not api_secret:
        raise HTTPException(
            status_code=500,
            detail="SIGHTENGINE_API_USER / SIGHTENGINE_API_SECRET not configured.",
        )
    return api_user, api_secret


def _ai_verdict(ai_score: float, df_score: float) -> str:
    ai_flag = ai_score >= 0.7
    df_flag = df_score >= 0.7
    if ai_flag and df_flag:
        return "AI-generated + Deepfake"
    if ai_flag:
        return "AI-generated"
    if df_flag:
        return "Deepfake detected"
    if ai_score <= 0.3 and df_score <= 0.3:
        return "Likely authentic"
    return "Inconclusive"


class ImageUrlDetectRequest(BaseModel):
    url: str


@app.post("/api/detect/image")
async def detect_ai_image(file: UploadFile = File(...)):
    """Detect AI-generated content and deepfakes in an uploaded image."""
    api_user, api_secret = _sightengine_creds()
    contents = await file.read()

    try:
        resp = http_requests.post(
            SIGHTENGINE_CHECK_URL,
            files={"media": (file.filename or "image.jpg", contents, file.content_type or "image/jpeg")},
            data={
                "models": "genai,deepfake",
                "api_user": api_user,
                "api_secret": api_secret,
            },
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Sightengine request failed: {e}")

    if data.get("status") != "success":
        raise HTTPException(status_code=502, detail=f"Sightengine error: {data}")

    ai_score = data.get("type", {}).get("ai_generated", 0)
    df_score = data.get("type", {}).get("deepfake", 0)

    return {
        "ai_generated": ai_score,
        "deepfake": df_score,
        "verdict": _ai_verdict(ai_score, df_score),
        "media_id": data.get("media", {}).get("id"),
        "sightengine": data,
    }


@app.post("/api/detect/image-url")
async def detect_ai_image_url(req: ImageUrlDetectRequest):
    """Detect AI-generated content and deepfakes from an image URL."""
    image_url = req.url.strip()
    if not image_url:
        raise HTTPException(status_code=400, detail="Provide an image URL.")

    api_user, api_secret = _sightengine_creds()

    try:
        resp = http_requests.get(
            SIGHTENGINE_CHECK_URL,
            params={
                "url": image_url,
                "models": "genai,deepfake",
                "api_user": api_user,
                "api_secret": api_secret,
            },
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Sightengine request failed: {e}")

    if data.get("status") != "success":
        raise HTTPException(status_code=502, detail=f"Sightengine error: {data}")

    ai_score = data.get("type", {}).get("ai_generated", 0)
    df_score = data.get("type", {}).get("deepfake", 0)

    return {
        "ai_generated": ai_score,
        "deepfake": df_score,
        "verdict": _ai_verdict(ai_score, df_score),
        "media_id": data.get("media", {}).get("id"),
        "sightengine": data,
    }


MAX_VIDEO_SIZE = 50 * 1024 * 1024  # 50 MB


@app.post("/api/detect/video")
async def detect_ai_video(file: UploadFile = File(...)):
    """Detect AI-generated content and deepfakes in an uploaded video (sync, <1 min)."""
    api_user, api_secret = _sightengine_creds()
    contents = await file.read()

    if len(contents) > MAX_VIDEO_SIZE:
        raise HTTPException(
            status_code=413,
            detail="Video too large. Maximum size is 50 MB.",
        )

    try:
        resp = http_requests.post(
            SIGHTENGINE_VIDEO_SYNC_URL,
            files={"media": (file.filename or "video.mp4", contents, file.content_type or "video/mp4")},
            data={
                "models": "genai,deepfake",
                "api_user": api_user,
                "api_secret": api_secret,
            },
            timeout=120,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Sightengine request failed: {e}")

    if data.get("status") != "success":
        raise HTTPException(status_code=502, detail=f"Sightengine error: {data}")

    raw_frames = data.get("data", {}).get("frames", [])
    frames = list(raw_frames)

    if frames:
        ai_scores = [
            fr.get("type", {}).get("ai_generated", 0) for fr in frames
        ]
        df_scores = [fr.get("type", {}).get("deepfake", 0) for fr in frames]
        ai_avg = sum(ai_scores) / len(ai_scores)
        ai_max = max(ai_scores)
        df_avg = sum(df_scores) / len(df_scores)
        df_max = max(df_scores)
    else:
        ai_avg = ai_max = df_avg = df_max = 0

    return {
        "summary": {
            "ai_generated_avg": round(ai_avg, 4),
            "ai_generated_max": round(ai_max, 4),
            "deepfake_avg": round(df_avg, 4),
            "deepfake_max": round(df_max, 4),
            "verdict": _ai_verdict(ai_avg, df_avg),
            "frames_analyzed": len(frames),
        },
        "frames": frames,
        "sightengine": data,
    }


# Serve frontend static assets if built
frontend_dist = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dist")
if os.path.exists(frontend_dist):
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dist, "assets")), name="static-assets")

    @app.get("/{rest_of_path:path}")
    async def serve_frontend(rest_of_path: str):
        file_path = os.path.join(frontend_dist, rest_of_path)
        if rest_of_path and os.path.exists(file_path) and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(frontend_dist, "index.html"))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
