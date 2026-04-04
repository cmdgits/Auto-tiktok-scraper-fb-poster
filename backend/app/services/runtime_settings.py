from __future__ import annotations

from pathlib import Path

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.models import FacebookPage, RuntimeSetting
from app.services.security import decrypt_secret, encrypt_secret, mask_secret

RUNTIME_ENV_FILE = Path(__file__).resolve().parents[2] / "runtime.env"

RUNTIME_SETTING_SPECS = {
    "BASE_URL": {
        "label": "BASE_URL",
        "description": "URL cong khai cua he thong",
        "is_secret": False,
        "requires_restart": False,
    },
    "FB_VERIFY_TOKEN": {
        "label": "FB_VERIFY_TOKEN",
        "description": "Ma xac minh webhook Facebook",
        "is_secret": False,
        "requires_restart": False,
    },
    "FB_APP_SECRET": {
        "label": "FB_APP_SECRET",
        "description": "App secret de xac minh chu ky webhook",
        "is_secret": True,
        "requires_restart": False,
    },
    "GEMINI_API_KEY": {
        "label": "GEMINI_API_KEY",
        "description": "Khoa Gemini de sinh caption va tra loi",
        "is_secret": True,
        "requires_restart": False,
    },
    "OPENAI_API_KEY": {
        "label": "OPENAI_API_KEY",
        "description": "Khoa OpenAI GPT de thay the khi Gemini loi hoac het quota",
        "is_secret": True,
        "requires_restart": False,
    },
    "SERPAPI_API_KEY": {
        "label": "SERPAPI_API_KEY",
        "description": "Khoa SerpApi de lay related queries tu Google Trends",
        "is_secret": True,
        "requires_restart": False,
    },
    "TREND_GEO": {
        "label": "TREND_GEO",
        "description": "Ma quoc gia Google Trends, vi du VN hoac US",
        "is_secret": False,
        "requires_restart": False,
    },
    "TREND_SEARCH_ENDPOINT": {
        "label": "TREND_SEARCH_ENDPOINT",
        "description": "API search/trend ngoai tra ve related queries hoac hashtag",
        "is_secret": False,
        "requires_restart": False,
    },
    "TREND_SEARCH_API_KEY": {
        "label": "TREND_SEARCH_API_KEY",
        "description": "Khoa truy cap cho search service ngoai neu can",
        "is_secret": True,
        "requires_restart": False,
    },
    "GOOGLE_SERVICE_ACCOUNT_EMAIL": {
        "label": "Google service account email",
        "description": "Email service account duoc share quyen sua Google Sheet san pham",
        "is_secret": False,
        "requires_restart": False,
    },
    "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY": {
        "label": "Google service account private key",
        "description": "Private key cua service account de doc va cap nhat Google Sheet",
        "is_secret": True,
        "requires_restart": False,
    },
    "TUNNEL_TOKEN": {
        "label": "TUNNEL_TOKEN",
        "description": "Token Cloudflare Tunnel",
        "is_secret": True,
        "requires_restart": True,
    },
    "TELEGRAM_BOT_TOKEN": {
        "label": "TELEGRAM_BOT_TOKEN",
        "description": "Bot Token de nhan thong bao tu Telegram",
        "is_secret": True,
        "requires_restart": False,
    },
    "TELEGRAM_CHAT_ID": {
        "label": "TELEGRAM_CHAT_ID",
        "description": "Chat ID de gui thong bao",
        "is_secret": False,
        "requires_restart": False,
    },
    "ADMIN_PASSWORD": {
        "label": "Mat khau Admin mac dinh",
        "description": "Mat khau cho tai khoan quan tri he thong",
        "is_secret": True,
        "requires_restart": False,
    },
    "DEFAULT_ADMIN_USERNAME": {
        "label": "Ten dang nhap Admin mac dinh",
        "description": "Ten dang nhap cho tai khoan quan tri he thong",
        "is_secret": False,
        "requires_restart": False,
    },
}


def get_runtime_setting_specs() -> dict[str, dict]:
    return RUNTIME_SETTING_SPECS


def get_runtime_default_value(key: str) -> str:
    return str(getattr(settings, key, "") or "")


def _normalize_value(value) -> str | None:
    if value is None:
        return None
    return str(value).strip()


def _encode_runtime_env_value(value: str | None) -> str:
    return str(value or "").replace("\n", "\\n")


def _resolve_page_access_token(raw_token: str | None) -> str:
    if not raw_token:
        return ""
    try:
        return decrypt_secret(raw_token)
    except ValueError:
        return raw_token


