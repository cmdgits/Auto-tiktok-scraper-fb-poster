import pytest
from datetime import datetime, timedelta

from app.core.time import utc_now
from app.models.models import Campaign, CampaignStatus, FacebookPage, TaskQueue, Video, VideoStatus
from app.services.campaign_jobs import sync_campaign_content
from app.services.source_resolver import SourceResolutionError, resolve_content_source
from app.services.ytdlp_crawler import extract_source_entries


@pytest.mark.parametrize(
    ("url", "platform", "source_kind", "is_collection", "normalized_url"),
    [
        (
            "https://www.tiktok.com/@demo/video/1234567890?is_copy_url=1",
            "tiktok",
            "tiktok_video",
            False,
            "https://www.tiktok.com/@demo/video/1234567890",
        ),
        (
            "https://www.tiktok.com/@demo/",
            "tiktok",
            "tiktok_profile",
            True,
            "https://www.tiktok.com/@demo",
        ),
        (
            "https://vt.tiktok.com/ZSh123abc/",
            "tiktok",
            "tiktok_shortlink",
            False,
            "https://vt.tiktok.com/ZSh123abc",
        ),
        (
            "https://www.youtube.com/shorts/abc123?feature=share",
            "youtube",
            "youtube_short",
            False,
            "https://www.youtube.com/shorts/abc123",
        ),
        (
            "https://www.youtube.com/watch?v=abc123&si=test",
            "youtube",
            "youtube_video",
            False,
            "https://www.youtube.com/watch?v=abc123",
        ),
        (
            "https://youtu.be/abc123?si=test",
            "youtube",
            "youtube_video",
            False,
            "https://www.youtube.com/watch?v=abc123",
        ),
        (
            "https://www.youtube.com/playlist?list=PL123456&si=test",
            "youtube",
            "youtube_playlist",
            True,
            "https://www.youtube.com/playlist?list=PL123456",
        ),
        (
            "https://www.youtube.com/@creator/videos",
            "youtube",
            "youtube_channel",
            True,
            "https://www.youtube.com/@creator/videos",
        ),
        (
            "https://www.youtube.com/@creator/shorts",
            "youtube",
            "youtube_shorts_feed",
            True,
            "https://www.youtube.com/@creator/shorts",
        ),
    ],
)
def test_resolve_content_source_supported_urls(url, platform, source_kind, is_collection, normalized_url):
    resolved = resolve_content_source(url)
    assert resolved.platform.value == platform
    assert resolved.source_kind.value == source_kind
    assert resolved.is_collection is is_collection
    assert resolved.normalized_url == normalized_url


@pytest.mark.parametrize(
    "url",
    [
        "https://example.com/video/123",
    ],
)
def test_resolve_content_source_rejects_unsupported_urls(url):
    with pytest.raises(SourceResolutionError):
        resolve_content_source(url)


def test_create_campaign_detects_youtube_shorts_metadata(client, auth_headers, db_session):
    response = client.post(
        "/campaigns/",
        headers=auth_headers,
        json={
            "name": "YouTube Shorts test",
            "source_url": "https://www.youtube.com/shorts/abc123?feature=share",
            "auto_post": False,
            "schedule_interval": 30,
        },
    )

    assert response.status_code == 200
    campaign = db_session.query(Campaign).one()
    assert campaign.source_url == "https://www.youtube.com/shorts/abc123"
    assert campaign.source_platform == "youtube"
    assert campaign.source_kind == "youtube_short"

    task = db_session.query(TaskQueue).one()
    assert task.payload["source_platform"] == "youtube"
    assert task.payload["source_kind"] == "youtube_short"


def test_create_campaign_persists_schedule_start_at_in_utc(client, auth_headers, db_session):
    response = client.post(
        "/campaigns/",
        headers=auth_headers,
        json={
            "name": "Campaign has start time",
            "source_url": "https://www.tiktok.com/@demo/video/1234567890",
            "auto_post": False,
            "schedule_interval": 45,
            "schedule_start_at": "2026-04-01T09:30:00+07:00",
        },
    )

    assert response.status_code == 200
    campaign = db_session.query(Campaign).one()
    assert campaign.schedule_start_at == datetime(2026, 4, 1, 2, 30, 0)


