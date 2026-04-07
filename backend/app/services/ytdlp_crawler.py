from __future__ import annotations

from contextvars import ContextVar
from dataclasses import dataclass
import os
from pathlib import Path
import tempfile
from typing import Any
import uuid
from urllib.parse import parse_qsl, urlsplit

import yt_dlp

from app.core.config import settings
from app.services.observability import log_structured

DOWNLOAD_DIR = settings.DOWNLOAD_DIR
_LAST_METADATA_DIAGNOSTICS: ContextVar[tuple[str, ...]] = ContextVar(
    "last_metadata_diagnostics",
    default=(),
)


@dataclass(frozen=True)
class NormalizedMediaEntry:
    original_id: str
    source_video_url: str
    original_caption: str | None
    title: str | None
    description: str | None
    source_platform: str
    source_kind: str


class _YTDLPDiagnosticCollector:
    def __init__(self) -> None:
        self._messages: list[str] = []

    @property
    def messages(self) -> list[str]:
        return list(self._messages)

    def debug(self, message: Any) -> None:
        normalized = self._normalize(message)
        if normalized.startswith("WARNING:") or normalized.startswith("ERROR:"):
            self._remember(normalized)

    def warning(self, message: Any) -> None:
        self._remember(f"WARNING: {self._normalize(message)}")

    def error(self, message: Any) -> None:
        self._remember(f"ERROR: {self._normalize(message)}")

    def _remember(self, message: str) -> None:
        normalized = self._normalize(message)
        if normalized and normalized not in self._messages:
            self._messages.append(normalized)

    @staticmethod
    def _normalize(message: Any) -> str:
        return str(message or "").strip()


def _get_last_metadata_diagnostics() -> list[str]:
    return list(_LAST_METADATA_DIAGNOSTICS.get())


def _set_last_metadata_diagnostics(messages: list[str]) -> None:
    _LAST_METADATA_DIAGNOSTICS.set(tuple(messages))


def _clean_diagnostic_message(message: str) -> str:
    normalized = (message or "").strip()
    if normalized.startswith("WARNING:"):
        return normalized[len("WARNING:") :].strip()
    if normalized.startswith("ERROR:"):
        return normalized[len("ERROR:") :].strip()
    return normalized


def _build_empty_source_error(source_platform: str, source_kind: str, diagnostics: list[str]) -> str | None:
    cleaned = [_clean_diagnostic_message(message) for message in diagnostics if _clean_diagnostic_message(message)]
    combined = " ".join(cleaned).casefold()

    if source_platform == "tiktok" and source_kind == "tiktok_profile":
        if "private or has embedding disabled" in combined and "secondary user id" in combined:
            return (
                "TikTok không cho phép đọc danh sách video từ hồ sơ này vì tài khoản đang riêng tư "
                "hoặc đã tắt embedding; yt-dlp cũng không lấy được secondary user ID. "
                "Hãy dùng link video TikTok cụ thể thay vì link trang hồ sơ."
            )
        if "private or has embedding disabled" in combined:
            return (
                "TikTok không cho phép đọc danh sách video từ hồ sơ này vì tài khoản đang riêng tư "
                "hoặc đã tắt embedding. Hãy dùng link video TikTok cụ thể thay vì link trang hồ sơ."
            )
        if "secondary user id" in combined:
            return (
                "Không thể đọc danh sách video từ hồ sơ TikTok này vì yt-dlp không lấy được "
                "secondary user ID của tài khoản. Hãy dùng link video TikTok cụ thể thay vì link trang hồ sơ."
            )

    return None


