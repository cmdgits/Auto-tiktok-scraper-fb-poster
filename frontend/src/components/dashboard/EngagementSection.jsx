import { Clock, MessageSquareText } from 'lucide-react';

import {
  cx,
  DetailToggle,
  EmptyState,
  InfoRow,
  Panel,
  StatusIcon,
  StatusPill,
} from './ui';

export default function EngagementSection({ state, actions, helpers }) {
  const {
    systemInfo,
    interactions,
    engagementPage,
    totalEngagementPages,
    pagedInteractions,
    stats,
    fbPages,
    expandedItems,
  } = state;
  const { setEngagementPage, toggleExpandedItem } = actions;
  const {
    formatDateTime,
    summarizeText,
    getStatusClasses,
    getStatusLabel,
  } = helpers;

  return (
    <div className="space-y-6">
      <Panel
        eyebrow="Luồng bình luận"
        title="Phản hồi Facebook theo từng tình huống"
        subtitle="Theo dõi bình luận mới, trạng thái xử lý của AI và fanpage liên quan trong một bố cục gọn, dễ quét trên mọi màn hình."
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <InfoRow label="Bình luận đang chờ" value={systemInfo?.pending_comment_replies ?? 0} emphasis />
          <InfoRow label="Đang xem trong trang" value={pagedInteractions.length} />
          <InfoRow label="Trang đã kết nối" value={stats.connected_pages ?? 0} />
        </div>
      </Panel>

      <Panel
        eyebrow="Nhật ký tương tác"
        title="Các bình luận gần nhất"
        subtitle="Mở rộng từng mục để xem nguyên văn bình luận và phản hồi AI đã tạo."
        action={(
          <div className="rounded-[22px] border border-slate-200 bg-white px-4 py-3 text-sm text-[var(--text-soft)]">
            Trang {engagementPage} / {totalEngagementPages}
          </div>
        )}
      >
        {interactions.length === 0 ? (
          <EmptyState title="Chưa có bình luận nào" description="Bình luận mới sẽ xuất hiện tại đây khi webhook nhận được dữ liệu." />
        ) : (
          <div className="space-y-4">
            {pagedInteractions.map((log) => {
              const targetPage = fbPages.find((pageItem) => pageItem.page_id === log.page_id);
              const isExpanded = !!expandedItems[`comment:${log.id}`];

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
                        Người dùng: {log.user_id} • Bình luận: {log.comment_id}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
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
                    <div className="mt-5 grid gap-4 xl:grid-cols-2">
                      <div className="rounded-[22px] border border-slate-200/80 bg-white/90 p-4">
                        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">
                          <MessageSquareText className="h-3.5 w-3.5" />
                          Tin nhắn người dùng
                        </div>
                        <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-900">
                          {log.user_message}
                        </div>
                      </div>
                      <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/70 p-4">
                        <div className="text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">
                          Phản hồi AI
                        </div>
                        <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[var(--text-soft)]">
                          {log.ai_reply || 'AI chưa tạo phản hồi cho mục này.'}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
            {totalEngagementPages > 1 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 pt-5">
                <div className="text-sm text-[var(--text-soft)]">
                  Hiển thị {pagedInteractions.length} / {interactions.length} bình luận gần nhất.
                </div>
                <div className="flex gap-2">
                  <button type="button" disabled={engagementPage <= 1} onClick={() => setEngagementPage((current) => Math.max(1, current - 1))} className="btn-ghost inline-flex min-h-10 items-center justify-center gap-2 rounded-full px-4 py-2.5 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-50">
                    Trước
                  </button>
                  <button type="button" disabled={engagementPage >= totalEngagementPages} onClick={() => setEngagementPage((current) => Math.min(totalEngagementPages, current + 1))} className="btn-ghost inline-flex min-h-10 items-center justify-center gap-2 rounded-full px-4 py-2.5 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-50">
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
