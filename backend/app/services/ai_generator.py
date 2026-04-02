import json
import re
import unicodedata
from typing import Any

from app.core.config import settings
from app.services.http_client import request_with_retries
from app.services.observability import log_structured
from app.services.runtime_settings import resolve_runtime_value

GEMINI_MODEL = "gemini-3-flash-preview"
OPENAI_MODEL = "gpt-5.4-mini"
OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
DEFAULT_COMMENT_REPLY_PROMPT = (
    "You are a customer support staff member replying on behalf of a Facebook page in a public comment thread. "
    "Answer as a real support agent, not as a generic AI assistant. "
    "Use only the provided page knowledge and recent customer context for product, service, price, policy, schedule, stock, promotion, and operational facts. "
    "Never invent page-specific facts, prices, promotions, or product details that are not in the provided context. "
    "If information is missing, say so clearly and ask one short follow-up question at most. "
    "When replying in Vietnamese, always write proper Vietnamese with full diacritics. "
    "For short compliments, greetings, or emotional reactions, reply in 1-2 short sentences like a real admin. "
    "Keep the reply short, natural, friendly, and suitable for a public comment. "
    "Return only the final reply text."
)
DEFAULT_MESSAGE_REPLY_PROMPT = (
    "You are a customer support staff member replying inside a Facebook page inbox. "
    "Answer like a real support agent who remembers the conversation, not like a generic AI assistant. "
    "Use only the provided page knowledge, matched page content, customer facts, and recent conversation context for product, service, price, policy, schedule, stock, promotion, and operational facts. "
    "Never invent page-specific facts, prices, promotions, or product details that are not in the provided context. "
    "If something is missing, say what is missing and ask at most one short clarifying question only when it helps. "
    "When replying in Vietnamese, always write proper Vietnamese with full diacritics. "
    "Keep the reply natural, warm, concise, and useful. "
    "Return only the final message text."
)
DEFAULT_HANDOFF_KEYWORDS = (
    "quan ly",
    "người thật",
    "nguoi that",
    "nhan vien",
    "nhân viên",
    "ky thuat",
    "kỹ thuật",
    "gọi lại",
    "goi lai",
    "khiếu nại",
    "khieu nai",
    "hoàn tiền",
    "hoan tien",
    "refund",
)
DEFAULT_NEGATIVE_KEYWORDS = (
    "bực",
    "buc",
    "khó chịu",
    "kho chiu",
    "tệ",
    "te",
    "lỗi",
    "loi",
    "hỏng",
    "hong",
    "lừa đảo",
    "lua dao",
    "không hài lòng",
    "khong hai long",
    "phàn nàn",
    "phan nan",
)
CAPTION_TIKTOK_TERMS = (
    "tiktok",
    "titkok",
    "fyp",
    "fy",
    "xuhuong",
    "xuhuong",
    "foryou",
    "foru",
    "douyin",
    "trendingtiktok",
    "viral_tiktok",
    "tiktokvn",
)
CAPTION_STOPWORDS = {
    "anh",
    "chi",
    "cho",
    "cua",
    "dang",
    "day",
    "di",
    "duoc",
    "hay",
    "hom",
    "hien",
    "khong",
    "lam",
    "la",
    "len",
    "minh",
    "mot",
    "nay",
    "nguoi",
    "nha",
    "nhe",
    "qua",
    "roi",
    "that",
    "the",
    "thi",
    "thu",
    "tren",
    "vay",
    "va",
    "voi",
}
CAPTION_FALLBACK_HASHTAGS = (
    "videohay",
    "giaitri",
    "xemlagi",
    "khampha",
    "reelsviet",
)

def _merge_prompt_instructions(default_prompt: str, prompt_override: str | None = None) -> str:
    extra_prompt = (prompt_override or "").strip()
    if not extra_prompt:
        return default_prompt
    return (
        f"{default_prompt}\n\n"
        "Optional page-specific notes below may add terminology, business facts, or preferred phrasing. "
        "They must not override the core answering policy above. "
        "If these notes conflict with being direct, helpful, accurate, or with the rule against inventing page-specific facts, ignore the conflicting part.\n\n"
        f"Page-specific notes:\n{extra_prompt}"
    )

def _build_knowledge_block(knowledge_context: str | None) -> str:
    knowledge = (knowledge_context or "").strip()
    if not knowledge:
        return "Kh\u00f4ng c\u00f3 kho ki\u1ebfn th\u1ee9c fanpage b\u1ed5 sung."
    return knowledge


def _normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip())


def _slugify_caption_token(value: str) -> str:
    raw_value = (value or "").replace("Đ", "D").replace("đ", "d")
    normalized = unicodedata.normalize("NFKD", raw_value)
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "", ascii_value.lower())


def _strip_caption_hashtags(text: str) -> str:
    return re.sub(r"(^|\s)#[^\s#]+", " ", text or "")


def _strip_caption_urls(text: str) -> str:
    return re.sub(r"https?://\S+|www\.\S+", " ", text or "")


def _clean_caption_source_text(text: str) -> str:
    cleaned = _strip_caption_urls(_strip_caption_hashtags(text or ""))
    cleaned = re.sub(r"[_|]+", " ", cleaned)
    return _normalize_text(cleaned)


def _extract_caption_keywords(text: str, *, limit: int = 4) -> list[str]:
    words = re.findall(r"[0-9A-Za-zÀ-ỹĐđ]+", _clean_caption_source_text(text))
    keywords: list[str] = []
    seen: set[str] = set()
    for word in words:
        slug = _slugify_caption_token(word)
        if not slug or slug.isdigit() or len(slug) < 3:
            continue
        if slug in CAPTION_STOPWORDS or slug in CAPTION_TIKTOK_TERMS:
            continue
        if slug in seen:
            continue
        seen.add(slug)
        keywords.append(slug)
        if len(keywords) >= limit:
            break
    return keywords


def _truncate_caption_words(text: str, *, limit: int) -> str:
    words = _normalize_text(text).split()
    if not words:
        return ""
    if len(words) <= limit:
        return " ".join(words)
    return f"{' '.join(words[:limit]).rstrip(' ,.;:!?')}..."


def _sentence_case_text(text: str) -> str:
    normalized = _normalize_text(text)
    if not normalized:
        return ""
    return normalized[0].upper() + normalized[1:]


def _build_facebook_hashtags(original_caption: str, ai_text: str | None = None, *, limit: int = 5) -> str:
    hashtag_tokens: list[str] = []
    seen: set[str] = set()

    for candidate in re.findall(r"#([^\s#]+)", ai_text or ""):
        slug = _slugify_caption_token(candidate)
        if not slug or slug in CAPTION_TIKTOK_TERMS or slug in seen:
            continue
        seen.add(slug)
        hashtag_tokens.append(slug)
        if len(hashtag_tokens) >= limit:
            return " ".join(f"#{item}" for item in hashtag_tokens)

    for candidate in _extract_caption_keywords(original_caption, limit=limit):
        if candidate in seen:
            continue
        seen.add(candidate)
        hashtag_tokens.append(candidate)
        if len(hashtag_tokens) >= limit:
            return " ".join(f"#{item}" for item in hashtag_tokens)

    for candidate in CAPTION_FALLBACK_HASHTAGS:
        if candidate in seen:
            continue
        seen.add(candidate)
        hashtag_tokens.append(candidate)
        if len(hashtag_tokens) >= limit:
            break

    return " ".join(f"#{item}" for item in hashtag_tokens)