def extract_metadata(url: str):
    collector = _YTDLPDiagnosticCollector()
    ydl_opts = {
        "skip_download": True,
        "quiet": True,
        "ignoreerrors": True,
        "extract_flat": False,
        "logger": collector,
    }
    try:
        _set_last_metadata_diagnostics([])
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            result = ydl.extract_info(url, download=False)
        _set_last_metadata_diagnostics(collector.messages)
        return result
    except Exception as exc:
        _set_last_metadata_diagnostics(collector.messages)
        log_structured(
            "crawler",
            "error",
            "Không thể lấy metadata nguồn video.",
            details={"url": url, "error": str(exc), "diagnostics": collector.messages},
        )
        raise


def _iter_info_entries(info) -> list[dict]:
    if not info:
        return []
    if isinstance(info, dict) and "entries" in info:
        return [entry for entry in (info.get("entries") or []) if entry]
    if isinstance(info, dict):
        return [info]
    return []


def _is_youtube_short_url(url: str | None) -> bool:
    if not url:
        return False
    parsed = urlsplit(url)
    return parsed.netloc.lower() in {"youtube.com", "www.youtube.com", "m.youtube.com"} and parsed.path.lower().startswith("/shorts/")


def _normalize_youtube_entry_url(url: str | None, fallback_id: str | None = None, source_kind_hint: str | None = None) -> str | None:
    if isinstance(url, str) and url.startswith("http"):
        parsed = urlsplit(url)
        host = parsed.netloc.lower()
        path = parsed.path or "/"
        if host in {"youtu.be", "www.youtu.be"}:
            video_id = path.strip("/")
            if video_id:
                return f"https://www.youtube.com/watch?v={video_id}"
        if host in {"youtube.com", "www.youtube.com", "m.youtube.com"}:
            if path.lower().startswith("/shorts/"):
                short_id = path.strip("/").split("/", 1)[1]
                return f"https://www.youtube.com/shorts/{short_id}"
            if path.lower() == "/watch":
                video_id = dict(parse_qsl(parsed.query, keep_blank_values=False)).get("v")
                if video_id:
                    return f"https://www.youtube.com/watch?v={video_id}"
            return url

    if fallback_id:
        if source_kind_hint in {"youtube_short", "youtube_shorts_feed"}:
            return f"https://www.youtube.com/shorts/{fallback_id}"
        return f"https://www.youtube.com/watch?v={fallback_id}"

    return None


def _is_tiktok_video_url(url: str | None) -> bool:
    if not url:
        return False
    parsed = urlsplit(url)
    path = parsed.path.lower()
    return parsed.netloc.lower().endswith("tiktok.com") and ("/video/" in path or "/photo/" in path)


def _build_entry_url(entry: dict, source_platform: str, source_kind_hint: str) -> str | None:
    entry_id = entry.get("id")

    original_url = entry.get("original_url")
    if isinstance(original_url, str) and original_url.startswith("http"):
        if source_platform == "youtube":
            return _normalize_youtube_entry_url(original_url, entry_id, source_kind_hint)
        return original_url

    webpage_url = entry.get("webpage_url")
    if isinstance(webpage_url, str) and webpage_url.startswith("http"):
        if source_platform == "youtube":
            return _normalize_youtube_entry_url(webpage_url, entry_id, source_kind_hint)
        return webpage_url

    direct_url = entry.get("url")
    if isinstance(direct_url, str) and direct_url.startswith("http"):
        if source_platform == "youtube":
            return _normalize_youtube_entry_url(direct_url, entry_id, source_kind_hint)
        return direct_url

    if source_platform == "youtube":
        return _normalize_youtube_entry_url(None, entry_id, source_kind_hint)

    if not entry_id:
        return None

    return None


def _build_original_caption(title: str | None, description: str | None) -> str | None:
    normalized_title = (title or "").strip()
    normalized_description = (description or "").strip()
    if normalized_title and normalized_description:
        if normalized_title.casefold() == normalized_description.casefold():
            return normalized_title
        return f"{normalized_title}\n{normalized_description}"
    return normalized_description or normalized_title or None


