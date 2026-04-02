from __future__ import annotations

import csv
import io
import random
import re
import unicodedata
from dataclasses import dataclass
from datetime import timedelta
from urllib.parse import parse_qs, quote, urlparse

import jwt

from app.core.time import utc_now
from app.services.http_client import request_with_retries
from app.services.runtime_settings import resolve_runtime_value

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_SHEETS_BASE_URL = "https://sheets.googleapis.com/v4/spreadsheets"
GOOGLE_SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets"

STATUS_HEADER_CANDIDATES = {"status", "trangthai"}
LINK_HEADER_CANDIDATES = {"link", "url", "productlink", "duongdan", "duonglink"}
NAME_HEADER_CANDIDATES = {"ten", "tensanpham", "name", "sanpham", "product", "productname"}


@dataclass
class GoogleSheetSelection:
    caption_text: str
    items: list[dict[str, str]]
    spreadsheet_id: str
    sheet_title: str


def _normalize_header(value: str) -> str:
    normalized = unicodedata.normalize("NFD", (value or "").strip().lower())
    normalized = "".join(char for char in normalized if unicodedata.category(char) != "Mn")
    normalized = normalized.replace("đ", "d").replace("Ä‘", "d")
    normalized = re.sub(r"[^a-z0-9]+", "", normalized)
    return normalized


def _column_index_to_a1(column_index: int) -> str:
    value = column_index + 1
    letters = []
    while value > 0:
        value, remainder = divmod(value - 1, 26)
        letters.append(chr(65 + remainder))
    return "".join(reversed(letters))


def _quote_sheet_title(sheet_title: str) -> str:
    safe_title = (sheet_title or "").replace("'", "''")
    return f"'{safe_title}'"


def _build_status_marker() -> str:
    return f"Posted {utc_now().isoformat(timespec='seconds')}"


def _has_service_account_credentials() -> bool:
    return bool(
        resolve_runtime_value("GOOGLE_SERVICE_ACCOUNT_EMAIL").strip()
        and resolve_runtime_value("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY").strip()
    )


def _build_service_account_access_token() -> str:
    client_email = resolve_runtime_value("GOOGLE_SERVICE_ACCOUNT_EMAIL").strip()
    private_key = resolve_runtime_value("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY")
    if not client_email or not private_key:
        raise ValueError("Thiếu GOOGLE_SERVICE_ACCOUNT_EMAIL hoặc GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.")

    normalized_key = private_key.strip().replace("\\n", "\n")
    now = utc_now()
    claims = {
        "iss": client_email,
        "scope": GOOGLE_SHEETS_SCOPE,
        "aud": GOOGLE_TOKEN_URL,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=55)).timestamp()),
    }
    assertion = jwt.encode(claims, normalized_key, algorithm="RS256")
    response = request_with_retries(
        "POST",
        GOOGLE_TOKEN_URL,
        data={
            "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
            "assertion": assertion,
        },
        scope="google_sheets",
        operation="oauth_token",
        timeout=20,
        max_attempts=2,
        retryable_status_codes={429, 500, 502, 503, 504},
    )
    data = response.json()
    if response.status_code != 200 or not data.get("access_token"):
        raise ValueError(data.get("error_description") or data.get("error") or "Không lấy được access token Google.")
    return str(data["access_token"])


def _google_sheets_request(method: str, url: str, *, token: str, **kwargs):
    headers = kwargs.pop("headers", {})
    headers["Authorization"] = f"Bearer {token}"
    response = request_with_retries(
        method,
        url,
        headers=headers,
        scope="google_sheets",
        operation=f"{method.upper()} {url}",
        timeout=20,
        max_attempts=2,
        retryable_status_codes={429, 500, 502, 503, 504},
        **kwargs,
    )
    try:
        data = response.json()
    except ValueError:
        data = {}
    if response.status_code >= 400:
        error_message = data.get("error", {}).get("message") if isinstance(data, dict) else None
        raise ValueError(error_message or f"Google Sheets API trả về HTTP {response.status_code}.")
    return data