def _decode_record_value(record: RuntimeSetting | None) -> str | None:
    if not record or record.value is None:
        return None
    if record.is_secret:
        return decrypt_secret(record.value)
    return record.value


def resolve_runtime_value(key: str, db: Session | None = None) -> str:
    if key not in RUNTIME_SETTING_SPECS:
        return get_runtime_default_value(key)

    if db is not None:
        record = db.get(RuntimeSetting, key)
        decoded = _decode_record_value(record)
        if decoded is not None:
            return decoded
        return get_runtime_default_value(key)

    temp_db = None
    try:
        temp_db = SessionLocal()
        return resolve_runtime_value(key, db=temp_db)
    except Exception:
        return get_runtime_default_value(key)
    finally:
        if temp_db is not None:
            temp_db.close()


def build_runtime_settings_payload(db: Session) -> dict:
    resolved_values = {key: resolve_runtime_value(key, db=db) for key in RUNTIME_SETTING_SPECS}
    settings_payload = {}

    for key, spec in RUNTIME_SETTING_SPECS.items():
        record = db.get(RuntimeSetting, key)
        value = resolved_values[key]
        settings_payload[key] = {
            "key": key,
            "label": spec["label"],
            "description": spec["description"],
            "is_secret": spec["is_secret"],
            "requires_restart": spec["requires_restart"],
            "value": value,
            "display_value": mask_secret(value) if spec["is_secret"] else value,
            "source": "override" if record else "env",
            "is_configured": bool(value),
            "updated_at": record.updated_at.isoformat() if record and record.updated_at else None,
            "updated_by_user_id": record.updated_by_user_id if record else None,
        }

    base_url = resolved_values["BASE_URL"].rstrip("/")
    webhook_url = f"{base_url}/webhooks/fb" if base_url else ""

    return {
        "settings": settings_payload,
        "derived": {
            "base_url": base_url,
            "webhook_url": webhook_url,
            "verify_token": resolved_values["FB_VERIFY_TOKEN"],
            "runtime_env_file": str(RUNTIME_ENV_FILE),
        },
    }


def write_runtime_env_file(db: Session) -> None:
    resolved_values = {key: resolve_runtime_value(key, db=db) for key in RUNTIME_SETTING_SPECS}
    pages = db.query(FacebookPage).order_by(FacebookPage.page_id.asc()).all()
    lines = [
        "# Auto-generated from admin dashboard",
        "# Restart related services after changing values if needed",
    ]
    for key in RUNTIME_SETTING_SPECS:
        value = _encode_runtime_env_value(resolved_values[key])
        lines.append(f"{key}={value}")
    lines.extend(
        [
            "",
            "# Facebook pages synced from dashboard",
            "# Warning: page access tokens are written as plain text by request",
            f"FB_PAGE_COUNT={len(pages)}",
            f"FB_PAGE_IDS={','.join(page.page_id or '' for page in pages)}",
        ]
    )
    for index, page in enumerate(pages, start=1):
        lines.append(f"FB_PAGE_{index}_ID={_encode_runtime_env_value(page.page_id)}")
        lines.append(f"FB_PAGE_{index}_NAME={_encode_runtime_env_value(page.page_name)}")
        lines.append(
            "FB_PAGE_"
            f"{index}_ACCESS_TOKEN="
            f"{_encode_runtime_env_value(_resolve_page_access_token(page.long_lived_access_token))}"
        )
    RUNTIME_ENV_FILE.write_text("\n".join(lines) + "\n", encoding="utf-8")


def update_runtime_settings(db: Session, updates: dict[str, str | None], *, actor_user_id: str | None = None) -> list[str]:
    changed_keys: list[str] = []

    for key, raw_value in updates.items():
        if key not in RUNTIME_SETTING_SPECS or raw_value is None:
            continue

        normalized = _normalize_value(raw_value)
        record = db.get(RuntimeSetting, key)
        spec = RUNTIME_SETTING_SPECS[key]
        current_value = resolve_runtime_value(key, db=db)

        if normalized == "":
            if record is not None:
                db.delete(record)
                changed_keys.append(key)
            continue

        if normalized == current_value and record is not None:
            continue

        stored_value = encrypt_secret(normalized) if spec["is_secret"] else normalized
        if record is None:
            record = RuntimeSetting(
                key=key,
                is_secret=spec["is_secret"],
                updated_by_user_id=actor_user_id,
            )
            db.add(record)

        record.value = stored_value
        record.is_secret = spec["is_secret"]
        record.updated_by_user_id = actor_user_id
        changed_keys.append(key)

    db.commit()
    write_runtime_env_file(db)
    return changed_keys
