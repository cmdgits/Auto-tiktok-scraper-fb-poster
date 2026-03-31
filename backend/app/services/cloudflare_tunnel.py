from __future__ import annotations

import base64
import json
import re
from uuid import UUID

TUNNEL_TOKEN_PATTERN = re.compile(r"(eyJ[A-Za-z0-9._-]{20,})")


def extract_tunnel_token(raw_value: str | None) -> str:
    normalized = (raw_value or "").strip()
    if not normalized:
        return ""

    match = TUNNEL_TOKEN_PATTERN.search(normalized)
    if match:
        return match.group(1)
    return normalized


def _decode_base64url(candidate: str) -> dict | None:
    if not candidate:
        return None

    padded = candidate + "=" * (-len(candidate) % 4)
    try:
        decoded = base64.urlsafe_b64decode(padded.encode("utf-8")).decode("utf-8")
    except Exception:
        return None

    try:
        payload = json.loads(decoded)
    except Exception:
        return None

    return payload if isinstance(payload, dict) else None


def _parse_token_payload(token: str) -> dict | None:
    parts = token.split(".")
    if len(parts) >= 2:
        payload = _decode_base64url(parts[1])
        if payload:
            return payload
    return _decode_base64url(token)


def _walk_values(data):
    if isinstance(data, dict):
        for key, value in data.items():
            yield key, value
            yield from _walk_values(value)
    elif isinstance(data, list):
        for item in data:
            yield from _walk_values(item)


def _extract_tunnel_id(payload: dict | None) -> str | None:
    if not payload:
        return None

    for key, value in _walk_values(payload):
        if not isinstance(value, str):
            continue
        candidate = value.strip()
        try:
            UUID(candidate)
        except Exception:
            continue

        normalized_key = str(key or "").lower()
        if "tunnel" in normalized_key or normalized_key in {"id", "uuid", "tid"}:
            return candidate
    return None


def _extract_account_tag(payload: dict | None) -> str | None:
    if not payload:
        return None

    preferred_keys = {
        "account_tag",
        "account_id",
        "account",
        "accounttag",
        "accountid",
        "a",
    }
    for key, value in _walk_values(payload):
        if not isinstance(value, str):
            continue
        normalized_key = str(key or "").lower().replace("-", "_")
        if normalized_key in preferred_keys:
            candidate = value.strip()
            if candidate:
                return candidate
    return None


def inspect_tunnel_token(raw_value: str | None) -> dict:
    normalized_token = extract_tunnel_token(raw_value)
    if not normalized_token:
        return {
            "ok": False,
            "message": "Bạn cần nhập TUNNEL_TOKEN trước khi xác thực.",
        }

    if not normalized_token.startswith("eyJ") or len(normalized_token) < 40:
        return {
            "ok": False,
            "message": "TUNNEL_TOKEN chưa đúng định dạng Cloudflare Tunnel. Bạn có thể dán trực tiếp token hoặc cả lệnh cloudflared.",
        }

    payload = _parse_token_payload(normalized_token)
    tunnel_id = _extract_tunnel_id(payload)
    account_tag = _extract_account_tag(payload)

    return {
        "ok": True,
        "message": (
            "Token đã đúng định dạng Cloudflare Tunnel. "
            "BASE_URL chưa thể sinh tự động từ token vì public hostname được cấu hình riêng trên Cloudflare."
        ),
        "verification_mode": "local_format_check",
        "normalized_token": normalized_token,
        "tunnel_id": tunnel_id,
        "account_tag": account_tag,
        "can_autofill_base_url": False,
        "base_url": None,
        "next_step": "Nhập hostname public đã cấu hình trong Cloudflare vào BASE_URL.",
    }
