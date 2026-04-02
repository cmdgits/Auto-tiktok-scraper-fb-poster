from __future__ import annotations

import re
import unicodedata
from typing import Any

from sqlalchemy.orm import Session

from app.models.models import Campaign, Video, VideoStatus

LOOKUP_HINT_PHRASES = (
    "gui link",
    "gửi link",
    "xin link",
    "cho link",
    "link video",
    "link clip",
    "video nao",
    "video nào",
    "clip nao",
    "clip nào",
    "tieu de",
    "tiêu đề",
    "noi dung",
    "nội dung",
    "phan tiep",
    "phần tiếp",
    "part 2",
    "xem lai",
    "xem lại",
)

LOOKUP_REQUEST_SIGNALS = (
    "link",
    "xin",
    "gui",
    "g\u1eedi",
    "cho",
    "tim",
    "t\u00ecm",
    "ten",
    "t\u00ean",
    "nhac",
    "nh\u1ea1c",
    "nguon",
    "ngu\u1ed3n",
    "source",
    "part",
    "phan",
    "ph\u1ea7n",
    "full",
    "xem lai",
    "xem l\u1ea1i",
    "o dau",
    "\u1edf \u0111\u00e2u",
)


GENERIC_LOOKUP_TOKENS = {
    "ad",
    "admin",
    "ban",
    "banh",
    "cho",
    "clip",
    "co",
    "cua",
    "di",
    "dum",
    "dung",
    "duoc",
    "gi",
    "giup",
    "gui",
    "hay",
    "ho",
    "hoac",
    "hoi",
    "khong",
    "lai",
    "link",
    "minh",
    "nao",
    "nay",
    "neu",
    "noi",
    "noi_dung",
    "noi_dung_nao",
    "oi",
    "page",
    "phan",
    "phan_tiep",
    "phim",
    "reel",
    "shop",
    "them",
    "theo",
    "tieu",
    "tieu_de",
    "tim",
    "toi",
    "tra",
    "ve",
    "video",
    "voi",
    "xem",
    "xin",
}


def _strip_accents(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value or "")
    return "".join(char for char in normalized if not unicodedata.combining(char))


def _normalize_lookup_text(value: str) -> str:
    lowered = _strip_accents(value or "").lower()
    lowered = lowered.replace("đ", "d")
    lowered = re.sub(r"[^a-z0-9\s]", " ", lowered)
    return re.sub(r"\s+", " ", lowered).strip()


def _tokenize_lookup_text(value: str) -> list[str]:
    normalized = _normalize_lookup_text(value)
    tokens = re.findall(r"[a-z0-9]+", normalized)
    return [token for token in tokens if len(token) >= 2 and token not in GENERIC_LOOKUP_TOKENS]


def _should_attempt_video_lookup(user_message: str) -> bool:
    normalized = _normalize_lookup_text(user_message)
    if not normalized:
        return False
    if any(phrase in normalized for phrase in LOOKUP_HINT_PHRASES):
        return True
    return (
        any(keyword in normalized for keyword in ("video", "clip", "reel"))
        and any(token not in {"video", "clip", "reel"} for token in _tokenize_lookup_text(user_message))
    )


def _should_attempt_video_lookup(user_message: str) -> bool:
    normalized = _normalize_lookup_text(user_message)
    if not normalized:
        return False
    if any(phrase in normalized for phrase in LOOKUP_HINT_PHRASES):
        return True

    has_media_reference = any(keyword in normalized for keyword in ("video", "clip", "reel"))
    if not has_media_reference:
        return False

    has_lookup_signal = "?" in (user_message or "") or any(signal in normalized for signal in LOOKUP_REQUEST_SIGNALS)
    if not has_lookup_signal:
        return False

    return any(token not in {"video", "clip", "reel"} for token in _tokenize_lookup_text(user_message))


def _build_video_search_text(video: Video, campaign_name: str | None) -> str:
    parts = [
        (video.ai_caption or "").strip(),
        (video.original_caption or "").strip(),
        (campaign_name or "").strip(),
        (video.source_video_url or "").strip(),
    ]
    return " ".join(part for part in parts if part)


def _pick_video_title(video: Video, campaign_name: str | None) -> str:
    for value in (video.ai_caption, video.original_caption, campaign_name, video.source_video_url, video.original_id):
        text = (value or "").strip()
        if text:
            text = re.sub(r"\s+", " ", text)
            return text[:140]
    return "Video khong co tieu de"