def test_create_campaign_persists_product_sheet_url(client, auth_headers, db_session):
    response = client.post(
        "/campaigns/",
        headers=auth_headers,
        json={
            "name": "Campaign has product sheet",
            "source_url": "https://www.tiktok.com/@demo/video/1234567890",
            "auto_post": True,
            "schedule_interval": 30,
            "product_sheet_url": "https://docs.google.com/spreadsheets/d/demo-sheet-id/edit#gid=0",
        },
    )

    assert response.status_code == 200
    campaign = db_session.query(Campaign).one()
    assert campaign.product_sheet_url == "https://docs.google.com/spreadsheets/d/demo-sheet-id/edit#gid=0"


def test_sync_campaign_backfills_missing_source_metadata(client, auth_headers, db_session):
    campaign = Campaign(
        name="Legacy TikTok",
        source_url="https://www.tiktok.com/@legacy/video/987654321",
        source_platform=None,
        source_kind=None,
        status=CampaignStatus.active,
        last_sync_status="idle",
    )
    db_session.add(campaign)
    db_session.commit()
    db_session.refresh(campaign)

    response = client.post(f"/campaigns/{campaign.id}/sync", headers=auth_headers)

    assert response.status_code == 200
    db_session.refresh(campaign)
    assert campaign.source_platform == "tiktok"
    assert campaign.source_kind == "tiktok_video"

    queued_task = (
        db_session.query(TaskQueue)
        .filter(TaskQueue.entity_id == str(campaign.id))
        .order_by(TaskQueue.created_at.desc())
        .first()
    )
    assert queued_task is not None
    assert queued_task.payload["source_platform"] == "tiktok"
    assert queued_task.payload["source_kind"] == "tiktok_video"


def test_extract_source_entries_supports_mixed_youtube_entries(monkeypatch):
    def fake_extract_metadata(_url):
        return {
            "entries": [
                {
                    "id": "short-1",
                    "webpage_url": "https://www.youtube.com/shorts/short-1",
                    "title": "Short 1",
                    "description": "Mo ta short 1",
                },
                {
                    "id": "watch-2",
                    "webpage_url": "https://www.youtube.com/watch?v=watch-2",
                    "title": "Video dai",
                    "description": "Mo ta video dai",
                },
                {
                    "id": "watch-3",
                    "title": "Video 3",
                    "description": "",
                },
            ]
        }

    monkeypatch.setattr("app.services.ytdlp_crawler.extract_metadata", fake_extract_metadata)

    entries = extract_source_entries(
        "https://www.youtube.com/@creator/videos",
        source_platform="youtube",
        source_kind="youtube_channel",
    )

    assert [entry.original_id for entry in entries] == ["short-1", "watch-2", "watch-3"]
    assert all(entry.source_platform == "youtube" for entry in entries)
    assert entries[0].source_kind == "youtube_short"
    assert entries[1].source_kind == "youtube_video"
    assert entries[2].source_kind == "youtube_video"
    assert entries[1].source_video_url == "https://www.youtube.com/watch?v=watch-2"
    assert entries[2].source_video_url == "https://www.youtube.com/watch?v=watch-3"


def test_extract_source_entries_keeps_single_short_when_webpage_url_is_watch(monkeypatch):
    def fake_extract_metadata(_url):
        return {
            "id": "abc123",
            "webpage_url": "https://www.youtube.com/watch?v=abc123",
            "original_url": "https://www.youtube.com/shorts/abc123",
            "title": "Short single",
            "description": "Mo ta short single",
        }

    monkeypatch.setattr("app.services.ytdlp_crawler.extract_metadata", fake_extract_metadata)

    entries = extract_source_entries(
        "https://www.youtube.com/shorts/abc123",
        source_platform="youtube",
        source_kind="youtube_short",
    )

    assert len(entries) == 1
    assert entries[0].original_id == "abc123"
    assert entries[0].source_video_url == "https://www.youtube.com/shorts/abc123"
    assert entries[0].source_kind == "youtube_short"


def test_extract_source_entries_normalizes_youtu_be_single_video(monkeypatch):
    def fake_extract_metadata(_url):
        return {
            "id": "abc123",
            "webpage_url": "https://youtu.be/abc123?si=test",
            "title": "YouTube single",
            "description": "Mo ta video",
        }

    monkeypatch.setattr("app.services.ytdlp_crawler.extract_metadata", fake_extract_metadata)

    entries = extract_source_entries(
        "https://youtu.be/abc123?si=test",
        source_platform="youtube",
        source_kind="youtube_video",
    )

    assert len(entries) == 1
    assert entries[0].source_video_url == "https://www.youtube.com/watch?v=abc123"
    assert entries[0].source_kind == "youtube_video"


