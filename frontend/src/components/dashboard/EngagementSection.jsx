import { Clock, MessageSquareText } from 'lucide-react';

import { Bot, Send, TriangleAlert, UserRound } from 'lucide-react';

import {
  cx,
  DetailToggle,
  EmptyState,
  InfoRow,
  Panel,
  StatusIcon,
  StatusPill,
} from './ui';

function getReplyModeMeta(replyMode) {
  if (replyMode === 'operator') {
    return {
      label: 'Operator phản hồi',
      tone: 'amber',
      description: 'Operator sẽ chủ động nhập nội dung và gửi phản hồi thủ công cho bình luận này.',
    };
  }

  return {
    label: 'AI phản hồi',
    tone: 'sky',
    description: 'Worker AI sẽ sinh nội dung và gửi phản hồi tự động khi task được xử lý.',
  };
}

function getReplySourceMeta(replySource) {
  if (replySource === 'operator') return { label: 'Đã gửi bởi operator', tone: 'amber' };
  if (replySource === 'ai') return { label: 'Đã gửi bởi AI', tone: 'sky' };
  return null;
}

const ENGAGEMENT_FILTER_OPTIONS = [
  { value: 'all', label: 'Tất cả bình luận' },
  { value: 'ai_replied', label: 'AI đã trả lời' },
  { value: 'operator_replied', label: 'Người dùng trả lời' },
  { value: 'ai_failed', label: 'AI lỗi cần xử lý' },
];

