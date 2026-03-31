import json
import uuid
from datetime import datetime, timedelta
from json import JSONDecodeError
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.auth import require_admin, require_authenticated_user
from app.core.config import settings
from app.core.database import get_db
from app.core.time import utc_now
from app.models.models import ConversationStatus, FacebookPage, InboxConversation, InboxMessageLog, InteractionLog, InteractionStatus, TaskQueue, TaskStatus, User
from app.services.accounts import serialize_user
from app.services.ai_generator import generate_reply
from app.services.inbox_memory import get_or_create_inbox_conversation, serialize_conversation, touch_conversation_with_customer_message
from app.services.observability import record_event
from app.services.runtime_settings import resolve_runtime_value
from app.services.security import verify_facebook_signature
from app.services.task_queue import TASK_TYPE_COMMENT_REPLY, TASK_TYPE_MESSAGE_REPLY, enqueue_task
from app.services.fb_graph import delete_comment, lookup_profile_name, moderate_conversation, reply_to_comment, send_page_message
from app.services.security import decrypt_secret

router = APIRouter(prefix="/webhooks", tags=["Webhook"])
LOCAL_TIMEZONE = ZoneInfo(settings.APP_TIMEZONE)


class ConversationHandoffUpdate(BaseModel):
    needs_human_handoff: bool
    handoff_reason: str | None = None


class ConversationUpdateRequest(BaseModel):
    status: ConversationStatus | None = None
    assigned_to_user_id: str | None = None
    internal_note: str | None = Field(default=None, max_length=1000)
    handoff_reason: str | None = Field(default=None, max_length=300)


class ConversationReplyRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    mark_resolved: bool = False


class CommentInteractionUpdateRequest(BaseModel):
    reply_mode: str = Field(pattern=r"^(ai|operator)$")


class CommentReplyRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)


def serialize_interaction_log(log: InteractionLog, reply_author: User | None = None) -> dict:
    return {
        "id": str(log.id),
        "page_id": log.page_id,
        "post_id": log.post_id,
        "comment_id": log.comment_id,
        "user_id": log.user_id,
        "user_name": log.user_name,
        "user_message": log.user_message,
        "reply_mode": log.reply_mode or "ai",
        "ai_reply": log.ai_reply,
        "facebook_reply_comment_id": log.facebook_reply_comment_id,
        "reply_source": log.reply_source or ("ai" if log.ai_reply and log.status == InteractionStatus.replied else ""),
        "reply_author_user_id": str(log.reply_author_user_id) if log.reply_author_user_id else None,
        "reply_author": _serialize_compact_user(reply_author),
        "last_error": log.last_error,
        "status": log.status.value if hasattr(log.status, "value") else log.status,
        "created_at": log.created_at.isoformat() if log.created_at else None,
        "updated_at": log.updated_at.isoformat() if log.updated_at else None,
    }


def _serialize_compact_user(user: User | None) -> dict | None:
    if not user:
        return None
    payload = serialize_user(user)
    return {
        "id": payload["id"],
        "username": payload["username"],
        "display_name": payload["display_name"] or payload["username"],
        "role": payload["role"],
    }


def _resolve_conversation_activity_time(conversation: InboxConversation) -> datetime | None:
    candidates = [
        conversation.last_customer_message_at,
        conversation.last_ai_reply_at,
        conversation.last_operator_reply_at,
        conversation.updated_at,
        conversation.created_at,
    ]
    values = [item for item in candidates if item is not None]
    return max(values) if values else None


def _resolve_conversation_preview(log: InboxMessageLog | None) -> tuple[str, str]:
    if not log:
        return "empty", "Chưa có nội dung."
    if (log.user_message or "").strip():
        return "customer", log.user_message.strip()
    if (log.ai_reply or "").strip():
        return "page", log.ai_reply.strip()
    return "empty", "Chưa có nội dung."


def serialize_message_log(
    log: InboxMessageLog,
    conversation: InboxConversation | None = None,
    reply_author: User | None = None,
) -> dict:
    return {
        "id": str(log.id),
        "page_id": log.page_id,
        "conversation_id": str(log.conversation_id) if log.conversation_id else None,
        "facebook_message_id": log.facebook_message_id,
        "sender_id": log.sender_id,
        "sender_name": log.sender_name or (conversation.sender_name if conversation else None),
        "recipient_id": log.recipient_id,
        "user_message": log.user_message,
        "ai_reply": log.ai_reply,
        "facebook_reply_message_id": log.facebook_reply_message_id,
        "reply_source": log.reply_source or ("ai" if log.ai_reply and log.status == InteractionStatus.replied else ""),
        "reply_author_user_id": str(log.reply_author_user_id) if log.reply_author_user_id else None,
        "reply_author": _serialize_compact_user(reply_author),
        "last_error": log.last_error,
        "status": log.status.value if hasattr(log.status, "value") else log.status,
        "created_at": log.created_at.isoformat() if log.created_at else None,
        "updated_at": log.updated_at.isoformat() if log.updated_at else None,
        "conversation": serialize_conversation(conversation),
    }


def serialize_conversation_item(
    conversation: InboxConversation,
    *,
    latest_log: InboxMessageLog | None,
    assigned_user: User | None = None,
    message_count: int = 0,
) -> dict:
    preview_direction, preview_text = _resolve_conversation_preview(latest_log)
    payload = serialize_conversation(conversation, assigned_user=assigned_user) or {}
    payload.update(
        {
            "message_count": message_count,
            "latest_activity_at": _resolve_conversation_activity_time(conversation).isoformat()
            if _resolve_conversation_activity_time(conversation)
            else None,
            "latest_preview": preview_text,
            "latest_preview_direction": preview_direction,
            "latest_log": serialize_message_log(latest_log, conversation, reply_author=assigned_user) if latest_log else None,
        }
    )
    return payload