def test_extract_source_entries_combines_title_and_description_for_unique_caption_context(monkeypatch):
    def fake_extract_metadata(_url):
        return {
            "entries": [
                {
                    "id": "part-2",
                    "webpage_url": "https://www.youtube.com/shorts/part-2",
                    "title": "Gia Thien Movie Part 2/3",
                    "description": "Gia Thien Movie Full Tap",
                },
                {
                    "id": "part-3",
                    "webpage_url": "https://www.youtube.com/shorts/part-3",
                    "title": "Gia Thien Movie Part 3/3",
                    "description": "Gia Thien Movie Full Tap",
                },
            ]
        }

    monkeypatch.setattr("app.services.ytdlp_crawler.extract_metadata", fake_extract_metadata)

    entries = extract_source_entries(
        "https://www.youtube.com/@creator/shorts",
        source_platform="youtube",
        source_kind="youtube_shorts_feed",
    )

    assert entries[0].original_caption == "Gia Thien Movie Part 2/3\nGia Thien Movie Full Tap"
    assert entries[1].original_caption == "Gia Thien Movie Part 3/3\nGia Thien Movie Full Tap"
    assert entries[0].original_caption != entries[1].original_caption


def test_extract_metadata_ignores_playlist_entry_errors(monkeypatch):
    captured = {}

    class FakeYDL:
        def __init__(self, opts):
            captured["opts"] = opts

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def extract_info(self, url, download=False):
            captured["url"] = url
            captured["download"] = download
            return {"entries": []}

    monkeypatch.setattr("app.services.ytdlp_crawler.yt_dlp.YoutubeDL", FakeYDL)

    result = extract_source_entries(
        "https://www.youtube.com/@creator/shorts",
        source_platform="youtube",
        source_kind="youtube_shorts_feed",
    )

    assert result == []
    assert captured["opts"]["ignoreerrors"] is True
    assert captured["download"] is False


def test_extract_source_entries_surfaces_tiktok_profile_diagnostics(monkeypatch):
    class FakeYDL:
        def __init__(self, opts):
            self._logger = opts["logger"]

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def extract_info(self, _url, download=False):
            assert download is False
            self._logger.warning("This user's account is either private or has embedding disabled")
            self._logger.error("phimnganxutrung: Unable to extract secondary user ID")
            return None

    monkeypatch.setattr("app.services.ytdlp_crawler.yt_dlp.YoutubeDL", FakeYDL)

    with pytest.raises(ValueError, match="embedding"):
        extract_source_entries(
            "https://www.tiktok.com/@phimnganxutrung",
            source_platform="tiktok",
            source_kind="tiktok_profile",
        )


def test_sync_campaign_content_uses_normalized_youtube_entries(monkeypatch, db_session):
    campaign = Campaign(
        name="YouTube channel campaign",
        source_url="https://www.youtube.com/@creator/videos",
        source_platform="youtube",
        source_kind="youtube_channel",
        status=CampaignStatus.active,
        schedule_interval=15,
        last_sync_status="idle",
    )
    db_session.add(campaign)
    db_session.commit()
    db_session.refresh(campaign)

    def fake_extract_source_entries(_url, source_platform, source_kind):
        assert source_platform == "youtube"
        assert source_kind == "youtube_channel"
        from app.services.ytdlp_crawler import NormalizedMediaEntry

        return [
            NormalizedMediaEntry(
                original_id="short-a",
                source_video_url="https://www.youtube.com/shorts/short-a",
                original_caption="Caption A",
                title="Short A",
                description="Caption A",
                source_platform="youtube",
                source_kind="youtube_short",
            ),
            NormalizedMediaEntry(
                original_id="watch-b",
                source_video_url="https://www.youtube.com/watch?v=watch-b",
                original_caption="Caption B",
                title="Watch B",
                description="Caption B",
                source_platform="youtube",
                source_kind="youtube_video",
            ),
        ]

    def fake_download_video(url, filename_prefix):
        return (f"/tmp/{filename_prefix}-{url.rsplit('/', 1)[-1]}.mp4", "download-id")

    monkeypatch.setattr("app.services.campaign_jobs.extract_source_entries", fake_extract_source_entries)
    monkeypatch.setattr("app.services.campaign_jobs.download_video", fake_download_video)

    result = sync_campaign_content(
        str(campaign.id),
        campaign.source_url,
        allow_paused=False,
        source_platform=campaign.source_platform,
        source_kind=campaign.source_kind,
    )

    assert result["ok"] is True
    assert result["videos_added"] == 2

    videos = db_session.query(Video).filter(Video.campaign_id == campaign.id).order_by(Video.original_id.asc()).all()
    assert [video.original_id for video in videos] == ["short-a", "watch-b"]
    assert all(video.source_platform == "youtube" for video in videos)
    assert [video.source_kind for video in videos] == ["youtube_short", "youtube_video"]
    assert all(video.status == VideoStatus.ready for video in videos)
    assert videos[0].file_path.endswith("youtube-short-a.mp4")


