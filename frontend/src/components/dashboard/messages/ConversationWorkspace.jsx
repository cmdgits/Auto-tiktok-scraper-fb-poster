import {
  AlertTriangle,
  CircleCheck,
  Clock,
  ExternalLink,
  MessagesSquare,
  RefreshCw,
  UserPlus,
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
    isAdmin,
    assignableUsers,
    conversationAssigneeDraft,
    conversationNoteDraft,
    currentUser,
    manualReplyDraft,
  } = state;
  const {
    handleConversationStatusChange,
    setConversationAssigneeDraft,
    setConversationNoteDraft,
    handleConversationMetaSave,
    setManualReplyDraft,
    handleManualReply,
  } = actions;
  const {
    formatDateTime,
    formatIntentLabel,
    getConversationFactEntries,
  } = helpers;
  const { FIELD_CLASS, BUTTON_PRIMARY, BUTTON_SECONDARY, BUTTON_GHOST } = classes;
  const { manualReplyPanelRef, manualReplyInputRef } = refs;

  if (!selectedConversation) {
    return (
      <EmptyState title="Chọn một cuộc trò chuyện" description="Danh sách bên trái đã được gom theo conversation để operator xử lý gọn hơn." />
    );
  }

  const factEntries = getConversationFactEntries(selectedConversation);
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
            <div className="mt-1 text-sm text-[var(--text-muted)]">Người gửi: {selectedConversation.sender_id}</div>
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

      <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-[24px] border border-slate-200/80 bg-white/80 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">Memory hội thoại</div>
            {isOperatorActive ? <StatusPill tone="rose" icon={AlertTriangle}>Đang cần người thật</StatusPill> : null}
          </div>
          <div className="mt-3 text-sm leading-7 text-slate-900">{selectedConversation.conversation_summary || 'Chưa có tóm tắt hội thoại.'}</div>
          {selectedConversation.handoff_reason ? (
            <div className="mt-4 rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-7 text-rose-700">
              {selectedConversation.handoff_reason}
            </div>
          ) : null}
        </div>
        <div className="rounded-[24px] border border-slate-200/80 bg-white/80 p-4">
          <div className="text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">Intent và dữ kiện nhớ</div>
          <div className="mt-3 space-y-3">
            <InfoRow label="Intent hiện tại" value={formatIntentLabel(selectedConversation.current_intent)} emphasis />
            <InfoRow label="Người xử lý" value={selectedConversation.assigned_user?.display_name || 'Chưa gán'} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {factEntries.length > 0
              ? factEntries.map(([key, value]) => (
                <StatusPill key={`${selectedConversation.id}-${key}`} tone="slate">{`${formatIntentLabel(key)}: ${value}`}</StatusPill>
              ))
              : <StatusPill tone="slate">Chưa có facts</StatusPill>}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.84fr_1.16fr]">
        <div className="rounded-[24px] border border-slate-200/80 bg-white/80 p-4">
          <div className="text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">Điều phối operator</div>
          <div className="mt-4 space-y-4">
            {isAdmin ? (
              <label className="block space-y-2">
                <span className="text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">Giao cho</span>
                <select className={FIELD_CLASS} value={conversationAssigneeDraft} onChange={(event) => setConversationAssigneeDraft(event.target.value)}>
                  <option value="">Chưa gán người xử lý</option>
                  {assignableUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {(user.display_name || user.username)} • {user.role}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <button type="button" className={BUTTON_GHOST} onClick={() => setConversationAssigneeDraft(currentUser?.id || '')}>
                <UserPlus className="h-4 w-4" />
                Nhận xử lý cho mình
              </button>
            )}
            <label className="block space-y-2">
              <span className="text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">Ghi chú nội bộ</span>
              <textarea
                className={cx(FIELD_CLASS, 'min-h-[160px] resize-y')}
                value={conversationNoteDraft}
                onChange={(event) => setConversationNoteDraft(event.target.value)}
                placeholder="Ghi chú nội bộ cho operator, không gửi cho khách."
              />
            </label>
            <button
              type="button"
              className={BUTTON_SECONDARY}
              onClick={handleConversationMetaSave}
              disabled={actionState[`conversation-meta-${selectedConversation.id}`]}
            >
              <CircleCheck className="h-4 w-4" />
              {actionState[`conversation-meta-${selectedConversation.id}`] ? 'Đang lưu...' : 'Lưu phân công và ghi chú'}
            </button>
          </div>
        </div>

        <div className="rounded-[24px] border border-slate-200/80 bg-white/80 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">Timeline cuộc trò chuyện</div>
            <StatusPill tone="slate">{selectedConversationLogs.length} bản ghi</StatusPill>
          </div>
          {selectedConversationTimeline.length === 0 ? (
            <div className="mt-4">
              <EmptyState title="Chưa có timeline" description="Lịch sử chat sẽ hiện ở đây khi có tin nhắn hoặc phản hồi." />
            </div>
          ) : (
            <div className="mt-4 max-h-[32rem] space-y-3 overflow-y-auto pr-1">
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
                    <StatusPill tone="slate" icon={Clock}>{formatDateTime(event.time)}</StatusPill>
                  </div>
                  <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-900">{event.text}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-[24px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(56,189,248,0.06),rgba(0,0,0,0.06))] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">Phản hồi thủ công</div>
            <div className="mt-2 text-sm text-[var(--text-soft)]">
              {isAiActive
                ? 'AI đang xử lý cuộc chat này. Nếu cần can thiệp tay, hãy chuyển operator trước.'
                : 'Nhập nội dung để operator phản hồi trực tiếp từ dashboard.'}
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
            placeholder={isAiActive ? 'Chuyển operator để phản hồi tay.' : 'Nhập phản hồi gửi cho khách hàng.'}
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