def _score_video_match(video: Video, campaign_name: str | None, *, raw_query: str, query_tokens: list[str]) -> tuple[int, int]:
    haystack = _normalize_lookup_text(_build_video_search_text(video, campaign_name))
    if not haystack:
        return 0, 0

    score = 0
    token_hits = 0
    for token in query_tokens:
        if token in haystack:
            token_hits += 1
            score += 14 if len(token) >= 4 else 8

    condensed_query = " ".join(query_tokens[:8]).strip()
    if condensed_query and condensed_query in haystack:
        score += 75
    elif raw_query and len(raw_query) >= 10 and raw_query in haystack:
        score += 55

    if query_tokens and token_hits == len(query_tokens):
        score += 35
    elif token_hits >= 2:
        score += 15

    status_value = video.status.value if hasattr(video.status, "value") else str(video.status)
    if status_value == VideoStatus.posted.value:
        score += 12
    elif status_value == VideoStatus.ready.value:
        score += 6

    if video.fb_post_id:
        score += 5

    return score, token_hits


def _build_match_payload(video: Video, campaign_name: str | None, *, score: int, token_hits: int) -> dict[str, Any]:
    status_value = video.status.value if hasattr(video.status, "value") else str(video.status)
    return {
        "video_id": str(video.id),
        "title": _pick_video_title(video, campaign_name),
        "campaign_name": (campaign_name or "").strip() or None,
        "source_video_url": (video.source_video_url or "").strip() or None,
        "fb_post_id": (video.fb_post_id or "").strip() or None,
        "status": status_value,
        "score": score,
        "token_hits": token_hits,
    }


def _format_match_line(index: int, match: dict[str, Any]) -> str:
    title = match["title"]
    link = match.get("source_video_url")
    if link:
        return f"{index}. {title}\nLink hi\u1ec7n h\u1ec7 th\u1ed1ng \u0111ang c\u00f3: {link}"
    if match.get("fb_post_id"):
        return f"{index}. {title}\nVideo n\u00e0y \u0111\u00e3 \u0111\u0103ng tr\u00ean page, m\u00e3 b\u00e0i: {match['fb_post_id']}"
    return f"{index}. {title}"


def _build_direct_lookup_reply(matches: list[dict[str, Any]], query_tokens: list[str]) -> str:
    if not matches:
        query_hint = " ".join(query_tokens[:6]).strip()
        if query_hint:
            return (
                f"M\u00ecnh ch\u01b0a t\u00ecm th\u1ea5y video n\u00e0o trong kho n\u1ed9i dung c\u1ee7a page kh\u1edbp v\u1edbi \"{query_hint}\". "
                "B\u1ea1n nh\u1eafn th\u00eam 2-3 t\u1eeb kh\u00f3a trong ti\u00eau \u0111\u1ec1 ho\u1eb7c n\u1ed9i dung n\u1ed5i b\u1eadt \u0111\u1ec3 m\u00ecnh t\u00ecm s\u00e1t h\u01a1n nh\u00e9."
            )
        return (
            "M\u00ecnh ch\u01b0a \u0111\u1ee7 th\u00f4ng tin \u0111\u1ec3 t\u00ecm \u0111\u00fang video b\u1ea1n c\u1ea7n. "
            "B\u1ea1n nh\u1eafn th\u00eam v\u00e0i t\u1eeb kh\u00f3a trong ti\u00eau \u0111\u1ec1 ho\u1eb7c n\u1ed9i dung n\u1ed5i b\u1eadt \u0111\u1ec3 m\u00ecnh l\u1ecdc l\u1ea1i nh\u00e9."
        )

    if len(matches) == 1:
        match = matches[0]
        status_note = (
            "Video n\u00e0y \u0111\u00e3 \u0111\u0103ng tr\u00ean page r\u1ed3i."
            if match.get("status") == VideoStatus.posted.value or match.get("fb_post_id")
            else "Video n\u00e0y \u0111ang n\u1eb1m trong kho n\u1ed9i dung c\u1ee7a page."
        )
        if match.get("source_video_url"):
            return (
                f"M\u00ecnh t\u00ecm th\u1ea5y video g\u1ea7n \u0111\u00fang nh\u1ea5t r\u1ed3i n\u00e8: {match['title']}\n"
                f"Link hi\u1ec7n h\u1ec7 th\u1ed1ng \u0111ang c\u00f3: {match['source_video_url']}\n"
                f"{status_note}"
            )
        if match.get("fb_post_id"):
            return (
                f"M\u00ecnh t\u00ecm th\u1ea5y video g\u1ea7n \u0111\u00fang nh\u1ea5t r\u1ed3i n\u00e8: {match['title']}\n"
                f"{status_note} M\u00e3 b\u00e0i hi\u1ec7n t\u1ea1i: {match['fb_post_id']}"
            )
        return f"M\u00ecnh t\u00ecm th\u1ea5y video g\u1ea7n \u0111\u00fang nh\u1ea5t r\u1ed3i n\u00e8: {match['title']}\n{status_note}"

    lines = "\n".join(_format_match_line(index, match) for index, match in enumerate(matches[:3], start=1))
    return (
        "M\u00ecnh th\u1ea5y v\u00e0i video kh\u00e1 kh\u1edbp v\u1edbi m\u00f4 t\u1ea3 c\u1ee7a b\u1ea1n:\n"
        f"{lines}\n"
        "N\u1ebfu ch\u01b0a \u0111\u00fang clip b\u1ea1n c\u1ea7n, b\u1ea1n nh\u1eafn th\u00eam v\u00e0i t\u1eeb kh\u00f3a \u0111\u1ec3 m\u00ecnh l\u1ecdc ti\u1ebfp nh\u00e9."
    )


