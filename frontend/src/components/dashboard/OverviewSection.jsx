import {
  AlertTriangle,
  Copy,
  ExternalLink,
  Globe2,
  KeyRound,
  RefreshCw,
  Server,
  ShieldCheck,
} from 'lucide-react';

import { cx, InfoRow, Panel, StatusPill } from './ui';

const CARD_CLASS = 'rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]';
const MUTED_CARD_CLASS = 'rounded-[24px] border border-slate-200 bg-slate-50 p-4';

const TREND_STATUS_META = {
  ready: { label: 'Sẵn sàng', color: '#67e8f9' },
  posted: { label: 'Đã đăng', color: '#34d399' },
  failed: { label: 'Thất bại', color: '#fb7185' },
};

function formatTrendLabel(dateString) {
  if (!dateString) return '--';
  const date = new Date(`${dateString}T00:00:00Z`);
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

function SourceBreakdownBar({ label, value, max = 1, tone = 'slate', detail }) {
  const width = `${Math.max(8, Math.round((value / Math.max(1, max)) * 100))}%`;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12px] text-[var(--text-muted)]">{label}</span>
        <span className="text-sm font-medium text-slate-900">{value}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-200/80">
        <div
          className={cx(
            'h-full rounded-full',
            tone === 'rose'
              ? 'bg-rose-300/90'
              : tone === 'sky'
                ? 'bg-cyan-300/90'
                : 'bg-slate-300/90'
          )}
          style={{ width }}
        />
      </div>
      {detail ? <div className="text-[11px] text-[var(--text-muted)]">{detail}</div> : null}
    </div>
  );
}

function TrendLegend() {
  return (
    <div className="flex flex-wrap gap-2">
      {Object.entries(TREND_STATUS_META).map(([key, meta]) => (
        <span
          key={key}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-2.5 py-1 text-[10px] text-[var(--text-soft)]"
        >
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: meta.color }} />
          {meta.label}
        </span>
      ))}
    </div>
  );
}

function TrendTimelineChart({ labels, series }) {
  const width = 100;
  const height = 56;
  const entries = Object.entries(TREND_STATUS_META);
  const values = entries.flatMap(([key]) => series?.[key] || []);
  const maxValue = Math.max(1, ...values, 0);

  const buildPoints = (points) => {
    if (!points?.length) return '';
    return points
      .map((value, index) => {
        const x = points.length === 1 ? width / 2 : (index / (points.length - 1)) * width;
        const y = height - (value / maxValue) * (height - 6) - 3;
        return `${x},${Number.isFinite(y) ? y : height - 3}`;
      })
      .join(' ');
  };

  return (
    <div className={MUTED_CARD_CLASS}>
      <TrendLegend />
      <div className="mt-4">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-32 w-full overflow-visible">
          {[0.25, 0.5, 0.75].map((ratio) => {
            const y = height - ratio * (height - 6) - 3;
            return (
              <line
                key={ratio}
                x1="0"
                y1={y}
                x2={width}
                y2={y}
                stroke="rgba(148,163,184,0.35)"
                strokeWidth="0.6"
                strokeDasharray="2 2"
              />
            );
          })}
          <line x1="0" y1={height - 3} x2={width} y2={height - 3} stroke="rgba(148,163,184,0.45)" strokeWidth="0.8" />
          {entries.map(([key, meta]) => {
            const points = series?.[key] || [];
            const pointString = buildPoints(points);
            return pointString ? (
              <polyline
                key={key}
                fill="none"
                stroke={meta.color}
                strokeWidth="2.2"
                strokeLinejoin="round"
                strokeLinecap="round"
                points={pointString}
              />
            ) : null;
          })}
          {entries.map(([key, meta]) => {
            const points = series?.[key] || [];
            return points.map((value, index) => {
              const x = points.length === 1 ? width / 2 : (index / (points.length - 1)) * width;
              const y = height - (value / maxValue) * (height - 6) - 3;
              return <circle key={`${key}-${labels?.[index] || index}`} cx={x} cy={y} r="1.75" fill={meta.color} />;
            });
          })}
        </svg>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-[var(--text-muted)]">
        <span>{formatTrendLabel(labels?.[0])}</span>
        <span>7 ngày gần nhất</span>
        <span>{formatTrendLabel(labels?.[labels.length - 1])}</span>
      </div>
    </div>
  );
}