def _build_caption_cta(original_caption: str) -> str:
    normalized = _slugify_caption_token(original_caption)
    if any(token in normalized for token in ("meo", "tip", "cach", "huongdan")):
        return "Luu lai de xem lai khi can va xem het clip nhe."
    if any(token in normalized for token in ("review", "danhgia", "test", "thudo")):
        return "Xem het clip roi de lai cam nhan cua ban nhe."
    return "Xem het clip roi ke minh nghe doan nao cuon nhat nha."


def _build_caption_fallback(original_caption: str) -> str:
    cleaned_source = _clean_caption_source_text(original_caption)
    short_lead = _truncate_caption_words(cleaned_source, limit=12)
    if short_lead:
        hook = _sentence_case_text(short_lead)
        if hook[-1] not in ".!?":
            hook = f"{hook}."
    else:
        hook = "Xem thu clip nay nha."

    detail_seed = _truncate_caption_words(cleaned_source, limit=18)
    if detail_seed and detail_seed.lower() not in hook.lower():
        detail = f"{_sentence_case_text(detail_seed)} {_build_caption_cta(cleaned_source)}"
    else:
        detail = _build_caption_cta(cleaned_source)

    hashtags = _build_facebook_hashtags(original_caption)
    return f"{hook}\n{detail}\n\n{hashtags}".strip()


def _sanitize_generated_caption(generated_caption: str, original_caption: str) -> str:
    fallback = _build_caption_fallback(original_caption)
    if not generated_caption:
        return fallback

    body_lines: list[str] = []
    for raw_line in (generated_caption or "").splitlines():
        line = _normalize_text(_strip_caption_urls(_strip_caption_hashtags(raw_line)))
        if line:
            body_lines.append(line)

    if not body_lines:
        return fallback

    if len(body_lines) == 1:
        body_lines.append(_build_caption_cta(original_caption))

    normalized_body: list[str] = []
    for index, line in enumerate(body_lines[:3]):
        cleaned_line = _sentence_case_text(line)
        if cleaned_line and cleaned_line[-1] not in ".!?":
            cleaned_line = f"{cleaned_line}."
        if cleaned_line:
            normalized_body.append(cleaned_line)
        if index == 0 and len(cleaned_line.split()) > 16:
            normalized_body[0] = f"{_sentence_case_text(_truncate_caption_words(cleaned_line, limit=12)).rstrip('.') }..."

    if not normalized_body:
        return fallback

    hashtags = _build_facebook_hashtags(original_caption, generated_caption)
    body_text = "\n".join(normalized_body).strip()
    if not hashtags:
        return body_text
    return f"{body_text}\n\n{hashtags}".strip()


def _contains_any(text: str, keywords: tuple[str, ...]) -> bool:
    lowered = text.lower()
    return any(keyword in lowered for keyword in keywords)


def _normalize_match_text(value: str) -> str:
    text = (value or "").lower()
    text = text.replace("đ", "d")
    return re.sub(r"\s+", " ", text).strip()


def _split_keyword_text(raw_value: str | None) -> tuple[str, ...]:
    if not raw_value:
        return ()
    items = re.split(r"[\n,;|]+", raw_value)
    return tuple(item.strip().lower() for item in items if item.strip())


def _contains_phrase(text: str, keywords: tuple[str, ...]) -> bool:
    normalized = _normalize_match_text(text)
    return any(keyword and _normalize_match_text(keyword) in normalized for keyword in keywords)


def _is_price_question(user_message: str) -> bool:
    return _contains_phrase(
        user_message,
        ("giá", "bao nhiêu", "bao nhieu", "giá sao", "gia sao", "báo giá", "bao gia", "price"),
    )


def _is_complaint_message(user_message: str, *, negative_keywords: tuple[str, ...] = ()) -> bool:
    return _contains_phrase(user_message, negative_keywords or DEFAULT_NEGATIVE_KEYWORDS)


def _contains_handoff_trigger(user_message: str, *, handoff_keywords: tuple[str, ...] = ()) -> bool:
    return _contains_phrase(user_message, handoff_keywords or DEFAULT_HANDOFF_KEYWORDS)


def _is_product_suggestion_request(user_message: str) -> bool:
    return _contains_phrase(
        user_message,
        (
            "gợi ý sản phẩm",
            "goi y san pham",
            "gợi ý một số sản phẩm",
            "goi y mot so san pham",
            "tư vấn sản phẩm",
            "tu van san pham",
            "đề xuất sản phẩm",
            "de xuat san pham",
            "nên chọn sản phẩm nào",
            "nen chon san pham nao",
        ),
    )


def _default_support_follow_up(user_message: str) -> str:
    if _is_complaint_message(user_message):
        return "Mình để lại số điện thoại giúp em để kỹ thuật gọi lại cho mình nhé?"
    if _is_price_question(user_message):
        return "Mình muốn em tư vấn thêm mẫu nào để em báo sát hơn cho mình ạ?"
    return "Mình cần em tư vấn thêm phần nào cho mình ạ?"


def _finalize_support_reply(reply: str, *, user_message: str) -> str:
    text = re.sub(r"\s+", " ", (reply or "").strip())
    if not text:
        text = "Dạ em đang kiểm tra lại thông tin giúp mình ạ."
    if text[-1] not in ".!?":
        text = f"{text}."
    if "?" not in text[-80:]:
        text = f"{text} {_default_support_follow_up(user_message)}"
    return text.strip()


def detect_support_handoff(
    user_message: str,
    *,
    handoff_keywords: tuple[str, ...] = (),
    negative_keywords: tuple[str, ...] = (),
) -> dict[str, Any] | None:
    if not user_message:
        return None

    has_handoff_request = _contains_handoff_trigger(user_message, handoff_keywords=handoff_keywords)
    has_negative_tone = _is_complaint_message(user_message, negative_keywords=negative_keywords)
    if not has_handoff_request and not has_negative_tone:
        return None

    if has_negative_tone:
        reply = (
            "Dạ em rất xin lỗi vì trải nghiệm chưa tốt của mình ạ. "
            "Em xin phép chuyển ngay cho nhân viên hỗ trợ và mình để lại số điện thoại giúp em để kỹ thuật gọi lại cho mình nhé?"
        )
        reason = "Khách đang phàn nàn hoặc dùng ngôn ngữ tiêu cực, cần nhân viên tiếp nhận."
        intent = "support_complaint_handoff"
    else:
        reply = (
            "Dạ em ghi nhận mình đang muốn gặp nhân viên hỗ trợ trực tiếp ạ. "
            "Em chuyển cuộc trò chuyện này cho người thật ngay, mình cần bên em gọi lại cho mình luôn không ạ?"
        )
        reason = "Khách yêu cầu gặp người thật hoặc quản lý."
        intent = "support_human_handoff"

    return {
        "reply": _finalize_support_reply(reply, user_message=user_message),
        "summary": _build_contextual_summary(user_message, "criticism"),
        "intent": intent,
        "customer_facts": {},
        "handoff": True,
        "handoff_reason": reason,
    }


