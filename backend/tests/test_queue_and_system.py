from datetime import timedelta
from pathlib import Path

from app.core.time import utc_now
from app.models.models import FacebookPage, SystemEvent, TaskQueue, WorkerHeartbeat
from app.services.runtime_settings import RUNTIME_ENV_FILE
from app.services.observability import cleanup_stale_worker_heartbeats
from app.services.task_queue import (
    TASK_TYPE_CAMPAIGN_SYNC,
    claim_next_task,
    complete_task,
    enqueue_task,
    fail_task,
)


def test_task_queue_deduplicates_and_retries(db_session):
    first_task = enqueue_task(
        db_session,
        task_type=TASK_TYPE_CAMPAIGN_SYNC,
        entity_type="campaign",
        entity_id="campaign-1",
        payload={"campaign_id": "campaign-1", "source_url": "https://example.com"},
        priority=10,
    )
    second_task = enqueue_task(
        db_session,
        task_type=TASK_TYPE_CAMPAIGN_SYNC,
        entity_type="campaign",
        entity_id="campaign-1",
        payload={"campaign_id": "campaign-1", "source_url": "https://example.com"},
        priority=10,
    )
    assert first_task.id == second_task.id

    claimed = claim_next_task(db_session, "worker-test")
    assert str(claimed.id) == str(first_task.id)
    assert claimed.attempts == 1
    assert claimed.locked_by == "worker-test"

    failed = fail_task(db_session, claimed, "Lỗi thử nghiệm", retry_delay_seconds=1)
    assert failed.status.value == "queued"
    assert failed.last_error == "Lỗi thử nghiệm"

    reclaimed = claim_next_task(db_session, "worker-test")
    assert reclaimed is None

    failed.available_at = utc_now() - timedelta(seconds=1)
    db_session.commit()

    reclaimed = claim_next_task(db_session, "worker-test")
    assert reclaimed is not None
    completed = complete_task(db_session, reclaimed)
    assert completed.status.value == "completed"


def test_system_endpoints_return_health_tasks_and_events(client, auth_headers, db_session):
    task = TaskQueue(
        task_type=TASK_TYPE_CAMPAIGN_SYNC,
        entity_type="campaign",
        entity_id="campaign-2",
        payload={"campaign_id": "campaign-2"},
    )
    worker = WorkerHeartbeat(
        worker_name="worker@test",
        app_role="worker",
        hostname="localhost",
        status="idle",
        last_seen_at=utc_now(),
    )
    event = SystemEvent(scope="queue", level="INFO", message="Đã tạo tác vụ kiểm thử.")
    db_session.add_all([task, worker, event])
    db_session.commit()

    overview_response = client.get("/system/overview", headers=auth_headers)
    assert overview_response.status_code == 200
    overview_payload = overview_response.json()
    assert overview_payload["active_users"] == 1
    assert overview_payload["task_queue"]["queued"] >= 1

    health_response = client.get("/system/health", headers=auth_headers)
    assert health_response.status_code == 200
    assert health_response.json()["database"]["ok"] is True
    assert health_response.json()["worker"]["online_count"] == 1

    tasks_response = client.get("/system/tasks", headers=auth_headers)
    assert tasks_response.status_code == 200
    assert tasks_response.json()["tasks"][0]["task_type"] == TASK_TYPE_CAMPAIGN_SYNC

    events_response = client.get("/system/events", headers=auth_headers)
    assert events_response.status_code == 200
    assert events_response.json()["events"][0]["message"] == "Đã tạo tác vụ kiểm thử."