def test_sync_campaign_content_uses_schedule_start_at(monkeypatch, db_session):
    fixed_now = datetime(2026, 4, 1, 0, 0, 0)
    start_at = datetime(2026, 4, 1, 9, 15, 0)
    campaign = Campaign(
        name="Scheduled start campaign",
        source_url="https://www.tiktok.com/@demo",
        source_platform="tiktok",
        source_kind="tiktok_profile",
        status=CampaignStatus.active,
        schedule_interval=20,
        schedule_start_at=start_at,
        last_sync_status="idle",
    )
    db_session.add(campaign)
    db_session.commit()
    db_session.refresh(campaign)

    def fake_extract_source_entries(_url, source_platform, source_kind):
        assert source_platform == "tiktok"
        assert source_kind == "tiktok_profile"
        from app.services.ytdlp_crawler import NormalizedMediaEntry

        return [
            NormalizedMediaEntry(
                original_id="video-a",
                source_video_url="https://www.tiktok.com/@demo/video/video-a",
                original_caption="Caption A",
                title="Video A",
                description="Caption A",
                source_platform="tiktok",
                source_kind="tiktok_video",
            ),
            NormalizedMediaEntry(
                original_id="video-b",
                source_video_url="https://www.tiktok.com/@demo/video/video-b",
                original_caption="Caption B",
                title="Video B",
                description="Caption B",
                source_platform="tiktok",
                source_kind="tiktok_video",
            ),
        ]

    def fake_download_video(url, filename_prefix):
        return (f"/tmp/{filename_prefix}-{url.rsplit('/', 1)[-1]}.mp4", "download-id")

    monkeypatch.setattr("app.services.campaign_jobs.utc_now", lambda: fixed_now)
    monkeypatch.setattr("app.services.campaign_jobs.extract_source_entries", fake_extract_source_entries)
    monkeypatch.setattr("app.services.campaign_jobs.download_video", fake_download_video)

    result = sync_campaign_content(
        str(campaign.id),
        campaign.source_url,
        allow_paused=False,
        source_platform=campaign.source_platform,
        source_kind=campaign.source_kind,
    )

    assert result["ok"] is True
    videos = db_session.query(Video).filter(Video.campaign_id == campaign.id).order_by(Video.publish_time.asc()).all()
    assert len(videos) == 2
    assert videos[0].publish_time == start_at
    assert videos[1].publish_time == start_at + timedelta(minutes=20)


def test_sync_campaign_content_keeps_explicit_schedule_start_even_when_page_has_queue(monkeypatch, db_session):
    fixed_now = datetime(2026, 4, 1, 0, 0, 0)
    start_at = datetime(2026, 4, 4, 12, 36, 0)

    page = FacebookPage(
        page_id="page-queue-priority",
        page_name="Queue priority page",
        long_lived_access_token="encrypted-token",
    )
    db_session.add(page)

    existing_campaign = Campaign(
        name="Existing queued campaign",
        source_url="https://www.tiktok.com/@other",
        source_platform="tiktok",
        source_kind="tiktok_profile",
        status=CampaignStatus.active,
        target_page_id=page.page_id,
        schedule_interval=30,
        last_sync_status="idle",
    )
    campaign = Campaign(
        name="Explicit scheduled campaign",
        source_url="https://www.tiktok.com/@demo",
        source_platform="tiktok",
        source_kind="tiktok_profile",
        status=CampaignStatus.active,
        target_page_id=page.page_id,
        schedule_interval=30,
        schedule_start_at=start_at,
        last_sync_status="idle",
    )
    db_session.add_all([existing_campaign, campaign])
    db_session.commit()
    db_session.refresh(existing_campaign)
    db_session.refresh(campaign)

    db_session.add(
        Video(
            campaign_id=existing_campaign.id,
            original_id="queued-video",
            source_video_url="https://www.tiktok.com/@other/video/queued-video",
            original_caption="Queued video",
            status=VideoStatus.ready,
            publish_time=datetime(2026, 4, 8, 3, 29, 0),
        )
    )
    db_session.commit()

    def fake_extract_source_entries(_url, source_platform, source_kind):
        assert source_platform == "tiktok"
        assert source_kind == "tiktok_profile"
        from app.services.ytdlp_crawler import NormalizedMediaEntry

        return [
            NormalizedMediaEntry(
                original_id="video-explicit",
                source_video_url="https://www.tiktok.com/@demo/video/video-explicit",
                original_caption="Caption explicit",
                title="Video explicit",
                description="Caption explicit",
                source_platform="tiktok",
                source_kind="tiktok_video",
            ),
        ]

    def fake_download_video(url, filename_prefix):
        return (f"/tmp/{filename_prefix}-{url.rsplit('/', 1)[-1]}.mp4", "download-id")

    monkeypatch.setattr("app.services.campaign_jobs.utc_now", lambda: fixed_now)
    monkeypatch.setattr("app.services.campaign_jobs.extract_source_entries", fake_extract_source_entries)
    monkeypatch.setattr("app.services.campaign_jobs.download_video", fake_download_video)

    result = sync_campaign_content(
        str(campaign.id),
        campaign.source_url,
        allow_paused=False,
        source_platform=campaign.source_platform,
        source_kind=campaign.source_kind,
    )

    assert result["ok"] is True
    videos = db_session.query(Video).filter(Video.campaign_id == campaign.id).order_by(Video.publish_time.asc()).all()
    assert len(videos) == 1
    assert videos[0].publish_time == start_at


