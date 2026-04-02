from app.core.time import utc_now
from app.models.models import Campaign, CampaignStatus, FacebookPage, Video, VideoStatus
from app.services.google_sheet_products import GoogleSheetSelection
from app.services.security import encrypt_secret
from app.worker.cron import auto_post_job


def test_auto_post_job_comments_products_from_google_sheet(db_session, monkeypatch, tmp_path):
    video_path = tmp_path / "video-ready.mp4"
    video_path.write_bytes(b"fake-video")

    page = FacebookPage(
        page_id="page-product-sheet",
        page_name="Page product sheet",
        long_lived_access_token=encrypt_secret("page-token"),
    )
    db_session.add(page)
    db_session.commit()

    campaign = Campaign(
        name="Campaign with sheet",
        source_url="https://www.tiktok.com/@demo/video/123",
        source_platform="tiktok",
        source_kind="tiktok_video",
        status=CampaignStatus.active,
        auto_post=True,
        target_page_id=page.page_id,
        product_sheet_url="https://docs.google.com/spreadsheets/d/sheet-123/edit#gid=0",
        schedule_interval=15,
    )
    db_session.add(campaign)
    db_session.commit()
    db_session.refresh(campaign)

    video = Video(
        campaign_id=campaign.id,
        original_id="video-sheet-1",
        source_platform="tiktok",
        source_kind="tiktok_video",
        source_video_url="https://www.tiktok.com/@demo/video/123",
        file_path=str(video_path),
        original_caption="Caption goc",
        ai_caption="Caption goc",
        status=VideoStatus.ready,
        publish_time=utc_now(),
    )
    db_session.add(video)
    db_session.commit()
    db_session.refresh(video)

    monkeypatch.setattr(
        "app.worker.cron.select_random_products_from_google_sheet",
        lambda sheet_url: GoogleSheetSelection(
            caption_text="Sản phẩm 1: https://example.com/a\nSản phẩm 2: https://example.com/b",
            items=[
                {"name": "Sản phẩm A", "link": "https://example.com/a", "row_number": "2"},
                {"name": "Sản phẩm B", "link": "https://example.com/b", "row_number": "3"},
            ],
            spreadsheet_id="sheet-123",
            sheet_title="San pham",
        ),
    )

    upload_calls = {}
    product_comment_calls = []

    def fake_upload(file_path, caption, page_id, access_token):
        upload_calls["file_path"] = file_path
        upload_calls["caption"] = caption
        upload_calls["page_id"] = page_id
        upload_calls["access_token"] = access_token
        return {"id": "fb-post-123"}

    def fake_create_post_comment(post_id, message, access_token):
        product_comment_calls.append(
            {"post_id": post_id, "message": message, "access_token": access_token}
        )
        return {"id": f"comment-{len(product_comment_calls)}"}

    monkeypatch.setattr("app.worker.cron.upload_video_to_facebook", fake_upload)
    monkeypatch.setattr("app.worker.cron.create_post_comment", fake_create_post_comment)
    monkeypatch.setattr("app.worker.cron.record_event", lambda *args, **kwargs: None)
    monkeypatch.setattr("app.services.telegram_bot.notify_telegram", lambda *args, **kwargs: None)

    auto_post_job()

    db_session.expire_all()
    saved_video = db_session.query(Video).filter(Video.id == video.id).first()
    assert saved_video is not None
    assert saved_video.status == VideoStatus.posted
    assert saved_video.fb_post_id == "fb-post-123"
    assert upload_calls["file_path"] == str(video_path)
    assert upload_calls["page_id"] == page.page_id
    assert upload_calls["access_token"] == "page-token"
    assert upload_calls["caption"] == "Caption goc"
    assert product_comment_calls == [
        {
            "post_id": "fb-post-123",
            "message": "Sản phẩm A\nMua tại đây ạ\n👉 https://example.com/a",
            "access_token": "page-token",
        },
        {
            "post_id": "fb-post-123",
            "message": "Sản phẩm B\nMua tại đây ạ\n👉 https://example.com/b",
            "access_token": "page-token",
        },
    ]
    assert not video_path.exists()


