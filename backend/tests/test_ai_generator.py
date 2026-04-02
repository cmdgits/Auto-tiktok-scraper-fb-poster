from app.services import ai_generator


def test_generate_message_reply_with_context_requests_json_mode(monkeypatch):
    captured = {}

    def fake_generate(prompt, fallback, **kwargs):
        captured["prompt"] = prompt
        captured["kwargs"] = kwargs
        return '{"reply":"OK","summary":"Tom tat","intent":"general_support","customer_facts":{},"handoff":false,"handoff_reason":null}'

    monkeypatch.setattr(ai_generator, "_generate_with_ai", fake_generate)

    payload = ai_generator.generate_message_reply_with_context(
        "Ban oi tu van giup minh",
        conversation_summary="Khach vua mo dau hoi.",
    )

    assert payload["reply"].startswith("OK.")
    assert payload["reply"].endswith("?")
    assert captured["kwargs"]["generation_config"]["responseMimeType"] == "application/json"
    assert captured["kwargs"]["generation_config"]["temperature"] == 0.15
    assert "Exact customer topic" in captured["prompt"]
    assert "real customer support staff member" in captured["prompt"]
    assert "technical staff can call back" in captured["prompt"]
    assert "always write proper Vietnamese with full diacritics" in captured["prompt"]


def test_generate_message_reply_with_context_includes_topic_anchor_and_knowledge(monkeypatch):
    captured = {}

    def fake_generate(prompt, fallback, **kwargs):
        captured["prompt"] = prompt
        return '{"reply":"OK","summary":"Tom tat","intent":"general_support","customer_facts":{},"handoff":false,"handoff_reason":null}'

    monkeypatch.setattr(ai_generator, "_generate_with_ai", fake_generate)

    ai_generator.generate_message_reply_with_context(
        "Gui link video co gai quay lai giup minh",
        knowledge_context="Video 1: Co gai quay lai - https://example.com/video-1",
        conversation_summary="Khach dang hoi xin link video.",
    )

    assert "Exact customer topic" in captured["prompt"]
    assert "Gui link video co gai quay lai giup minh" in captured["prompt"]
    assert "Page knowledge block" in captured["prompt"]
    assert "https://example.com/video-1" in captured["prompt"]
    assert "Support identity" in captured["prompt"]


def test_generate_message_reply_with_context_parses_structured_json(monkeypatch):
    monkeypatch.setattr(
        ai_generator,
        "_generate_with_ai",
        lambda prompt, fallback, **kwargs: (
            '```json\n'
            '{"reply":"Chào bạn, gói cơ bản hiện gồm 3 bài mỗi tuần.",'
            '"summary":"Khách đang hỏi thành phần gói cơ bản.",'
            '"intent":"hoi_thanh_phan_goi",'
            '"customer_facts":{"san_pham":"goi co ban"},'
            '"handoff":false,'
            '"handoff_reason":null}\n'
            '```'
        ),
    )

    payload = ai_generator.generate_message_reply_with_context(
        "Gói cơ bản gồm những gì?",
        conversation_summary="Khách đã hỏi giá gói cơ bản.",
        recent_turns=[{"role": "customer", "content": "Cho mình xin giá gói cơ bản"}],
        customer_facts={"san_pham": "goi co ban"},
    )

    assert payload["reply"].startswith("Chào bạn")
    assert payload["summary"] == "Khách đang hỏi thành phần gói cơ bản."
    assert payload["intent"] == "hoi_thanh_phan_goi"
    assert payload["reply"].endswith("?")
    assert payload["customer_facts"] == {"san_pham": "goi co ban"}
    assert payload["handoff"] is False


def test_generate_message_reply_with_context_falls_back_when_json_invalid(monkeypatch):
    monkeypatch.setattr(
        ai_generator,
        "_generate_with_ai",
        lambda prompt, fallback, **kwargs: "Đây không phải JSON hợp lệ",
    )

    payload = ai_generator.generate_message_reply_with_context(
        "Có ai hỗ trợ mình không?",
        conversation_summary="Khách cần hỗ trợ chung.",
        recent_turns=[],
        customer_facts={"trang_thai": "moi"},
    )

    assert payload["reply"].startswith('Mình đã hiểu bạn đang hỏi về "Có ai hỗ trợ mình không?"')
    assert payload["summary"] == "Khách cần hỗ trợ chung."
    assert payload["intent"] == "general_support"
    assert payload["reply"].endswith("?")
    assert payload["customer_facts"] == {"trang_thai": "moi"}
    assert payload["handoff"] is False


def test_generate_message_reply_with_context_forces_handoff_on_complaint(monkeypatch):
    called = {"ai": False}

    def fake_generate(prompt, fallback, **kwargs):
        called["ai"] = True
        return fallback

    monkeypatch.setattr(ai_generator, "_generate_with_ai", fake_generate)

    payload = ai_generator.generate_message_reply_with_context(
        "Mình đang rất bực vì sản phẩm bị lỗi, cho mình gặp quản lý",
        conversation_summary="Khách đang than phiền.",
    )

    assert payload["handoff"] is True
    assert "số điện thoại" in payload["reply"].lower()
    assert called["ai"] is False
def test_generate_reply_keeps_positive_comment_short_and_soft(monkeypatch):
    monkeypatch.setattr(ai_generator, "_generate_with_ai", lambda prompt, fallback, **kwargs: fallback)

    reply = ai_generator.generate_reply(
        "quá là tuyệt vời ông mặt trời",
        channel="comment",
    )

    lowered = reply.lower()
    assert "theo dõi page" in lowered
    assert "mình đã hiểu bạn đang hỏi về" not in lowered
    assert len(reply) <= 170
def test_generate_reply_positive_comment_cta_is_soft(monkeypatch):
    monkeypatch.setattr(ai_generator, "_generate_with_ai", lambda prompt, fallback, **kwargs: fallback)

    reply = ai_generator.generate_reply(
        "đẹp quá page ơi",
        channel="comment",
    ).lower()

    assert "theo dõi page" in reply
    assert "giúp bên em" not in reply