def _build_support_identity_block(page_name: str | None, agent_name: str | None) -> str:
    resolved_page_name = (page_name or "").strip() or "Fanpage"
    resolved_agent_name = (agent_name or "").strip() or "nhân viên chăm sóc khách hàng"
    return (
        f"Support identity:\n"
        f"- Agent name: {resolved_agent_name}\n"
        f"- Facebook page: {resolved_page_name}\n"
        "- Speak like a friendly Vietnamese customer support staff member."
    )


def _summarize_customer_topic(user_message: str, max_length: int = 52) -> str:
    normalized = _normalize_text(user_message)
    if len(normalized) <= max_length:
        return normalized
    return f"{normalized[:max_length].rstrip()}..."


def _build_topic_anchor(user_message: str, max_length: int = 96) -> str:
    topic = _summarize_customer_topic(user_message, max_length=max_length).strip()
    return topic or "Kh\u00e1ch ch\u01b0a n\u00eau r\u00f5 ch\u1ee7 \u0111\u1ec1"


def _classify_social_intent(user_message: str) -> str:
    text = _normalize_text(user_message).lower()
    if not text:
        return "generic"

    if _contains_any(text, ("xem thêm", "xem video", "video nữa", "clip nữa", "nhiều video", "xin clip", "xin video", "gợi ý video", "gửi video", "coi thêm")):
        return "content_request"
    if _contains_any(text, ("alo", "hello", "hi", "chào", "ad ơi", "page ơi")):
        return "greeting"
    if _contains_any(text, ("tên bài", "bài gì", "nhạc gì", "xin nhạc", "tên nhạc", "source", "nguồn video", "link gốc", "video gốc")):
        return "unknown_fact"
    if _contains_any(text, ("bản quyền", "copyright", "reup", "ăn cắp", "copy", "khiếu nại", "bị report", "gỡ video", "gỡ bài")):
        return "copyright"
    if _contains_any(text, ("inbox chị", "zalo", "telegram", "crypto", "kiếm tiền", "đầu tư", "ib em", "quảng cáo", "spam")):
        return "spam"
    if _contains_any(text, ("cảm ơn", "thanks", "thank you", "ok cảm ơn", "tks", "thx")):
        return "gratitude"
    if _contains_any(text, ("đẹp", "hay", "xịn", "đỉnh", "cuốn", "mê", "iu", "yêu", "nice", "great", "good", "🔥", "😍", "🥰", "❤️")):
        return "praise"
    if _contains_any(text, ("dở", "chán", "xàm", "nhảm", "rác", "cringe", "tệ", "không hay", "khó chịu", "xu cà na", "🤡")):
        return "criticism"
    if "?" in text or _contains_any(text, ("sao", "bao nhiêu", "ở đâu", "khi nào", "thế nào", "như nào", "có không", "được không")):
        return "question"
    return "generic"


def _build_contextual_need_reply(user_message: str, *, channel: str) -> str | None:
    text = _normalize_text(user_message).lower()
    if not text:
        return None

    if _contains_any(text, ("xem thêm", "xem video", "video nữa", "clip nữa", "nhiều video", "xin clip", "xin video", "gợi ý video", "gửi video", "coi thêm")):
        if channel == "message":
            return "Dạ nếu bạn muốn xem thêm video thì page còn nhiều clip cùng kiểu lắm nha. Bạn thích mood nào hơn để mình gợi ý đúng gu cho bạn: drama, tình cảm hay plot twist?"
        return "Có thêm nhiều clip cùng kiểu này lắm nha 😆 Bạn thích mood nào hơn để page lên tiếp đúng gu bạn: drama, chữa lành hay plot twist?"

    if _contains_any(text, ("link", "full", "phần tiếp", "part 2", "đoạn tiếp", "xin nguồn", "nguồn đâu")):
        if channel == "message":
            return "Mình thấy bạn đang cần nguồn hoặc phần tiếp của video. Nếu bạn nói rõ đang cần link, tên nhạc hay phần tiếp nào thì mình trả lời sát hơn cho bạn nha."
        return "Ad thấy bạn đang hỏi nguồn hoặc phần tiếp của clip nè. Bạn nói rõ giúp Ad đang cần link, tên nhạc hay phần tiếp nào để page trả lời đúng ý hơn nha."

    if _contains_any(text, ("alo", "hello", "hi", "chào", "ad ơi", "page ơi")):
        if channel == "message":
            return "Dạ mình đây nha 👋 Bạn đang cần page hỗ trợ nội dung nào hoặc muốn tìm kiểu video nào, mình trả lời ngay cho bạn."
        return "Ad đây nè 👋 Bạn đang cần hỏi gì về clip này, nói Ad một câu để page trả lời sát hơn nha."

    return None


def _build_contextual_summary(user_message: str, intent: str) -> str:
    topic = _summarize_customer_topic(user_message, max_length=80)
    if intent == "content_request":
        return f"Khách muốn xem thêm nội dung cùng gu: {topic}"
    if intent == "unknown_fact":
        return f"Khách đang hỏi thông tin chưa xác thực chắc chắn: {topic}"
    if intent == "copyright":
        return f"Khách đang phản ánh vấn đề nghiêm túc: {topic}"
    if intent == "praise":
        return f"Khách đang khen hoặc hưởng ứng nội dung: {topic}"
    if intent == "criticism":
        return f"Khách đang góp ý hoặc chê nội dung: {topic}"
    if intent == "question":
        return f"Khách đang hỏi thêm về: {topic}"
    return f"Khách vừa nhắn về: {topic}"


