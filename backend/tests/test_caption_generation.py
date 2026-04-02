from app.services import ai_generator


def test_generate_caption_sanitizes_tiktok_hashtags(monkeypatch):
    captured = {}

    def fake_generate(prompt, fallback, **kwargs):
        captured["prompt"] = prompt
        return "Doan cuoi nay cuon that.\nXem het clip roi de lai cam nhan nha.\n#tiktok #fyp #lamdep #review"

    monkeypatch.setattr(ai_generator, "_generate_with_ai", fake_generate)

    caption = ai_generator.generate_caption("Clip review lam dep cuc cuon #tiktok #xuhuong")
    lowered = caption.lower()

    assert "Line 1 must be a short hook or title" in captured["prompt"]
    assert "#tiktok" not in lowered
    assert "#fyp" not in lowered
    assert "#lamdep" in lowered
    assert "#review" in lowered


def test_generate_caption_fallback_is_facebook_first(monkeypatch):
    monkeypatch.setattr(ai_generator, "_generate_with_ai", lambda prompt, fallback, **kwargs: fallback)

    caption = ai_generator.generate_caption("Meo phoi do mua he cho nang ne #tiktok #xuhuong #foryou")
    lowered = caption.lower()
    lines = [line for line in caption.splitlines() if line.strip()]

    assert len(lines) >= 3
    assert "#tiktok" not in lowered
    assert "#xuhuong" not in lowered
    assert "#foryou" not in lowered
    assert lines[0].endswith((".", "!", "?"))