def _normalize_entry(entry: dict, source_platform: str, source_kind_hint: str) -> NormalizedMediaEntry | None:
    entry_url = _build_entry_url(entry, source_platform, source_kind_hint)
    if not entry_url:
        return None

    if source_platform == "youtube":
        source_kind = "youtube_short" if _is_youtube_short_url(entry_url) else "youtube_video"
    elif source_platform == "tiktok":
        if _is_tiktok_video_url(entry_url):
            source_kind = "tiktok_video"
        else:
            source_kind = source_kind_hint or "tiktok_video"
    else:
        source_kind = source_kind_hint

    title = (entry.get("title") or "").strip() or None
    description = (entry.get("description") or "").strip() or None
    original_caption = _build_original_caption(title, description)

    return NormalizedMediaEntry(
        original_id=str(entry.get("id") or uuid.uuid4()),
        source_video_url=entry_url,
        original_caption=original_caption,
        title=title,
        description=description,
        source_platform=source_platform,
        source_kind=source_kind,
    )


def extract_source_entries(url: str, source_platform: str, source_kind: str) -> list[NormalizedMediaEntry]:
    raw_info = extract_metadata(url)
    diagnostics = _get_last_metadata_diagnostics()
    normalized_entries: list[NormalizedMediaEntry] = []
    seen_ids: set[str] = set()

    for entry in _iter_info_entries(raw_info):
        normalized = _normalize_entry(entry, source_platform, source_kind)
        if not normalized:
            continue
        if normalized.original_id in seen_ids:
            continue
        seen_ids.add(normalized.original_id)
        normalized_entries.append(normalized)

    if not normalized_entries and isinstance(raw_info, dict):
        normalized = _normalize_entry(raw_info, source_platform, source_kind)
        if normalized:
            normalized_entries.append(normalized)

    if not normalized_entries and diagnostics:
        diagnostic_error = _build_empty_source_error(source_platform, source_kind, diagnostics)
        if diagnostic_error:
            log_structured(
                "crawler",
                "warning",
                "Nguon video khong tra ve entry hop le kem chan doan yt-dlp.",
                details={
                    "url": url,
                    "source_platform": source_platform,
                    "source_kind": source_kind,
                    "diagnostics": diagnostics,
                },
            )
            raise ValueError(diagnostic_error)

    return normalized_entries


def download_video(url: str, filename_prefix: str = "video"):
    Path(DOWNLOAD_DIR).mkdir(parents=True, exist_ok=True)
    video_id = str(uuid.uuid4())
    filename = f"{filename_prefix}_{video_id}.mp4"
    out_path = os.path.join(DOWNLOAD_DIR, filename)

    ydl_opts = {
        "format": "best[vcodec^=h264]/best[vcodec^=avc]/best",
        "outtmpl": out_path,
        "quiet": True,
        "no_warnings": True,
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
        return out_path, video_id
    except Exception as exc:
        log_structured(
            "crawler",
            "error",
            "Không thể tải video từ nguồn.",
            details={"url": url, "filename_prefix": filename_prefix, "error": str(exc)},
        )
        return None, None


def get_downloader_health() -> dict:
    download_dir = Path(DOWNLOAD_DIR)
    try:
        download_dir.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=download_dir, delete=True):
            pass
        return {
            "ok": True,
            "configured": True,
            "download_dir": str(download_dir),
            "download_dir_exists": download_dir.exists(),
            "download_dir_writable": True,
            "yt_dlp_version": getattr(getattr(yt_dlp, "version", None), "__version__", None),
            "message": "yt-dlp sẵn sàng và thư mục tải xuống có thể ghi.",
        }
    except Exception as exc:
        return {
            "ok": False,
            "configured": True,
            "download_dir": str(download_dir),
            "download_dir_exists": download_dir.exists(),
            "download_dir_writable": False,
            "yt_dlp_version": getattr(getattr(yt_dlp, "version", None), "__version__", None),
            "message": f"yt-dlp hoặc thư mục tải xuống chưa sẵn sàng: {exc}",
        }
