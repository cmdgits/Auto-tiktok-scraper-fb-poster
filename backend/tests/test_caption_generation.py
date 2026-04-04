from app.services import ai_generator


def stub_trend_context(monkeypatch, *, queries=None, hashtags=None, sources=None):
    monkeypatch.setattr(
        ai_generator,
        "_get_external_trend_context",
        lambda original_caption: {
            "queries": list(queries or []),
            "hashtags": list(hashtags or []),
            "sources": list(sources or []),
        },
    )


def test_generate_caption_sanitizes_tiktok_hashtags(monkeypatch):
    stub_trend_context(monkeypatch)
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
    stub_trend_context(monkeypatch)
    monkeypatch.setattr(ai_generator, "_generate_with_ai", lambda prompt, fallback, **kwargs: fallback)

    caption = ai_generator.generate_caption("Meo phoi do mua he cho nang ne #tiktok #xuhuong #foryou")
    lowered = caption.lower()
    lines = [line for line in caption.splitlines() if line.strip()]

    assert len(lines) >= 3
    assert "#tiktok" not in lowered
    assert "#xuhuong" not in lowered
    assert "#foryou" not in lowered
    assert "#cachphoido" in lowered or "#meophoido" in lowered
    assert lines[0].endswith((".", "!", "?"))
    assert any(char in caption for char in "ăâêôơưđáàảãạéèẻẽẹíìỉĩịóòỏõọúùủũụýỳỷỹỵ")


def test_generate_caption_falls_back_when_ai_returns_vietnamese_without_diacritics(monkeypatch):
    stub_trend_context(monkeypatch)
    monkeypatch.setattr(
        ai_generator,
        "_generate_with_ai",
        lambda prompt, fallback, **kwargs: "Xem clip nay nha.\nXem het clip roi de lai cam nhan nha.\n#lamdep #review",
    )

    caption = ai_generator.generate_caption("Clip review lam dep cuc cuon #tiktok")

    assert "Xem clip nay nha." not in caption
    assert any(char in caption for char in "ăâêôơưđáàảãạéèẻẽẹíìỉĩịóòỏõọúùủũụýỳỷỹỵ")


def test_generate_caption_creates_plausible_copy_when_original_caption_is_empty(monkeypatch):
    stub_trend_context(monkeypatch)
    monkeypatch.setattr(ai_generator, "_generate_with_ai", lambda prompt, fallback, **kwargs: fallback)

    caption = ai_generator.generate_caption("")
    lines = [line for line in caption.splitlines() if line.strip()]

    assert len(lines) >= 4
    assert "Nội dung kiểu nội dung này mở đầu nhẹ thôi mà càng xem càng dễ bị giữ lại đấy." in caption
    assert any(line.startswith("#") for line in lines)


def test_generate_caption_prompt_requests_search_intent_hashtags(monkeypatch):
    stub_trend_context(monkeypatch)
    captured = {}

    def fake_generate(prompt, fallback, **kwargs):
        captured["prompt"] = prompt
        return fallback

    monkeypatch.setattr(ai_generator, "_generate_with_ai", fake_generate)

    ai_generator.generate_caption("Review serum dưỡng ẩm cho da khô")

    assert "match common search intent around the topic" in captured["prompt"]
    assert "real viewers would search for this topic" in captured["prompt"]


def test_generate_caption_prompt_includes_external_trend_hints(monkeypatch):
    captured = {}
    stub_trend_context(
        monkeypatch,
        queries=["review serum cap am", "serum cap am cho da kho"],
        hashtags=["reviewserumcapam", "serumcapamdakho"],
        sources=["serpapi_google_trends"],
    )

    def fake_generate(prompt, fallback, **kwargs):
        captured["prompt"] = prompt
        return fallback

    monkeypatch.setattr(ai_generator, "_generate_with_ai", fake_generate)

    ai_generator.generate_caption("Review serum duong am cho da kho")

    assert "External trend/search hints:" in captured["prompt"]
    assert "review serum cap am" in captured["prompt"]
    assert "serpapi_google_trends" in captured["prompt"]


def test_generate_caption_fallback_prefers_external_trend_hashtags(monkeypatch):
    stub_trend_context(
        monkeypatch,
        queries=["review serum cap am", "serum cap am da kho"],
        hashtags=["reviewserumcapam", "serumcapamdakho"],
        sources=["google_suggest"],
    )
    monkeypatch.setattr(ai_generator, "_generate_with_ai", lambda prompt, fallback, **kwargs: fallback)

    caption = ai_generator.generate_caption("Review serum duong am cho da kho #tiktok")
    lowered = caption.lower()

    assert "#reviewserumcapam" in lowered
    assert "#serumcapamdakho" in lowered


def test_generate_caption_prompt_requests_light_rewrite_when_source_caption_is_meaningful(monkeypatch):
    stub_trend_context(monkeypatch)
    captured = {}

    def fake_generate(prompt, fallback, **kwargs):
        captured["prompt"] = prompt
        return fallback

    monkeypatch.setattr(ai_generator, "_generate_with_ai", fake_generate)

    ai_generator.generate_caption("Review serum dưỡng ẩm cho da khô khá ổn và thấm nhanh")

    assert "Keep around 70-85% of the original meaning" in captured["prompt"]
    assert "Only sharpen the hook, rhythm, and viewer pull" in captured["prompt"]


def test_generate_caption_uses_video_context_when_original_caption_is_empty(monkeypatch):
    captured = {}
    stub_trend_context(monkeypatch)

    def fake_generate(prompt, fallback, **kwargs):
        captured["prompt"] = prompt
        return fallback

    monkeypatch.setattr(ai_generator, "_generate_with_ai", fake_generate)

    caption = ai_generator.generate_caption(
        "",
        video_context={
            "campaign_name": "Girl Xinh",
            "source_platform": "tiktok",
            "source_kind": "tiktok_video",
            "target_page_name": "Trạm Dừng Video",
        },
    )

    assert "There is no reliable original caption" in captured["prompt"]
    assert "Video context hints:" in captured["prompt"]
    assert "Girl Xinh" in captured["prompt"]
    assert "Trạm Dừng Video" in captured["prompt"]
    assert 'chủ đề "Girl Xinh"' in caption