def get_local_now() -> datetime:
    return datetime.now(LOCAL_TIMEZONE)


def _load_user_map(db: Session, user_ids: list[uuid.UUID | str | None]) -> dict[uuid.UUID, User]:
    normalized_ids = []
    for raw_user_id in user_ids:
        if not raw_user_id:
            continue
        if isinstance(raw_user_id, uuid.UUID):
            normalized_ids.append(raw_user_id)
            continue
        try:
            normalized_ids.append(uuid.UUID(str(raw_user_id)))
        except ValueError:
            continue
    if not normalized_ids:
        return {}
    users = db.query(User).filter(User.id.in_(normalized_ids)).all()
    return {user.id: user for user in users}


def _get_conversation_rows(
    db: Session,
    *,
    status: str = "all",
    limit: int = 100,
) -> list[dict]:
    query = db.query(InboxConversation)
    if status != "all":
        query = query.filter(InboxConversation.status == ConversationStatus(status))
    conversations = query.all()
    if not conversations:
        return []

    conversation_ids = [conversation.id for conversation in conversations]
    logs = (
        db.query(InboxMessageLog)
        .filter(InboxMessageLog.conversation_id.in_(conversation_ids))
        .order_by(InboxMessageLog.created_at.desc())
        .all()
    )

    latest_log_map: dict[uuid.UUID, InboxMessageLog] = {}
    message_counts: dict[uuid.UUID, int] = {}
    reply_author_ids: list[uuid.UUID] = []
    for log in logs:
        if not log.conversation_id:
            continue
        message_counts[log.conversation_id] = message_counts.get(log.conversation_id, 0) + 1
        if log.reply_author_user_id:
            reply_author_ids.append(log.reply_author_user_id)
        if log.conversation_id not in latest_log_map:
            latest_log_map[log.conversation_id] = log

    assigned_user_map = _load_user_map(db, [conversation.assigned_to_user_id for conversation in conversations] + reply_author_ids)
    ordered = sorted(
        conversations,
        key=lambda conversation: _resolve_conversation_activity_time(conversation) or conversation.created_at or utc_now(),
        reverse=True,
    )[:limit]

    items = []
    for conversation in ordered:
        latest_log = latest_log_map.get(conversation.id)
        item = serialize_conversation_item(
            conversation,
            latest_log=latest_log,
            assigned_user=assigned_user_map.get(conversation.assigned_to_user_id),
            message_count=message_counts.get(conversation.id, 0),
        )
        if latest_log and item.get("latest_log"):
            item["latest_log"]["reply_author"] = _serialize_compact_user(
                assigned_user_map.get(latest_log.reply_author_user_id),
            ) if latest_log.reply_author_user_id else None
        items.append(item)
    return items


