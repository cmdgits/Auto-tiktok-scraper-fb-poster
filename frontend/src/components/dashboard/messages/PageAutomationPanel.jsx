import {
  Bot,
  MessagesSquare,
  ShieldCheck,
} from 'lucide-react';

import {
  cx,
  DetailToggle,
  EmptyState,
  Panel,
  StatusPill,
} from '../ui';

export default function PageAutomationPanel({
  state,
  actions,
  helpers,
  classes,
}) {
  const {
    fbPages,
    replyAutomationDrafts,
    pageChecks,
    expandedItems,
    actionState,
  } = state;
  const {
    handleSubscribeMessages,
    handleValidatePage,
    toggleExpandedItem,
    handleReplyAutomationReset,
    handleReplyAutomationSave,
    handleReplyAutomationDraftChange,
  } = actions;
  const {
    buildReplyAutomationDraft,
    getPageTokenMeta,
    getResolvedPageTokenKind,
    getMessengerConnectionMeta,
  } = helpers;
  const { FIELD_CLASS, BUTTON_PRIMARY, BUTTON_SECONDARY, BUTTON_GHOST } = classes;

  return (
    <Panel eyebrow="Prompt theo trang" title="Bật tắt và soạn quy tắc trả lời">
      {fbPages.length === 0 ? (
        <EmptyState title="Chưa có fanpage" description="Thêm fanpage trước khi cấu hình AI." />
      ) : (
        <div className="space-y-4">
          {fbPages.map((pageItem) => {
            const draft = replyAutomationDrafts[pageItem.page_id] || buildReplyAutomationDraft(pageItem);
            const validation = pageChecks[pageItem.page_id];
            const tokenMeta = getPageTokenMeta(getResolvedPageTokenKind(pageItem, validation));
            const messengerMeta = getMessengerConnectionMeta(validation);
            const isExpanded = !!expandedItems[`page-ai:${pageItem.page_id}`];

            return (
              <article key={pageItem.page_id} className="rounded-[24px] border border-slate-200/80 bg-white/[0.035] p-4 shadow-[0_18px_46px_rgba(3,9,23,0.14)]">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="font-display text-lg font-semibold text-slate-900 sm:text-[1.15rem]">{pageItem.page_name}</div>
                    <div className="mt-1 text-xs text-[var(--text-muted)]">{pageItem.page_id}</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <StatusPill tone={tokenMeta.tone}>{tokenMeta.label}</StatusPill>
                      <StatusPill tone={messengerMeta.tone}>{messengerMeta.label}</StatusPill>
                      <StatusPill tone={draft.comment_auto_reply_enabled ? 'emerald' : 'slate'}>
                        Comment: {draft.comment_auto_reply_enabled ? 'Bật' : 'Tắt'}
                      </StatusPill>
                      <StatusPill tone={draft.message_auto_reply_enabled ? 'emerald' : 'slate'}>
                        Inbox: {draft.message_auto_reply_enabled ? 'Bật' : 'Tắt'}
                      </StatusPill>
                      <StatusPill tone={draft.message_reply_schedule_enabled ? 'sky' : 'slate'}>
                        Giờ: {draft.message_reply_schedule_enabled ? `${draft.message_reply_start_time}-${draft.message_reply_end_time}` : 'Cả ngày'}
                      </StatusPill>
                      <StatusPill tone={draft.message_reply_cooldown_minutes > 0 ? 'amber' : 'slate'}>
                        Cooldown: {draft.message_reply_cooldown_minutes > 0 ? `${draft.message_reply_cooldown_minutes} phút` : 'Tắt'}
                      </StatusPill>
                    </div>
                    <div className="mt-3 rounded-[20px] border border-slate-200/80 bg-white/90 px-4 py-3 text-sm leading-7 text-[var(--text-soft)]">
                      {messengerMeta.detail}
                    </div>
                  </div>
                  <div className="mobile-action-stack lg:min-w-[220px]">
                    <button
                      type="button"
                      className={BUTTON_GHOST}
                      onClick={() => handleSubscribeMessages(pageItem.page_id)}
                      disabled={actionState[`page-subscribe-${pageItem.page_id}`]}
                    >
                      <MessagesSquare className="h-4 w-4" />
                      {actionState[`page-subscribe-${pageItem.page_id}`] ? 'Đang đăng ký...' : 'Đăng ký webhook'}
                    </button>
                    <button
                      type="button"
                      className={BUTTON_SECONDARY}
                      onClick={() => handleValidatePage(pageItem.page_id)}
                      disabled={actionState[`page-validate-${pageItem.page_id}`]}
                    >
                      <ShieldCheck className="h-4 w-4" />
                      {actionState[`page-validate-${pageItem.page_id}`] ? 'Đang kiểm tra...' : 'Kiểm tra kết nối'}
                    </button>
                    <DetailToggle expanded={isExpanded} onClick={() => toggleExpandedItem(`page-ai:${pageItem.page_id}`)} />
                  </div>
                </div>
                {isExpanded ? (
                  <>
                    <div className="mt-5 mobile-action-stack">
                      <button type="button" className={BUTTON_GHOST} onClick={() => handleReplyAutomationReset(pageItem)}>
                        Khôi phục
                      </button>
                      <button
                        type="button"
                        className={BUTTON_PRIMARY}
                        onClick={() => handleReplyAutomationSave(pageItem.page_id)}
                        disabled={actionState[`reply-automation-${pageItem.page_id}`]}
                      >
                        <Bot className="h-4 w-4" />
                        {actionState[`reply-automation-${pageItem.page_id}`] ? 'Đang lưu...' : 'Lưu prompt AI'}
                      </button>
                    </div>
                    <div className="mt-5 grid gap-4 xl:grid-cols-2">
                      <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/80 p-4">
                        <label className="flex items-center justify-between gap-3 rounded-[20px] border border-slate-200/80 bg-white/80 px-4 py-3">
                          <div>
                            <div className="font-medium text-slate-900">Tự động trả lời comment</div>
                            <div className="mt-1 text-sm text-[var(--text-soft)]">Luồng bình luận hiện có.</div>
                          </div>
                          <input
                            type="checkbox"
                            checked={draft.comment_auto_reply_enabled}
                            onChange={(event) => handleReplyAutomationDraftChange(pageItem.page_id, 'comment_auto_reply_enabled', event.target.checked)}
                          />
                        </label>
                        <div className="mt-4 text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">Prompt comment</div>
                        <textarea
                          className={cx(FIELD_CLASS, 'mt-3 min-h-[180px] resize-y')}
                          value={draft.comment_ai_prompt}
                          onChange={(event) => handleReplyAutomationDraftChange(pageItem.page_id, 'comment_ai_prompt', event.target.value)}
                          placeholder="Để trống nếu muốn dùng prompt mặc định cho comment."
                        />
                      </div>

                      <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/80 p-4">
                        <label className="flex items-center justify-between gap-3 rounded-[20px] border border-slate-200/80 bg-white/80 px-4 py-3">
                          <div>
                            <div className="font-medium text-slate-900">Tự động trả lời inbox</div>
                            <div className="mt-1 text-sm text-[var(--text-soft)]">Luồng Messenger mới.</div>
                          </div>
                          <input
                            type="checkbox"
                            checked={draft.message_auto_reply_enabled}
                            onChange={(event) => handleReplyAutomationDraftChange(pageItem.page_id, 'message_auto_reply_enabled', event.target.checked)}
                          />
                        </label>
                        <div className="mt-4 text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">Prompt inbox</div>
                        <textarea
                          className={cx(FIELD_CLASS, 'mt-3 min-h-[180px] resize-y')}
                          value={draft.message_ai_prompt}
                          onChange={(event) => handleReplyAutomationDraftChange(pageItem.page_id, 'message_ai_prompt', event.target.value)}
                          placeholder="Để trống nếu muốn dùng prompt mặc định cho inbox."
                        />
                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                          <label className="space-y-2">
                            <span className="flex items-center justify-between text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">
                              <span>Khung giờ</span>
                              <input
                                type="checkbox"
                                checked={draft.message_reply_schedule_enabled}
                                onChange={(event) => handleReplyAutomationDraftChange(pageItem.page_id, 'message_reply_schedule_enabled', event.target.checked)}
                              />
                            </span>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                              <input
                                type="time"
                                className={FIELD_CLASS}
                                value={draft.message_reply_start_time}
                                onChange={(event) => handleReplyAutomationDraftChange(pageItem.page_id, 'message_reply_start_time', event.target.value)}
                                disabled={!draft.message_reply_schedule_enabled}
                              />
                              <input
                                type="time"
                                className={FIELD_CLASS}
                                value={draft.message_reply_end_time}
                                onChange={(event) => handleReplyAutomationDraftChange(pageItem.page_id, 'message_reply_end_time', event.target.value)}
                                disabled={!draft.message_reply_schedule_enabled}
                              />
                            </div>
                          </label>
                          <label className="space-y-2">
                            <span className="text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">Cooldown cùng người gửi</span>
                            <input
                              type="number"
                              min="0"
                              max="1440"
                              className={FIELD_CLASS}
                              value={draft.message_reply_cooldown_minutes}
                              onChange={(event) => handleReplyAutomationDraftChange(pageItem.page_id, 'message_reply_cooldown_minutes', parseInt(event.target.value, 10) || 0)}
                            />
                            <div className="text-sm text-[var(--text-soft)]">Tính theo phút, giờ Việt Nam.</div>
                          </label>
                        </div>
                      </div>
                    </div>
                  </>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </Panel>
  );
}



