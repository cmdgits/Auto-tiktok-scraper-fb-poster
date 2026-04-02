import { useState } from 'react';
import {
  AlertTriangle,
  CircleCheck,
  Clock,
  ExternalLink,
  FileText,
  ImageIcon,
  MessagesSquare,
  Paperclip,
  Reply,
  SmilePlus,
  X,
} from 'lucide-react';

import {
  cx,
  EmptyState,
  InfoRow,
  StatusPill,
} from '../ui';

const EMOJI_GROUPS = [
  { label: 'Nhanh', items: ['👍', '❤️', '😂', '😍', '🙏', '🔥', '🎉', '😊'] },
  { label: 'Cảm xúc', items: ['😀', '😁', '🥰', '😎', '🤔', '😢', '😡', '😴'] },
  { label: 'Hành động', items: ['👏', '🙌', '💪', '✌️', '🤝', '👀', '💯', '✅'] },
  { label: 'Biểu tượng', items: ['✨', '⭐', '🌈', '🍀', '🎁', '📌', '📣', '💬'] },
];

export default function ConversationWorkspace({
  state,
  actions,
  helpers,
  classes,
  refs,
}) {
  const {
    selectedConversation,
    selectedConversationStatusMeta,
    selectedConversationTimeline,
    selectedConversationLogs,
    selectedReplyTarget,
    selectedReplyAttachment,
    fbPages,
    actionState,
    manualReplyDraft,
  } = state;
  const {
    handleConversationStatusChange,
    setManualReplyDraft,
    handleManualReply,
    handleReplyToMessage,
    handleReplyTargetClear,
    handleAppendEmoji,
    handleReplyAttachmentPick,
    handleReplyAttachmentChange,
    handleReplyAttachmentClear,
  } = actions;
  const {
    formatDateTime,
    formatIntentLabel,
  } = helpers;
  const { FIELD_CLASS, BUTTON_PRIMARY, BUTTON_SECONDARY, BUTTON_GHOST } = classes;
  const { manualReplyPanelRef, manualReplyInputRef, manualReplyAttachmentInputRef } = refs;
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);

  if (!selectedConversation) {
    return (
      <EmptyState title="Chọn một cuộc trò chuyện" description="Danh sách bên trái đã được gom theo conversation để operator xử lý gọn hơn." />
    );
  }

  const pageLabel = fbPages.find((pageItem) => pageItem.page_id === selectedConversation.page_id)?.page_name || selectedConversation.page_id;
  const isAiActive = selectedConversation.status === 'ai_active';
  const isOperatorActive = selectedConversation.status === 'operator_active';
  const isResolved = selectedConversation.status === 'resolved';

  return (
    <div className="space-y-4">
      <div ref={manualReplyPanelRef} className="rounded-[24px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.92))] p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="font-display text-xl font-semibold text-slate-900">
              {pageLabel}
            </div>
            <div className="mt-1 text-sm text-[var(--text-muted)]">Người gửi: {selectedConversation.sender_name || selectedConversation.sender_id}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusPill tone={selectedConversationStatusMeta.tone}>{selectedConversationStatusMeta.label}</StatusPill>
              {selectedConversation.current_intent ? <StatusPill tone="amber">{formatIntentLabel(selectedConversation.current_intent)}</StatusPill> : null}
              {selectedConversation.assigned_user ? <StatusPill tone="slate">Người xử lý: {selectedConversation.assigned_user.display_name}</StatusPill> : null}
            </div>
          </div>
          <div className="mobile-action-stack xl:min-w-[220px]">
            {selectedConversation.facebook_thread_url ? (
              <a href={selectedConversation.facebook_thread_url} target="_blank" rel="noreferrer" className={BUTTON_GHOST}>
                <ExternalLink className="h-4 w-4" />
                Mở trên Facebook
              </a>
            ) : null}
            {isOperatorActive ? (
              <>
                <button
                  type="button"
                  className={BUTTON_SECONDARY}
                  onClick={() => handleConversationStatusChange(selectedConversation.id, 'resolved')}
                  disabled={actionState[`conversation-status-resolved-${selectedConversation.id}`]}
                >
                  <CircleCheck className="h-4 w-4" />
                  {actionState[`conversation-status-resolved-${selectedConversation.id}`] ? 'Đang cập nhật...' : 'Đánh dấu đã xử lý'}
                </button>
                <button
                  type="button"
                  className={BUTTON_GHOST}
                  onClick={() => handleConversationStatusChange(selectedConversation.id, 'ai_active')}
                  disabled={actionState[`conversation-status-ai_active-${selectedConversation.id}`]}
                >
                  <Reply className="h-4 w-4" />
                  {actionState[`conversation-status-ai_active-${selectedConversation.id}`] ? 'Đang cập nhật...' : 'Bật lại AI'}
                </button>
              </>
            ) : isResolved ? (
              <>
                <button
                  type="button"
                  className={cx(BUTTON_GHOST, 'border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-300/30 hover:bg-rose-100')}
                  onClick={() => handleConversationStatusChange(selectedConversation.id, 'operator_active', 'Đã mở lại để operator hỗ trợ tiếp.')}
                  disabled={actionState[`conversation-status-operator_active-${selectedConversation.id}`]}
                >
                  <AlertTriangle className="h-4 w-4" />
                  {actionState[`conversation-status-operator_active-${selectedConversation.id}`] ? 'Đang cập nhật...' : 'Mở lại cho operator'}
                </button>
                <button
                  type="button"
                  className={BUTTON_GHOST}
                  onClick={() => handleConversationStatusChange(selectedConversation.id, 'ai_active')}
                  disabled={actionState[`conversation-status-ai_active-${selectedConversation.id}`]}
                >
                  <Reply className="h-4 w-4" />
                  {actionState[`conversation-status-ai_active-${selectedConversation.id}`] ? 'Đang cập nhật...' : 'Bật lại AI'}
                </button>
              </>
            ) : (
              <button
                type="button"
                className={cx(BUTTON_GHOST, 'border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-300/30 hover:bg-rose-100')}
                onClick={() => handleConversationStatusChange(selectedConversation.id, 'operator_active', 'Đã chuyển cho nhân viên tư vấn hỗ trợ tiếp.')}
                disabled={actionState[`conversation-status-operator_active-${selectedConversation.id}`]}
              >
                <AlertTriangle className="h-4 w-4" />
                {actionState[`conversation-status-operator_active-${selectedConversation.id}`] ? 'Đang cập nhật...' : 'Chuyển operator'}
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <InfoRow label="Tin khách cuối" value={formatDateTime(selectedConversation.last_customer_message_at)} />
          <InfoRow label="AI phản hồi cuối" value={formatDateTime(selectedConversation.last_ai_reply_at)} />
          <InfoRow label="Operator phản hồi cuối" value={formatDateTime(selectedConversation.last_operator_reply_at)} />
          <InfoRow label="Đóng case lúc" value={formatDateTime(selectedConversation.resolved_at)} />
        </div>
      </div>

      <div className="rounded-[24px] border border-slate-200/80 bg-white/80 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">Timeline cuộc trò chuyện</div>
          <StatusPill tone="slate">{selectedConversationLogs.length} bản ghi</StatusPill>
        </div>
        <div className="mt-4 rounded-[20px] border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-800">
          Chọn nút <span className="font-semibold">Trả lời</span> trên một tin nhắn của khách để phản hồi đúng ngữ cảnh. Emoji có thể chèn trực tiếp từ thanh công cụ bên dưới khung soạn.
        </div>
        {selectedConversationTimeline.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="Chưa có timeline" description="Lịch sử chat sẽ hiện ở đây khi có tin nhắn hoặc phản hồi." />
          </div>
        ) : (
          <div className="mt-4 max-h-[40rem] space-y-3 overflow-y-auto pr-1">
            {selectedConversationTimeline.map((event) => (
              <div
                key={event.id}
                className={cx(
                  'rounded-[22px] border px-4 py-3',
                  event.type === 'customer'
                    ? 'border-slate-200/80 bg-white/80'
                    : event.type === 'operator'
                      ? 'border-amber-200 bg-amber-50'
                      : 'border-sky-200 bg-sky-50',
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="font-medium text-slate-900">{event.sourceLabel}</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill tone="slate" icon={Clock}>{formatDateTime(event.time)}</StatusPill>
                    {event.canReply ? (
                      <button
                        type="button"
                        className={cx(
                          BUTTON_GHOST,
                          'px-3 py-1.5',
                          selectedReplyTarget?.id === event.logId ? 'border-sky-300 bg-sky-50 text-sky-700' : '',
                        )}
                        onClick={() => handleReplyToMessage(event)}
                      >
                        <Reply className="h-3.5 w-3.5" />
                        Trả lời
                      </button>
                    ) : null}
                  </div>
                </div>
                {event.replyTo ? (
                  <div className="mt-3 rounded-[18px] border border-slate-200/80 bg-white/80 px-3 py-2">
                    <div className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">{event.replyTo.sourceLabel}</div>
                    <div className="mt-1 line-clamp-2 text-sm leading-6 text-[var(--text-soft)]">{event.replyTo.text}</div>
                  </div>
                ) : null}
                {event.attachment ? (
                  <div className="mt-3 rounded-[18px] border border-slate-200/80 bg-white/90 px-3 py-3">
                    {event.attachment.type === 'image' ? (
                      <a href={event.attachment.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-[16px] border border-slate-200">
                        <img src={event.attachment.url} alt={event.attachment.name || 'Attachment'} className="max-h-[220px] w-full object-cover" />
                      </a>
                    ) : (
                      <a href={event.attachment.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-3 transition hover:border-sky-200 hover:bg-sky-50">
                        <FileText className="h-5 w-5 text-slate-500" />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-slate-900">{event.attachment.name || 'Tệp đính kèm'}</div>
                          <div className="text-xs text-[var(--text-muted)]">Mở tệp</div>
                        </div>
                      </a>
                    )}
                  </div>
                ) : null}
                {event.text ? <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-900">{event.text}</div> : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-[24px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(56,189,248,0.06),rgba(0,0,0,0.06))] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">Trả lời trong Messenger</div>
            <div className="mt-2 text-sm text-[var(--text-soft)]">
              {isAiActive
                ? 'AI đang xử lý cuộc chat này. Nếu cần trả lời tay, hãy chuyển operator trước.'
                : 'Chọn một tin khách trong timeline để trả lời đúng ngữ cảnh, rồi soạn nội dung ở đây.'}
            </div>
          </div>
          {!isAiActive ? <StatusPill tone="rose">AI đang tạm dừng cho case này</StatusPill> : null}
        </div>
        <div className="mt-4 rounded-[24px] border border-slate-200/80 bg-white p-3 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
          {selectedReplyTarget ? (
            <div className="mb-3 rounded-[18px] border border-sky-200 bg-sky-50 px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-medium uppercase tracking-[0.18em] text-sky-700">Trả lời {selectedReplyTarget.sender_name || 'khách hàng'}</div>
                  <div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-900">{selectedReplyTarget.user_message}</div>
                </div>
                <button
                  type="button"
                  className={cx(BUTTON_GHOST, 'min-h-8 px-2 py-1 text-slate-500')}
                  onClick={handleReplyTargetClear}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : null}

          {selectedReplyAttachment ? (
            <div className="mb-3 rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-3">
              {selectedReplyAttachment.kind === 'image' && selectedReplyAttachment.preview_url ? (
                <div className="mb-3 overflow-hidden rounded-[18px] border border-slate-200 bg-white">
                  <img
                    src={selectedReplyAttachment.preview_url}
                    alt={selectedReplyAttachment.name || 'Preview ảnh'}
                    className="max-h-[280px] w-full object-contain"
                  />
                </div>
              ) : null}
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  {selectedReplyAttachment.kind === 'image' ? (
                    <ImageIcon className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" />
                  ) : (
                    <FileText className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" />
                  )}
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-900">{selectedReplyAttachment.name}</div>
                    <div className="text-xs text-[var(--text-muted)]">
                      {selectedReplyAttachment.kind === 'image' ? 'Ảnh xem trước trước khi gửi' : 'Tệp đính kèm'} • {(selectedReplyAttachment.size / 1024 / 1024).toFixed(2)} MB
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className={cx(BUTTON_GHOST, 'min-h-8 px-2 py-1 text-slate-500')}
                  onClick={handleReplyAttachmentClear}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : null}

          <textarea
            ref={manualReplyInputRef}
            className={cx(FIELD_CLASS, 'min-h-[132px] resize-y border-none bg-transparent px-1 py-2 shadow-none focus:border-none focus:ring-0')}
            value={manualReplyDraft}
            onChange={(event) => setManualReplyDraft(event.target.value)}
            placeholder={isAiActive ? 'Chuyển operator để phản hồi tay.' : 'Trả lời trong Messenger...'}
            disabled={isAiActive}
          />

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
            <div className="relative flex flex-wrap items-center gap-2">
              <input
                ref={manualReplyAttachmentInputRef}
                type="file"
                className="hidden"
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar,.csv"
                onChange={handleReplyAttachmentChange}
              />
              <button
                type="button"
                className={cx(BUTTON_GHOST, 'min-h-9 px-3 py-2')}
                onClick={handleReplyAttachmentPick}
                disabled={isAiActive}
              >
                <Paperclip className="h-4 w-4" />
                Đính kèm
              </button>
              <button
                type="button"
                className={cx(BUTTON_GHOST, 'min-h-9 px-3 py-2')}
                onClick={() => setEmojiPickerOpen((current) => !current)}
                disabled={isAiActive}
              >
                <SmilePlus className="h-4 w-4" />
                Emoji
              </button>
              {EMOJI_GROUPS[0].items.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className={cx(BUTTON_GHOST, 'min-h-9 px-3 py-2 text-base')}
                  onClick={() => handleAppendEmoji(emoji)}
                  disabled={isAiActive}
                >
                  {emoji}
                </button>
              ))}
              {emojiPickerOpen ? (
                <div className="absolute left-0 top-full z-10 mt-2 w-[320px] rounded-[24px] border border-slate-200 bg-white p-3 shadow-[0_24px_60px_rgba(15,23,42,0.12)]">
                  <div className="space-y-3">
                    {EMOJI_GROUPS.map((group) => (
                      <div key={group.label}>
                        <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">{group.label}</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {group.items.map((emoji) => (
                            <button
                              key={`${group.label}-${emoji}`}
                              type="button"
                              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-lg transition hover:border-sky-200 hover:bg-sky-50"
                              onClick={() => handleAppendEmoji(emoji)}
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mobile-action-stack">
              <button
                type="button"
                className={BUTTON_PRIMARY}
                onClick={() => handleManualReply(false)}
                disabled={isAiActive || actionState[`conversation-reply-${selectedConversation.id}`]}
              >
                <MessagesSquare className="h-4 w-4" />
                {actionState[`conversation-reply-${selectedConversation.id}`] ? 'Đang gửi...' : 'Gửi phản hồi'}
              </button>
              <button
                type="button"
                className={BUTTON_SECONDARY}
                onClick={() => handleManualReply(true)}
                disabled={isAiActive || actionState[`conversation-reply-${selectedConversation.id}`]}
              >
                <CircleCheck className="h-4 w-4" />
                {actionState[`conversation-reply-${selectedConversation.id}`] ? 'Đang gửi...' : 'Gửi và đánh dấu đã xử lý'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


