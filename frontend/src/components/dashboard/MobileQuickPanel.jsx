import { InfoRow, Panel } from './ui';

export default function MobileQuickPanel({
  state,
  actions,
  helpers,
}) {
  const {
    stats,
    onlineWorkers,
    focusCampaigns,
    pagesNeedingAttention,
    connectedMessagePages,
    fbPages,
    staleWorkers,
  } = state;
  const { handleSectionChange } = actions;
  const { formatRelTime, formatDateTime } = helpers;

  return (
    <Panel className="xl:hidden" eyebrow="Tóm tắt nhanh" title="Điểm cần nhìn ngay">
      <div className="space-y-4">
        <div className="grid gap-3">
          <InfoRow label="Đến lượt kế tiếp" value={formatRelTime(stats.next_publish)} emphasis />
          <InfoRow label="Cuối hàng chờ" value={formatDateTime(stats.queue_end)} />
          <InfoRow label="Worker trực tuyến" value={onlineWorkers} />
        </div>
        <div className="grid gap-3">
          <button type="button" onClick={() => handleSectionChange('campaigns')} className="rounded-[22px] border border-slate-200/80 bg-white/80 px-4 py-4 text-left transition hover:border-sky-200 hover:bg-sky-50">
            <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">Chiến dịch</div>
            <div className="mt-2 font-medium text-slate-900">
              {focusCampaigns.length ? `${focusCampaigns.length} chiến dịch cần xem ngay` : 'Không có chiến dịch nóng'}
            </div>
          </button>
          <button type="button" onClick={() => handleSectionChange('settings')} className="rounded-[22px] border border-slate-200/80 bg-white/80 px-4 py-4 text-left transition hover:border-sky-200 hover:bg-sky-50">
            <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">Cài đặt fanpage</div>
            <div className="mt-2 font-medium text-slate-900">
              {pagesNeedingAttention > 0
                ? `${pagesNeedingAttention} trang cần xử lý`
                : `${connectedMessagePages}/${fbPages.length || 0} trang đã nối đủ feed và messages`}
            </div>
          </button>
          <button type="button" onClick={() => handleSectionChange('operations')} className="rounded-[22px] border border-slate-200/80 bg-white/80 px-4 py-4 text-left transition hover:border-sky-200 hover:bg-sky-50">
            <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">Vận hành</div>
            <div className="mt-2 font-medium text-slate-900">
              {staleWorkers.length ? `${staleWorkers.length} worker cần dọn` : 'Không có worker stale'}
            </div>
          </button>
        </div>
      </div>
    </Panel>
  );
}