def _build_rule_based_comment_fallback(user_message: str) -> str:
    intent = _classify_social_intent(user_message)
    topic = _summarize_customer_topic(user_message, max_length=80) or "noi dung ban vua nhac"

    if intent == "unknown_fact":
        return (
            f'M\u00ecnh \u0111\u00e3 hi\u1ec3u b\u1ea1n \u0111ang h\u1ecfi v\u1ec1 "{topic}". '
            "\u0110\u00e2y l\u00e0 th\u00f4ng tin c\u1ea7n d\u1eef li\u1ec7u c\u1ee5 th\u1ec3 t\u1eeb page ho\u1eb7c video, nh\u01b0ng hi\u1ec7n m\u00ecnh ch\u01b0a c\u00f3 d\u1eef li\u1ec7u ch\u1eafc ch\u1eafn \u0111\u1ec3 tr\u1ea3 l\u1eddi \u0111\u00fang. "
            "B\u1ea1n g\u1eedi th\u00eam t\u00ean video, link, ho\u1eb7c 2-3 t\u1eeb kh\u00f3a \u0111\u1ec3 m\u00ecnh ki\u1ec3m tra s\u00e1t h\u01a1n nh\u00e9."
        )
    if intent == "copyright":
        return "M\u00ecnh \u0111\u00e3 ghi nh\u1eadn ph\u1ea3n \u00e1nh c\u1ee7a b\u1ea1n. B\u1ea1n vui l\u00f2ng inbox page k\u00e8m th\u00f4ng tin c\u1ee5 th\u1ec3 \u0111\u1ec3 b\u00ean m\u00ecnh ki\u1ec3m tra v\u00e0 x\u1eed l\u00fd \u0111\u00fang v\u1ea5n \u0111\u1ec1 nhanh h\u01a1n."
    if intent == "spam":
        return "Trang xin ph\u00e9p kh\u00f4ng h\u1ed7 tr\u1ee3 n\u1ed9i dung n\u00e0y trong lu\u1ed3ng b\u00ecnh lu\u1eadn."
    if intent == "greeting":
        return "M\u00ecnh \u0111\u00e2y nha. B\u1ea1n c\u1ee9 h\u1ecfi th\u1eb3ng \u0111i\u1ec1u b\u1ea1n c\u1ea7n v\u1ec1 video hay th\u00f4ng tin tr\u00ean page, m\u00ecnh tr\u1ea3 l\u1eddi s\u00e1t h\u01a1n cho b\u1ea1n n\u00e8."
    if intent == "gratitude":
        return "Kh\u00f4ng c\u00f3 g\u00ec nha. N\u1ebfu b\u1ea1n c\u1ea7n t\u00ecm th\u00eam video, link, hay th\u00f4ng tin n\u00e0o tr\u00ean page th\u00ec c\u1ee9 nh\u1eafn t\u00ean ho\u1eb7c t\u1eeb kh\u00f3a c\u1ee5 th\u1ec3."
    if intent == "praise":
        return "C\u1ea3m \u01a1n b\u1ea1n nha, \u0111\u1ecdc xong c\u0169ng th\u1ea5y vui d\u00f9m page lu\u00f4n n\u00e8. N\u1ebfu b\u1ea1n mu\u1ed1n t\u00ecm th\u00eam video c\u00f9ng ch\u1ee7 \u0111\u1ec1 ho\u1eb7c xin link clip c\u1ee5 th\u1ec3 th\u00ec c\u1ee9 nh\u1eafn t\u1eeb kh\u00f3a, m\u00ecnh l\u1ecdc gi\u00fap."
    if intent == "criticism":
        return f'M\u00ecnh \u0111\u00e3 ghi nh\u1eadn \u00fd c\u1ee7a b\u1ea1n v\u1ec1 "{topic}". N\u1ebfu b\u1ea1n n\u00f3i r\u00f5 h\u01a1n \u0111i\u1ec1u ch\u01b0a \u1ed5n \u1edf \u0111\u00e2u, m\u00ecnh s\u1ebd tr\u1ea3 l\u1eddi \u0111\u00fang tr\u1ecdng t\u00e2m h\u01a1n.'
    return (
        f'M\u00ecnh \u0111\u00e3 hi\u1ec3u b\u1ea1n \u0111ang h\u1ecfi v\u1ec1 "{topic}". '
        "N\u1ebfu b\u1ea1n c\u1ea7n th\u00f4ng tin tr\u00ean page nh\u01b0 link video, ti\u00eau \u0111\u1ec1, part ti\u1ebfp, t\u00ean nh\u1ea1c, hay chi ti\u1ebft c\u1ee5 th\u1ec3 th\u00ec c\u1ee9 n\u00f3i r\u00f5 th\u00eam 1-2 t\u1eeb kh\u00f3a, m\u00ecnh s\u1ebd tr\u1ea3 l\u1eddi s\u00e1t h\u01a1n."
    )

def _build_rule_based_message_fallback(user_message: str) -> str:
    intent = _classify_social_intent(user_message)
    if _is_product_suggestion_request(user_message):
        return (
            "Dạ được ạ, mình muốn em gợi ý theo nhu cầu nào và tầm giá khoảng bao nhiêu "
            "để em đề xuất sát hơn cho mình nha?"
        )

    if intent == "unknown_fact":
        return "Dạ phần này em chưa có đủ dữ liệu để chốt ngay ạ, mình gửi giúp em tên sản phẩm hoặc chi tiết cần hỏi để em kiểm tra sát hơn nha?"
    if intent == "copyright":
        return "Dạ em ghi nhận rồi ạ, mình gửi giúp em thông tin cụ thể hơn để bên em kiểm tra và hỗ trợ nhanh cho mình nha?"
    if intent == "spam":
        return "Dạ trang xin phép không hỗ trợ nội dung này nha."
    if intent == "greeting":
        return "Dạ em đây ạ, mình cần em tư vấn sản phẩm hay hỗ trợ vấn đề gì để em trả lời ngay cho mình nha?"
    if intent == "gratitude":
        return "Dạ không có gì ạ, mình cần em tư vấn thêm sản phẩm hay thông tin nào nữa không nha?"
    if intent == "praise":
        return "Dạ dễ thương quá ạ, cảm ơn mình nha. Mình cần em tư vấn thêm sản phẩm hay thông tin nào nữa không ạ?"
    if intent == "criticism":
        return "Dạ em ghi nhận rồi ạ, mình nói rõ thêm giúp em chỗ chưa ổn để em hỗ trợ sát hơn nha?"
    return "Dạ mình cho em biết rõ hơn sản phẩm hoặc thông tin đang cần để em trả lời đúng ý hơn nha?"


def _classify_social_intent(user_message: str) -> str:
    text = _normalize_text(user_message).lower()
    if not text:
        return "generic"

    if _contains_any(text, ("xem th\u00eam", "xem video", "video n\u1eefa", "clip n\u1eefa", "nhi\u1ec1u video", "xin clip", "xin video", "g\u1ee3i \u00fd video", "g\u1eedi video", "coi th\u00eam")):
        return "content_request"
    if _contains_any(text, ("t\u00ean b\u00e0i", "b\u00e0i g\u00ec", "nh\u1ea1c g\u00ec", "xin nh\u1ea1c", "t\u00ean nh\u1ea1c", "source", "ngu\u1ed3n video", "link g\u1ed1c", "video g\u1ed1c")):
        return "unknown_fact"
    if _contains_any(text, ("b\u1ea3n quy\u1ec1n", "copyright", "reup", "\u0103n c\u1eafp", "copy", "khi\u1ebfu n\u1ea1i", "b\u1ecb report", "g\u1ee1 video", "g\u1ee1 b\u00e0i")):
        return "copyright"
    if _contains_any(text, ("inbox ch\u1ecb", "zalo", "telegram", "crypto", "ki\u1ebfm ti\u1ec1n", "\u0111\u1ea7u t\u01b0", "ib em", "qu\u1ea3ng c\u00e1o", "spam")):
        return "spam"
    if _contains_any(text, ("c\u1ea3m \u01a1n", "thanks", "thank you", "ok c\u1ea3m \u01a1n", "tks", "thx")):
        return "gratitude"
    if _contains_any(
        text,
        (
            "\u0111\u1eb9p",
            "hay",
            "x\u1ecbn",
            "\u0111\u1ec9nh",
            "cu\u1ed1n",
            "m\u00ea",
            "iu",
            "y\u00eau",
            "tuy\u1ec7t v\u1eddi",
            "tuyet voi",
            "qu\u00e1 tuy\u1ec7t",
            "qua tuyet",
            "nice",
            "great",
            "good",
            "\ud83d\udd25",
            "\ud83d\ude0d",
            "\ud83e\udd70",
            "\u2764\ufe0f",
        ),
    ):
        return "praise"
    if _contains_any(text, ("alo", "hello", "hi", "ch\u00e0o", "ad \u01a1i", "page \u01a1i")):
        return "greeting"
    if _contains_any(text, ("d\u1edf", "ch\u00e1n", "x\u00e0m", "nh\u1ea3m", "r\u00e1c", "cringe", "t\u1ec7", "kh\u00f4ng hay", "kh\u00f3 ch\u1ecbu", "xu c\u00e0 na", "\ud83e\udd21")):
        return "criticism"
    if "?" in text or _contains_any(text, ("sao", "bao nhi\u00eau", "\u1edf \u0111\u00e2u", "khi n\u00e0o", "th\u1ebf n\u00e0o", "nh\u01b0 n\u00e0o", "c\u00f3 kh\u00f4ng", "\u0111\u01b0\u1ee3c kh\u00f4ng")):
        return "question"
    return "generic"