def test_auto_post_job_skips_manual_campaign_and_posts_auto_campaign(db_session, monkeypatch, tmp_path):
    manual_video_path = tmp_path / "video-manual.mp4"
    auto_video_path = tmp_path / "video-auto.mp4"
    manual_video_path.write_bytes(b"manual-video")
    auto_video_path.write_bytes(b"auto-video")

    page = FacebookPage(
        page_id="page-auto-filter",
        page_name="Page auto filter",
        long_lived_access_token=encrypt_secret("page-token"),
    )
    db_session.add(page)
    db_session.commit()

    manual_campaign = Campaign(
        name="Manual campaign",
        source_url="https://www.tiktok.com/@demo/video/manual",
        source_platform="tiktok",
        source_kind="tiktok_video",
        status=CampaignStatus.active,
        auto_post=False,
        target_page_id=page.page_id,
        schedule_interval=15,
    )
    auto_campaign = Campaign(
        name="Auto campaign",
        source_url="https://www.tiktok.com/@demo/video/auto",
        source_platform="tiktok",
        source_kind="tiktok_video",
        status=CampaignStatus.active,
        auto_post=True,
        target_page_id=page.page_id,
        schedule_interval=15,
    )
    db_session.add_all([manual_campaign, auto_campaign])
    db_session.commit()
    db_session.refresh(manual_campaign)
    db_session.refresh(auto_campaign)

    manual_video = Video(
        campaign_id=manual_campaign.id,
        original_id="manual-video",
        source_platform="tiktok",
        source_kind="tiktok_video",
        source_video_url="https://www.tiktok.com/@demo/video/manual",
        file_path=str(manual_video_path),
        original_caption="Manual caption",
        ai_caption="Manual caption",
        status=VideoStatus.ready,
        publish_time=utc_now(),
    )
    auto_video = Video(
        campaign_id=auto_campaign.id,
        original_id="auto-video",
        source_platform="tiktok",
        source_kind="tiktok_video",
        source_video_url="https://www.tiktok.com/@demo/video/auto",
        file_path=str(auto_video_path),
        original_caption="Auto caption",
        ai_caption="Auto caption",
        status=VideoStatus.ready,
        publish_time=utc_now(),
    )
    db_session.add_all([manual_video, auto_video])
    db_session.commit()
    db_session.refresh(manual_video)
    db_session.refresh(auto_video)

    upload_calls = {}

    def fake_upload(file_path, caption, page_id, access_token):
        upload_calls["file_path"] = file_path
        upload_calls["caption"] = caption
        upload_calls["page_id"] = page_id
        upload_calls["access_token"] = access_token
        return {"id": "fb-post-auto"}

    monkeypatch.setattr("app.worker.cron.upload_video_to_facebook", fake_upload)
    monkeypatch.setattr("app.worker.cron.create_post_comment", lambda *args, **kwargs: {"id": "comment-auto"})
    monkeypatch.setattr("app.worker.cron.record_event", lambda *args, **kwargs: None)
    monkeypatch.setattr("app.services.telegram_bot.notify_telegram", lambda *args, **kwargs: None)

    auto_post_job()

    db_session.expire_all()
    saved_manual_video = db_session.query(Video).filter(Video.id == manual_video.id).first()
    saved_auto_video = db_session.query(Video).filter(Video.id == auto_video.id).first()
    assert saved_manual_video is not None
    assert saved_auto_video is not None
    assert saved_manual_video.status == VideoStatus.ready
    assert saved_manual_video.fb_post_id is None
    assert saved_auto_video.status == VideoStatus.posted
    assert saved_auto_video.fb_post_id == "fb-post-auto"
    assert upload_calls["file_path"] == str(auto_video_path)
    assert upload_calls["caption"] == "Auto caption"
