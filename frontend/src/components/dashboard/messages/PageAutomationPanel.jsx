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
                      <StatusPill tone="sky">
                        History: {draft.message_history_turn_limit} lượt
                      </StatusPill>
                      <StatusPill tone={draft.message_typing_indicator_enabled ? 'emerald' : 'slate'}>
                        Typing: {draft.message_typing_indicator_enabled ? 'Bật' : 'Tắt'}
                      </StatusPill>
                      <StatusPill tone="amber">
                        Delay: {draft.message_reply_min_delay_seconds}-{draft.message_reply_max_delay_seconds}s
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
                        {actionState[`reply-automation-${pageItem.page_id}`] ? 'Đang lưu...' : 'Lưu cấu hình AI'}
                      </button>
                    </div>
                    <div className="mt-5 rounded-[24px] border border-slate-200/80 bg-white/85 p-4">
                      <div className="text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">Nhân sự AI của fanpage</div>
                      <div className="mt-3 grid gap-4 md:grid-cols-2">
                        <label className="space-y-2">
                          <span className="text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">Tên nhân viên AI</span>
                          <input
                            className={FIELD_CLASS}
                            value={draft.ai_agent_name}
                            onChange={(event) => handleReplyAutomationDraftChange(pageItem.page_id, 'ai_agent_name', event.target.value)}
                            placeholder="Ví dụ: Linh, Hân, Mai"
                          />
                        </label>
                        <div className="rounded-[20px] border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-sm leading-7 text-[var(--text-soft)]">
                          AI sẽ tự xưng là nhân viên CSKH của page bằng tên này. Nếu để trống, hệ thống sẽ dùng cách xưng hô trung tính theo fanpage.
                        </div>
                      </div>
                    </div>
                    <div className="mt-5 rounded-[24px] border border-slate-200/80 bg-white/85 p-4">
                      <div className="text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">Kho kiến thức fanpage</div>
                      <textarea
                        className={cx(FIELD_CLASS, 'mt-3 min-h-[180px] resize-y')}
                        value={draft.ai_knowledge_base}
                        onChange={(event) => handleReplyAutomationDraftChange(pageItem.page_id, 'ai_knowledge_base', event.target.value)}
                        placeholder="Điền thông tin AI phải biết để trả lời chính xác: giới thiệu page, sản phẩm/dịch vụ, giá, khu vực phục vụ, giờ làm việc, cách mua, chính sách đổi trả, FAQ, link quan trọng, câu trả lời chuẩn cho các câu hỏi thường gặp."
                      />
                      <div className="mt-3 text-sm leading-6 text-[var(--text-soft)]">
                        Đây là phần dữ liệu thật của fanpage. Khi khách hỏi về page, sản phẩm, dịch vụ, giá, chính sách hay cách liên hệ, AI sẽ ưu tiên đọc phần này trước rồi mới trả lời. Nếu trong đây không có thông tin thì AI sẽ phải nhận là chưa biết thay vì đoán.
                      </div>
                    </div>
                    <div className="mt-5 grid gap-4 xl:grid-cols-2">
                      <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/80 p-4">
                        <label className="flex items-center justify-between gap-3 rounded-[20px] border border-slate-200/80 bg-white/80 px-4 py-3">
                          <div>
                            <div className="font-medium text-slate-900">Tự động trả lời comment</div>
                            <div className="mt-1 text-sm text-[var(--text-soft)]">AI sẽ bám đúng ý bình luận của khách và gợi ý bước tiếp theo khi phù hợp.</div>
                          </div>
                          <input
                            type="checkbox"
                            checked={draft.comment_auto_reply_enabled}
                            onChange={(event) => handleReplyAutomationDraftChange(pageItem.page_id, 'comment_auto_reply_enabled', event.target.checked)}
                          />
                        </label>
                        <div className="mt-4 text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">Quy tắc bổ sung cho comment</div>
                        <textarea
                          className={cx(FIELD_CLASS, 'mt-3 min-h-[180px] resize-y')}
                          value={draft.comment_ai_prompt}
                          onChange={(event) => handleReplyAutomationDraftChange(pageItem.page_id, 'comment_ai_prompt', event.target.value)}
                          placeholder="Ví dụ: Nếu khách hỏi giá hoặc cách mua thì trả lời ngắn gọn, sau đó mời khách nói rõ mẫu hoặc nhu cầu cụ thể."
                        />
                        <div className="mt-3 text-sm leading-6 text-[var(--text-soft)]">
                          Prompt mặc định của hệ thống đã có sẵn các quy tắc: không biết thì nhận, phân loại khủng hoảng, CTA giữ tương tác, hiểu từ lóng mạng và giới hạn độ dài. Ô này chỉ dùng để bổ sung quy tắc riêng cho fanpage.
                        </div>
                      </div>

                      <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/80 p-4">
                        <label className="flex items-center justify-between gap-3 rounded-[20px] border border-slate-200/80 bg-white/80 px-4 py-3">
                          <div>
                            <div className="font-medium text-slate-900">Tự động trả lời inbox</div>
                            <div className="mt-1 text-sm text-[var(--text-soft)]">AI sẽ trả lời theo đúng tin nhắn mới nhất của khách, giữ ngữ cảnh và gợi ý bước tiếp theo khi phù hợp.</div>
                          </div>
                          <input
                            type="checkbox"
                            checked={draft.message_auto_reply_enabled}
                            onChange={(event) => handleReplyAutomationDraftChange(pageItem.page_id, 'message_auto_reply_enabled', event.target.checked)}
                          />
                        </label>
                        <div className="mt-4 text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">Quy tắc bổ sung cho inbox</div>
                        <textarea
                          className={cx(FIELD_CLASS, 'mt-3 min-h-[180px] resize-y')}
                          value={draft.message_ai_prompt}
                          onChange={(event) => handleReplyAutomationDraftChange(pageItem.page_id, 'message_ai_prompt', event.target.value)}
                          placeholder="Ví dụ: Trả lời ngắn gọn, dùng cùng ngôn ngữ với khách, nếu còn thiếu dữ kiện thì chỉ hỏi thêm đúng một câu."
                        />
                        <div className="mt-3 text-sm leading-6 text-[var(--text-soft)]">
                          Prompt mặc định của hệ thống đã có sẵn các quy tắc: không biết thì nhận, bám đúng ngữ cảnh, hiểu từ lóng mạng, trả lời đủ ý và thêm gợi ý bước tiếp theo khi phù hợp. Ô này chỉ dùng để bổ sung quy tắc riêng cho fanpage.
                        </div>
                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                          <label className="space-y-2">
                            <span className="text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">Số lượt hội thoại gửi vào AI</span>
                            <input
                              type="number"
                              min="3"
                              max="5"
                              className={FIELD_CLASS}
                              value={draft.message_history_turn_limit}
                              onChange={(event) => handleReplyAutomationDraftChange(pageItem.page_id, 'message_history_turn_limit', parseInt(event.target.value, 10) || 5)}
                            />
                            <div className="text-sm text-[var(--text-soft)]">Giữ đúng 3-5 lượt gần nhất để AI hiểu các đại từ như “cái đó”, “như trên”.</div>
                          </label>
                          <label className="space-y-2">
                            <span className="flex items-center justify-between text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">
                              <span>Hiện trạng thái đang soạn</span>
                              <input
                                type="checkbox"
                                checked={draft.message_typing_indicator_enabled}
                                onChange={(event) => handleReplyAutomationDraftChange(pageItem.page_id, 'message_typing_indicator_enabled', event.target.checked)}
                              />
                            </span>
                            <div className="rounded-[20px] border border-slate-200/80 bg-white/80 px-4 py-3 text-sm leading-7 text-[var(--text-soft)]">
                              Khi bật, worker sẽ gửi `typing_on` trước lúc phản hồi Messenger để trông giống người thật hơn.
                            </div>
                          </label>
                        </div>
                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                          <label className="space-y-2">
                            <span className="text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">Delay tối thiểu</span>
                            <input
                              type="number"
                              min="0"
                              max="30"
                              className={FIELD_CLASS}
                              value={draft.message_reply_min_delay_seconds}
                              onChange={(event) => handleReplyAutomationDraftChange(pageItem.page_id, 'message_reply_min_delay_seconds', parseInt(event.target.value, 10) || 0)}
                            />
                          </label>
                          <label className="space-y-2">
                            <span className="text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">Delay tối đa</span>
                            <input
                              type="number"
                              min="0"
                              max="30"
                              className={FIELD_CLASS}
                              value={draft.message_reply_max_delay_seconds}
                              onChange={(event) => handleReplyAutomationDraftChange(pageItem.page_id, 'message_reply_max_delay_seconds', parseInt(event.target.value, 10) || 0)}
                            />
                          </label>
                        </div>
                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                          <label className="space-y-2">
                            <span className="text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">Từ khóa chuyển người thật</span>
                            <textarea
                              className={cx(FIELD_CLASS, 'min-h-[120px] resize-y')}
                              value={draft.handoff_keywords}
                              onChange={(event) => handleReplyAutomationDraftChange(pageItem.page_id, 'handoff_keywords', event.target.value)}
                              placeholder="Ví dụ: quản lý, người thật, gọi lại, kỹ thuật, khiếu nại, hoàn tiền"
                            />
                          </label>
                          <label className="space-y-2">
                            <span className="text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">Từ khóa tiêu cực</span>
                            <textarea
                              className={cx(FIELD_CLASS, 'min-h-[120px] resize-y')}
                              value={draft.negative_keywords}
                              onChange={(event) => handleReplyAutomationDraftChange(pageItem.page_id, 'negative_keywords', event.target.value)}
                              placeholder="Ví dụ: bực, tệ, lỗi, hỏng, lừa đảo, không hài lòng"
                            />
                          </label>
                        </div>
                        <div className="mt-3 text-sm leading-6 text-[var(--text-soft)]">
                          Nếu khách dùng từ ngữ tiêu cực hoặc yêu cầu gặp quản lý/người thật, hệ thống sẽ dừng AI, đánh dấu handoff và chuyển conversation sang operator.
                        </div>
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
                            <div className="text-sm text-[var(--text-soft)]">Tính theo phút. Chỉ chặn khi lượt tin khách trước đó vẫn còn đang chờ AI xử lý.</div>
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