def _get_interaction_log_or_404(db: Session, interaction_log_id: str) -> InteractionLog:
    try:
        log_uuid = uuid.UUID(interaction_log_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Mã bình luận không hợp lệ.") from exc

    log = db.query(InteractionLog).filter(InteractionLog.id == log_uuid).first()
    if not log:
        raise HTTPException(status_code=404, detail="Không tìm thấy bình luận cần xử lý.")
    return log


def _delete_related_tasks_or_raise(
    db: Session,
    *,
    entity_type: str,
    entity_id: str,
) -> int:
    tasks = (
        db.query(TaskQueue)
        .filter(
            TaskQueue.entity_type == entity_type,
            TaskQueue.entity_id == entity_id,
        )
        .all()
    )
    if any(task.status == TaskStatus.processing for task in tasks):
        raise HTTPException(status_code=409, detail="Bản ghi này đang được worker xử lý, hãy thử lại sau.")

    for task in tasks:
        db.delete(task)
    return len(tasks)


def _purge_conversation_or_raise(
    db: Session,
    *,
    conversation: InboxConversation,
) -> dict:
    logs = db.query(InboxMessageLog).filter(InboxMessageLog.conversation_id == conversation.id).all()
    deleted_task_count = 0
    deleted_log_count = len(logs)
    for log in logs:
        deleted_task_count += _delete_related_tasks_or_raise(
            db,
            entity_type="inbox_message_log",
            entity_id=str(log.id),
        )

    for log in logs:
        db.delete(log)

    conversation_id = str(conversation.id)
    page_id = conversation.page_id
    sender_id = conversation.sender_id
    db.delete(conversation)
    db.commit()

    return {
        "conversation_id": conversation_id,
        "page_id": page_id,
        "sender_id": sender_id,
        "deleted_log_count": deleted_log_count,
        "deleted_task_count": deleted_task_count,
    }


def _set_conversation_status(
    conversation: InboxConversation,
    *,
    status: ConversationStatus,
    handoff_reason: str | None = None,
) -> None:
    conversation.status = status
    if status == ConversationStatus.operator_active:
        conversation.needs_human_handoff = True
        conversation.handoff_reason = (handoff_reason or conversation.handoff_reason or "Đã chuyển cho nhân viên hỗ trợ.").strip()[:300]
        conversation.resolved_at = None
    elif status == ConversationStatus.resolved:
        conversation.needs_human_handoff = False
        conversation.handoff_reason = None
        conversation.resolved_at = utc_now()
    else:
        conversation.needs_human_handoff = False
        conversation.handoff_reason = None
        conversation.resolved_at = None


def _parse_hhmm(raw_value: str | None):
    value = (raw_value or "").strip()
    try:
        hours, minutes = value.split(":")
        return int(hours), int(minutes)
    except Exception:
        return None


def _is_within_message_schedule(page_config: FacebookPage, local_now: datetime) -> tuple[bool, str | None]:
    if not page_config.message_reply_schedule_enabled:
        return True, None

    start_parts = _parse_hhmm(page_config.message_reply_start_time)
    end_parts = _parse_hhmm(page_config.message_reply_end_time)
    if not start_parts or not end_parts:
        return True, None

    current_minutes = local_now.hour * 60 + local_now.minute
    start_minutes = start_parts[0] * 60 + start_parts[1]
    end_minutes = end_parts[0] * 60 + end_parts[1]

    if start_minutes == end_minutes:
        return True, None

    if start_minutes < end_minutes:
        is_allowed = start_minutes <= current_minutes < end_minutes
    else:
        is_allowed = current_minutes >= start_minutes or current_minutes < end_minutes

    if is_allowed:
        return True, None

    return False, f"Ngoài khung giờ tự động phản hồi {page_config.message_reply_start_time}-{page_config.message_reply_end_time}."


def _get_message_cooldown_reason(db: Session, page_id: str, sender_id: str, cooldown_minutes: int) -> str | None:
    if cooldown_minutes <= 0:
        return None

    latest_log = (
        db.query(InboxMessageLog)
        .filter(
            InboxMessageLog.page_id == page_id,
            InboxMessageLog.sender_id == sender_id,
            InboxMessageLog.status.in_([InteractionStatus.pending, InteractionStatus.replied]),
        )
        .order_by(InboxMessageLog.updated_at.desc(), InboxMessageLog.created_at.desc())
        .first()
    )
    if not latest_log:
        return None

    latest_time = latest_log.updated_at or latest_log.created_at
    if not latest_time:
        return None

    if latest_time >= utc_now() - timedelta(minutes=cooldown_minutes):
        return f"Đang trong thời gian chờ {cooldown_minutes} phút cho người gửi này."

    return None


def _resolve_contact_name(
    page_config: FacebookPage | None,
    contact_id: str | None,
    *,
    fallback_name: str | None = None,
) -> str | None:
    preferred = (fallback_name or "").strip()
    if preferred:
        return preferred
    if not page_config or not page_config.long_lived_access_token or not contact_id:
        return None
    try:
        access_token = decrypt_secret(page_config.long_lived_access_token)
    except Exception:
        return None
    resolved_name = lookup_profile_name(contact_id, access_token)
    return (resolved_name or "").strip() or None


def _record_comment_event(db: Session, page_id: str, value: dict):
    comment_id = value.get("comment_id")
    message = value.get("message")
    post_id = value.get("post_id")
    sender_id = value.get("from", {}).get("id")
    sender_name = value.get("from", {}).get("name")

    if sender_id == page_id:
        return

    existing = db.query(InteractionLog).filter(InteractionLog.comment_id == comment_id).first()
    if existing:
        return

    page_config = db.query(FacebookPage).filter(FacebookPage.page_id == page_id).first()
    if not page_config:
        record_event(
            "webhook",
            "warning",
            "Nhận bình luận từ trang chưa cấu hình.",
            db=db,
            details={"page_id": page_id, "comment_id": comment_id},
        )
        return

    comment_auto_reply_enabled = page_config.comment_auto_reply_enabled is not False
    resolved_user_name = _resolve_contact_name(page_config, sender_id, fallback_name=sender_name)

    log = InteractionLog(
        page_id=page_id,
        post_id=post_id,
        comment_id=comment_id,
        user_id=sender_id,
        user_name=resolved_user_name,
        user_message=message,
        reply_mode="ai" if comment_auto_reply_enabled else "operator",
        status=InteractionStatus.pending,
    )
    if not comment_auto_reply_enabled:
        log.ai_reply = None
    db.add(log)
    db.commit()
    db.refresh(log)

    if not comment_auto_reply_enabled:
        record_event(
            "webhook",
            "info",
            "Đã ghi nhận bình luận mới nhưng không tự động phản hồi vì fanpage đang tắt chế độ này.",
            db=db,
            details={"comment_id": comment_id, "page_id": page_id},
        )
        return

    task = enqueue_task(
        db,
        task_type=TASK_TYPE_COMMENT_REPLY,
        entity_type="interaction_log",
        entity_id=str(log.id),
        payload={"interaction_log_id": str(log.id)},
        priority=10,
        max_attempts=3,
    )
    record_event(
        "webhook",
        "info",
        "Đã ghi nhận bình luận mới và đưa vào hàng đợi phản hồi.",
        db=db,
        details={"comment_id": comment_id, "page_id": page_id, "task_id": str(task.id)},
    )


def _record_message_event(db: Session, page_id: str, event: dict):
    sender_id = event.get("sender", {}).get("id")
    recipient_id = event.get("recipient", {}).get("id")
    message = event.get("message") or {}
    message_id = message.get("mid")
    text = (message.get("text") or "").strip()

    if not sender_id or sender_id == page_id or message.get("is_echo") or not text or not message_id:
        return

    existing = db.query(InboxMessageLog).filter(InboxMessageLog.facebook_message_id == message_id).first()
    if existing:
        return

    page_config = db.query(FacebookPage).filter(FacebookPage.page_id == page_id).first()
    if not page_config:
        record_event(
            "webhook",
            "warning",
            "Nhận tin nhắn inbox từ trang chưa cấu hình.",
            db=db,
            details={"page_id": page_id, "message_id": message_id},
        )
        return

    sender_name = _resolve_contact_name(page_config, sender_id)

    conversation = get_or_create_inbox_conversation(
        db,
        page_id=page_id,
        sender_id=sender_id,
        sender_name=sender_name,
        recipient_id=recipient_id,
    )
    touch_conversation_with_customer_message(
        conversation,
        message_id=message_id,
        recipient_id=recipient_id,
    )

    local_now = get_local_now()
    schedule_allowed, schedule_reason = _is_within_message_schedule(page_config, local_now)
    cooldown_reason = _get_message_cooldown_reason(
        db,
        page_id=page_id,
        sender_id=sender_id,
        cooldown_minutes=page_config.message_reply_cooldown_minutes or 0,
    )
    handoff_reason = (
        "Cuộc trò chuyện này đang được chuyển cho nhân viên hỗ trợ."
        if conversation.status == ConversationStatus.operator_active or conversation.needs_human_handoff
        else None
    )
    should_auto_reply = bool(
        conversation.status == ConversationStatus.ai_active
        and not conversation.needs_human_handoff
        and page_config.message_auto_reply_enabled
        and schedule_allowed
        and not cooldown_reason
        and not handoff_reason
    )
    ignored_reason = None
    if not page_config.message_auto_reply_enabled:
        ignored_reason = "Tự động phản hồi inbox đang tắt cho fanpage này."
    elif handoff_reason:
        ignored_reason = handoff_reason
    elif not schedule_allowed:
        ignored_reason = schedule_reason
    elif cooldown_reason:
        ignored_reason = cooldown_reason

    log = InboxMessageLog(
        page_id=page_id,
        conversation_id=conversation.id,
        facebook_message_id=message_id,
        sender_id=sender_id,
        sender_name=sender_name,
        recipient_id=recipient_id,
        user_message=text,
        status=InteractionStatus.pending if should_auto_reply else InteractionStatus.ignored,
        ai_reply=None if should_auto_reply else ignored_reason,
    )
    db.add(log)
    db.commit()
    db.refresh(log)

    if not should_auto_reply:
        record_event(
            "webhook",
            "info",
            "Đã ghi nhận tin nhắn inbox mới nhưng không đưa vào tự động phản hồi.",
            db=db,
            details={
                "page_id": page_id,
                "message_id": message_id,
                "sender_id": sender_id,
                "reason": ignored_reason,
                "local_time": local_now.isoformat(),
            },
        )
        return

    task = enqueue_task(
        db,
        task_type=TASK_TYPE_MESSAGE_REPLY,
        entity_type="inbox_message_log",
        entity_id=str(log.id),
        payload={"message_log_id": str(log.id)},
        priority=15,
        max_attempts=3,
    )
    record_event(
        "webhook",
        "info",
        "Đã ghi nhận tin nhắn inbox mới và đưa vào hàng đợi phản hồi.",
        db=db,
        details={"page_id": page_id, "message_id": message_id, "sender_id": sender_id, "task_id": str(task.id)},
    )


@router.get("/fb")
def verify_webhook(request: Request, db: Session = Depends(get_db)):
    mode = request.query_params.get("hub.mode")
    token = request.query_params.get("hub.verify_token")
    challenge = request.query_params.get("hub.challenge")
    verify_token = resolve_runtime_value("FB_VERIFY_TOKEN", db=db)

    if mode == "subscribe" and token == verify_token:
        return PlainTextResponse(content=challenge)
    raise HTTPException(status_code=403, detail="Mã xác minh webhook không hợp lệ")


@router.post("/fb")
async def handle_webhook(request: Request, db: Session = Depends(get_db)):
    body = await request.body()
    signature = request.headers.get("x-hub-signature-256")
    app_secret = resolve_runtime_value("FB_APP_SECRET", db=db)
    if app_secret and not verify_facebook_signature(body, signature, app_secret=app_secret):
        raise HTTPException(status_code=403, detail="Chữ ký webhook không hợp lệ")

    try:
        payload = json.loads(body.decode("utf-8"))
    except JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Dữ liệu webhook không phải JSON hợp lệ.") from exc

    if payload.get("object") == "page":
        for entry in payload.get("entry", []):
            page_id = entry.get("id")
            for event in entry.get("messaging", []):
                _record_message_event(db, page_id, event)
            for change in entry.get("changes", []):
                value = change.get("value", {})

                if change.get("field") == "feed" and value.get("item") == "status" and value.get("message") == "Example post content.":
                    record_event(
                        "webhook",
                        "info",
                        "Đã nhận sự kiện thử webhook từ Facebook.",
                        db=db,
                        details={"page_id": page_id},
                    )
                    continue

                if change.get("field") == "feed" and value.get("item") == "comment" and value.get("verb") == "add":
                    _record_comment_event(db, page_id, value)

    return {"status": "đã nhận"}


@router.get("/logs")
def get_interaction_logs(
    db: Session = Depends(get_db),
    _: User = Depends(require_authenticated_user),
):
    logs = db.query(InteractionLog).order_by(InteractionLog.created_at.desc()).limit(50).all()
    reply_user_map = _load_user_map(db, [log.reply_author_user_id for log in logs])
    return [serialize_interaction_log(log, reply_author=reply_user_map.get(log.reply_author_user_id)) for log in logs]


@router.delete("/comments/{interaction_log_id}")
def delete_comment_interaction(
    interaction_log_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authenticated_user),
):
    log = _get_interaction_log_or_404(db, interaction_log_id)
    page_config = db.query(FacebookPage).filter(FacebookPage.page_id == log.page_id).first()
    if not page_config or not page_config.long_lived_access_token:
        raise HTTPException(status_code=400, detail="Trang Facebook chưa có Page Access Token hợp lệ để xóa bình luận.")

    access_token = decrypt_secret(page_config.long_lived_access_token)
    delete_response = delete_comment(log.comment_id, access_token)
    if not delete_response or delete_response.get("error"):
        raise HTTPException(
            status_code=502,
            detail=delete_response.get("error") if isinstance(delete_response, dict) else "Không thể xóa bình luận trên Facebook.",
        )

    deleted_task_count = _delete_related_tasks_or_raise(
        db,
        entity_type="interaction_log",
        entity_id=str(log.id),
    )
    comment_id = log.comment_id
    page_id = log.page_id
    db.delete(log)
    db.commit()

    record_event(
        "webhook",
        "info",
        "Đã xóa bình luận trên Facebook và khỏi dashboard.",
        db=db,
        actor_user_id=str(current_user.id),
        details={
            "interaction_log_id": interaction_log_id,
            "comment_id": comment_id,
            "page_id": page_id,
            "deleted_task_count": deleted_task_count,
        },
    )

    return {"message": "Đã xóa bình luận trên Facebook page và khỏi dashboard."}