export default function EngagementSection({ state, actions, helpers, classes }) {
  const {
    systemInfo,
    interactions,
    filteredInteractions,
    engagementPage,
    engagementFilter,
    totalEngagementPages,
    pagedInteractions,
    stats,
    fbPages,
    expandedItems,
    actionState,
    commentReplyDrafts,
  } = state;
  const {
    setEngagementPage,
    setEngagementFilter,
    toggleExpandedItem,
    handleCommentReplyModeChange,
    handleGenerateCommentAiDraft,
    handleCommentReplyDraftChange,
    handleCommentManualReply,
  } = actions;
  const {
    formatDateTime,
    summarizeText,
    getStatusClasses,
    getStatusLabel,
  } = helpers;
  const { FIELD_CLASS, BUTTON_PRIMARY, BUTTON_SECONDARY, BUTTON_GHOST } = classes;
  const pendingAiCount = interactions.filter((log) => log.status !== 'replied' && (log.reply_mode || 'ai') === 'ai').length;
  const pendingOperatorCount = interactions.filter((log) => log.status !== 'replied' && (log.reply_mode || 'ai') === 'operator').length;

  return (
    <div className="space-y-6">
      <Panel
        eyebrow="Luồng bình luận"
        title="Phản hồi Facebook theo từng tình huống"
        subtitle="Mỗi bình luận có thể đổi ngay giữa AI và operator để xử lý. Bạn cũng có thể lấy gợi ý AI, chỉnh thêm nội dung rồi gửi thủ công ngay trong cùng một khung."
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <InfoRow label="Bình luận đang chờ" value={systemInfo?.pending_comment_replies ?? 0} emphasis />
          <InfoRow label="Chờ AI xử lý" value={pendingAiCount} />
          <InfoRow label="Chờ operator xử lý" value={pendingOperatorCount} />
          <InfoRow label="Khớp bộ lọc" value={filteredInteractions.length} />
          <InfoRow label="Trang đã kết nối" value={stats.connected_pages ?? 0} />
        </div>
      </Panel>

      <Panel
        eyebrow="Nhật ký tương tác"
        title="Các bình luận gần nhất"
        subtitle="Mở từng bình luận để chọn AI hoặc chuyển cho operator trả lời thủ công."
        action={(
          <div className="rounded-[22px] border border-slate-200 bg-white px-4 py-3 text-sm text-[var(--text-soft)]">
            Trang {engagementPage} / {totalEngagementPages}
          </div>
        )}
      >
        <div className="mb-5 flex flex-wrap gap-2">
          {ENGAGEMENT_FILTER_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setEngagementFilter(option.value)}
              className={cx(
                BUTTON_GHOST,
                engagementFilter === option.value ? 'border-sky-200 bg-sky-50 text-sky-700' : '',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        {filteredInteractions.length === 0 ? (
          <EmptyState title="Chưa có bình luận nào" description="Bình luận mới sẽ xuất hiện tại đây khi webhook nhận được dữ liệu." />
        ) : (
          <div className="space-y-4">
            {pagedInteractions.map((log) => {
              const targetPage = fbPages.find((pageItem) => pageItem.page_id === log.page_id);
              const isExpanded = !!expandedItems[`comment:${log.id}`];
              const replyMode = log.reply_mode || 'ai';
              const replyModeMeta = getReplyModeMeta(replyMode);
              const replySourceMeta = getReplySourceMeta(log.reply_source);
              const isModeBusy = !!actionState[`comment-mode-${log.id}`];
              const isDraftBusy = !!actionState[`comment-draft-${log.id}`];
              const isReplyBusy = !!actionState[`comment-reply-${log.id}`];
              const isReplied = log.status === 'replied';
              const replyDraft = commentReplyDrafts[log.id] || '';
              const isAiFailure = log.status === 'failed' && (replyMode === 'ai' || log.reply_source === 'ai');
              const canManualOverride = isReplied || replyMode === 'operator' || isAiFailure;
              const submitButtonLabel = isReplied ? 'Gửi thay thế' : 'Gửi phản hồi';
              const editorLabel = isReplied ? 'Chỉnh sửa và thay thế phản hồi' : 'Phản hồi thủ công';

              return (
                <article
                  key={log.id}
                  className="rounded-[22px] border border-slate-200/80 bg-white/90 p-4 shadow-[0_14px_32px_rgba(15,23,42,0.04)] sm:p-5"
                >
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <div className="font-display text-base font-semibold text-slate-900">
                        {targetPage?.page_name || log.page_id}
                      </div>
                      <div className="mt-1 text-xs leading-6 text-[var(--text-muted)]">
                        Người dùng: {log.user_name || log.user_id} • Bình luận: {log.comment_id}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill tone={replyModeMeta.tone} icon={replyMode === 'operator' ? UserRound : Bot}>
                        {replyModeMeta.label}
                      </StatusPill>
                      <span
                        className={cx(
                          'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium',
                          getStatusClasses(log.status)
                        )}
                      >
                        <StatusIcon status={log.status} />
                        {getStatusLabel(log.status)}
                      </span>
                      <StatusPill tone="slate" icon={Clock}>
                        {formatDateTime(log.created_at)}
                      </StatusPill>
                    </div>
                  </div>

                  <div className="mt-4 rounded-[20px] border border-slate-200/80 bg-slate-50/70 px-4 py-3 text-sm leading-7 text-[var(--text-soft)]">
                    {summarizeText(log.user_message, 'Chưa có bình luận.')}
                  </div>

                  <div className="mt-4 flex justify-start">
                    <DetailToggle expanded={isExpanded} onClick={() => toggleExpandedItem(`comment:${log.id}`)} />
                  </div>

                  {isExpanded ? (
                    <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
                      <div className="rounded-[22px] border border-slate-200/80 bg-white/90 p-4">
                        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">
                          <MessageSquareText className="h-3.5 w-3.5" />
                          Bình luận gốc
                        </div>
                        <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-900">
                          {log.user_message}
                        </div>
                      </div>

                      <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/70 p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">
                              Cách phản hồi
                            </div>
                            <div className="mt-2 text-sm leading-6 text-[var(--text-soft)]">
                              {replyModeMeta.description}
                            </div>
                          </div>
                          {replySourceMeta ? (
                            <StatusPill tone={replySourceMeta.tone}>
                              {replySourceMeta.label}
                            </StatusPill>
                          ) : null}
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={isReplied || isModeBusy}
                            onClick={() => handleCommentReplyModeChange(log, 'ai')}
                            className={cx(
                              BUTTON_SECONDARY,
                              'min-w-[10rem]',
                              replyMode === 'ai' ? 'border-sky-200 bg-sky-50 text-sky-700' : '',
                            )}
                          >
                            <Bot className="h-4 w-4" />
                            AI phản hồi
                          </button>
                          <button
                            type="button"
                            disabled={isReplied || isModeBusy}
                            onClick={() => handleCommentReplyModeChange(log, 'operator')}
                            className={cx(
                              BUTTON_SECONDARY,
                              'min-w-[10rem]',
                              replyMode === 'operator' ? 'border-amber-200 bg-amber-50 text-amber-700' : '',
                            )}
                          >
                            <UserRound className="h-4 w-4" />
                            Chuyển operator
                          </button>
                          <button
                            type="button"
                            disabled={isReplied || isDraftBusy}
                            onClick={() => handleGenerateCommentAiDraft(log)}
                            className={BUTTON_GHOST}
                          >
                            <Bot className="h-4 w-4" />
                            Gợi ý AI để chỉnh
                          </button>
                        </div>

                        {log.last_error ? (
                          <div className="mt-4 rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">
                            <div className="flex items-center gap-2 font-medium">
                              <TriangleAlert className="h-4 w-4" />
                              Cần xử lý lại phản hồi
                            </div>
                            <div className="mt-1.5">{log.last_error}</div>
                          </div>
                        ) : null}

                        {isReplied ? (
                          <div className="mt-4 rounded-[18px] border border-emerald-200 bg-emerald-50/70 px-4 py-3">
                            <div className="text-xs uppercase tracking-[0.24em] text-emerald-700">
                              Nội dung đã gửi
                            </div>
                            <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-900">
                              {log.ai_reply || 'Không có nội dung phản hồi đã lưu.'}
                            </div>
                            {log.reply_source === 'operator' && log.reply_author ? (
                              <div className="mt-3 text-xs text-[var(--text-soft)]">
                                Thực hiện bởi {log.reply_author.display_name || log.reply_author.username}.
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        {canManualOverride ? (
                          <div className="mt-4 space-y-3">
                            <label className="block text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">
                              {editorLabel}
                            </label>
                            <textarea
                              value={replyDraft}
                              onChange={(event) => handleCommentReplyDraftChange(log.id, event.target.value)}
                              className={cx(FIELD_CLASS, 'min-h-[9.5rem] resize-y')}
                              placeholder="Nhập nội dung operator sẽ gửi cho khách hàng..."
                            />
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="text-sm text-[var(--text-soft)]">
                                {isReplied
                                  ? 'Hệ thống sẽ xóa phản hồi cũ trên Facebook rồi thay bằng nội dung mới bạn nhập.'
                                  : 'Bạn có thể sửa gợi ý AI, thêm ý mới rồi gửi trực tiếp lên bình luận Facebook của khách hàng.'}
                              </div>
                              <button
                                type="button"
                                disabled={isReplyBusy}
                                onClick={() => handleCommentManualReply(log)}
                                className={BUTTON_PRIMARY}
                              >
                                <Send className="h-4 w-4" />
                                {submitButtonLabel}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-4 rounded-[18px] border border-sky-200 bg-sky-50/70 px-4 py-3 text-sm leading-6 text-sky-700">
                            AI đang được bật cho bình luận này. Nếu muốn chỉnh tay nội dung trước khi gửi, bấm Gợi ý AI để chỉnh để chuyển comment sang operator cùng bản nháp AI.
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
            {totalEngagementPages > 1 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 pt-5">
                <div className="text-sm text-[var(--text-soft)]">
                  Hiển thị {pagedInteractions.length} / {filteredInteractions.length} bình luận theo bộ lọc hiện tại.
                </div>
                <div className="flex gap-2">
                  <button type="button" disabled={engagementPage <= 1} onClick={() => setEngagementPage((current) => Math.max(1, current - 1))} className={BUTTON_GHOST}>
                    Trước
                  </button>
                  <button type="button" disabled={engagementPage >= totalEngagementPages} onClick={() => setEngagementPage((current) => Math.min(totalEngagementPages, current + 1))} className={BUTTON_GHOST}>
                    Sau
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </Panel>
    </div>
  );
}