def _default_support_follow_up(user_message: str, *, channel: str = "message") -> str:
    intent = _classify_social_intent(user_message)
    if channel == "comment":
        if intent in {"praise", "gratitude"}:
            return (
                "N\u1ebfu th\u1ea5y h\u1ee3p gu th\u00ec theo d\u00f5i page nha, "
                "m\u00ecnh th\u00edch xem th\u00eam ki\u1ec3u clip n\u00e0y n\u1eefa kh\u00f4ng \u1ea1?"
            )
        if intent == "content_request":
            return "M\u00ecnh th\u00edch th\u00eam mood n\u00e0o \u0111\u1ec3 page l\u00ean clip ti\u1ebfp \u1ea1?"
        if intent in {"unknown_fact", "question"}:
            return "M\u00ecnh nh\u1eafn th\u00eam 2-3 t\u1eeb kh\u00f3a gi\u00fap em \u0111\u1ec3 em tr\u1ea3 l\u1eddi s\u00e1t h\u01a1n nha?"
        if intent == "criticism":
            return "M\u00ecnh n\u00f3i r\u00f5 th\u00eam gi\u00fap em ch\u1ed7 ch\u01b0a \u1ed5n \u1edf \u0111\u00e2u \u0111\u01b0\u1ee3c kh\u00f4ng \u1ea1?"
        return "M\u00ecnh c\u1ea7n page h\u1ed7 tr\u1ee3 th\u00eam g\u00ec n\u1eefa kh\u00f4ng \u1ea1?"

    if _is_complaint_message(user_message):
        return "M\u00ecnh \u0111\u1ec3 l\u1ea1i s\u1ed1 \u0111i\u1ec7n tho\u1ea1i gi\u00fap em \u0111\u1ec3 k\u1ef9 thu\u1eadt g\u1ecdi l\u1ea1i cho m\u00ecnh nh\u00e9?"
    if _is_price_question(user_message):
        return "M\u00ecnh mu\u1ed1n em t\u01b0 v\u1ea5n th\u00eam m\u1eabu n\u00e0o \u0111\u1ec3 em b\u00e1o s\u00e1t h\u01a1n cho m\u00ecnh \u1ea1?"
    return "M\u00ecnh c\u1ea7n em h\u1ed7 tr\u1ee3 th\u00eam g\u00ec n\u1eefa \u1ea1?"


def _shorten_comment_reply(text: str, *, user_message: str) -> str:
    intent = _classify_social_intent(user_message)
    if intent not in {"praise", "gratitude", "greeting", "generic"}:
        return text

    sentences = [part.strip() for part in re.split(r"(?<=[.!?])\s+", text) if part.strip()]
    if not sentences:
        return text

    shortened = " ".join(sentences[:2]).strip()
    if len(shortened) <= 160:
        return shortened

    trimmed = shortened[:157].rsplit(" ", 1)[0].rstrip(" ,.;:")
    return f"{trimmed}."


def _finalize_support_reply(reply: str, *, user_message: str, channel: str = "message") -> str:
    text = re.sub(r"\s+", " ", (reply or "").strip())
    if not text:
        text = "D\u1ea1 em \u0111ang ki\u1ec3m tra l\u1ea1i th\u00f4ng tin gi\u00fap m\u00ecnh \u1ea1."
    if channel == "comment":
        text = _shorten_comment_reply(text, user_message=user_message)
    if text[-1] not in ".!?":
        text = f"{text}."
    if "?" not in text[-80:]:
        text = f"{text} {_default_support_follow_up(user_message, channel=channel)}"
    return text.strip()


def _build_rule_based_comment_fallback(user_message: str) -> str:
    intent = _classify_social_intent(user_message)

    if intent == "unknown_fact":
        return "D\u1ea1 m\u00ecnh nh\u1eafn th\u00eam t\u00ean video, link ho\u1eb7c 2-3 t\u1eeb kh\u00f3a gi\u00fap em \u0111\u1ec3 em t\u00ecm s\u00e1t h\u01a1n nha."
    if intent == "copyright":
        return "D\u1ea1 em ghi nh\u1eadn r\u1ed3i \u1ea1, m\u00ecnh inbox page gi\u00fap em th\u00f4ng tin c\u1ee5 th\u1ec3 \u0111\u1ec3 b\u00ean em ki\u1ec3m tra nhanh nha."
    if intent == "spam":
        return "D\u1ea1 page xin ph\u00e9p kh\u00f4ng h\u1ed7 tr\u1ee3 n\u1ed9i dung n\u00e0y trong comment \u1ea1."
    if intent == "greeting":
        return "D\u1ea1 page \u0111\u00e2y \u1ea1, m\u00ecnh c\u1ea7n h\u1ecfi g\u00ec c\u1ee9 nh\u1eafn em nha?"
    if intent == "gratitude":
        return "D\u1ea1 kh\u00f4ng c\u00f3 g\u00ec \u0111\u00e2u \u1ea1, n\u1ebfu th\u1ea5y h\u1ee3p gu th\u00ec theo d\u00f5i page nha?"
    if intent == "praise":
        return "D\u1ea1 d\u1ec5 th\u01b0\u01a1ng qu\u00e1 \u1ea1, c\u1ea3m \u01a1n m\u00ecnh nha hihi. N\u1ebfu th\u1ea5y h\u1ee3p gu th\u00ec theo d\u00f5i page nha?"
    if intent == "criticism":
        return "D\u1ea1 em ghi nh\u1eadn \u00fd c\u1ee7a m\u00ecnh r\u1ed3i \u1ea1, m\u00ecnh n\u00f3i r\u00f5 th\u00eam gi\u00fap em ch\u1ed7 ch\u01b0a \u1ed5n \u0111\u1ec3 em h\u1ed7 tr\u1ee3 s\u00e1t h\u01a1n nha?"
    if intent == "content_request":
        return "D\u1ea1 page c\u00f2n nhi\u1ec1u clip c\u00f9ng gu l\u1eafm \u1ea1, m\u00ecnh mu\u1ed1n xem th\u00eam ki\u1ec3u n\u00e0o \u0111\u1ec3 em g\u1ee3i \u00fd nha?"
    return "D\u1ea1 em \u1edf \u0111\u00e2y \u1ea1, m\u00ecnh c\u1ea7n page h\u1ed7 tr\u1ee3 c\u1ee5 th\u1ec3 g\u00ec th\u00eam kh\u00f4ng nha?"

