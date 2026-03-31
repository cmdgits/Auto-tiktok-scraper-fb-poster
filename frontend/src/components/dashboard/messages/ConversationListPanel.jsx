import { InfoRow, EmptyState, StatusPill, cx } from '../ui';

export default function ConversationListPanel({
  state,
  actions,
  helpers,
  classes,
}) {
  const {
    conversationList,
    handoffConversations,
    resolvedConversations,
    conversationStatusFilter,
    visibleConversations,
    selectedConversationId,
    fbPages,
  } = state;
  const {
    setConversationStatusFilter,
    setSelectedConversationId,
  } = actions;
  const {
    getConversationStatusMeta,
    formatIntentLabel,
    summarizeText,
    formatDateTime,
  } = helpers;
  const { BUTTON_GHOST } = classes;

  const filters = [
    { value: 'all', label: `Tất cả (${conversationList.length})` },
    { value: 'operator_active', label: `Cần operator (${handoffConversations.length})` },
    { value: 'ai_active', label: `AI đang xử lý (${conversationList.filter((conversation) => conversation.status === 'ai_active').length})` },
    { value: 'resolved', label: `Đã xử lý (${resolvedConversations.length})` },
  ];

  return (
    <div className="space-y-4 xl:max-h-[78vh] xl:overflow-y-auto xl:pr-1">
      <div className="rounded-[24px] border border-slate-200/80 bg-white/80 p-3">
        <div className="flex flex-wrap gap-2">
          {filters.map((filterItem) => (
            <button
              key={filterItem.value}
              type="button"
              onClick={() => setConversationStatusFilter(filterItem.value)}
              className={cx(
                BUTTON_GHOST,
                conversationStatusFilter === filterItem.value ? 'border-sky-300 bg-sky-50 text-sky-700 shadow-[0_10px_24px_rgba(56,189,248,0.12)]' : '',
              )}
            >
              {filterItem.label}
            </button>
          ))}
        </div>
      </div>

      {visibleConversations.length === 0 ? (
        <EmptyState title="Chưa có conversation phù hợp" description="Tin nhắn inbox sẽ được gom theo conversation và hiện tại đây." />
      ) : (
        visibleConversations.map((conversation) => {
          const targetPage = fbPages.find((pageItem) => pageItem.page_id === conversation.page_id);
          const statusMeta = getConversationStatusMeta(conversation.status);
          const isSelected = selectedConversationId === conversation.id;
          return (
            <button
              key={conversation.id}
              type="button"
              onClick={() => setSelectedConversationId(conversation.id)}
              className={cx(
                'w-full rounded-[24px] border p-4 text-left transition-all',
                isSelected
                  ? 'border-sky-300 bg-sky-50 shadow-[0_10px_24px_rgba(56,189,248,0.12)]'
                  : 'border-slate-200/80 bg-white/80 hover:border-slate-300 hover:bg-white',
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-slate-900">{targetPage?.page_name || conversation.page_id}</div>
                  <div className="mt-1 text-xs text-[var(--text-muted)]">Người gửi: {conversation.sender_name || conversation.sender_id}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <StatusPill tone={statusMeta.tone}>{statusMeta.label}</StatusPill>
                  {conversation.current_intent ? <StatusPill tone="amber">{formatIntentLabel(conversation.current_intent)}</StatusPill> : null}
                </div>
              </div>
              <div className="mt-3 text-sm leading-6 text-[var(--text-soft)]">
                {summarizeText(conversation.latest_preview, 'Chưa có nội dung.')}
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <InfoRow label="Lượt chat" value={conversation.message_count ?? 0} />
                <InfoRow label="Cập nhật cuối" value={formatDateTime(conversation.latest_activity_at)} />
                <InfoRow label="Người xử lý" value={conversation.assigned_user?.display_name || 'Chưa gán'} />
                <InfoRow label="Nguồn preview" value={conversation.latest_preview_direction === 'page' ? 'Trang' : 'Khách'} />
              </div>
            </button>
          );
        })
      )}
    </div>
  );
}