@router.patch("/comments/{interaction_log_id}")
def update_comment_interaction(
    interaction_log_id: str,
    payload: CommentInteractionUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authenticated_user),
):
    log = _get_interaction_log_or_404(db, interaction_log_id)
    if log.status == InteractionStatus.replied:
        raise HTTPException(status_code=400, detail="Bình luận này đã được phản hồi rồi.")

    log.reply_mode = payload.reply_mode
    log.status = InteractionStatus.pending
    log.last_error = None
    if payload.reply_mode == "ai":
        log.reply_source = None
        log.reply_author_user_id = None
        log.ai_reply = None
        task = enqueue_task(
            db,
            task_type=TASK_TYPE_COMMENT_REPLY,
            entity_type="interaction_log",
            entity_id=str(log.id),
            payload={"interaction_log_id": str(log.id)},
            priority=10,
            max_attempts=3,
        )
        message = "Đã chuyển bình luận sang AI phản hồi."
    else:
        task = None
        message = "Đã chuyển bình luận sang operator phản hồi."

    db.commit()
    db.refresh(log)

    record_event(
        "webhook",
        "info",
        "Đã cập nhật chế độ phản hồi bình luận.",
        db=db,
        actor_user_id=str(current_user.id),
        details={
            "interaction_log_id": str(log.id),
            "comment_id": log.comment_id,
            "page_id": log.page_id,
            "reply_mode": log.reply_mode,
            "task_id": str(task.id) if task else None,
        },
    )

    reply_user_map = _load_user_map(db, [log.reply_author_user_id])
    return {
        "message": message,
        "log": serialize_interaction_log(log, reply_author=reply_user_map.get(log.reply_author_user_id)),
    }