def _extract_json_payload(raw_text: str) -> dict[str, Any] | None:
    text = (raw_text or "").strip()
    if not text:
        return None

    candidates = [text]
    if "```" in text:
        parts = text.split("```")
        for part in parts:
            cleaned = part.replace("json", "", 1).strip()
            if cleaned:
                candidates.append(cleaned)

    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        candidates.append(text[start : end + 1])

    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            return parsed
    return None


def _normalize_reply_payload(
    payload: dict[str, Any] | None,
    *,
    user_message: str,
    fallback_reply: str,
    fallback_summary: str | None,
    fallback_intent: str = "general_support",
    fallback_facts: dict[str, Any] | None = None,
) -> dict[str, Any]:
    data = payload or {}
    reply = str(data.get("reply") or "").strip() or fallback_reply
    reply = _finalize_support_reply(reply, user_message=user_message)
    summary = str(data.get("summary") or "").strip() or (fallback_summary or "")
    intent = str(data.get("intent") or "").strip() or fallback_intent
    customer_facts = data.get("customer_facts")
    if not isinstance(customer_facts, dict):
        customer_facts = fallback_facts or {}
    handoff = bool(data.get("handoff"))
    handoff_reason = str(data.get("handoff_reason") or "").strip() or None
    return {
        "reply": reply,
        "summary": summary[: settings.INBOX_SUMMARY_MAX_CHARS],
        "intent": intent[:80],
        "customer_facts": customer_facts,
        "handoff": handoff,
        "handoff_reason": handoff_reason[:300] if handoff_reason else None,
    }


def _extract_openai_output_text(data: dict[str, Any]) -> str | None:
    output_text = data.get("output_text")
    if isinstance(output_text, str) and output_text.strip():
        return output_text.strip()

    chunks: list[str] = []
    for item in data.get("output", []):
        if not isinstance(item, dict):
            continue
        for content in item.get("content", []):
            if not isinstance(content, dict):
                continue
            text_value = content.get("text")
            if isinstance(text_value, str) and text_value.strip():
                chunks.append(text_value.strip())
                continue
            if isinstance(text_value, dict):
                nested_value = text_value.get("value") or text_value.get("text")
                if isinstance(nested_value, str) and nested_value.strip():
                    chunks.append(nested_value.strip())
                    continue
            raw_value = content.get("value")
            if isinstance(raw_value, str) and raw_value.strip():
                chunks.append(raw_value.strip())

    joined = "\n".join(chunks).strip()
    return joined or None


def _generate_with_gemini(
    prompt: str,
    fallback: str,
    *,
    timeout: int = 20,
    max_retries: int = 3,
    generation_config: dict[str, Any] | None = None,
) -> str:
    gemini_api_key = resolve_runtime_value("GEMINI_API_KEY")
    if not gemini_api_key:
        log_structured("gemini", "warning", "Chưa cấu hình GEMINI_API_KEY, dùng nội dung fallback.")
        return fallback

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={gemini_api_key}"
    payload = {"contents": [{"parts": [{"text": prompt}]}]}
    if generation_config:
        payload["generationConfig"] = generation_config

    try:
        response = request_with_retries(
            "POST",
            url,
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=timeout,
            max_attempts=max_retries,
            scope="gemini",
            operation="generate_content",
        )
    except Exception as exc:
        log_structured(
            "gemini",
            "error",
            "Không thể gọi Gemini sau nhiều lần thử.",
            details={"model": GEMINI_MODEL, "error": str(exc)},
        )
        return fallback

    if response.status_code == 200:
        data = response.json()
        if data.get("candidates") and data["candidates"][0].get("content"):
            return data["candidates"][0]["content"]["parts"][0]["text"].strip()

    log_structured(
        "gemini",
        "warning",
        "Gemini không trả về nội dung hợp lệ, dùng fallback.",
        details={"model": GEMINI_MODEL, "status_code": response.status_code},
    )
    return fallback


def _generate_with_openai(
    prompt: str,
    fallback: str,
    *,
    timeout: int = 20,
    max_retries: int = 3,
    generation_config: dict[str, Any] | None = None,
) -> str:
    openai_api_key = resolve_runtime_value("OPENAI_API_KEY")
    if not openai_api_key:
        log_structured("openai", "warning", "Chua cau hinh OPENAI_API_KEY, dung noi dung fallback.")
        return fallback

    payload: dict[str, Any] = {
        "model": OPENAI_MODEL,
        "input": prompt,
        "reasoning": {"effort": "low"},
    }
    if generation_config and generation_config.get("responseMimeType") == "application/json":
        payload["text"] = {"format": {"type": "json_object"}}
    try:
        response = request_with_retries(
            "POST",
            OPENAI_RESPONSES_URL,
            json=payload,
            headers={
                "Authorization": f"Bearer {openai_api_key}",
                "Content-Type": "application/json",
            },
            timeout=timeout,
            max_attempts=max_retries,
            scope="openai",
            operation="responses_generate",
        )
    except Exception as exc:
        log_structured(
            "openai",
            "error",
            "Khong the goi OpenAI sau nhieu lan thu.",
            details={"model": OPENAI_MODEL, "error": str(exc)},
        )
        return fallback

    try:
        data = response.json()
    except ValueError:
        data = {}

    if response.status_code == 200:
        text = _extract_openai_output_text(data)
        if text:
            return text

    error_message = data.get("error", {}).get("message") if isinstance(data, dict) else None
    log_structured(
        "openai",
        "warning",
        "OpenAI khong tra ve noi dung hop le, dung fallback.",
        details={
            "model": OPENAI_MODEL,
            "status_code": response.status_code,
            "error": error_message,
        },
    )
    return fallback


def get_configured_ai_provider_order() -> list[str]:
    providers: list[str] = []
    if resolve_runtime_value("OPENAI_API_KEY").strip():
        providers.append("openai")
    if resolve_runtime_value("GEMINI_API_KEY").strip():
        providers.append("gemini")
    return providers


def _generate_with_ai(
    prompt: str,
    fallback: str,
    *,
    timeout: int = 20,
    max_retries: int = 3,
    generation_config: dict[str, Any] | None = None,
) -> str:
    providers: list[tuple[str, Any]] = []
    for provider_name in get_configured_ai_provider_order():
        if provider_name == "gemini":
            providers.append((provider_name, _generate_with_gemini))
        elif provider_name == "openai":
            providers.append((provider_name, _generate_with_openai))

    if not providers:
        log_structured("ai", "warning", "Chua cau hinh bat ky provider AI nao, dung fallback.")
        return fallback

    for index, (provider_name, provider_fn) in enumerate(providers):
        result = provider_fn(
            prompt,
            fallback,
            timeout=timeout,
            max_retries=max_retries,
            generation_config=generation_config,
        )
        if result != fallback:
            return result
        if index < len(providers) - 1:
            log_structured(
                "ai",
                "warning",
                "Provider AI hien tai khong tao duoc noi dung, thu provider tiep theo.",
                details={"provider": provider_name},
            )

    return fallback