def test_admin_can_cleanup_stale_workers(client, auth_headers, db_session):
    online_worker = WorkerHeartbeat(
        worker_name="worker-online@test",
        app_role="worker",
        hostname="localhost",
        status="idle",
        last_seen_at=utc_now(),
    )
    stale_worker = WorkerHeartbeat(
        worker_name="worker-stale@test",
        app_role="worker",
        hostname="localhost",
        status="idle",
        last_seen_at=utc_now() - timedelta(minutes=10),
    )
    db_session.add_all([online_worker, stale_worker])
    db_session.commit()

    cleanup_response = client.post("/system/workers/cleanup", headers=auth_headers)
    assert cleanup_response.status_code == 200
    cleanup_payload = cleanup_response.json()
    assert cleanup_payload["deleted_count"] == 1
    assert cleanup_payload["deleted_workers"] == ["worker-stale@test"]

    workers_response = client.get("/system/workers", headers=auth_headers)
    assert workers_response.status_code == 200
    worker_names = [worker["worker_name"] for worker in workers_response.json()["workers"]]
    assert "worker-online@test" in worker_names
    assert "worker-stale@test" not in worker_names


def test_cleanup_stale_worker_heartbeats_deletes_only_stale_workers(db_session):
    online_worker = WorkerHeartbeat(
        worker_name="worker-online-auto@test",
        app_role="worker",
        hostname="localhost",
        status="idle",
        last_seen_at=utc_now(),
    )
    stale_worker = WorkerHeartbeat(
        worker_name="worker-stale-auto@test",
        app_role="worker",
        hostname="localhost",
        status="idle",
        last_seen_at=utc_now() - timedelta(minutes=10),
    )
    db_session.add_all([online_worker, stale_worker])
    db_session.commit()

    deleted_count, deleted_workers = cleanup_stale_worker_heartbeats(db=db_session)

    assert deleted_count == 1
    assert deleted_workers == ["worker-stale-auto@test"]
    remaining_workers = [worker.worker_name for worker in db_session.query(WorkerHeartbeat).all()]
    assert "worker-online-auto@test" in remaining_workers
    assert "worker-stale-auto@test" not in remaining_workers


def test_admin_can_update_runtime_config_and_webhook_uses_new_values(client, auth_headers):
    runtime_file = Path(RUNTIME_ENV_FILE)
    if runtime_file.exists():
        runtime_file.unlink()

    update_response = client.put(
        "/system/runtime-config",
        headers=auth_headers,
        json={
            "BASE_URL": "https://runtime.example.com",
            "FB_VERIFY_TOKEN": "runtime-verify-token",
            "FB_APP_SECRET": "runtime-app-secret",
            "TUNNEL_TOKEN": "runtime-tunnel-token",
            "GEMINI_API_KEY": "runtime-gemini-key",
            "OPENAI_API_KEY": "runtime-openai-key",
            "ADMIN_PASSWORD": "RuntimeAdmin123",
        },
    )
    assert update_response.status_code == 200
    update_payload = update_response.json()
    assert set(update_payload["changed_keys"]) >= {"BASE_URL", "FB_VERIFY_TOKEN", "FB_APP_SECRET", "TUNNEL_TOKEN", "GEMINI_API_KEY", "OPENAI_API_KEY", "ADMIN_PASSWORD"}
    assert update_payload["derived"]["webhook_url"] == "https://runtime.example.com/webhooks/fb"

    overview_response = client.get("/system/overview", headers=auth_headers)
    assert overview_response.status_code == 200
    overview_payload = overview_response.json()
    assert overview_payload["base_url"] == "https://runtime.example.com"
    assert overview_payload["verify_token"] == "runtime-verify-token"
    assert overview_payload["webhook_signature_enabled"] is True
    assert overview_payload["tunnel_token_configured"] is True

    verify_response = client.get(
        "/webhooks/fb?hub.mode=subscribe&hub.verify_token=runtime-verify-token&hub.challenge=12345"
    )
    assert verify_response.status_code == 200
    assert verify_response.text == "12345"

    wrong_verify_response = client.get(
        "/webhooks/fb?hub.mode=subscribe&hub.verify_token=wrong-token&hub.challenge=12345"
    )
    assert wrong_verify_response.status_code == 403

    assert runtime_file.exists()
    runtime_content = runtime_file.read_text(encoding="utf-8")
    assert "BASE_URL=https://runtime.example.com" in runtime_content
    assert "TUNNEL_TOKEN=runtime-tunnel-token" in runtime_content
    assert "ADMIN_PASSWORD=RuntimeAdmin123" in runtime_content


