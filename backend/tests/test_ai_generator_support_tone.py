from app.services import ai_generator


def test_inbox_fallback_avoids_robotic_paraphrase(monkeypatch):
    monkeypatch.setattr(
        ai_generator,
        "_generate_with_ai",
        lambda prompt, fallback, **kwargs: "INVALID JSON",
    )

    payload = ai_generator.generate_message_reply_with_context(
        "Có ai hỗ trợ mình không?",
        conversation_summary="Khách cần hỗ trợ chung.",
        recent_turns=[],
        customer_facts={"trang_thai": "moi"},
    )

    assert "Mình đã hiểu bạn đang hỏi về" not in payload["reply"]
    assert payload["reply"].endswith("?")
    assert payload["intent"] == "general_support"


def test_inbox_fallback_handles_product_suggestion_request(monkeypatch):
    monkeypatch.setattr(
        ai_generator,
        "_generate_with_ai",
        lambda prompt, fallback, **kwargs: "INVALID JSON",
    )

    payload = ai_generator.generate_message_reply_with_context(
        "gợi ý một số sản phẩm",
        conversation_summary="Khách muốn được gợi ý sản phẩm.",
        recent_turns=[],
        customer_facts={},
    )

    lowered = payload["reply"].lower()
    assert "mình đã hiểu bạn đang hỏi về" not in lowered
    assert "video" not in lowered
    assert "tầm giá" in lowered
    assert payload["reply"].endswith("?")
