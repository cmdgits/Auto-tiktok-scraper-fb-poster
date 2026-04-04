import {
  CloudDownload,
  ExternalLink,
  Filter,
  Pause,
  Play,
  PlusCircle,
  RefreshCw,
  Terminal,
  Trash2,
} from 'lucide-react';

import { useState } from 'react';

import {
  cx,
  DetailToggle,
  EmptyState,
  InfoRow,
  Panel,
  StatusIcon,
  StatusPill,
} from './ui';

const CARD_CLASS = 'rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]';
const MUTED_CARD_CLASS = 'rounded-[24px] border border-slate-200 bg-slate-50 p-4';
const CAMPAIGN_PAGE_SIZE = 5;

export default function CampaignSection({
  state,
  actions,
  helpers,
  constants,
  classes,
}) {
  const {
    formData,
    fbPages,
    campaignScheduleDrafts,
    actionState,
    campaignSourceFilter,
    campaigns,
    campaignSourceSummary,
    filteredCampaigns,
    expandedItems,
  } = state;
  const {
    setFormData,
    handleCampaignSubmit,
    handleSectionChange,
    setCampaignSourceFilter,
    toggleExpandedItem,
    handleCampaignAction,
    handleCampaignScheduleDraftChange,
    handleCampaignScheduleReset,
    handleCampaignScheduleSave,
  } = actions;
  const {
    detectSourcePreview,
    getSyncStateMeta,
    getSourcePlatformMeta,
    getStatusClasses,
    getStatusLabel,
    getSourceKindLabel,
    formatDateTime,
    formatUtcIsoForDateTimeLocal,
  } = helpers;
  const { SOURCE_PLATFORM_FILTERS } = constants;
  const { FIELD_CLASS, BUTTON_PRIMARY, BUTTON_SECONDARY, BUTTON_GHOST } = classes;
  const [campaignPage, setCampaignPage] = useState(1);

  const totalCampaignPages = Math.max(1, Math.ceil(filteredCampaigns.length / CAMPAIGN_PAGE_SIZE));
  const safeCampaignPage = Math.min(campaignPage, totalCampaignPages);
  const pagedCampaigns = filteredCampaigns.slice(
    (safeCampaignPage - 1) * CAMPAIGN_PAGE_SIZE,
    safeCampaignPage * CAMPAIGN_PAGE_SIZE,
  );

  const sourcePreview = detectSourcePreview(formData.source_url);

  return (
    <div className="grid gap-6 2xl:grid-cols-12">
      <Panel
        className="2xl:col-span-12"
        eyebrow="Nguồn mới"
        title="Tạo chiến dịch đăng tự động"
        subtitle="Khai báo fanpage đích, nguồn nội dung, ngày giờ bắt đầu và nhịp đăng trong một form gọn để lên lịch rõ ràng hơn."
      >
        <form onSubmit={handleCampaignSubmit} className="grid gap-5 xl:grid-cols-12">
          <label className="space-y-2 xl:col-span-7">
            <span className="text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">Trang đích</span>
            <select required className={FIELD_CLASS} value={formData.target_page_id} onChange={(event) => setFormData({ ...formData, target_page_id: event.target.value })} disabled={fbPages.length === 0}>
              {fbPages.length === 0 ? <option value="">Chưa có trang nào</option> : fbPages.map((pageItem) => <option key={pageItem.page_id} value={pageItem.page_id} style={{ color: '#06101a' }}>{pageItem.page_name}</option>)}
            </select>
          </label>
          <div className={cx('xl:col-span-5', MUTED_CARD_CLASS)}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">Cấu hình fanpage</div>
                <div className="mt-2 text-sm leading-7 text-[var(--text-soft)]">
                  {fbPages.length === 0
                    ? 'Chưa có fanpage đích. Hãy vào mục Cài đặt để kết nối từ app Meta hoặc nhập tay fanpage trước khi tạo chiến dịch.'
                    : `Đang có ${fbPages.length} fanpage trong hệ thống. Việc thêm trang mới, kiểm tra token và runtime đã được chuyển sang mục Cài đặt.`}
                </div>
              </div>
              <button type="button" className={BUTTON_GHOST} onClick={() => handleSectionChange('settings')}>
                <Terminal className="h-4 w-4" />
                Mở Cài đặt
              </button>
            </div>
          </div>
          <label className="space-y-2 xl:col-span-5">
            <span className="text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">Tên chiến dịch</span>
            <input required type="text" className={FIELD_CLASS} placeholder="Ví dụ: Giải trí mỗi ngày" value={formData.name} onChange={(event) => setFormData({ ...formData, name: event.target.value })} />
          </label>
          <label className="space-y-2 xl:col-span-3">
            <span className="text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">Khoảng cách đăng (phút)</span>
            <input required type="number" min="0" className={FIELD_CLASS} value={formData.schedule_interval} onChange={(event) => setFormData({ ...formData, schedule_interval: parseInt(event.target.value, 10) || 0 })} />
          </label>
          <label className="space-y-2 xl:col-span-4">
            <span className="text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">Bắt đầu từ</span>
            <input
              type="datetime-local"
              step="60"
              className={FIELD_CLASS}
              value={formData.schedule_start_at || ''}
              onChange={(event) => setFormData({ ...formData, schedule_start_at: event.target.value })}
            />
          </label>
          <label className="space-y-2 xl:col-span-12">
            <span className="text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">Nguồn nội dung</span>
            <input required type="url" className={FIELD_CLASS} placeholder="https://www.tiktok.com/@... hoặc https://www.youtube.com/watch?v=... hoặc playlist/kênh YouTube" value={formData.source_url} onChange={(event) => setFormData({ ...formData, source_url: event.target.value })} />
          </label>
          <label className="space-y-2 xl:col-span-12">
            <span className="text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">Google Sheet sản phẩm</span>
            <input
              type="url"
              className={FIELD_CLASS}
              placeholder="https://docs.google.com/spreadsheets/d/..."
              value={formData.product_sheet_url || ''}
              onChange={(event) => setFormData({ ...formData, product_sheet_url: event.target.value })}
            />
            <div className="text-xs leading-5 text-[var(--text-muted)]">
              Nếu có link này, worker sẽ lấy ngẫu nhiên 2-3 sản phẩm rồi tự bình luận dưới video, mỗi sản phẩm một comment gồm tên và link. Nếu Sheet public thì chỉ cần dán link để đọc; nếu Sheet private và muốn cập nhật `Status` thì mới cần service account.
            </div>
          </label>
          <div className="grid gap-3 lg:grid-cols-3 xl:col-span-12">
            <div className={MUTED_CARD_CLASS}>
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">Nhận diện nguồn</div>
                <StatusPill tone={sourcePreview.tone}>{sourcePreview.title}</StatusPill>
              </div>
              <div className="mt-3 text-sm leading-7 text-[var(--text-soft)]">{sourcePreview.detail}</div>
            </div>
            <div className={cx(MUTED_CARD_CLASS, 'text-sm leading-7 text-[var(--text-soft)]')}>
              <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">Lưu ý lịch đăng</div>
              <div className="mt-3">Nếu chọn <span className="font-medium text-slate-900">Bắt đầu từ</span>, video đầu tiên sẽ bám theo mốc này.</div>
              <div className="mt-1">Các video tiếp theo sẽ cộng thêm theo <span className="font-medium text-slate-900">Khoảng cách đăng</span>.</div>
              <div className="mt-1">Nếu bỏ trống ngày giờ, hệ thống sẽ tự nối tiếp theo hàng chờ hiện tại của fanpage.</div>
            </div>
            <div className={cx(MUTED_CARD_CLASS, 'text-sm leading-7 text-[var(--text-soft)]')}>
              <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">Ví dụ hợp lệ</div>
              <div className="mt-3 break-all">TikTok: `https://www.tiktok.com/@creator/video/...`</div>
              <div className="mt-1 break-all">YouTube video: `https://www.youtube.com/watch?v=...` hoặc `https://youtu.be/...`</div>
              <div className="mt-1 break-all">YouTube Shorts: `https://www.youtube.com/shorts/...`</div>
              <div className="mt-1 break-all">Playlist/Kênh: `https://www.youtube.com/playlist?list=...` hoặc `https://www.youtube.com/@creator/videos`</div>
            </div>
          </div>
          <label className={cx('xl:col-span-8 flex items-center gap-3', CARD_CLASS)}>
            <input type="checkbox" checked={formData.auto_post} onChange={(event) => setFormData({ ...formData, auto_post: event.target.checked })} />
            <div>
              <div className="font-medium text-slate-900">Cho phép tự đăng ngay khi hàng chờ đến lượt</div>
              <div className="text-sm text-[var(--text-soft)]">Worker sẽ tự đăng theo lịch.</div>
            </div>
          </label>
          <div className={cx('xl:col-span-4', CARD_CLASS)}>
            <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">Sẵn sàng tạo chiến dịch</div>
            <div className="mt-2 text-sm leading-7 text-[var(--text-soft)]">
              {fbPages.length === 0
                ? 'Cần kết nối ít nhất một fanpage trước khi tạo chiến dịch mới.'
                : 'Sau khi tạo, hệ thống sẽ đồng bộ nguồn và đưa video vào hàng chờ theo lịch đã chọn.'}
            </div>
            <div className="mt-4 flex justify-end">
              <button type="submit" disabled={fbPages.length === 0 || actionState['create-campaign']} className={BUTTON_PRIMARY}>
                <PlusCircle className="h-4 w-4" />
                {actionState['create-campaign'] ? 'Đang tạo chiến dịch...' : 'Tạo và đưa vào hàng đợi'}
              </button>
            </div>
          </div>
        </form>
      </Panel>

      <Panel
        className="2xl:col-span-12"
        eyebrow="Danh mục chiến dịch"
        title="Toàn bộ chiến dịch đang quản lý"
        subtitle="Lọc nhanh theo nguồn, xem tình trạng đồng bộ và thao tác ngay trên từng chiến dịch. Mỗi trang chỉ hiển thị 5 chiến dịch mới nhất để màn hình gọn hơn."
        action={(
          <div className="rounded-[20px] border border-slate-200/80 bg-white/90 px-4 py-2.5 text-sm text-[var(--text-soft)]">
            Trang {safeCampaignPage} / {totalCampaignPages}
          </div>
        )}
      >
        <div className="mb-5 grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <label className="space-y-2">
            <span className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">
              <Filter className="h-3.5 w-3.5" />
              Nguồn chiến dịch
            </span>
            <select
              className={FIELD_CLASS}
              value={campaignSourceFilter}
              onChange={(event) => {
                setCampaignPage(1);
                setCampaignSourceFilter(event.target.value);
              }}
            >
              {SOURCE_PLATFORM_FILTERS.map((option) => <option key={option.value} value={option.value} style={{ color: '#06101a' }}>{option.label}</option>)}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <InfoRow label="Campaign TikTok" value={campaignSourceSummary.tiktok} emphasis={campaignSourceFilter === 'tiktok'} />
            <InfoRow label="Campaign YouTube" value={campaignSourceSummary.youtube} emphasis={campaignSourceFilter === 'youtube'} />
            <InfoRow label="Khớp bộ lọc" value={filteredCampaigns.length} />
          </div>
        </div>
        {filteredCampaigns.length === 0 ? (
          <EmptyState
            title={campaigns.length === 0 ? 'Chưa có chiến dịch nào' : 'Không có chiến dịch khớp bộ lọc'}
            description={campaigns.length === 0 ? 'Tạo chiến dịch để bắt đầu.' : 'Đổi bộ lọc nguồn để xem thêm.'}
          />
        ) : (
          <>
            <div className="grid gap-4 xl:grid-cols-2">
              {pagedCampaigns.map((campaign) => {
              const syncMeta = getSyncStateMeta(campaign.last_sync_status);
              const isExpanded = !!expandedItems[`campaign:${campaign.id}`];
              const sourcePlatformMeta = getSourcePlatformMeta(campaign.source_platform);
              return (
                <article key={campaign.id} className={CARD_CLASS}>
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <div className="font-display text-lg font-semibold text-slate-900 sm:text-[1.15rem]">{campaign.name}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className={cx('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium', getStatusClasses(campaign.status))}>
                          <StatusIcon status={campaign.status} />
                          {getStatusLabel(campaign.status)}
                        </span>
                        <span className={cx('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium', getStatusClasses(syncMeta.tone))}>
                          <StatusIcon status={syncMeta.tone} />
                          {syncMeta.label}
                        </span>
                        <StatusPill tone={sourcePlatformMeta.tone}>{sourcePlatformMeta.label}</StatusPill>
                        <StatusPill tone="slate">{getSourceKindLabel(campaign.source_kind)}</StatusPill>
                      </div>
                    </div>
                    <div className="rounded-[20px] border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-right xl:min-w-[180px]">
                      <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--text-muted)]">Trang đích</div>
                      <div className="mt-2 text-sm font-medium text-slate-900">{campaign.target_page_name || campaign.target_page_id || 'Chưa gắn'}</div>
                    </div>
                  </div>
                      <div className="mt-4 rounded-[20px] border border-slate-200/80 bg-slate-50/70 px-4 py-3 text-sm text-[var(--text-soft)]">
                        {(campaign.video_counts?.total ?? 0)} video • {(campaign.video_counts?.ready ?? 0)} sẵn sàng • {campaign.schedule_interval || 0} phút/lần
                        {campaign.product_sheet_url ? ' • Có chèn sản phẩm từ Sheet' : ''}
                        {campaign.schedule_start_at ? ` • Bắt đầu ${formatDateTime(campaign.schedule_start_at, { year: 'numeric' })}` : ''}
                      </div>
                  <div className="mt-4 flex justify-start">
                    <DetailToggle expanded={isExpanded} onClick={() => toggleExpandedItem(`campaign:${campaign.id}`)} />
                  </div>
                  {isExpanded ? (
                    <>
                      <div className={cx('mt-5', MUTED_CARD_CLASS)}>
                        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">
                          <CloudDownload className="h-3.5 w-3.5" />
                          Nguồn crawl
                        </div>
                        <a href={campaign.source_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-2 break-all text-sm text-sky-700 hover:text-slate-900">
                          {campaign.source_url}
                          <ExternalLink className="h-4 w-4 shrink-0" />
                        </a>
                      </div>
                      {campaign.product_sheet_url ? (
                        <div className={cx('mt-4', MUTED_CARD_CLASS)}>
                          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">
                            <CloudDownload className="h-3.5 w-3.5" />
                            Google Sheet sản phẩm
                          </div>
                          <a href={campaign.product_sheet_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-2 break-all text-sm text-sky-700 hover:text-slate-900">
                            {campaign.product_sheet_url}
                            <ExternalLink className="h-4 w-4 shrink-0" />
                          </a>
                        </div>
                      ) : null}
                      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        <InfoRow label="Nền tảng nguồn" value={sourcePlatformMeta.label} />
                        <InfoRow label="Kiểu nguồn" value={getSourceKindLabel(campaign.source_kind)} />
                        <InfoRow label="Tổng video" value={campaign.video_counts?.total ?? 0} emphasis />
                        <InfoRow label="Sẵn sàng" value={campaign.video_counts?.ready ?? 0} />
                        <InfoRow label="Thất bại" value={campaign.video_counts?.failed ?? 0} />
                        <InfoRow label="Khoảng cách" value={`${campaign.schedule_interval || 0} phút`} />
                        <InfoRow label="Sheet sản phẩm" value={campaign.product_sheet_url ? 'Đã gắn' : 'Chưa gắn'} />
                        <InfoRow label="Bắt đầu từ" value={formatDateTime(campaign.schedule_start_at, { year: 'numeric' })} />
                        <InfoRow label="Tự đăng" value={campaign.auto_post ? 'Đang bật' : 'Đang tắt'} />
                        <InfoRow label="Lần sync gần nhất" value={formatDateTime(campaign.last_synced_at)} />
                      </div>
                      <div className={cx('mt-4', MUTED_CARD_CLASS)}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">Chỉnh lịch bắt đầu</div>
                            <div className="mt-2 text-sm leading-7 text-[var(--text-soft)]">
                              Đổi ngày giờ bắt đầu cho campaign đã tạo. Hệ thống sẽ xếp lại các video chưa đăng của campaign này theo mốc mới.
                            </div>
                          </div>
                          <StatusPill tone="sky">Chỉ áp dụng video chưa đăng</StatusPill>
                        </div>
                        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
                          <label className="space-y-2">
                            <span className="text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">Ngày giờ bắt đầu mới</span>
                            <input
                              type="datetime-local"
                              step="60"
                              className={FIELD_CLASS}
                              value={campaignScheduleDrafts[campaign.id] ?? formatUtcIsoForDateTimeLocal(campaign.schedule_start_at)}
                              onChange={(event) => handleCampaignScheduleDraftChange(campaign.id, event.target.value)}
                            />
                          </label>
                          <button
                            type="button"
                            className={cx(BUTTON_GHOST, 'self-end')}
                            onClick={() => handleCampaignScheduleReset(campaign)}
                          >
                            Khôi phục
                          </button>
                          <button
                            type="button"
                            className={cx(BUTTON_SECONDARY, 'self-end')}
                            onClick={() => handleCampaignScheduleSave(campaign)}
                            disabled={actionState[`campaign-${campaign.id}-schedule`]}
                          >
                            {actionState[`campaign-${campaign.id}-schedule`] ? 'Đang lưu...' : 'Lưu lịch bắt đầu'}
                          </button>
                        </div>
                        <div className="mt-3 text-xs leading-5 text-[var(--text-muted)]">
                          Để trống ô này rồi bấm lưu nếu muốn bỏ mốc bắt đầu cố định và quay về xếp lịch theo hàng chờ hiện tại của fanpage.
                        </div>
                      </div>
                      {campaign.last_sync_error ? <div className="mt-4 rounded-[22px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-7 text-rose-700">{campaign.last_sync_error}</div> : null}
                      <div className="mobile-action-stack mt-5 border-t border-slate-200/80 pt-5">
                        <button type="button" className={BUTTON_SECONDARY} onClick={() => handleCampaignAction(campaign, 'sync')} disabled={actionState[`campaign-${campaign.id}-sync`]}>
                          <RefreshCw className={cx('h-4 w-4', actionState[`campaign-${campaign.id}-sync`] ? 'animate-spin' : '')} />
                          Đồng bộ lại
                        </button>
                        {campaign.status === 'active' ? (
                          <button type="button" className={BUTTON_GHOST} onClick={() => handleCampaignAction(campaign, 'pause')} disabled={actionState[`campaign-${campaign.id}-pause`]}>
                            <Pause className="h-4 w-4" />
                            Tạm dừng
                          </button>
                        ) : (
                          <button type="button" className={BUTTON_GHOST} onClick={() => handleCampaignAction(campaign, 'resume')} disabled={actionState[`campaign-${campaign.id}-resume`]}>
                            <Play className="h-4 w-4" />
                            Kích hoạt lại
                          </button>
                        )}
                        <button type="button" className={cx(BUTTON_GHOST, 'text-rose-700')} onClick={() => handleCampaignAction(campaign, 'delete')} disabled={actionState[`campaign-${campaign.id}-delete`]}>
                          <Trash2 className="h-4 w-4" />
                          Xóa chiến dịch
                        </button>
                      </div>
                    </>
                  ) : null}
                </article>
              );
              })}
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 pt-5">
              <div className="text-sm text-[var(--text-soft)]">
                Đang xem {pagedCampaigns.length} / {filteredCampaigns.length} chiến dịch ở trang {safeCampaignPage}.
              </div>
              <div className="mobile-action-stack sm:justify-end">
                <button
                  type="button"
                  disabled={safeCampaignPage <= 1}
                  onClick={() => setCampaignPage((current) => Math.max(1, current - 1))}
                  className={BUTTON_GHOST}
                >
                  Trước
                </button>
                <button
                  type="button"
                  disabled={safeCampaignPage >= totalCampaignPages}
                  onClick={() => setCampaignPage((current) => Math.min(totalCampaignPages, current + 1))}
                  className={BUTTON_GHOST}
                >
                  Sau
                </button>
              </div>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}


