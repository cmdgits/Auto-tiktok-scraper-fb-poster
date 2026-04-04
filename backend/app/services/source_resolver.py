from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
import re
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


class SourcePlatform(str, Enum):
    tiktok = "tiktok"
    youtube = "youtube"


class SourceKind(str, Enum):
    tiktok_video = "tiktok_video"
    tiktok_profile = "tiktok_profile"
    tiktok_shortlink = "tiktok_shortlink"
    youtube_video = "youtube_video"
    youtube_short = "youtube_short"
    youtube_channel = "youtube_channel"
    youtube_playlist = "youtube_playlist"
    youtube_shorts_feed = "youtube_shorts_feed"


class SourceResolutionError(ValueError):
    pass


@dataclass(frozen=True)
class ResolvedContentSource:
    platform: SourcePlatform
    source_kind: SourceKind
    normalized_url: str
    is_collection: bool


TIKTOK_SHORTLINK_HOSTS = {"vm.tiktok.com", "vt.tiktok.com"}
YOUTUBE_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com"}
YOUTUBE_SHORTS_FEED_PATTERN = re.compile(r"^/(?:@[^/]+|channel/[^/]+|c/[^/]+|user/[^/]+)/shorts/?$", re.IGNORECASE)
YOUTUBE_CHANNEL_PATTERN = re.compile(
    r"^/(?:@[^/]+|channel/[^/]+|c/[^/]+|user/[^/]+)(?:/(?:videos|featured|streams|live|playlists))?/?$",
    re.IGNORECASE,
)
TIKTOK_PROFILE_PATTERN = re.compile(r"^/@[^/]+/?$", re.IGNORECASE)
TIKTOK_VIDEO_PATTERN = re.compile(r"^/@[^/]+/(?:video|photo)/[^/]+/?$", re.IGNORECASE)
YOUTUBE_SHORT_PATTERN = re.compile(r"^/shorts/[^/]+/?$", re.IGNORECASE)


def _normalize_youtube_url(parsed):
    path = parsed.path or "/"
    if path != "/" and path.endswith("/"):
        path = path.rstrip("/")

    query_params = dict(parse_qsl(parsed.query, keep_blank_values=False))
    normalized_query = ""

    if path.lower() == "/watch" and query_params.get("v"):
        normalized_query = urlencode({"v": query_params["v"]})
    elif path.lower() == "/playlist" and query_params.get("list"):
        normalized_query = urlencode({"list": query_params["list"]})

    normalized = parsed._replace(
        scheme=parsed.scheme or "https",
        netloc=parsed.netloc.lower(),
        path=path,
        query=normalized_query,
        fragment="",
    )
    return urlunsplit(normalized)


def normalize_source_url(raw_url: str) -> str:
    candidate = (raw_url or "").strip()
    if not candidate:
        raise SourceResolutionError("Vui lòng nhập liên kết nguồn nội dung.")
    if "://" not in candidate and not candidate.startswith("//"):
        candidate = f"https://{candidate}"

    parsed = urlsplit(candidate)
    if not parsed.netloc:
        raise SourceResolutionError("Liên kết nguồn không hợp lệ.")

    lower_host = parsed.netloc.lower()
    if lower_host in YOUTUBE_HOSTS:
        return _normalize_youtube_url(parsed)

    path = parsed.path or "/"
    if path != "/" and path.endswith("/"):
        path = path.rstrip("/")

    normalized = parsed._replace(
        scheme=parsed.scheme or "https",
        netloc=lower_host,
        path=path,
        query="",
        fragment="",
    )
    return urlunsplit(normalized)