def test_admin_can_verify_tunnel_token_and_restart_tunnel_service(client, auth_headers, monkeypatch):
    from app.api import system as system_api

    monkeypatch.setattr(
        system_api,
        "restart_tunnel_service",
        lambda: {
            "ok": True,
            "message": "Đã gửi lệnh khởi động lại tunnel.",
            "command": "docker compose up -d --force-recreate tunnel",
        },
    )

    response = client.post(
        "/system/runtime-config/verify-tunnel-token",
        headers=auth_headers,
        json={
            "tunnel_token": (
                "cloudflared service install "
                "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
                "eyJhY2NvdW50X3RhZyI6ImFjY3QtMTIzIiwidHVubmVsX2lkIjoiNmZmNDJhZTItNzY1ZC00YWRmLTgxMTItMzFjNTVjMTU1MWVmIn0."
                "signature"
            ),
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["tunnel_verification"]["ok"] is True
    assert payload["settings"]["TUNNEL_TOKEN"]["value"].startswith("eyJ")
    assert payload["tunnel_verification"]["tunnel_id"] == "6ff42ae2-765d-4adf-8112-31c55c1551ef"
    assert payload["tunnel_verification"]["account_tag"] == "acct-123"
    assert payload["tunnel_verification"]["can_autofill_base_url"] is False
    assert payload["tunnel_restart"]["ok"] is True
    assert "TUNNEL_TOKEN" in payload["changed_keys"]


def test_admin_can_preview_ai_reply_for_comment_and_message(client, auth_headers, db_session, monkeypatch):
    from app.api import system as system_api

    page = FacebookPage(
        page_id="page-preview-ai",
        page_name="Trang preview AI",
        long_lived_access_token="encrypted-token-placeholder",
    )
    db_session.add(page)
    db_session.commit()

    monkeypatch.setattr(system_api, "get_configured_ai_provider_order", lambda: ["gemini", "openai"])
    monkeypatch.setattr(
        system_api,
        "build_comment_reply_plan",
        lambda db, page_config, user_message: {
            "reply": f"Comment preview cho: {user_message}",
            "reply_mode": "ai",
            "intent": "comment_preview",
            "summary": "Tom tat comment",
            "lookup_used": False,
            "lookup_matches": [],
        },
    )
    monkeypatch.setattr(
        system_api,
        "build_message_reply_plan",
        lambda db, page_config, user_message, conversation_summary=None, recent_turns=None, customer_facts=None: {
            "reply": f"Inbox preview cho: {user_message}",
            "reply_mode": "lookup",
            "intent": "message_preview",
            "summary": "Tom tat inbox",
            "customer_facts": {"muc_dich": "test"},
            "handoff": False,
            "handoff_reason": None,
            "lookup_used": True,
            "lookup_matches": [{"title": "Video A", "source_video_url": "https://example.com/video-a"}],
        },
    )

    comment_response = client.post(
        "/system/ai-preview",
        headers=auth_headers,
        json={
            "page_id": "page-preview-ai",
            "channel": "comment",
            "user_message": "Video nay noi gi vay?",
        },
    )
    assert comment_response.status_code == 200
    comment_payload = comment_response.json()
    assert comment_payload["provider_order"] == ["gemini", "openai"]
    assert comment_payload["reply"] == "Comment preview cho: Video nay noi gi vay?"
    assert comment_payload["reply_mode"] == "ai"

    message_response = client.post(
        "/system/ai-preview",
        headers=auth_headers,
        json={
            "page_id": "page-preview-ai",
            "channel": "message",
            "user_message": "Gui minh link video do",
            "conversation_summary": "Khach dang hoi link video",
            "recent_turns": [{"role": "customer", "content": "Cho minh xin clip"}],
            "customer_facts": {"so_thich": "drama"},
        },
    )
    assert message_response.status_code == 200
    message_payload = message_response.json()
    assert message_payload["reply"] == "Inbox preview cho: Gui minh link video do"
    assert message_payload["reply_mode"] == "lookup"
    assert message_payload["lookup_used"] is True
    assert message_payload["lookup_matches"][0]["title"] == "Video A"