def generate_caption(original_caption: str) -> str:
    prompt = f"""Bạn là Trùm Copywriter chuyên viral content Facebook. Mệnh lệnh bắt buộc:
1. Viết lại caption sao cho kịch tính, thú vị, xài emoji hợp lý, độ dài 50-100 từ.
2. Ngay lập tức loại bỏ toàn bộ hashtag cũ trong caption gốc.
3. Dựa vào nội dung, tự bổ sung 5-6 hashtag phù hợp cho Facebook.
Kết quả chỉ trả về đoạn caption thuần túy, không có giải thích.

Caption gốc: {original_caption}"""
    return _generate_with_ai(prompt, f"{original_caption}\n\n#giaitri #trending", timeout=30)


def generate_caption(original_caption: str) -> str:
    fallback = _build_caption_fallback(original_caption)
    prompt = f"""You are a Facebook Reels copywriter.
Mandatory rules:
1. Rewrite the original caption into a Facebook-first caption with 2-3 short lines only.
2. Line 1 must be a short hook or title that makes viewers want to watch.
3. Add one short viewer prompt or curiosity line based on the original caption.
4. Remove every old hashtag from the source caption.
5. Add 4-5 relevant hashtags for Facebook only.
6. Never use TikTok-specific hashtags or phrases such as #tiktok, #fyp, #xuhuong, #douyin, #foryou.
7. Keep the meaning close to the original caption. Do not invent new facts.
8. Do not explain your process. Return caption text only.

Original caption:
{original_caption}"""
    generated = _generate_with_ai(prompt, fallback, timeout=30)
    return _sanitize_generated_caption(generated, original_caption)


def generate_message_reply_with_context(
    user_message: str,
    *,
    prompt_override: str | None = None,
    knowledge_context: str | None = None,
    conversation_summary: str | None = None,
    recent_turns: list[dict[str, str]] | None = None,
    customer_facts: dict[str, Any] | None = None,
    page_name: str | None = None,
    agent_name: str | None = None,
    handoff_keywords: tuple[str, ...] = (),
    negative_keywords: tuple[str, ...] = (),
) -> dict[str, Any]:
    base_prompt = _merge_prompt_instructions(DEFAULT_MESSAGE_REPLY_PROMPT, prompt_override)
    fallback_reply = _finalize_support_reply(_build_rule_based_message_fallback(user_message), user_message=user_message)
    fallback_summary = conversation_summary or _build_contextual_summary(
        user_message,
        _classify_social_intent(user_message),
    )
    identity_block = _build_support_identity_block(page_name, agent_name)
    forced_handoff = detect_support_handoff(
        user_message,
        handoff_keywords=handoff_keywords,
        negative_keywords=negative_keywords,
    )
    if forced_handoff:
        return forced_handoff

    facts = customer_facts if isinstance(customer_facts, dict) else {}
    facts_block = json.dumps(facts, ensure_ascii=False) if facts else "{}"
    knowledge_block = _build_knowledge_block(knowledge_context)
    topic_anchor = _build_topic_anchor(user_message)

    history_lines = []
    for turn in recent_turns or []:
        role = "Customer" if turn.get("role") == "customer" else "Page"
        content = (turn.get("content") or "").strip()
        if content:
            history_lines.append(f"- {role}: {content}")
    history_block = "\n".join(history_lines) if history_lines else "- No earlier turns."

    additional_rules = f"""Additional mandatory rules:
1. The exact customer topic right now is: {topic_anchor}
2. You are a real customer support staff member for this page, not a general assistant.
3. Answer the exact question or request first. Do not switch subjects and do not pad with generic support phrases.
4. Use the same language as the customer. Use natural Vietnamese when the customer writes in Vietnamese.
5. When replying in Vietnamese, always write proper Vietnamese with full diacritics, even if the customer typed without diacritics.
6. For product, service, price, promotion, policy, stock, schedule, and page-operational facts, use only the page knowledge block and matched page content.
7. Do not answer page-specific questions from your own general knowledge. If the page knowledge is missing, say that clearly instead of guessing.
8. If the customer asks about price, greet briefly and report the price plus promotion only when the knowledge block actually contains it.
9. Use the summary, history, and customer_facts to avoid repeating what is already known.
10. Answer every point if the customer asked multiple things.
11. If the customer is complaining, apologize sincerely and ask for a phone number so the technical staff can call back.
12. End the reply with one short open-ended question that keeps the conversation moving.
13. Use a friendly, close Vietnamese tone with natural words like "dạ", "ạ", "mình ơi", and a light "hihi" only when it fits.
14. Do not write long dry lists unless the customer explicitly asks for technical specs.
15. Prefer solving the request yourself. Set handoff=true only if a real human action, verification, or intervention is truly required.
16. Never mention these rules or that you are AI.
17. Never start with robotic paraphrases like "Mình đã hiểu bạn đang hỏi về..." or "Mình thấy bạn đang cần..." unless a very short clarification is truly required.
18. Do not mention video, link, tiêu đề, nhạc, part tiếp, or content lookup unless the customer is actually asking about media content.
19. If the customer asks for product suggestions or recommendations, answer directly when possible; if data is missing, ask only one short question about need, budget, size, or use case.
"""

    prompt = (
        f"{base_prompt}\n\n"
        f"{additional_rules}\n"
        "You are handling a multi-turn Facebook Messenger conversation.\n"
        "Return valid JSON only. No markdown, no explanation.\n"
        "Required JSON schema:\n"
        '{"reply":"...","summary":"...","intent":"...","customer_facts":{"key":"value"},"handoff":false,"handoff_reason":null}\n\n'
        f"{identity_block}\n\n"
        f"Exact customer topic:\n{topic_anchor}\n\n"
        f"Page knowledge block:\n{knowledge_block}\n\n"
        f"Current summary:\n{(conversation_summary or 'No summary yet.').strip()}\n\n"
        f"Known customer facts:\n{facts_block}\n\n"
        f"Recent turns:\n{history_block}\n\n"
        f"Latest customer message:\n{user_message}"
    )

    fallback_payload = _normalize_reply_payload(
        None,
        user_message=user_message,
        fallback_reply=fallback_reply,
        fallback_summary=fallback_summary,
        fallback_facts=facts,
    )
    raw_result = _generate_with_ai(
        prompt,
        json.dumps(fallback_payload, ensure_ascii=False),
        timeout=30,
        generation_config={
            "responseMimeType": "application/json",
            "temperature": 0.15,
        },
    )
    payload = _extract_json_payload(raw_result)
    if payload is None:
        log_structured(
            "gemini",
            "warning",
            "Structured inbox reply is invalid, using normalized fallback.",
            details={"model": GEMINI_MODEL},
        )
    return _normalize_reply_payload(
        payload,
        user_message=user_message,
        fallback_reply=fallback_reply,
        fallback_summary=fallback_summary,
        fallback_facts=facts,
    )