def _resolve_tiktok_source(host: str, path: str, normalized_url: str) -> ResolvedContentSource:
    lower_host = host.lower()
    lower_path = path.lower() or "/"

    if lower_host in TIKTOK_SHORTLINK_HOSTS or lower_path.startswith("/t/"):
        return ResolvedContentSource(
            platform=SourcePlatform.tiktok,
            source_kind=SourceKind.tiktok_shortlink,
            normalized_url=normalized_url,
            is_collection=False,
        )

    if TIKTOK_VIDEO_PATTERN.match(lower_path):
        return ResolvedContentSource(
            platform=SourcePlatform.tiktok,
            source_kind=SourceKind.tiktok_video,
            normalized_url=normalized_url,
            is_collection=False,
        )

    if TIKTOK_PROFILE_PATTERN.match(lower_path):
        return ResolvedContentSource(
            platform=SourcePlatform.tiktok,
            source_kind=SourceKind.tiktok_profile,
            normalized_url=normalized_url,
            is_collection=True,
        )

    raise SourceResolutionError("Liên kết TikTok chưa được hỗ trợ. Hãy dùng link video, hồ sơ hoặc shortlink TikTok hợp lệ.")


def _resolve_youtube_source(host: str, path: str, normalized_url: str, query: str) -> ResolvedContentSource:
    lower_path = path.lower() or "/"
    query_params = dict(parse_qsl(query, keep_blank_values=False))

    if lower_path == "/watch" and query_params.get("v"):
        return ResolvedContentSource(
            platform=SourcePlatform.youtube,
            source_kind=SourceKind.youtube_video,
            normalized_url=normalized_url,
            is_collection=False,
        )

    if lower_path == "/playlist" and query_params.get("list"):
        return ResolvedContentSource(
            platform=SourcePlatform.youtube,
            source_kind=SourceKind.youtube_playlist,
            normalized_url=normalized_url,
            is_collection=True,
        )

    if YOUTUBE_SHORT_PATTERN.match(lower_path):
        return ResolvedContentSource(
            platform=SourcePlatform.youtube,
            source_kind=SourceKind.youtube_short,
            normalized_url=normalized_url,
            is_collection=False,
        )

    if YOUTUBE_SHORTS_FEED_PATTERN.match(lower_path):
        return ResolvedContentSource(
            platform=SourcePlatform.youtube,
            source_kind=SourceKind.youtube_shorts_feed,
            normalized_url=normalized_url,
            is_collection=True,
        )

    if YOUTUBE_CHANNEL_PATTERN.match(lower_path):
        return ResolvedContentSource(
            platform=SourcePlatform.youtube,
            source_kind=SourceKind.youtube_channel,
            normalized_url=normalized_url,
            is_collection=True,
        )

    raise SourceResolutionError(
        "Liên kết YouTube chưa nằm trong phạm vi hỗ trợ. Hãy dùng link video, Shorts, playlist hoặc trang kênh YouTube hợp lệ."
    )


def resolve_content_source(raw_url: str) -> ResolvedContentSource:
    normalized_url = normalize_source_url(raw_url)
    parsed = urlsplit(normalized_url)
    host = parsed.netloc.lower()
    path = parsed.path or "/"

    if host.endswith("tiktok.com"):
        return _resolve_tiktok_source(host, path, normalized_url)

    if host in YOUTUBE_HOSTS:
        return _resolve_youtube_source(host, path, normalized_url, parsed.query)

    if host in {"youtu.be", "www.youtu.be"}:
        video_id = (path or "/").strip("/")
        if video_id:
            normalized_watch_url = normalize_source_url(f"https://www.youtube.com/watch?v={video_id}")
            return ResolvedContentSource(
                platform=SourcePlatform.youtube,
                source_kind=SourceKind.youtube_video,
                normalized_url=normalized_watch_url,
                is_collection=False,
            )
        raise SourceResolutionError(
            "Liên kết youtu.be chưa hợp lệ. Hãy dùng link video YouTube đầy đủ hoặc rút gọn có chứa mã video."
        )

    raise SourceResolutionError("Nguồn nội dung chưa được hỗ trợ. Hiện hệ thống nhận TikTok và YouTube.")
