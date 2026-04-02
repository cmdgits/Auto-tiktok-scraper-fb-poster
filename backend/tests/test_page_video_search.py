from app.models.models import (
    Campaign,
    CampaignStatus,
    FacebookPage,
    InboxConversation,
    InboxMessageLog,
    InteractionStatus,
    Video,
    VideoStatus,
)
from app.services.page_video_search import lookup_page_video_knowledge
from app.services.security import encrypt_secret
from app.services.task_queue import TASK_TYPE_MESSAGE_REPLY, enqueue_task
from app.worker.tasks import process_task_queue


def test_lookup_page_video_knowledge_returns_matching_link(db_session):
    campaign = Campaign(
        name="Drama co gai quay lai",
        source_url="https://example.com/source",
        source_platform="tiktok",
        source_kind="tiktok_video",
        status=CampaignStatus.active,
        target_page_id="page-video-search",
    )
    db_session.add(campaign)
    db_session.commit()
    db_session.refresh(campaign)

    video = Video(
        campaign_id=campaign.id,
        original_id="video-lookup-1",
        source_platform="tiktok",
        source_kind="tiktok_video",
        source_video_url="https://example.com/videos/co-gai-quay-lai",
        original_caption="Co gai bo di roi quay lai o doan cuoi",
        ai_caption="Doan cuoi co gai quay lai khien ca nha bat ngo",
        status=VideoStatus.posted,
        fb_post_id="fb-post-lookup-1",
    )
    db_session.add(video)
    db_session.commit()

    result = lookup_page_video_knowledge(
        db_session,
        page_id="page-video-search",
        user_message="ban gui link video co gai quay lai giup minh",
    )

    assert result["should_lookup"] is True
    assert result["matches"]
    assert result["matches"][0]["source_video_url"] == "https://example.com/videos/co-gai-quay-lai"
    assert "https://example.com/videos/co-gai-quay-lai" in result["direct_reply"]
    assert "khach dang hoi tim video" in result["summary"].lower()


def test_message_worker_uses_video_lookup_before_ai_generator(db_session, monkeypatch):
    page = FacebookPage(
        page_id="page-lookup-worker",
        page_name="Trang lookup worker",
        long_lived_access_token=encrypt_secret("page-token-lookup-worker"),
        message_reply_min_delay_seconds=0,
        message_reply_max_delay_seconds=0,
        message_typing_indicator_enabled=False,
        message_auto_reply_enabled=True,
    )
    db_session.add(page)

    campaign = Campaign(
        name="Drama quay lai",
        source_url="https://example.com/source-drama",
        source_platform="tiktok",
        source_kind="tiktok_video",
        status=CampaignStatus.active,
        target_page_id="page-lookup-worker",
    )
    db_session.add(campaign)
    db_session.commit()
    db_session.refresh(campaign)

    video = Video(
        campaign_id=campaign.id,
        original_id="video-lookup-worker-1",
        source_platform="tiktok",
        source_kind="tiktok_video",
        source_video_url="https://example.com/videos/drama-quay-lai",
        original_caption="Co gai quay lai xin gap nam chinh",
        ai_caption="Clip co gai quay lai xin gap nam chinh",
        status=VideoStatus.posted,
        fb_post_id="fb-post-worker-1",
    )
    db_session.add(video)
    db_session.commit()

    conversation = InboxConversation(
        page_id="page-lookup-worker",
        sender_id="user-lookup-worker",
        recipient_id="page-lookup-worker",
        customer_facts={},
    )
    db_session.add(conversation)
    db_session.commit()
    db_session.refresh(conversation)

    log = InboxMessageLog(
        page_id="page-lookup-worker",
        conversation_id=conversation.id,
        facebook_message_id="mid.lookup.worker.1",
        sender_id="user-lookup-worker",
        recipient_id="page-lookup-worker",
        user_message="cho minh xin link video co gai quay lai",
        status=InteractionStatus.pending,
    )
    db_session.add(log)
    db_session.commit()
    db_session.refresh(log)

    enqueue_task(
        db_session,
        task_type=TASK_TYPE_MESSAGE_REPLY,
        entity_type="inbox_message_log",
        entity_id=str(log.id),
        payload={"message_log_id": str(log.id)},
        priority=20,
    )

    def fail_if_ai_called(*args, **kwargs):
        raise AssertionError("AI generator should not be called for direct video lookup replies.")

    sent = {}

    def fake_send(recipient_id, message, access_token):
        sent["recipient_id"] = recipient_id
        sent["message"] = message
        return {"recipient_id": recipient_id, "message_id": "m_lookup_worker_1"}

    monkeypatch.setattr("app.services.page_reply_engine.generate_message_reply_with_context", fail_if_ai_called)
    monkeypatch.setattr("app.services.campaign_jobs.send_page_message", fake_send)

    processed = process_task_queue("worker-video-lookup@test")
    assert processed == 1

    db_session.expire_all()
    saved_log = db_session.query(InboxMessageLog).filter(InboxMessageLog.id == log.id).first()
    saved_conversation = db_session.query(InboxConversation).filter(InboxConversation.id == conversation.id).first()

    assert saved_log.status == InteractionStatus.replied
    assert "https://example.com/videos/drama-quay-lai" in (saved_log.ai_reply or "")
    assert saved_log.facebook_reply_message_id == "m_lookup_worker_1"
    assert sent["recipient_id"] == "user-lookup-worker"
    assert "https://example.com/videos/drama-quay-lai" in sent["message"]
    assert saved_conversation.current_intent == "video_lookup"
    assert saved_conversation.customer_facts["last_video_lookup_query"] == "gai quay"


def test_lookup_page_video_knowledge_skips_positive_page_name_mentions(db_session):
    result = lookup_page_video_knowledge(
        db_session,
        page_id="page-video-search",
        user_message="Trạm Dừng Video tôi khen đẹp",
    )

    assert result["should_lookup"] is False
    assert result["matches"] == []
    assert result["direct_reply"] is None