def generate_reply(
    user_message: str,
    *,
    channel: str = "comment",
    prompt_override: str | None = None,
    knowledge_context: str | None = None,
    page_name: str | None = None,
    agent_name: str | None = None,
) -> str:
    is_message_channel = channel == "message"
    base_prompt = _merge_prompt_instructions(
        DEFAULT_MESSAGE_REPLY_PROMPT if is_message_channel else DEFAULT_COMMENT_REPLY_PROMPT,
        prompt_override,
    )
    customer_label = "Facebook message" if is_message_channel else "Facebook comment"
    knowledge_block = _build_knowledge_block(knowledge_context)
    topic_anchor = _build_topic_anchor(user_message)
    identity_block = _build_support_identity_block(page_name, agent_name)
    fallback = (
        _build_rule_based_message_fallback(user_message)
        if is_message_channel
        else _build_rule_based_comment_fallback(user_message)
    )
    fallback = _finalize_support_reply(fallback, user_message=user_message, channel=channel)
    additional_rules = f"""Additional mandatory rules:
- Channel: {customer_label}
- Exact customer topic: {topic_anchor}
- Act like a real customer support staff member for this page.
- Answer the customer's exact question or request first. Do not switch subjects and do not pad with generic support phrases.
- Use the same language as the customer. Use natural Vietnamese when the customer writes in Vietnamese.
- When replying in Vietnamese, always write proper Vietnamese with full diacritics, even if the customer typed without diacritics.
- Use only the page knowledge block and matched page content for product, service, price, promotion, policy, stock, schedule, contact, or page-operational facts.
- Never invent page-specific facts. If the answer depends on page data that is not present in the knowledge block, say exactly that instead of guessing.
- If the customer asks about price, greet briefly and report price plus promotion only when it is present in the knowledge block.
- If the customer is complaining, apologize sincerely and ask for a phone number so the technical staff can call back.
- If the customer asked multiple things, answer every point clearly.
        - End with one short open-ended question that keeps the conversation moving.
        - If this is a short compliment, greeting, or emotional reaction in comments, keep it to 1-2 short sentences only.
        - Do not paraphrase the customer with robotic lines like "Mình đã hiểu bạn đang hỏi về..." unless the customer is actually asking for missing information.
        - For positive comments, you may softly invite the customer to like or follow the page when it feels natural.
- Use a friendly Vietnamese CSKH tone with natural words like "dạ", "ạ", "mình ơi", and a light "hihi" only when it fits.
- Do not write long dry bullet lists unless the customer explicitly asks for technical specs.
- Keep the reply natural and direct. For comments, keep it reasonably short; for inbox, be complete enough to solve the request.
- Never mention that you are AI.
"""

    prompt = (
        f"{base_prompt}\n\n"
        f"{additional_rules}\n"
        f"{identity_block}\n\n"
        f"Context:\n- Channel: {customer_label}\n- Exact topic: {topic_anchor}\n\n"
        f"Page knowledge block:\n{knowledge_block}\n\n"
        f"Customer message:\n{user_message}"
    )
    return _finalize_support_reply(_generate_with_ai(prompt, fallback), user_message=user_message, channel=channel)

def check_gemini_health(api_key: str | None = None) -> dict:
    resolved_key = (api_key or resolve_runtime_value("GEMINI_API_KEY") or "").strip()
    if not resolved_key:
        return {
            "configured": False,
            "ok": True,
            "status": "skipped",
            "model": GEMINI_MODEL,
            "message": "Chưa cấu hình GEMINI_API_KEY nên bỏ qua kiểm tra Gemini.",
        }

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={resolved_key}"
    try:
        response = request_with_retries(
            "POST",
            url,
            json={
                "contents": [{"parts": [{"text": "Reply with OK"}]}],
                "generationConfig": {"temperature": 0},
            },
            headers={"Content-Type": "application/json"},
            timeout=min(settings.EXTERNAL_HTTP_TIMEOUT, 8),
            max_attempts=2,
            scope="gemini",
            operation="health_check",
        )
    except Exception as exc:
        return {
            "configured": True,
            "ok": False,
            "status": "error",
            "model": GEMINI_MODEL,
            "message": f"Không thể kết nối Gemini: {exc}",
        }

    try:
        data = response.json()
    except ValueError:
        data = {}

    if response.status_code != 200:
        error_message = data.get("error", {}).get("message") if isinstance(data, dict) else None
        return {
            "configured": True,
            "ok": False,
            "status": "error",
            "model": GEMINI_MODEL,
            "message": error_message or f"Gemini trả về HTTP {response.status_code}.",
        }

    ok = bool(
        data.get("candidates")
        and data["candidates"][0].get("content")
        and data["candidates"][0]["content"].get("parts")
    )
    return {
        "configured": True,
        "ok": ok,
        "status": "healthy" if ok else "error",
        "model": GEMINI_MODEL,
        "available_models": [GEMINI_MODEL],
        "target_model_visible": ok,
        "message": "Gemini API phản hồi bình thường." if ok else "Gemini không trả về nội dung hợp lệ từ generateContent.",
    }

def check_openai_health(api_key: str | None = None) -> dict:
    resolved_key = (api_key or resolve_runtime_value("OPENAI_API_KEY") or "").strip()
    if not resolved_key:
        return {
            "configured": False,
            "ok": True,
            "status": "skipped",
            "model": OPENAI_MODEL,
            "message": "Chua cau hinh OPENAI_API_KEY nen bo qua kiem tra OpenAI.",
        }

    try:
        response = request_with_retries(
            "POST",
            OPENAI_RESPONSES_URL,
            json={
                "model": OPENAI_MODEL,
                "input": "Reply with OK",
                "reasoning": {"effort": "low"},
            },
            headers={
                "Authorization": f"Bearer {resolved_key}",
                "Content-Type": "application/json",
            },
            timeout=min(settings.EXTERNAL_HTTP_TIMEOUT, 8),
            max_attempts=2,
            scope="openai",
            operation="health_check",
        )
    except Exception as exc:
        return {
            "configured": True,
            "ok": False,
            "status": "error",
            "model": OPENAI_MODEL,
            "message": f"Khong the ket noi OpenAI: {exc}",
        }

    try:
        data = response.json()
    except ValueError:
        data = {}

    if response.status_code != 200:
        error_message = data.get("error", {}).get("message") if isinstance(data, dict) else None
        return {
            "configured": True,
            "ok": False,
            "status": "error",
            "model": OPENAI_MODEL,
            "message": error_message or f"OpenAI tra ve HTTP {response.status_code}.",
        }

    text = _extract_openai_output_text(data)
    ok = bool(text)
    return {
        "configured": True,
        "ok": ok,
        "status": "healthy" if ok else "error",
        "model": OPENAI_MODEL,
        "available_models": [OPENAI_MODEL],
        "target_model_visible": ok,
        "message": "OpenAI Responses API phan hoi binh thuong." if ok else "OpenAI khong tra ve noi dung hop le tu Responses API.",
    }