def _public_sheet_request(url: str):
    response = request_with_retries(
        "GET",
        url,
        scope="google_sheets_public",
        operation=f"GET {url}",
        timeout=20,
        max_attempts=2,
        retryable_status_codes={429, 500, 502, 503, 504},
    )
    if response.status_code >= 400:
        raise ValueError(
            "Khong doc duoc Google Sheet cong khai. Hay mo quyen xem cong khai hoac dung service account."
        )
    return response


def _parse_sheet_reference(sheet_url: str) -> tuple[str, str | None]:
    parsed = urlparse((sheet_url or "").strip())
    match = re.search(r"/spreadsheets/d/([a-zA-Z0-9-_]+)", parsed.path or "")
    if not match:
        raise ValueError("Link Google Sheet không hợp lệ.")
    spreadsheet_id = match.group(1)
    fragment_values = parse_qs(parsed.fragment or "")
    query_values = parse_qs(parsed.query or "")
    gid = fragment_values.get("gid", [None])[0] or query_values.get("gid", [None])[0]
    return spreadsheet_id, gid


def _build_public_sheet_csv_url(*, spreadsheet_id: str, gid: str | None) -> str:
    base_url = f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}/export?format=csv"
    if gid:
        return f"{base_url}&gid={gid}"
    return base_url


def _resolve_sheet_title(*, spreadsheet_id: str, gid: str | None, token: str) -> str:
    metadata = _google_sheets_request(
        "GET",
        f"{GOOGLE_SHEETS_BASE_URL}/{spreadsheet_id}",
        token=token,
        params={"fields": "sheets(properties(sheetId,title,index))"},
    )
    sheets = metadata.get("sheets") or []
    if not sheets:
        raise ValueError("Google Sheet không có worksheet nào.")

    if gid is not None:
        try:
            target_gid = int(gid)
        except ValueError:
            target_gid = None
        if target_gid is not None:
            for sheet in sheets:
                properties = sheet.get("properties") or {}
                if properties.get("sheetId") == target_gid:
                    return str(properties.get("title") or "").strip()

    first_properties = sheets[0].get("properties") or {}
    return str(first_properties.get("title") or "").strip()


def _find_header_index(headers: list[str], candidates: set[str]) -> int | None:
    normalized_headers = [_normalize_header(header) for header in headers]
    for index, header in enumerate(normalized_headers):
        if header in candidates:
            return index
    return None


def _parse_csv_values(csv_text: str) -> list[list[str]]:
    reader = csv.reader(io.StringIO(csv_text))
    return [row for row in reader]


def _decode_public_sheet_csv(response) -> str:
    raw_content = getattr(response, "content", None)
    if isinstance(raw_content, (bytes, bytearray)) and raw_content:
        try:
            return bytes(raw_content).decode("utf-8-sig")
        except UnicodeDecodeError:
            pass
    return getattr(response, "text", "")