export default function OverviewSection({
  state,
  actions,
  constants,
  classes,
}) {
  const {
    systemInfo,
    healthInfo,
    isRefreshing,
    overviewSourceFilter,
    visibleOverviewSources,
    overviewSourceMax,
    stats,
  } = state;
  const {
    fetchDashboard,
    handleCopy,
    setOverviewSourceFilter,
  } = actions;
  const { SOURCE_PLATFORM_FILTERS } = constants;
  const { FIELD_CLASS, BUTTON_SECONDARY, BUTTON_GHOST } = classes;

  return (
    <div className="space-y-5">
      <Panel
        eyebrow="Điểm nóng"
        title="Cảnh báo cần xử lý"
        subtitle="Cảnh báo được đưa lên đầu để nhận biết lỗi và mục cần kiểm tra ngay."
      >
        {(systemInfo?.warnings || []).length === 0 ? (
          <div className="rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-4 text-[13px] text-emerald-700">
            Chưa có cảnh báo.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {systemInfo.warnings.map((warning) => (
              <div key={warning} className="rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-3.5 text-[13px] leading-6 text-amber-800">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{warning}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel
        eyebrow="Nguồn nội dung"
        title="Hiệu quả TikTok và YouTube"
        subtitle="Khối nội dung chính chiếm trọn hàng ngang để so sánh hai nguồn rõ ràng hơn và tận dụng tốt màn hình lớn."
        action={(
          <select
            className={cx(FIELD_CLASS, 'min-w-[170px]')}
            value={overviewSourceFilter}
            onChange={(event) => setOverviewSourceFilter(event.target.value)}
          >
            {SOURCE_PLATFORM_FILTERS.map((option) => (
              <option key={option.value} value={option.value} style={{ color: '#06101a' }}>
                {option.label}
              </option>
            ))}
          </select>
        )}
      >
        <div className="grid gap-4 xl:grid-cols-2">
          {visibleOverviewSources.map((sourceItem) => (
            <div key={sourceItem.platform} className={CARD_CLASS}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">Nguồn đang theo dõi</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <StatusPill tone={sourceItem.tone}>{sourceItem.label}</StatusPill>
                  </div>
                </div>
                <div className="rounded-[16px] border border-slate-200/80 bg-slate-50/90 px-3 py-2.5 text-right">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">Campaign</div>
                  <div className="mt-1.5 font-display text-[1.15rem] font-semibold text-slate-900">{sourceItem.campaigns}</div>
                </div>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <InfoRow label="Tổng video" value={sourceItem.videos} emphasis />
                <InfoRow label="Video sẵn sàng" value={sourceItem.ready} />
              </div>
              <div className="mt-3 space-y-3">
                <SourceBreakdownBar label="Campaign" value={sourceItem.campaigns} max={overviewSourceMax} tone={sourceItem.tone} detail="Số chiến dịch đã gắn nguồn này." />
                <SourceBreakdownBar label="Tổng video" value={sourceItem.videos} max={overviewSourceMax} tone={sourceItem.tone} detail="Tổng video đã vào hàng chờ hoặc lịch sử đăng." />
                <SourceBreakdownBar label="Sẵn sàng đăng" value={sourceItem.ready} max={overviewSourceMax} tone={sourceItem.tone} detail="Video đang ở trạng thái ready." />
              </div>
              <div className="mt-4">
                <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">Xu hướng 7 ngày</div>
                <TrendTimelineChart labels={stats.source_trends?.labels || []} series={sourceItem.trend} />
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel
        eyebrow="Kết nối công khai"
        title="Webhook và cổng hệ thống"
        subtitle="Toàn bộ thông tin webhook được kéo ra full hàng để nhìn nhanh URL, token, trạng thái và thao tác quản trị."
        action={(
          <button type="button" className={BUTTON_SECONDARY} onClick={() => fetchDashboard()}>
            <RefreshCw className={cx('h-4 w-4', isRefreshing ? 'animate-spin' : '')} />
            Làm mới
          </button>
        )}
      >
        <div className="grid gap-4 xl:grid-cols-[repeat(3,minmax(0,1fr))]">
          {[
            { label: 'BASE_URL', value: systemInfo?.base_url || 'Chưa cấu hình', copyLabel: 'BASE_URL' },
            { label: 'Webhook URL', value: systemInfo?.webhook_url || 'Chưa tạo được đường dẫn webhook', copyLabel: 'đường dẫn webhook' },
            { label: 'Verify token', value: systemInfo?.verify_token || 'Chưa có', copyLabel: 'mã xác minh' },
          ].map((item) => (
            <div key={item.label} className={CARD_CLASS}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">{item.label}</div>
                  <div className="mt-2 break-all text-[13px] font-medium leading-6 text-slate-900">{item.value}</div>
                </div>
                <button
                  type="button"
                  className={cx(BUTTON_GHOST, 'shrink-0')}
                  onClick={() => handleCopy(item.value, item.copyLabel)}
                >
                  <Copy className="h-4 w-4" />
                  Sao chép
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto]">
          <div className={MUTED_CARD_CLASS}>
            <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">Tình trạng sẵn sàng</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusPill tone={systemInfo?.public_webhook_ready ? 'emerald' : 'rose'} icon={Globe2}>
                {systemInfo?.public_webhook_ready ? 'Webhook công khai' : 'Webhook chưa sẵn sàng'}
              </StatusPill>
              <StatusPill tone={systemInfo?.webhook_signature_enabled ? 'emerald' : 'amber'} icon={ShieldCheck}>
                {systemInfo?.webhook_signature_enabled ? 'Đã bật chữ ký' : 'Thiếu FB_APP_SECRET'}
              </StatusPill>
              <StatusPill tone={healthInfo?.database?.ok ? 'emerald' : 'rose'} icon={Server}>
                {healthInfo?.database?.ok ? 'Database ổn định' : 'Database có lỗi'}
              </StatusPill>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
            <button type="button" className={BUTTON_GHOST} onClick={() => handleCopy(systemInfo?.webhook_url, 'đường dẫn webhook')}>
              <Copy className="h-4 w-4" />
              Copy webhook
            </button>
            <button type="button" className={BUTTON_GHOST} onClick={() => handleCopy(systemInfo?.verify_token, 'mã xác minh')}>
              <KeyRound className="h-4 w-4" />
              Copy token
            </button>
            <a className={BUTTON_GHOST} href={systemInfo?.webhook_url || '#'} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" />
              Mở webhook
            </a>
          </div>
        </div>
      </Panel>

    </div>
  );
}
