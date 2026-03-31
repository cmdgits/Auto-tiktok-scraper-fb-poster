import {
  CircleCheck,
  CloudDownload,
  ExternalLink,
  Filter,
  Globe2,
  Play,
  RefreshCw,
  Zap,
} from 'lucide-react';

import {
  cx,
  DetailToggle,
  EmptyState,
  Panel,
  StatusIcon,
  StatusPill,
} from './ui';

function QueueSummaryCard({ label, value, emphasis = false }) {
  return (
    <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-3.5">
      <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">{label}</div>
      <div className={cx('mt-2 text-[15px] leading-6', emphasis ? 'font-semibold text-slate-900' : 'font-medium text-[var(--text-soft)]')}>
        {value}
      </div>
    </div>
  );
}

function QueueMetaCard({ label, value, emphasis = false }) {
  return (
    <div className="rounded-[16px] border border-slate-200/80 bg-slate-50/80 px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">{label}</div>
      <div className={cx('mt-1.5 text-[13px] leading-5', emphasis ? 'font-semibold text-slate-900' : 'font-medium text-[var(--text-soft)]')}>
        {value}
      </div>
    </div>
  );
}

export default function QueueSection({
  state,
  actions,
  helpers,
  constants,
  classes,
}) {
  const {
    filters,
    page,
    totalPages,
    filteredVideoTotal,
    stats,
    videos,
    campaigns,
    captionDrafts,
    expandedItems,
    actionState,
  } = state;
  const {
    setPage,
    setFilters,
    toggleExpandedItem,
    handleCaptionChange,
    handlePrioritize,
    handleRetryVideo,
    handleRegenerateCaption,
    handleSaveCaption,
  } = actions;
  const {
    formatRelTime,
    formatDateTime,
    summarizeText,
    getSourcePlatformMeta,
    getStatusClasses,
    getStatusLabel,
    getSourceKindLabel,
  } = helpers;
  const { STATUS_FILTERS, SOURCE_PLATFORM_FILTERS } = constants;
  const { FIELD_CLASS, BUTTON_PRIMARY, BUTTON_SECONDARY, BUTTON_GHOST } = classes;

  return (
    <div className="space-y-6">
      <Panel
        eyebrow="Điều phối lịch đăng"
        title="Hàng chờ đăng bài"
        subtitle="Lọc nhanh theo trạng thái, chiến dịch và nguồn để ưu tiên video, chỉnh caption hoặc xử lý lỗi ngay trong một nơi."
      >
        <div className="grid gap-4 xl:grid-cols-3">
          <label className="space-y-2">
            <span className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">
              <Filter className="h-3.5 w-3.5" />
              Trạng thái video
            </span>
            <select
              className={FIELD_CLASS}
              value={filters.status}
              onChange={(event) => {
                setPage(1);
                setFilters((current) => ({ ...current, status: event.target.value }));
              }}
            >
              {STATUS_FILTERS.map((option) => (
                <option key={option.value} value={option.value} style={{ color: '#06101a' }}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">Chiến dịch</span>
            <select
              className={FIELD_CLASS}
              value={filters.campaignId}
              onChange={(event) => {
                setPage(1);
                setFilters((current) => ({ ...current, campaignId: event.target.value }));
              }}
            >
              <option value="all" style={{ color: '#06101a' }}>
                Tất cả chiến dịch
              </option>
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id} style={{ color: '#06101a' }}>
                  {campaign.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">Nguồn nội dung</span>
            <select
              className={FIELD_CLASS}
              value={filters.sourcePlatform}
              onChange={(event) => {
                setPage(1);
                setFilters((current) => ({ ...current, sourcePlatform: event.target.value }));
              }}
            >
              {SOURCE_PLATFORM_FILTERS.map((option) => (
                <option key={option.value} value={option.value} style={{ color: '#06101a' }}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 border-t border-slate-200/70 pt-4">
          <div className="mb-3 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">Tóm tắt hàng chờ</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
            <QueueSummaryCard label="Khớp bộ lọc" value={filteredVideoTotal} emphasis />
            <QueueSummaryCard label="TikTok sẵn sàng" value={stats.by_source?.tiktok?.ready ?? 0} />
            <QueueSummaryCard label="Shorts sẵn sàng" value={stats.by_source?.youtube?.ready ?? 0} />
            <QueueSummaryCard label="Đến lượt kế tiếp" value={formatRelTime(stats.next_publish)} />
            <QueueSummaryCard label="Cuối hàng chờ" value={formatDateTime(stats.queue_end)} />
          </div>
        </div>
      </Panel>

      <Panel
        eyebrow="Danh sách video"
        title="Can thiệp trực tiếp vào lịch đăng"
        subtitle="Mỗi thẻ cho phép xem nguồn, kiểm tra lỗi, chỉnh lại caption và thay đổi mức ưu tiên đăng mà không phải rời màn hình."
        action={(
          <div className="rounded-[20px] border border-slate-200/80 bg-white/90 px-4 py-2.5 text-sm text-[var(--text-soft)]">
            Trang {page} / {totalPages}
          </div>
        )}
      >
        {videos.length === 0 ? (
          <EmptyState
            title="Không có video phù hợp bộ lọc"
            description="Thử đổi bộ lọc hoặc chiến dịch để xem thêm nội dung."
          />
        ) : (
          <div className="space-y-4">
            {videos.map((video) => {
              const isExpanded = !!expandedItems[`video:${video.id}`];
              const sourcePlatformMeta = getSourcePlatformMeta(video.source_platform);
              const canPrioritize = video.status === 'ready' || video.status === 'pending';
              const canRetry = video.status === 'failed';

              return (
                <article
                  key={video.id}
                  className="rounded-[20px] border border-slate-200 bg-white px-4 py-3.5 shadow-[0_12px_28px_rgba(15,23,42,0.05)]"
                >
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0">
                        <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
                          {video.campaign_name || 'Chưa rõ chiến dịch'}
                        </div>
                        <div className="mt-1.5 font-display text-[15px] font-semibold text-slate-900 sm:text-[1rem]">
                          {video.original_id}
                        </div>
                        <div className="mt-2.5 flex flex-wrap gap-2">
                          <span
                            className={cx(
                              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium',
                              getStatusClasses(video.status)
                            )}
                          >
                            <StatusIcon status={video.status} />
                            {getStatusLabel(video.status)}
                          </span>
                          <StatusPill tone={sourcePlatformMeta.tone}>{sourcePlatformMeta.label}</StatusPill>
                          <StatusPill tone="slate">{getSourceKindLabel(video.source_kind)}</StatusPill>
                          <StatusPill tone={video.target_page_name ? 'sky' : 'amber'} icon={Globe2}>
                            {video.target_page_name || video.target_page_id || 'Chưa gắn fanpage'}
                          </StatusPill>
                        </div>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-3 xl:min-w-[360px]">
                        <QueueMetaCard label="Lịch đăng" value={formatDateTime(video.publish_time)} emphasis />
                        <QueueMetaCard label="Retry" value={video.retry_count ?? 0} />
                        <QueueMetaCard label="Đến lượt" value={formatRelTime(video.publish_time)} />
                      </div>
                    </div>

                    <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                        Xem nhanh caption
                      </div>
                      <div className="mt-2 break-words text-[13px] leading-6 text-[var(--text-soft)]">
                        {summarizeText(
                          captionDrafts[video.id] ?? video.ai_caption ?? video.original_caption,
                          'Chưa có caption để xem nhanh.',
                          180
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/70 pt-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <DetailToggle expanded={isExpanded} onClick={() => toggleExpandedItem(`video:${video.id}`)} />
                        {canPrioritize ? (
                          <button
                            type="button"
                            className={BUTTON_SECONDARY}
                            onClick={() => handlePrioritize(video.id)}
                            disabled={actionState[`video-${video.id}`]}
                          >
                            <Play className="h-4 w-4" />
                            {actionState[`video-${video.id}`]
                              ? 'Đang xử lý...'
                              : video.status === 'pending'
                                ? 'Tải và đăng ngay'
                                : 'Ưu tiên đăng'}
                          </button>
                        ) : null}
                        {canRetry ? (
                          <button
                            type="button"
                            className={BUTTON_SECONDARY}
                            onClick={() => handleRetryVideo(video.id)}
                            disabled={actionState[`video-retry-${video.id}`]}
                          >
                            <RefreshCw className="h-4 w-4" />
                            {actionState[`video-retry-${video.id}`] ? 'Đang retry...' : 'Retry video'}
                          </button>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className={BUTTON_GHOST}
                          onClick={() => handleRegenerateCaption(video.id)}
                          disabled={actionState[`video-generate-${video.id}`]}
                        >
                          <Zap className="h-4 w-4" />
                          {actionState[`video-generate-${video.id}`] ? 'Đang tạo lại...' : 'Tạo lại caption'}
                        </button>
                        <button
                          type="button"
                          className={BUTTON_PRIMARY}
                          onClick={() => handleSaveCaption(video.id)}
                          disabled={actionState[`video-caption-${video.id}`]}
                        >
                          <CircleCheck className="h-4 w-4" />
                          {actionState[`video-caption-${video.id}`] ? 'Đang lưu...' : 'Lưu caption'}
                        </button>
                      </div>
                    </div>

                  {isExpanded ? (
                    <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
                      <div className="space-y-4">
                        <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/70 p-4">
                          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">
                            <CloudDownload className="h-3.5 w-3.5" />
                            Nguồn video
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <StatusPill tone={sourcePlatformMeta.tone}>{sourcePlatformMeta.label}</StatusPill>
                            <StatusPill tone="slate">{getSourceKindLabel(video.source_kind)}</StatusPill>
                          </div>
                          {video.source_video_url ? (
                            <a
                              href={video.source_video_url}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-3 inline-flex items-center gap-2 break-all text-sm text-sky-700 hover:text-slate-900"
                            >
                              {video.source_video_url}
                              <ExternalLink className="h-4 w-4 shrink-0" />
                            </a>
                          ) : (
                            <div className="mt-3 text-sm text-[var(--text-soft)]">Chưa có đường dẫn nguồn.</div>
                          )}
                        </div>

                        <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/70 p-4">
                          <div className="text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">Caption gốc</div>
                          <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[var(--text-soft)]">
                            {video.original_caption || 'Chưa có caption gốc từ nguồn.'}
                          </div>
                        </div>

                        {video.last_error ? (
                          <div className="rounded-[22px] border border-rose-200 bg-rose-50 p-4 text-sm leading-7 text-rose-700">
                            {video.last_error}
                          </div>
                        ) : null}
                      </div>

                      <div className="rounded-[22px] border border-slate-200/80 bg-white/90 p-4">
                        <div className="text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">
                          Caption AI có thể chỉnh tay
                        </div>
                        <textarea
                          className={cx(FIELD_CLASS, 'mt-4 min-h-[220px] resize-y')}
                          value={captionDrafts[video.id] ?? ''}
                          onChange={(event) => handleCaptionChange(video.id, event.target.value)}
                          placeholder="Chú thích AI sẽ xuất hiện ở đây..."
                        />
                      </div>
                    </div>
                  ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 pt-5">
          <div className="text-sm text-[var(--text-soft)]">Đang xem {videos.length} video ở trang {page}.</div>
          <div className="mobile-action-stack sm:justify-end">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className={BUTTON_GHOST}
            >
              Trước
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              className={BUTTON_GHOST}
            >
              Sau
            </button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
