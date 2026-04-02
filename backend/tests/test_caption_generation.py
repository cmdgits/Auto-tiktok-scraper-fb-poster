from app.services import ai_generator


def test_generate_caption_sanitizes_tiktok_hashtags(monkeypatch):
    captured = {}

    def fake_generate(prompt, fallback, **kwargs):
        captured["prompt"] = prompt
        return "Đoạn cuối này cuốn thật.\nXem hết clip rồi để lại cảm nhận nha.\n#tiktok #fyp #lamdep #review"

    monkeypatch.setattr(ai_generator, "_generate_with_ai", fake_generate)

    caption = ai_generator.generate_caption("Clip review lam dep cuc cuon #tiktok #xuhuong")
    lowered = caption.lower()

    assert "The opening line must feel smooth, natural, and slightly curiosity-driven" in captured["prompt"]
    assert "stay close to it and creatively remix that same idea" in captured["prompt"]
    assert "Write in natural Vietnamese with full diacritics" in captured["prompt"]
    assert "#tiktok" not in lowered
    assert "#fyp" not in lowered
    assert "#lamdep" in lowered
    assert "#review" in lowered
    assert "Đoạn cuối này cuốn thật." in caption


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
    assert any(char in caption for char in "ăâêôơưđáàảãạéèẻẽẹíìỉĩịóòỏõọúùủũụýỳỷỹỵ")


def test_generate_caption_falls_back_when_ai_returns_vietnamese_without_diacritics(monkeypatch):
    monkeypatch.setattr(
        ai_generator,
        "_generate_with_ai",
        lambda prompt, fallback, **kwargs: "Xem clip nay nha.\nXem het clip roi de lai cam nhan nha.\n#lamdep #review",
    )

    caption = ai_generator.generate_caption("Clip review lam dep cuc cuon #tiktok")

    assert "Xem clip nay nha." not in caption
    assert any(char in caption for char in "ăâêôơưđáàảãạéèẻẽẹíìỉĩịóòỏõọúùủũụýỳỷỹỵ")


def test_generate_caption_creates_plausible_copy_when_original_caption_is_empty(monkeypatch):
    monkeypatch.setattr(ai_generator, "_generate_with_ai", lambda prompt, fallback, **kwargs: fallback)

    caption = ai_generator.generate_caption("")
    lines = [line for line in caption.splitlines() if line.strip()]

    assert len(lines) >= 4
    assert "Lướt tới đây mà bỏ qua thì hơi phí đó nha." in caption
    assert any(line.startswith("#") for line in lines)
