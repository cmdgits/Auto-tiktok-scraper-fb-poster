from app.models.models import FacebookPage, InteractionLog, InteractionStatus, TaskQueue
from app.services.security import encrypt_secret
from app.services.campaign_jobs import reply_to_comment_job


def _create_page(db_session, *, page_id="page-comment-gate", auto_reply_enabled=True):
    page = FacebookPage(
        page_id=page_id,
        page_name="Trang comment gate",
        long_lived_access_token=encrypt_secret("page-token-comment-gate"),
        comment_auto_reply_enabled=auto_reply_enabled,
    )
    db_session.add(page)
    db_session.commit()
    db_session.refresh(page)
    return page


def test_webhook_ignores_comment_created_by_page_itself(client, db_session):
    page = _create_page(db_session, page_id="page-self-comment", auto_reply_enabled=True)

    response = client.post(
        "/webhooks/fb",
        json={
            "object": "page",
            "entry": [
                {
                    "id": page.page_id,
                    "changes": [
                        {
                            "field": "feed",
                            "value": {
                                "item": "comment",
                                "verb": "add",
                                "comment_id": "comment-self-1",
                                "post_id": "post-self-1",
                                "message": "Page tu comment",
                                "from": {"id": page.page_id, "name": page.page_name},
                            },
                        }
                    ],
                }
            ],
        },
    )

    assert response.status_code == 200
    assert db_session.query(InteractionLog).filter(InteractionLog.comment_id == "comment-self-1").first() is None
    assert db_session.query(TaskQueue).count() == 0


def test_webhook_ignores_comment_without_user_message_or_sender(client, db_session):
    page = _create_page(db_session, page_id="page-invalid-comment", auto_reply_enabled=True)

    response = client.post(
        "/webhooks/fb",
        json={
            "object": "page",
            "entry": [
                {
                    "id": page.page_id,
                    "changes": [
                        {
                            "field": "feed",
                            "value": {
                                "item": "comment",
                                "verb": "add",
                                "comment_id": "comment-invalid-1",
                                "post_id": "post-invalid-1",
                                "message": "   ",
                                "from": {"id": ""},
                            },
                        }
                    ],
                }
            ],
        },
    )

    assert response.status_code == 200
    assert db_session.query(InteractionLog).filter(InteractionLog.comment_id == "comment-invalid-1").first() is None
    assert db_session.query(TaskQueue).count() == 0


def test_webhook_records_user_comment_without_enqueuing_when_auto_reply_disabled(client, db_session):
    page = _create_page(db_session, page_id="page-comment-disabled", auto_reply_enabled=False)

    response = client.post(
        "/webhooks/fb",
        json={
            "object": "page",
            "entry": [
                {
                    "id": page.page_id,
                    "changes": [
                        {
                            "field": "feed",
                            "value": {
                                "item": "comment",
                                "verb": "add",
                                "comment_id": "comment-disabled-1",
                                "post_id": "post-disabled-1",
                                "message": "Khach co binh luan moi",
                                "from": {"id": "user-disabled-1", "name": "Khach 1"},
                            },
                        }
                    ],
                }
            ],
        },
    )

    assert response.status_code == 200

    saved_log = db_session.query(InteractionLog).filter(InteractionLog.comment_id == "comment-disabled-1").first()
    assert saved_log is not None
    assert saved_log.reply_mode == "operator"
    assert saved_log.status == InteractionStatus.pending
    assert db_session.query(TaskQueue).count() == 0


def test_comment_worker_ignores_stale_ai_task_when_page_auto_reply_disabled(db_session, monkeypatch):
    page = _create_page(db_session, page_id="page-worker-disabled", auto_reply_enabled=False)
    log = InteractionLog(
        page_id=page.page_id,
        post_id="post-worker-disabled",
        comment_id="comment-worker-disabled",
        user_id="user-worker-disabled",
        user_name="Khach cu",
        user_message="Con comment cu trong queue",
        reply_mode="ai",
        status=InteractionStatus.pending,
    )
    db_session.add(log)
    db_session.commit()
    db_session.refresh(log)

    monkeypatch.setattr(
        "app.services.campaign_jobs.reply_to_comment",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("reply_to_comment should not be called")),
    )

    result = reply_to_comment_job(str(log.id))

    assert result["ok"] is False
    assert result["ignored"] is True

    db_session.expire_all()
    saved_log = db_session.query(InteractionLog).filter(InteractionLog.id == log.id).first()
    assert saved_log is not None
    assert saved_log.status == InteractionStatus.ignored
    assert saved_log.last_error is None