def _deduplicate_available_rows(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    unique_rows_by_link: dict[str, dict[str, str]] = {}
    for item in rows:
        link_key = item["link"].strip()
        if link_key and link_key not in unique_rows_by_link:
            unique_rows_by_link[link_key] = item
    return list(unique_rows_by_link.values())


def _pick_rows(values: list[list[str]], *, require_status: bool) -> tuple[list[dict[str, str]], int | None]:
    if not values:
        raise ValueError("Google Sheet chưa có dữ liệu.")
    headers = values[0]
    link_index = _find_header_index(headers, LINK_HEADER_CANDIDATES)
    status_index = _find_header_index(headers, STATUS_HEADER_CANDIDATES)
    name_index = _find_header_index(headers, NAME_HEADER_CANDIDATES)
    if link_index is None:
        raise ValueError("Google Sheet cần có cột Link.")
    if require_status and status_index is None:
        raise ValueError("Google Sheet cần có cột Link và Status.")

    available_rows: list[dict[str, str]] = []
    for row_offset, row in enumerate(values[1:], start=2):
        link_value = row[link_index].strip() if len(row) > link_index and row[link_index] else ""
        status_value = row[status_index].strip() if status_index is not None and len(row) > status_index and row[status_index] else ""
        if not link_value or status_value:
            continue
        name_value = row[name_index].strip() if name_index is not None and len(row) > name_index and row[name_index] else ""
        available_rows.append(
            {
                "row_number": str(row_offset),
                "name": name_value or f"Sản phẩm {row_offset - 1}",
                "link": link_value,
            }
        )

    unique_available_rows = _deduplicate_available_rows(available_rows)
    if len(unique_available_rows) < 2:
        raise ValueError("Google Sheet không còn đủ ít nhất 2 sản phẩm có Status trống và link khác nhau.")

    selection_count = random.randint(2, min(3, len(unique_available_rows)))
    selected_rows = random.sample(unique_available_rows, selection_count)
    return selected_rows, status_index


def _update_status_cells(
    *,
    spreadsheet_id: str,
    sheet_title: str,
    status_column_index: int,
    selected_rows: list[dict[str, str]],
    token: str,
) -> None:
    status_column_a1 = _column_index_to_a1(status_column_index)
    status_value = _build_status_marker()
    data = [
        {
            "range": f"{_quote_sheet_title(sheet_title)}!{status_column_a1}{item['row_number']}",
            "values": [[status_value]],
        }
        for item in selected_rows
    ]
    _google_sheets_request(
        "POST",
        f"{GOOGLE_SHEETS_BASE_URL}/{spreadsheet_id}/values:batchUpdate",
        token=token,
        json={
            "valueInputOption": "RAW",
            "data": data,
        },
    )


def build_product_caption_text(items: list[dict[str, str]]) -> str:
    lines = [f"Sản phẩm {index}: {item['link']}" for index, item in enumerate(items, start=1)]
    return "\n".join(lines)


def build_product_comment_messages(items: list[dict[str, str]]) -> list[str]:
    messages: list[str] = []
    for item in items:
        name = (item.get("name") or "").strip() or "Sản phẩm"
        link = (item.get("link") or "").strip()
        if not link:
            continue
        messages.append(f"{name}\nMua tại đây ạ\n👉 {link}")
    return messages


def append_product_text_to_caption(base_caption: str | None, product_text: str) -> str:
    base = (base_caption or "").strip()
    suffix = (product_text or "").strip()
    if not base:
        return suffix
    if not suffix:
        return base
    return f"{base}\n\n{suffix}"


def select_random_products_from_google_sheet(sheet_url: str) -> GoogleSheetSelection:
    spreadsheet_id, gid = _parse_sheet_reference(sheet_url)
    token = _build_service_account_access_token() if _has_service_account_credentials() else None

    if token:
        sheet_title = _resolve_sheet_title(spreadsheet_id=spreadsheet_id, gid=gid, token=token)
        range_name = f"{_quote_sheet_title(sheet_title)}!A:Z"
        values_payload = _google_sheets_request(
            "GET",
            f"{GOOGLE_SHEETS_BASE_URL}/{spreadsheet_id}/values/{quote(range_name, safe='')}",
            token=token,
        )
        values = values_payload.get("values") or []
        selected_rows, status_index = _pick_rows(values, require_status=True)
        if status_index is not None:
            _update_status_cells(
                spreadsheet_id=spreadsheet_id,
                sheet_title=sheet_title,
                status_column_index=status_index,
                selected_rows=selected_rows,
                token=token,
            )
    else:
        public_csv_url = _build_public_sheet_csv_url(spreadsheet_id=spreadsheet_id, gid=gid)
        public_response = _public_sheet_request(public_csv_url)
        csv_text = _decode_public_sheet_csv(public_response)
        values = _parse_csv_values(csv_text)
        selected_rows, _status_index = _pick_rows(values, require_status=False)
        sheet_title = f"gid:{gid}" if gid else "Sheet1"

    return GoogleSheetSelection(
        caption_text=build_product_caption_text(selected_rows),
        items=selected_rows,
        spreadsheet_id=spreadsheet_id,
        sheet_title=sheet_title,
    )
