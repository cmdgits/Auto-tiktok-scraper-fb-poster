from app.models.models import FacebookPage, InteractionLog, InteractionStatus, TaskQueue
from app.services.security import encrypt_secret
from app.services.task_queue import TASK_TYPE_COMMENT_REPLY, enqueue_task


def _create_comment_delete_fixture(db_session, *, facebook_reply_comment_id=None):
    page = FacebookPage(
        page_id="page-comment-delete",
        page_name="Trang test xoa comment",
        long_lived_access_token=encrypt_secret("page-token-delete"),
    )
    db_session.add(page)
    db_session.commit()

    interaction_log = InteractionLog(
        page_id=page.page_id,
        post_id="post-comment-delete",
        comment_id="comment-delete-root",
        facebook_reply_comment_id=facebook_reply_comment_id,
        user_id="user-comment-delete",
        user_name="Khach test",
        user_message="Comment can xoa",
        status=InteractionStatus.pending,
    )
    db_session.add(interaction_log)
    db_session.commit()
    db_session.refresh(interaction_log)

    enqueue_task(
        db_session,
        task_type=TASK_TYPE_COMMENT_REPLY,
        entity_type="interaction_log",
        entity_id=str(interaction_log.id),
        payload={"interaction_log_id": str(interaction_log.id)},
        priority=10,
    )

    return interaction_log


def test_delete_comment_interaction_removes_dashboard_log_when_graph_delete_is_unsupported(
    client,
    db_session,
    auth_headers,
    monkeypatch,
):
    interaction_log = _create_comment_delete_fixture(db_session)
    interaction_log_id = interaction_log.id

    def fake_delete_comment(comment_id, access_token):
        assert comment_id == "comment-delete-root"
        assert access_token == "page-token-delete"
        return {
            "error": (
                "Unsupported delete request. Object with ID 'comment-delete-root' does not exist, "
                "cannot be loaded due to missing permissions, or does not support this operation."
            )
        }

    monkeypatch.setattr("app.api.webhooks.delete_comment", fake_delete_comment)

    response = client.delete(f"/webhooks/comments/{interaction_log.id}", headers=auth_headers)

    assert response.status_code == 200
    assert "dashboard" in response.json()["message"]

    db_session.expire_all()
    assert db_session.query(InteractionLog).filter(InteractionLog.id == interaction_log_id).first() is None
    assert db_session.query(TaskQueue).filter(TaskQueue.entity_id == str(interaction_log_id)).count() == 0


def test_delete_comment_interaction_deletes_page_reply_when_original_comment_delete_fails(
    client,
    db_session,
    auth_headers,
    monkeypatch,
):
    interaction_log = _create_comment_delete_fixture(
        db_session,
        facebook_reply_comment_id="comment-delete-page-reply",
    )
    interaction_log_id = interaction_log.id
    delete_calls = []

    def fake_delete_comment(comment_id, access_token):
        delete_calls.append((comment_id, access_token))
        if comment_id == "comment-delete-root":
            return {
                "error": (
                    "Unsupported delete request. Object with ID 'comment-delete-root' does not exist, "
                    "cannot be loaded due to missing permissions, or does not support this operation."
                )
            }
        if comment_id == "comment-delete-page-reply":
            return {"success": True}
        raise AssertionError(f"Unexpected comment id: {comment_id}")

    monkeypatch.setattr("app.api.webhooks.delete_comment", fake_delete_comment)

    response = client.delete(f"/webhooks/comments/{interaction_log.id}", headers=auth_headers)

    assert response.status_code == 200
    assert "reply của page" in response.json()["message"]
    assert delete_calls == [
        ("comment-delete-root", "page-token-delete"),
        ("comment-delete-page-reply", "page-token-delete"),
    ]

    db_session.expire_all()
    assert db_session.query(InteractionLog).filter(InteractionLog.id == interaction_log_id).first() is None
    assert db_session.query(TaskQueue).filter(TaskQueue.entity_id == str(interaction_log_id)).count() == 0


def test_delete_comment_interaction_keeps_log_when_delete_error_is_blocking(
    client,
    db_session,
    auth_headers,
    monkeypatch,
):
    interaction_log = _create_comment_delete_fixture(db_session)
    interaction_log_id = interaction_log.id

    def fake_delete_comment(comment_id, access_token):
        assert comment_id == "comment-delete-root"
        assert access_token == "page-token-delete"
        return {"error": "Graph timeout while deleting comment."}

    monkeypatch.setattr("app.api.webhooks.delete_comment", fake_delete_comment)

    response = client.delete(f"/webhooks/comments/{interaction_log.id}", headers=auth_headers)

    assert response.status_code == 502
    assert "Graph timeout" in response.json()["detail"]

    db_session.expire_all()
    assert db_session.query(InteractionLog).filter(InteractionLog.id == interaction_log_id).first() is not None
    assert db_session.query(TaskQueue).filter(TaskQueue.entity_id == str(interaction_log_id)).count() == 1