def _build_lookup_context(matches: list[dict[str, Any]]) -> str | None:
    if not matches:
        return None

    lines = ["Tra cuu video lien quan trong kho noi dung cua page:"]
    for index, match in enumerate(matches[:3], start=1):
        lines.append(f"{index}. Tieu de: {match['title']}")
        if match.get("campaign_name"):
            lines.append(f"   Chien dich: {match['campaign_name']}")
        lines.append(f"   Trang thai: {match['status']}")
        if match.get("source_video_url"):
            lines.append(f"   Link hien he thong dang co: {match['source_video_url']}")
        if match.get("fb_post_id"):
            lines.append(f"   Ma bai tren page: {match['fb_post_id']}")
    return "\n".join(lines)


def merge_page_knowledge_context(*parts: str | None) -> str | None:
    merged: list[str] = []
    for part in parts:
        text = (part or "").strip()
        if text:
            merged.append(text)
    if not merged:
        return None
    return "\n\n".join(merged)


def select_relevant_knowledge_sections(
    knowledge_base: str | None,
    *,
    user_message: str,
    limit: int = 5,
) -> str | None:
    raw_text = (knowledge_base or "").strip()
    if not raw_text:
        return None
    if len(raw_text) <= 1800:
        return raw_text

    sections = [section.strip() for section in re.split(r"\n\s*\n+", raw_text) if section.strip()]
    if not sections:
        return raw_text[:1800]

    query_tokens = _tokenize_lookup_text(user_message)
    if not query_tokens:
        return "\n\n".join(sections[: min(limit, len(sections))])

    scored_sections: list[tuple[int, int, str]] = []
    for index, section in enumerate(sections):
        haystack = _normalize_lookup_text(section)
        score = 0
        for token in query_tokens:
            if token in haystack:
                score += 2 if len(token) >= 4 else 1
        if score > 0:
            scored_sections.append((score, -index, section))

    if not scored_sections:
        return "\n\n".join(sections[: min(limit, len(sections))])

    scored_sections.sort(reverse=True)
    top_sections = [section for _, _, section in scored_sections[:limit]]
    return "\n\n".join(top_sections)


def lookup_page_video_knowledge(
    db: Session,
    *,
    page_id: str | None,
    user_message: str,
    limit: int = 3,
) -> dict[str, Any]:
    query_tokens = _tokenize_lookup_text(user_message)
    raw_query = _normalize_lookup_text(" ".join(query_tokens[:8]) or user_message)
    should_lookup = bool(page_id) and _should_attempt_video_lookup(user_message)

    result: dict[str, Any] = {
        "should_lookup": should_lookup,
        "query_tokens": query_tokens,
        "matches": [],
        "knowledge_block": None,
        "direct_reply": None,
        "summary": None,
        "intent": None,
        "customer_facts": {},
    }
    if not should_lookup:
        return result

    rows = (
        db.query(Video, Campaign.name)
        .join(Campaign, Video.campaign_id == Campaign.id)
        .filter(Campaign.target_page_id == page_id)
        .filter(Video.status != VideoStatus.failed)
        .all()
    )

    scored_matches: list[dict[str, Any]] = []
    for video, campaign_name in rows:
        score, token_hits = _score_video_match(video, campaign_name, raw_query=raw_query, query_tokens=query_tokens)
        if score < 18 or token_hits == 0:
            continue
        scored_matches.append(_build_match_payload(video, campaign_name, score=score, token_hits=token_hits))

    scored_matches.sort(
        key=lambda item: (
            item["score"],
            1 if item["status"] == VideoStatus.posted.value else 0,
            1 if item.get("source_video_url") else 0,
            item["title"],
        ),
        reverse=True,
    )

    top_matches = scored_matches[:limit]
    result["matches"] = top_matches
    result["knowledge_block"] = _build_lookup_context(top_matches)
    result["direct_reply"] = _build_direct_lookup_reply(top_matches, query_tokens)
    query_summary = " ".join(query_tokens[:8]).strip() or _normalize_lookup_text(user_message)[:120]
    result["summary"] = f"Khach dang hoi tim video theo tieu de/noi dung: {query_summary}"[:240]
    result["intent"] = "video_lookup"
    if query_summary:
        result["customer_facts"] = {"last_video_lookup_query": query_summary[:120]}
    return result