def test_update_campaign_schedule_reschedules_waiting_videos(client, auth_headers, db_session, monkeypatch):
    fixed_now = datetime(2026, 4, 1, 0, 0, 0)
    monkeypatch.setattr("app.services.campaign_jobs.utc_now", lambda: fixed_now)

    page = FacebookPage(
        page_id="page-1",
        page_name="Demo page",
        long_lived_access_token="encrypted-token",
    )
    db_session.add(page)

    other_campaign = Campaign(
        name="Existing queue campaign",
        source_url="https://www.tiktok.com/@other",
        source_platform="tiktok",
        source_kind="tiktok_profile",
        status=CampaignStatus.active,
        target_page_id="page-1",
        schedule_interval=15,
    )
    campaign = Campaign(
        name="Editable schedule campaign",
        source_url="https://www.tiktok.com/@demo",
        source_platform="tiktok",
        source_kind="tiktok_profile",
        status=CampaignStatus.active,
        target_page_id="page-1",
        schedule_interval=15,
        schedule_start_at=datetime(2026, 4, 1, 8, 0, 0),
    )
    db_session.add_all([other_campaign, campaign])
    db_session.commit()
    db_session.refresh(other_campaign)
    db_session.refresh(campaign)

    db_session.add(
        Video(
            campaign_id=other_campaign.id,
            original_id="other-ready",
            source_video_url="https://www.tiktok.com/@other/video/other-ready",
            original_caption="Other ready",
            status=VideoStatus.ready,
            publish_time=datetime(2026, 4, 1, 9, 0, 0),
        )
    )
    db_session.add_all(
        [
            Video(
                campaign_id=campaign.id,
                original_id="video-a",
                source_video_url="https://www.tiktok.com/@demo/video/video-a",
                original_caption="Caption A",
                status=VideoStatus.ready,
                publish_time=datetime(2026, 4, 1, 8, 0, 0),
            ),
            Video(
                campaign_id=campaign.id,
                original_id="video-b",
                source_video_url="https://www.tiktok.com/@demo/video/video-b",
                original_caption="Caption B",
                status=VideoStatus.pending,
                publish_time=datetime(2026, 4, 1, 8, 15, 0),
            ),
        ]
    )
    db_session.commit()

    response = client.patch(
        f"/campaigns/{campaign.id}/schedule",
        headers=auth_headers,
        json={"schedule_start_at": "2026-04-01T08:30:00+07:00"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["rescheduled_videos"] == 2
    assert payload["campaign"]["schedule_start_at"] == "2026-04-01T01:30:00"
    assert payload["first_publish_time"] == "2026-04-01T01:30:00"

    db_session.refresh(campaign)
    videos = db_session.query(Video).filter(Video.campaign_id == campaign.id).order_by(Video.publish_time.asc()).all()
    assert videos[0].publish_time == datetime(2026, 4, 1, 1, 30, 0)
    assert videos[1].publish_time == datetime(2026, 4, 1, 1, 45, 0)


def test_update_campaign_schedule_updates_interval_and_reschedules_waiting_videos(client, auth_headers, db_session, monkeypatch):
    fixed_now = datetime(2026, 4, 1, 0, 0, 0)
    monkeypatch.setattr("app.services.campaign_jobs.utc_now", lambda: fixed_now)

    campaign = Campaign(
        name="Editable interval campaign",
        source_url="https://www.tiktok.com/@demo",
        source_platform="tiktok",
        source_kind="tiktok_profile",
        status=CampaignStatus.active,
        schedule_interval=15,
        schedule_start_at=datetime(2026, 4, 1, 8, 0, 0),
    )
    db_session.add(campaign)
    db_session.commit()
    db_session.refresh(campaign)

    db_session.add_all(
        [
            Video(
                campaign_id=campaign.id,
                original_id="video-a",
                source_video_url="https://www.tiktok.com/@demo/video/video-a",
                original_caption="Caption A",
                status=VideoStatus.ready,
                publish_time=datetime(2026, 4, 1, 8, 0, 0),
            ),
            Video(
                campaign_id=campaign.id,
                original_id="video-b",
                source_video_url="https://www.tiktok.com/@demo/video/video-b",
                original_caption="Caption B",
                status=VideoStatus.pending,
                publish_time=datetime(2026, 4, 1, 8, 15, 0),
            ),
        ]
    )
    db_session.commit()

    response = client.patch(
        f"/campaigns/{campaign.id}/schedule",
        headers=auth_headers,
        json={
            "schedule_start_at": "2026-04-01T08:30:00+07:00",
            "schedule_interval": 45,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["campaign"]["schedule_start_at"] == "2026-04-01T01:30:00"
    assert payload["campaign"]["schedule_interval"] == 45
    assert payload["first_publish_time"] == "2026-04-01T01:30:00"

    db_session.refresh(campaign)
    assert campaign.schedule_interval == 45
    videos = db_session.query(Video).filter(Video.campaign_id == campaign.id).order_by(Video.publish_time.asc()).all()
    assert videos[0].publish_time == datetime(2026, 4, 1, 1, 30, 0)
    assert videos[1].publish_time == datetime(2026, 4, 1, 2, 15, 0)


def test_regenerate_caption_uses_video_context_when_original_caption_is_empty(client, auth_headers, db_session, monkeypatch):
    page = FacebookPage(
        page_id="page-caption-empty",
        page_name="Trạm Dừng Video",
        long_lived_access_token="encrypted-token",
    )
    campaign = Campaign(
        name="Girl Xinh",
        source_url="https://www.tiktok.com/@demo/video/123",
        source_platform="tiktok",
        source_kind="tiktok_video",
        status=CampaignStatus.active,
        target_page_id=page.page_id,
        schedule_interval=30,
    )
    db_session.add_all([page, campaign])
    db_session.commit()
    db_session.refresh(campaign)

    video = Video(
        campaign_id=campaign.id,
        original_id="video-empty-caption",
        source_platform="tiktok",
        source_kind="tiktok_video",
        source_video_url="https://www.tiktok.com/@demo/video/123",
        original_caption=None,
        status=VideoStatus.ready,
        publish_time=datetime(2026, 4, 1, 8, 0, 0),
    )
    db_session.add(video)
    db_session.commit()
    db_session.refresh(video)

    captured = {}

    def fake_generate_caption(original_caption, *, video_context=None):
        captured["original_caption"] = original_caption
        captured["video_context"] = video_context
        return "Caption AI moi"

    monkeypatch.setattr("app.api.campaigns.generate_caption", fake_generate_caption)

    response = client.post(f"/campaigns/videos/{video.id}/generate-caption", headers=auth_headers)

    assert response.status_code == 200
    payload = response.json()
    assert payload["video"]["ai_caption"] == "Caption AI moi"
    assert captured["original_caption"] == ""
    assert captured["video_context"]["campaign_name"] == "Girl Xinh"
    assert captured["video_context"]["target_page_name"] == "Trạm Dừng Video"


def test_sync_campaign_content_fails_when_youtube_source_has_no_valid_shorts(monkeypatch, db_session):
    campaign = Campaign(
        name="Empty Shorts feed",
        source_url="https://www.youtube.com/@creator/shorts",
        source_platform="youtube",
        source_kind="youtube_shorts_feed",
        status=CampaignStatus.active,
        last_sync_status="idle",
    )
    db_session.add(campaign)
    db_session.commit()
    db_session.refresh(campaign)

    monkeypatch.setattr("app.services.campaign_jobs.extract_source_entries", lambda *_args, **_kwargs: [])

    with pytest.raises(ValueError, match="không trả về video hợp lệ"):
        sync_campaign_content(
            str(campaign.id),
            campaign.source_url,
            allow_paused=False,
            source_platform=campaign.source_platform,
            source_kind=campaign.source_kind,
        )


def test_campaign_stats_include_source_breakdown(client, auth_headers, db_session):
    tiktok_campaign = Campaign(
        name="TikTok campaign",
        source_url="https://www.tiktok.com/@demo",
        source_platform="tiktok",
        source_kind="tiktok_profile",
        status=CampaignStatus.active,
    )
    youtube_campaign = Campaign(
        name="YouTube Shorts campaign",
        source_url="https://www.youtube.com/@creator/shorts",
        source_platform="youtube",
        source_kind="youtube_shorts_feed",
        status=CampaignStatus.active,
    )
    db_session.add_all([tiktok_campaign, youtube_campaign])
    db_session.commit()
    db_session.refresh(tiktok_campaign)
    db_session.refresh(youtube_campaign)

    db_session.add_all(
        [
            Video(
                campaign_id=tiktok_campaign.id,
                original_id="tt-ready",
                source_video_url="https://www.tiktok.com/@demo/video/tt-ready",
                original_caption="TikTok ready",
                status=VideoStatus.ready,
                publish_time=utc_now(),
            ),
            Video(
                campaign_id=youtube_campaign.id,
                original_id="yt-ready",
                source_video_url="https://www.youtube.com/shorts/yt-ready",
                original_caption="Short ready",
                status=VideoStatus.ready,
                source_platform="youtube",
                source_kind="youtube_short",
                publish_time=utc_now(),
            ),
            Video(
                campaign_id=youtube_campaign.id,
                original_id="yt-failed",
                source_video_url="https://www.youtube.com/shorts/yt-failed",
                original_caption="Short failed",
                status=VideoStatus.failed,
                source_platform="youtube",
                source_kind="youtube_short",
            ),
        ]
    )
    db_session.commit()

    response = client.get("/campaigns/stats", headers=auth_headers)

    assert response.status_code == 200
    payload = response.json()
    assert payload["by_source"]["tiktok"]["campaigns"] == 1
    assert payload["by_source"]["tiktok"]["videos"] == 1
    assert payload["by_source"]["tiktok"]["ready"] == 1
    assert payload["by_source"]["youtube"]["campaigns"] == 1
    assert payload["by_source"]["youtube"]["videos"] == 2
    assert payload["by_source"]["youtube"]["ready"] == 1


def test_get_videos_can_filter_by_source_platform(client, auth_headers, db_session):
    tiktok_campaign = Campaign(
        name="TikTok campaign",
        source_url="https://www.tiktok.com/@demo",
        source_platform="tiktok",
        source_kind="tiktok_profile",
        status=CampaignStatus.active,
    )
    youtube_campaign = Campaign(
        name="YouTube Shorts campaign",
        source_url="https://www.youtube.com/@creator/shorts",
        source_platform="youtube",
        source_kind="youtube_shorts_feed",
        status=CampaignStatus.active,
    )
    db_session.add_all([tiktok_campaign, youtube_campaign])
    db_session.commit()
    db_session.refresh(tiktok_campaign)
    db_session.refresh(youtube_campaign)

    db_session.add_all(
        [
            Video(
                campaign_id=tiktok_campaign.id,
                original_id="tt-ready",
                source_video_url="https://www.tiktok.com/@demo/video/tt-ready",
                original_caption="TikTok ready",
                status=VideoStatus.ready,
                publish_time=utc_now(),
            ),
            Video(
                campaign_id=youtube_campaign.id,
                original_id="yt-ready",
                source_video_url="https://www.youtube.com/shorts/yt-ready",
                original_caption="Short ready",
                status=VideoStatus.ready,
                source_platform="youtube",
                source_kind="youtube_short",
                publish_time=utc_now(),
            ),
            Video(
                campaign_id=youtube_campaign.id,
                original_id="yt-posted",
                source_video_url="https://www.youtube.com/shorts/yt-posted",
                original_caption="Short posted",
                status=VideoStatus.posted,
                source_platform="youtube",
                source_kind="youtube_short",
            ),
        ]
    )
    db_session.commit()

    response = client.get("/campaigns/videos?source_platform=youtube", headers=auth_headers)

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 2
    assert {video["original_id"] for video in payload["videos"]} == {"yt-ready", "yt-posted"}
    assert all(video["source_platform"] == "youtube" for video in payload["videos"])


def test_can_delete_video_from_queue_and_cleanup_related_file_and_tasks(client, auth_headers, db_session, tmp_path):
    page = FacebookPage(
        page_id="page-delete-video",
        page_name="Trang xóa video",
        long_lived_access_token="encrypted-token-placeholder",
    )
    db_session.add(page)
    db_session.commit()

    campaign = Campaign(
        name="Campaign xóa video",
        source_url="https://www.tiktok.com/@demo/video/delete-me",
        source_platform="tiktok",
        source_kind="tiktok_video",
        status=CampaignStatus.active,
        target_page_id=page.page_id,
        schedule_interval=30,
    )
    db_session.add(campaign)
    db_session.commit()
    db_session.refresh(campaign)

    video_path = tmp_path / "video-delete.mp4"
    video_path.write_bytes(b"delete-me")

    video = Video(
        campaign_id=campaign.id,
        original_id="video-delete-me",
        source_platform="tiktok",
        source_kind="tiktok_video",
        source_video_url="https://www.tiktok.com/@demo/video/delete-me",
        file_path=str(video_path),
        original_caption="Caption delete me",
        ai_caption="Caption delete me",
        status=VideoStatus.ready,
        publish_time=utc_now(),
    )
    db_session.add(video)
    db_session.commit()
    db_session.refresh(video)

    task = TaskQueue(
        task_type="video_retry",
        entity_type="video",
        entity_id=str(video.id),
        payload={"video_id": str(video.id)},
    )
    db_session.add(task)
    db_session.commit()

    response = client.delete(f"/campaigns/videos/{video.id}", headers=auth_headers)

    assert response.status_code == 200
    payload = response.json()
    assert payload["deleted_video_id"] == str(video.id)
    assert payload["deleted_tasks"] == 1

    db_session.expire_all()
    assert db_session.query(Video).filter(Video.id == video.id).first() is None
    assert db_session.query(TaskQueue).filter(TaskQueue.entity_id == str(video.id)).count() == 0
    assert not video_path.exists()


def test_campaign_stats_include_source_trends(client, auth_headers, db_session):
    now = utc_now()
    tiktok_campaign = Campaign(
        name="TikTok campaign",
        source_url="https://www.tiktok.com/@demo",
        source_platform="tiktok",
        source_kind="tiktok_profile",
        status=CampaignStatus.active,
    )
    youtube_campaign = Campaign(
        name="YouTube Shorts campaign",
        source_url="https://www.youtube.com/@creator/shorts",
        source_platform="youtube",
        source_kind="youtube_shorts_feed",
        status=CampaignStatus.active,
    )
    db_session.add_all([tiktok_campaign, youtube_campaign])
    db_session.commit()
    db_session.refresh(tiktok_campaign)
    db_session.refresh(youtube_campaign)

    db_session.add_all(
        [
            Video(
                campaign_id=tiktok_campaign.id,
                original_id="tt-ready-today",
                source_video_url="https://www.tiktok.com/@demo/video/tt-ready-today",
                original_caption="TikTok ready today",
                status=VideoStatus.ready,
                publish_time=now,
            ),
            Video(
                campaign_id=tiktok_campaign.id,
                original_id="tt-posted-yesterday",
                source_video_url="https://www.tiktok.com/@demo/video/tt-posted-yesterday",
                original_caption="TikTok posted yesterday",
                status=VideoStatus.posted,
                updated_at=now - timedelta(days=1),
            ),
            Video(
                campaign_id=youtube_campaign.id,
                original_id="yt-failed-two-days",
                source_video_url="https://www.youtube.com/shorts/yt-failed-two-days",
                original_caption="YouTube failed",
                status=VideoStatus.failed,
                source_platform="youtube",
                source_kind="youtube_short",
                updated_at=now - timedelta(days=2),
            ),
        ]
    )
    db_session.commit()

    response = client.get("/campaigns/stats", headers=auth_headers)

    assert response.status_code == 200
    payload = response.json()
    labels = payload["source_trends"]["labels"]
    tiktok_ready = payload["source_trends"]["series"]["tiktok"]["ready"]
    tiktok_posted = payload["source_trends"]["series"]["tiktok"]["posted"]
    youtube_failed = payload["source_trends"]["series"]["youtube"]["failed"]

    assert len(labels) == 7
    assert tiktok_ready[-1] == 1
    assert tiktok_posted[-2] == 1
    assert youtube_failed[-3] == 1