@router.post("/comments/{interaction_log_id}/draft")
def generate_comment_reply_draft(
    interaction_log_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authenticated_user),
):
    log = _get_interaction_log_or_404(db, interaction_log_id)
    if log.status == InteractionStatus.replied:
        raise HTTPException(status_code=400, detail="BÃ¬nh luáº­n nÃ y Ä‘Ã£ Ä‘Æ°á»£c pháº£n há»“i rá»“i.")

    page_config = db.query(FacebookPage).filter(FacebookPage.page_id == log.page_id).first()
    prompt_override = page_config.comment_ai_prompt if page_config else None
    draft_text = generate_reply(
        log.user_message,
        channel="comment",
        prompt_override=prompt_override,
    ).strip()
    if not draft_text:
        raise HTTPException(status_code=502, detail="KhÃ´ng táº¡o Ä‘Æ°á»£c gá»£i Ã½ AI cho bÃ¬nh luáº­n nÃ y.")

    log.reply_mode = "operator"
    log.reply_source = None
    log.reply_author_user_id = None
    log.facebook_reply_comment_id = None
    log.ai_reply = draft_text
    log.status = InteractionStatus.pending
    log.last_error = None
    db.commit()
    db.refresh(log)

    record_event(
        "webhook",
        "info",
        "ÄÃ£ táº¡o gá»£i Ã½ AI cho operator chá»‰nh sá»­a bÃ¬nh luáº­n.",
        db=db,
        actor_user_id=str(current_user.id),
        details={"interaction_log_id": str(log.id), "comment_id": log.comment_id, "page_id": log.page_id},
    )

    return {
        "message": "ÄÃ£ táº¡o gá»£i Ã½ AI. Báº¡n cÃ³ thá»ƒ chá»‰nh sá»­a ná»™i dung rá»“i gá»­i thá»§ cÃ´ng.",
        "log": serialize_interaction_log(log),
    }


