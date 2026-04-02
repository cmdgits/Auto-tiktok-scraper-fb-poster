from urllib.parse import quote

import pytest

from app.services.google_sheet_products import (
    append_product_text_to_caption,
    build_product_comment_messages,
    select_random_products_from_google_sheet,
)


class FakeResponse:
    def __init__(self, status_code, payload, text=""):
        self.status_code = status_code
        self._payload = payload
        self.text = text
        self.content = text.encode("utf-8")

    def json(self):
        return self._payload


def test_select_random_products_from_google_sheet_uses_gid_and_skips_duplicate_links(monkeypatch):
    captured_update = {}

    monkeypatch.setattr("app.services.google_sheet_products._has_service_account_credentials", lambda: True)
    monkeypatch.setattr("app.services.google_sheet_products._build_service_account_access_token", lambda: "google-token")
    monkeypatch.setattr("app.services.google_sheet_products.random.randint", lambda start, end: 3)
    monkeypatch.setattr("app.services.google_sheet_products.random.sample", lambda items, count: items[:count])

    def fake_request(method, url, **kwargs):
        if method == "GET" and url.endswith("/sheet-123"):
            return FakeResponse(
                200,
                {
                    "sheets": [
                        {"properties": {"sheetId": 0, "title": "Default"}},
                        {"properties": {"sheetId": 777, "title": "Kho san pham"}},
                    ]
                },
            )
        if method == "GET" and "/values/" in url:
            assert quote("'Kho san pham'!A:Z", safe="") in url
            return FakeResponse(
                200,
                {
                    "values": [
                        ["Tên", "Link", "Status"],
                        ["Áo 1", "https://example.com/a", ""],
                        ["Áo 1 trùng", "https://example.com/a", ""],
                        ["Áo 2", "https://example.com/b", ""],
                        ["Áo 3", "https://example.com/c", ""],
                        ["Áo đã dùng", "https://example.com/d", "Used"],
                    ]
                },
            )
        if method == "POST" and url.endswith("/sheet-123/values:batchUpdate"):
            captured_update["payload"] = kwargs["json"]
            return FakeResponse(200, {"totalUpdatedCells": 3})
        raise AssertionError(f"Unexpected request: {method} {url}")

    monkeypatch.setattr("app.services.google_sheet_products.request_with_retries", fake_request)

    selection = select_random_products_from_google_sheet(
        "https://docs.google.com/spreadsheets/d/sheet-123/edit#gid=777"
    )

    assert selection.sheet_title == "Kho san pham"
    assert [item["link"] for item in selection.items] == [
        "https://example.com/a",
        "https://example.com/b",
        "https://example.com/c",
    ]
    assert selection.caption_text == (
        "Sản phẩm 1: https://example.com/a\n"
        "Sản phẩm 2: https://example.com/b\n"
        "Sản phẩm 3: https://example.com/c"
    )
    assert captured_update["payload"]["valueInputOption"] == "RAW"
    assert [item["range"] for item in captured_update["payload"]["data"]] == [
        "'Kho san pham'!C2",
        "'Kho san pham'!C4",
        "'Kho san pham'!C5",
    ]


def test_select_random_products_from_google_sheet_requires_two_unique_links(monkeypatch):
    monkeypatch.setattr("app.services.google_sheet_products._has_service_account_credentials", lambda: True)
    monkeypatch.setattr("app.services.google_sheet_products._build_service_account_access_token", lambda: "google-token")

    def fake_request(method, url, **kwargs):
        if method == "GET" and url.endswith("/sheet-need-two"):
            return FakeResponse(
                200,
                {"sheets": [{"properties": {"sheetId": 0, "title": "San pham"}}]},
            )
        if method == "GET" and "/values/" in url:
            return FakeResponse(
                200,
                {
                    "values": [
                        ["Tên", "Link", "Status"],
                        ["Áo 1", "https://example.com/a", ""],
                        ["Áo 1 trùng", "https://example.com/a", ""],
                        ["Áo đã dùng", "https://example.com/b", "Used"],
                    ]
                },
            )
        raise AssertionError(f"Unexpected request: {method} {url}")

    monkeypatch.setattr("app.services.google_sheet_products.request_with_retries", fake_request)

    with pytest.raises(ValueError, match="ít nhất 2 sản phẩm"):
        select_random_products_from_google_sheet(
            "https://docs.google.com/spreadsheets/d/sheet-need-two/edit#gid=0"
        )


def test_append_product_text_to_caption_preserves_existing_caption():
    assert append_product_text_to_caption(
        "Caption goc",
        "Sản phẩm 1: https://example.com/a",
    ) == "Caption goc\n\nSản phẩm 1: https://example.com/a"


def test_select_random_products_from_public_google_sheet_without_credentials(monkeypatch):
    monkeypatch.setattr("app.services.google_sheet_products._has_service_account_credentials", lambda: False)
    monkeypatch.setattr("app.services.google_sheet_products.random.randint", lambda start, end: 2)
    monkeypatch.setattr("app.services.google_sheet_products.random.sample", lambda items, count: items[:count])

    def fake_request(method, url, **kwargs):
        if method == "GET" and "export?format=csv" in url:
            assert "gid=555" in url
            return FakeResponse(
                200,
                {},
                text=(
                    "Tên sản phẩm,Link\n"
                    "Áo A,https://example.com/a\n"
                    "Áo B,https://example.com/b\n"
                    "Áo C,https://example.com/c\n"
                ),
            )
        raise AssertionError(f"Unexpected request: {method} {url}")

    monkeypatch.setattr("app.services.google_sheet_products.request_with_retries", fake_request)

    selection = select_random_products_from_google_sheet(
        "https://docs.google.com/spreadsheets/d/public-sheet/edit#gid=555"
    )

    assert selection.spreadsheet_id == "public-sheet"
    assert selection.sheet_title == "gid:555"
    assert [item["name"] for item in selection.items] == [
        "Áo A",
        "Áo B",
    ]
    assert [item["link"] for item in selection.items] == [
        "https://example.com/a",
        "https://example.com/b",
    ]


def test_build_product_comment_messages_uses_name_and_link():
    assert build_product_comment_messages(
        [{"name": "Áo chống nắng", "link": "https://example.com/a"}]
    ) == ["Áo chống nắng\nMua tại đây ạ\n👉 https://example.com/a"]


def test_decode_public_sheet_csv_prefers_utf8_content():
    response = FakeResponse(200, {}, text="TÃªn s\u1ea3n ph\u1ea9m,Link")
    response.content = "Tên sản phẩm,Link".encode("utf-8")

    from app.services.google_sheet_products import _decode_public_sheet_csv

    assert _decode_public_sheet_csv(response) == "Tên sản phẩm,Link"
