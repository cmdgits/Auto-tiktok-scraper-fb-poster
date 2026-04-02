from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.models.models import FacebookPage
from app.services.ai_generator import (
    generate_message_reply_with_context,
    generate_reply,
)
from app.services.inbox_memory import normalize_customer_facts
from app.services.page_video_search import (
    lookup_page_video_knowledge,
    merge_page_knowledge_context,
    select_relevant_knowledge_sections,
)


def _build_page_identity_context(page_config: FacebookPage) -> str:
    page_name = (page_config.page_name or "").strip() or "Facebook page"
    return f"Page identity:\n- Page name: {page_name}\n- Page ID: {page_config.page_id}"


def _split_keywords(raw_value: str | None) -> tuple[str, ...]:
    if not raw_value:
        return ()
    return tuple(part.strip() for part in raw_value.replace(";", ",").replace("\n", ",").split(",") if part.strip())


def _ensure_follow_up_question(reply: str) -> str:
    text = (reply or "").strip()
    if not text:
        return "Dạ mình cần em hỗ trợ thêm phần nào cho mình ạ?"
    if "?" in text[-80:]:
        return text
    return f"{text} Mình cần em hỗ trợ thêm phần nào cho mình ạ?"


def build_comment_reply_plan(
    db: Session,
    *,
    page_config: FacebookPage,
    user_message: str,
) -> dict[str, Any]:
    lookup_result = lookup_page_video_knowledge(
        db,
        page_id=page_config.page_id,
        user_message=user_message,
    )
    knowledge_context = merge_page_knowledge_context(
        _build_page_identity_context(page_config),
        select_relevant_knowledge_sections(page_config.ai_knowledge_base, user_message=user_message),
        lookup_result.get("knowledge_block"),
    )
    direct_reply = (lookup_result.get("direct_reply") or "").strip()
    if direct_reply:
        return {
            "reply": _ensure_follow_up_question(direct_reply),
            "reply_mode": "lookup",
            "lookup_used": True,
            "lookup_matches": lookup_result.get("matches") or [],
            "knowledge_context": knowledge_context,
            "intent": lookup_result.get("intent") or "video_lookup",
            "summary": lookup_result.get("summary") or "",
        }

    reply_text = generate_reply(
        user_message,
        channel="comment",
        prompt_override=page_config.comment_ai_prompt,
        knowledge_context=knowledge_context,
        page_name=page_config.page_name,
        agent_name=page_config.ai_agent_name,
    )
    return {
        "reply": reply_text,
        "reply_mode": "ai",
        "lookup_used": bool(lookup_result.get("matches")),
        "lookup_matches": lookup_result.get("matches") or [],
        "knowledge_context": knowledge_context,
        "intent": lookup_result.get("intent") or "comment_reply",
        "summary": lookup_result.get("summary") or "",
    }


def build_message_reply_plan(
    db: Session,
    *,
    page_config: FacebookPage,
    user_message: str,
    conversation_summary: str | None = None,
    recent_turns: list[dict[str, str]] | None = None,
    customer_facts: dict[str, Any] | None = None,
) -> dict[str, Any]:
    lookup_result = lookup_page_video_knowledge(
        db,
        page_id=page_config.page_id,
        user_message=user_message,
    )
    normalized_facts = normalize_customer_facts(customer_facts)
    knowledge_context = merge_page_knowledge_context(
        _build_page_identity_context(page_config),
        select_relevant_knowledge_sections(page_config.ai_knowledge_base, user_message=user_message),
        lookup_result.get("knowledge_block"),
    )
    direct_reply = (lookup_result.get("direct_reply") or "").strip()
    if direct_reply:
        return {
            "reply": _ensure_follow_up_question(direct_reply),
            "summary": lookup_result.get("summary") or conversation_summary or "",
            "intent": lookup_result.get("intent") or "video_lookup",
            "customer_facts": {**normalized_facts, **(lookup_result.get("customer_facts") or {})},
            "handoff": False,
            "handoff_reason": None,
            "reply_mode": "lookup",
            "lookup_used": True,
            "lookup_matches": lookup_result.get("matches") or [],
            "knowledge_context": knowledge_context,
        }

    ai_payload = generate_message_reply_with_context(
        user_message,
        prompt_override=page_config.message_ai_prompt,
        knowledge_context=knowledge_context,
        conversation_summary=conversation_summary,
        recent_turns=recent_turns,
        customer_facts=normalized_facts,
        page_name=page_config.page_name,
        agent_name=page_config.ai_agent_name,
        handoff_keywords=_split_keywords(page_config.handoff_keywords),
        negative_keywords=_split_keywords(page_config.negative_keywords),
    )
    ai_payload["reply_mode"] = "ai"
    ai_payload["lookup_used"] = bool(lookup_result.get("matches"))
    ai_payload["lookup_matches"] = lookup_result.get("matches") or []
    ai_payload["knowledge_context"] = knowledge_context
    return ai_payload


def _ensure_follow_up_question(reply: str) -> str:
    text = (reply or "").strip()
    if not text:
        return "D\u1ea1 m\u00ecnh c\u1ea7n page h\u1ed7 tr\u1ee3 th\u00eam g\u00ec n\u1eefa kh\u00f4ng \u1ea1?"
    if "?" in text[-80:]:
        return text
    return f"{text} M\u00ecnh c\u1ea7n page h\u1ed7 tr\u1ee3 th\u00eam g\u00ec n\u1eefa kh\u00f4ng \u1ea1?"