@router.post("/comments/{interaction_log_id}/reply")
def send_manual_comment_reply(
    interaction_log_id: str,
    payload: CommentReplyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authenticated_user),
):
    log = _get_interaction_log_or_404(db, interaction_log_id)

    page_config = db.query(FacebookPage).filter(FacebookPage.page_id == log.page_id).first()
    if not page_config or not page_config.long_lived_access_token:
        raise HTTPException(status_code=400, detail="Trang Facebook chưa có Page Access Token hợp lệ.")

    access_token = decrypt_secret(page_config.long_lived_access_token)
    message_text = payload.message.strip()
    if not message_text:
        raise HTTPException(status_code=400, detail="Nội dung phản hồi không được để trống.")

    is_replacing_reply = log.status == InteractionStatus.replied
    if is_replacing_reply:
        if not log.facebook_reply_comment_id:
            raise HTTPException(
                status_code=400,
                detail="Không thể thay thế phản hồi đã gửi vì thiếu ID của reply comment. Hãy xóa tay trên Facebook rồi gửi lại.",
            )
        delete_response = delete_comment(log.facebook_reply_comment_id, access_token)
        if not delete_response or delete_response.get("error"):
            raise HTTPException(
                status_code=502,
                detail=delete_response.get("error") if isinstance(delete_response, dict) else "Không thể xóa phản hồi cũ trên Facebook.",
            )

    response = reply_to_comment(log.comment_id, message_text, access_token)
    if not response or response.get("error"):
        log.status = InteractionStatus.failed
        log.facebook_reply_comment_id = None
        log.last_error = response.get("error") if isinstance(response, dict) else "Không thể phản hồi bình luận."
        db.commit()
        raise HTTPException(status_code=502, detail=log.last_error or "Không thể phản hồi bình luận.")

    log.reply_mode = "operator"
    log.reply_source = "operator"
    log.reply_author_user_id = current_user.id
    log.ai_reply = message_text
    log.facebook_reply_comment_id = response.get("id") if isinstance(response, dict) else None
    log.status = InteractionStatus.replied
    log.last_error = None
    db.commit()
    db.refresh(log)

    record_event(
        "webhook",
        "info",
        "Operator đã phản hồi bình luận thủ công.",
        db=db,
        actor_user_id=str(current_user.id),
        details={"interaction_log_id": str(log.id), "comment_id": log.comment_id, "page_id": log.page_id},
    )

    reply_user_map = _load_user_map(db, [log.reply_author_user_id])
    return {
        "message": "Đã thay thế phản hồi cũ trên Facebook." if is_replacing_reply else "Đã gửi phản hồi thủ công cho bình luận.",
        "log": serialize_interaction_log(log, reply_author=reply_user_map.get(log.reply_author_user_id)),
    }


@router.get("/messages")
def get_message_logs(
    db: Session = Depends(get_db),
    _: User = Depends(require_authenticated_user),
):
    logs = db.query(InboxMessageLog).order_by(InboxMessageLog.created_at.desc()).limit(50).all()
    conversation_ids = [log.conversation_id for log in logs if log.conversation_id]
    conversations = {}
    if conversation_ids:
        rows = db.query(InboxConversation).filter(InboxConversation.id.in_(conversation_ids)).all()
        conversations = {row.id: row for row in rows}
    reply_user_map = _load_user_map(db, [log.reply_author_user_id for log in logs])
    return [
        serialize_message_log(
            log,
            conversations.get(log.conversation_id),
            reply_author=reply_user_map.get(log.reply_author_user_id),
        )
        for log in logs
    ]


