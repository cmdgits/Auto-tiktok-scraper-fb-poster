from __future__ import annotations

import requests

from app.services.runtime_settings import resolve_runtime_value
from app.services.observability import log_structured
from app.services.http_client import request_with_retries


def notify_telegram(message: str) -> bool:
    token = resolve_runtime_value("TELEGRAM_BOT_TOKEN")
    chat_id = resolve_runtime_value("TELEGRAM_CHAT_ID")

    if not token or not chat_id:
        log_structured(
            "telegram",
            "warning",
            "Thiếu cấu hình Telegram Token hoặc Chat ID, bỏ qua gửi thông báo.",
        )
        return False

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": message,
        "parse_mode": "HTML"
    }

    try:
        response = request_with_retries(
            "POST",
            url,
            json=payload,
            timeout=10,
            scope="telegram",
            operation="Gửi tin nhắn Telegram",
        )
        response.raise_for_status()
        return True
    except Exception as exc:
        log_structured(
            "telegram",
            "error",
            "Gửi thông báo Telegram thất bại.",
            details={"error": str(exc), "message_preview": message[:100]},
        )
        return False
