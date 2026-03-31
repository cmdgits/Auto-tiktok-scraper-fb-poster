import {
  AlertTriangle,
  CircleCheck,
  Clock,
  ExternalLink,
  MessagesSquare,
  RefreshCw,
} from 'lucide-react';

import {
  cx,
  EmptyState,
  InfoRow,
  StatusPill,
} from '../ui';

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
    fbPages,
    actionState,
    manualReplyDraft,
  } = state;
  const {
    handleConversationStatusChange,
    setManualReplyDraft,
    handleManualReply,
    handlePrepareMessageCorrection,
  } = actions;
  const {
    formatDateTime,
    formatIntentLabel,
  } = helpers;
  const { FIELD_CLASS, BUTTON_PRIMARY, BUTTON_SECONDARY, BUTTON_GHOST } = classes;
  const { manualReplyPanelRef, manualReplyInputRef } = refs;

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
                  <RefreshCw className="h-4 w-4" />
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
                  <RefreshCw className="h-4 w-4" />
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
        <div className="mt-4 rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              Tin nhắn khách hàng là dữ liệu chỉ đọc, không được sửa hoặc xóa từ dashboard.
              Phản hồi của AI hoặc quản trị viên cũng không thể sửa hoặc xóa trực tiếp trên Facebook bằng Messenger Send API hiện tại.
              Nút <span className="font-semibold">Nạp lại</span> chỉ chép nội dung cũ xuống khung soạn để bạn sửa rồi gửi một tin nhắn đính chính mới. Nếu cần xóa hẳn cuộc chat, dùng mục <span className="font-semibold">Tác vụ</span> ở danh sách bên trái để mở đúng thread trên Facebook và xóa trong Business Suite.
            </div>
          </div>
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
                    {event.canPrepareCorrection ? (
                      <button
                        type="button"
                        className={cx(BUTTON_GHOST, 'px-3 py-1.5')}
                        onClick={() => handlePrepareMessageCorrection(event)}
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Nạp lại
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-900">{event.text}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-[24px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(56,189,248,0.06),rgba(0,0,0,0.06))] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">Phản hồi thủ công</div>
            <div className="mt-2 text-sm text-[var(--text-soft)]">
              {isAiActive
                ? 'AI đang xử lý cuộc chat này. Nếu cần can thiệp tay, hãy chuyển operator trước.'
                : 'Nhập nội dung để operator phản hồi trực tiếp hoặc gửi tin nhắn đính chính từ dashboard.'}
            </div>
          </div>
          {!isAiActive ? <StatusPill tone="rose">AI đang tạm dừng cho case này</StatusPill> : null}
        </div>
        <div className="mt-4 space-y-4">
          <textarea
            ref={manualReplyInputRef}
            className={cx(FIELD_CLASS, 'min-h-[160px] resize-y')}
            value={manualReplyDraft}
            onChange={(event) => setManualReplyDraft(event.target.value)}
            placeholder={isAiActive ? 'Chuyển operator để phản hồi tay.' : 'Nhập phản hồi hoặc nội dung đính chính gửi cho khách hàng.'}
            disabled={isAiActive}
          />
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
  );
}