@router.delete("/messages/{message_log_id}")
def delete_message_log(
    message_log_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authenticated_user),
):
    try:
        log_uuid = uuid.UUID(message_log_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Mã tin nhắn không hợp lệ.") from exc

    log = db.query(InboxMessageLog).filter(InboxMessageLog.id == log_uuid).first()
    if not log:
        raise HTTPException(status_code=404, detail="Không tìm thấy đoạn tin nhắn cần xóa.")

    if (log.user_message or "").strip():
        raise HTTPException(
            status_code=400,
            detail="Không được xóa tin nhắn của khách hàng từ dashboard. Meta Messenger API hiện không hỗ trợ xóa tin nhắn này qua tích hợp.",
        )

    if log.facebook_reply_message_id:
        raise HTTPException(
            status_code=400,
            detail="Meta Messenger API hiện không hỗ trợ xóa tin nhắn fanpage đã gửi. Hãy gửi một tin nhắn đính chính mới thay vì xóa.",
        )

    deleted_task_count = _delete_related_tasks_or_raise(
        db,
        entity_type="inbox_message_log",
        entity_id=str(log.id),
    )
    conversation_id = str(log.conversation_id) if log.conversation_id else None
    page_id = log.page_id
    sender_id = log.sender_id
    conversation_uuid = log.conversation_id

    db.delete(log)
    deleted_conversation_id = None
    if conversation_uuid:
        remaining_count = (
            db.query(InboxMessageLog)
            .filter(InboxMessageLog.conversation_id == conversation_uuid, InboxMessageLog.id != log_uuid)
            .count()
        )
        if remaining_count == 0:
            conversation = db.query(InboxConversation).filter(InboxConversation.id == conversation_uuid).first()
            if conversation:
                deleted_conversation_id = str(conversation.id)
                db.delete(conversation)

    db.commit()

    record_event(
        "webhook",
        "info",
        "Đã xóa đoạn tin nhắn khỏi dashboard.",
        db=db,
        actor_user_id=str(current_user.id),
        details={
            "message_log_id": message_log_id,
            "conversation_id": conversation_id,
            "page_id": page_id,
            "sender_id": sender_id,
            "deleted_task_count": deleted_task_count,
            "deleted_conversation_id": deleted_conversation_id,
        },
    )

    return {
        "message": "Đã xóa đoạn tin nhắn khỏi dashboard.",
        "deleted_conversation_id": deleted_conversation_id,
    }


@router.delete("/conversations/{conversation_id}/remove")
def moderate_and_remove_conversation(
    conversation_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authenticated_user),
):
    try:
        conversation_uuid = uuid.UUID(conversation_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Mã conversation không hợp lệ.") from exc

    conversation = db.query(InboxConversation).filter(InboxConversation.id == conversation_uuid).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Không tìm thấy conversation cần xử lý.")

    page_config = db.query(FacebookPage).filter(FacebookPage.page_id == conversation.page_id).first()
    if not page_config or not page_config.long_lived_access_token:
        raise HTTPException(status_code=400, detail="Trang Facebook chưa có Page Access Token hợp lệ.")

    access_token = decrypt_secret(page_config.long_lived_access_token)
    moderation_response = moderate_conversation(
        conversation.page_id,
        conversation.sender_id,
        access_token,
        actions=("move_to_spam", "block_user"),
    )
    if not moderation_response or moderation_response.get("error"):
        raise HTTPException(
            status_code=502,
            detail=moderation_response.get("error") if isinstance(moderation_response, dict) else "Không thể chặn người gửi trên Facebook.",
        )

    purge_result = _purge_conversation_or_raise(db, conversation=conversation)

    record_event(
        "webhook",
        "info",
        "Đã chặn người gửi, chuyển hội thoại vào spam trên Facebook và ẩn khỏi dashboard.",
        db=db,
        actor_user_id=str(current_user.id),
        details={
            "conversation_id": conversation_id,
            "page_id": purge_result["page_id"],
            "sender_id": purge_result["sender_id"],
            "deleted_log_count": purge_result["deleted_log_count"],
            "deleted_task_count": purge_result["deleted_task_count"],
            "moderation_actions": ["move_to_spam", "block_user"],
        },
    )

    return {
        "message": "Đã chặn người gửi, chuyển hội thoại vào spam trên Facebook và ẩn khỏi dashboard.",
        "deleted_conversation_id": purge_result["conversation_id"],
    }


@router.delete("/conversations/{conversation_id}/hide")
def hide_conversation_from_dashboard(
    conversation_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authenticated_user),
):
    try:
        conversation_uuid = uuid.UUID(conversation_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Mã conversation không hợp lệ.") from exc

    conversation = db.query(InboxConversation).filter(InboxConversation.id == conversation_uuid).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Không tìm thấy conversation cần ẩn.")

    purge_result = _purge_conversation_or_raise(db, conversation=conversation)

    record_event(
        "webhook",
        "info",
        "Đã ẩn conversation khỏi dashboard mà không thay đổi gì trên Facebook.",
        db=db,
        actor_user_id=str(current_user.id),
        details={
            "conversation_id": purge_result["conversation_id"],
            "page_id": purge_result["page_id"],
            "sender_id": purge_result["sender_id"],
            "deleted_log_count": purge_result["deleted_log_count"],
            "deleted_task_count": purge_result["deleted_task_count"],
        },
    )

    return {
        "message": "Đã ẩn conversation khỏi dashboard. Cuộc chat trên Facebook vẫn được giữ nguyên.",
        "deleted_conversation_id": purge_result["conversation_id"],
    }


@router.get("/conversations")
def get_message_conversations(
    status: str = Query(default="all"),
    limit: int = Query(default=60, ge=1, le=200),
    db: Session = Depends(get_db),
    _: User = Depends(require_authenticated_user),
):
    if status != "all":
        try:
            ConversationStatus(status)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Trạng thái conversation không hợp lệ.") from exc
    return {"conversations": _get_conversation_rows(db, status=status, limit=limit)}


@router.get("/conversations/{conversation_id}")
def get_message_conversation_detail(
    conversation_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_authenticated_user),
):
    try:
        conversation_uuid = uuid.UUID(conversation_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Mã conversation không hợp lệ.") from exc

    conversation = db.query(InboxConversation).filter(InboxConversation.id == conversation_uuid).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Không tìm thấy cuộc trò chuyện.")

    logs = (
        db.query(InboxMessageLog)
        .filter(InboxMessageLog.conversation_id == conversation_uuid)
        .order_by(InboxMessageLog.created_at.asc())
        .all()
    )
    reply_user_map = _load_user_map(
        db,
        [conversation.assigned_to_user_id] + [log.reply_author_user_id for log in logs],
    )
    latest_log = logs[-1] if logs else None
    return {
        "conversation": serialize_conversation_item(
            conversation,
            latest_log=latest_log,
            assigned_user=reply_user_map.get(conversation.assigned_to_user_id),
            message_count=len(logs),
        ),
        "logs": [
            serialize_message_log(
                log,
                conversation,
                reply_author=reply_user_map.get(log.reply_author_user_id),
            )
            for log in logs
        ],
    }


@router.patch("/conversations/{conversation_id}")
def update_message_conversation(
    conversation_id: str,
    payload: ConversationUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authenticated_user),
):
    try:
        conversation_uuid = uuid.UUID(conversation_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Mã conversation không hợp lệ.") from exc

    conversation = db.query(InboxConversation).filter(InboxConversation.id == conversation_uuid).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Không tìm thấy cuộc trò chuyện cần cập nhật.")

    if payload.assigned_to_user_id is not None:
        assigned_user_id = payload.assigned_to_user_id.strip()
        if assigned_user_id:
            try:
                assigned_uuid = uuid.UUID(assigned_user_id)
            except ValueError as exc:
                raise HTTPException(status_code=400, detail="Mã người xử lý không hợp lệ.") from exc
            assigned_user = db.query(User).filter(User.id == assigned_uuid, User.is_active.is_(True)).first()
            if not assigned_user:
                raise HTTPException(status_code=404, detail="Không tìm thấy nhân viên để gán xử lý.")
            if current_user.role.value != "admin" and assigned_user.id != current_user.id:
                raise HTTPException(status_code=403, detail="Bạn chỉ có thể nhận cuộc chat về cho chính mình.")
            conversation.assigned_to_user_id = assigned_user.id
        else:
            conversation.assigned_to_user_id = None

    if payload.internal_note is not None:
        conversation.internal_note = (payload.internal_note or "").strip()[:1000] or None

    if payload.status is not None:
        _set_conversation_status(
            conversation,
            status=payload.status,
            handoff_reason=payload.handoff_reason,
        )
        if payload.status == ConversationStatus.ai_active and current_user.role.value != "admin":
            conversation.assigned_to_user_id = current_user.id
    elif payload.handoff_reason is not None and conversation.status == ConversationStatus.operator_active:
        conversation.handoff_reason = (payload.handoff_reason or "").strip()[:300] or None

    db.commit()
    db.refresh(conversation)
    assigned_user_map = _load_user_map(db, [conversation.assigned_to_user_id])

    record_event(
        "webhook",
        "info",
        "Đã cập nhật thông tin vận hành của cuộc trò chuyện inbox.",
        db=db,
        actor_user_id=str(current_user.id),
        details={
            "conversation_id": str(conversation.id),
            "page_id": conversation.page_id,
            "sender_id": conversation.sender_id,
            "status": conversation.status.value if hasattr(conversation.status, "value") else conversation.status,
            "assigned_to_user_id": str(conversation.assigned_to_user_id) if conversation.assigned_to_user_id else None,
        },
    )

    return {
        "message": "Đã cập nhật cuộc trò chuyện.",
        "conversation": serialize_conversation(
            conversation,
            assigned_user=assigned_user_map.get(conversation.assigned_to_user_id),
        ),
    }


@router.post("/conversations/{conversation_id}/reply")
def send_manual_message_reply(
    conversation_id: str,
    payload: ConversationReplyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authenticated_user),
):
    try:
        conversation_uuid = uuid.UUID(conversation_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Mã conversation không hợp lệ.") from exc

    conversation = db.query(InboxConversation).filter(InboxConversation.id == conversation_uuid).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Không tìm thấy cuộc trò chuyện.")

    page_config = db.query(FacebookPage).filter(FacebookPage.page_id == conversation.page_id).first()
    if not page_config or not page_config.long_lived_access_token:
        raise HTTPException(status_code=400, detail="Trang Facebook chưa có Page Access Token hợp lệ.")

    access_token = decrypt_secret(page_config.long_lived_access_token)
    message_text = payload.message.strip()
    if not message_text:
        raise HTTPException(status_code=400, detail="Nội dung phản hồi không được để trống.")

    response = send_page_message(conversation.sender_id, message_text, access_token)
    if not response or response.get("error"):
        raise HTTPException(status_code=502, detail=response.get("error") if isinstance(response, dict) else "Không thể gửi phản hồi qua Facebook.")

    reply_message_id = response.get("message_id") or response.get("id") or f"manual:{uuid.uuid4()}"
    log = InboxMessageLog(
        page_id=conversation.page_id,
        conversation_id=conversation.id,
        facebook_message_id=f"outbound:{reply_message_id}",
        sender_id=conversation.sender_id,
        recipient_id=conversation.recipient_id or conversation.page_id,
        user_message=None,
        ai_reply=message_text,
        facebook_reply_message_id=reply_message_id,
        reply_source="operator",
        reply_author_user_id=current_user.id,
        status=InteractionStatus.replied,
        last_error=None,
    )
    db.add(log)
    conversation.latest_reply_message_id = reply_message_id
    conversation.last_operator_reply_at = utc_now()
    conversation.assigned_to_user_id = current_user.id
    if payload.mark_resolved:
        _set_conversation_status(conversation, status=ConversationStatus.resolved)
    else:
        _set_conversation_status(
            conversation,
            status=ConversationStatus.operator_active,
            handoff_reason=conversation.handoff_reason or "Operator đang tiếp nhận cuộc trò chuyện này.",
        )
    db.commit()
    db.refresh(log)
    db.refresh(conversation)

    assigned_user_map = _load_user_map(db, [conversation.assigned_to_user_id, current_user.id])
    record_event(
        "webhook",
        "info",
        "Operator đã phản hồi thủ công một cuộc trò chuyện inbox.",
        db=db,
        actor_user_id=str(current_user.id),
        details={
            "conversation_id": str(conversation.id),
            "page_id": conversation.page_id,
            "sender_id": conversation.sender_id,
            "status": conversation.status.value if hasattr(conversation.status, "value") else conversation.status,
        },
    )

    return {
        "message": "Đã gửi phản hồi thủ công thành công.",
        "conversation": serialize_conversation(
            conversation,
            assigned_user=assigned_user_map.get(conversation.assigned_to_user_id),
        ),
        "log": serialize_message_log(log, conversation, reply_author=assigned_user_map.get(current_user.id)),
    }


@router.patch("/messages/{conversation_id}/handoff")
def update_message_conversation_handoff(
    conversation_id: str,
    payload: ConversationHandoffUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authenticated_user),
):
    try:
        conversation_uuid = uuid.UUID(conversation_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Mã conversation không hợp lệ.") from exc

    conversation = db.query(InboxConversation).filter(InboxConversation.id == conversation_uuid).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Không tìm thấy cuộc trò chuyện cần cập nhật.")

    _set_conversation_status(
        conversation,
        status=ConversationStatus.operator_active if payload.needs_human_handoff else ConversationStatus.resolved,
        handoff_reason=payload.handoff_reason,
    )
    conversation.assigned_to_user_id = current_user.id if payload.needs_human_handoff else conversation.assigned_to_user_id
    db.commit()
    db.refresh(conversation)
    assigned_user_map = _load_user_map(db, [conversation.assigned_to_user_id])

    record_event(
        "webhook",
        "info",
        "Đã cập nhật trạng thái handoff của cuộc trò chuyện inbox.",
        db=db,
        actor_user_id=str(current_user.id),
        details={
            "conversation_id": str(conversation.id),
            "page_id": conversation.page_id,
            "sender_id": conversation.sender_id,
            "needs_human_handoff": conversation.needs_human_handoff,
        },
    )

    return {
        "message": "Đã cập nhật trạng thái cuộc trò chuyện.",
        "conversation": serialize_conversation(
            conversation,
            assigned_user=assigned_user_map.get(conversation.assigned_to_user_id),
        ),
    }
