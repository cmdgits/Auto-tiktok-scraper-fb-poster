import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleCheck,
  CircleX,
  Radio,
  RefreshCw,
} from 'lucide-react';

const TONE_CLASSES = {
  slate: 'border-slate-200 bg-white text-slate-700',
  sky: 'border-sky-200 bg-sky-50 text-sky-700',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  amber: 'border-amber-200 bg-amber-50 text-amber-700',
  rose: 'border-rose-200 bg-rose-50 text-rose-700',
};

export function cx(...values) {
  return values.filter(Boolean).join(' ');
}

export function StatusIcon({ status, className = '' }) {
  if (['posted', 'completed', 'active', 'replied', 'page_access_token'].includes(status)) {
    return <CircleCheck className={cx('h-3.5 w-3.5', className)} />;
  }
  if (['failed', 'invalid_encryption'].includes(status)) {
    return <CircleX className={cx('h-3.5 w-3.5', className)} />;
  }
  if (['user_access_token', 'invalid_token'].includes(status)) {
    return <CircleX className={cx('h-3.5 w-3.5', className)} />;
  }
  if (['pending', 'queued', 'processing', 'downloading'].includes(status)) {
    return <RefreshCw className={cx('h-3.5 w-3.5 animate-spin', className)} />;
  }
  if (['paused', 'ready', 'legacy_webhook', 'ignored', 'network_error'].includes(status)) {
    return <Radio className={cx('h-3.5 w-3.5', className)} />;
  }
  return <ChevronRight className={cx('h-3.5 w-3.5', className)} />;
}

export function StatusPill({ tone = 'slate', icon: Icon, children, className = '' }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-[-0.01em]',
        TONE_CLASSES[tone] || TONE_CLASSES.slate,
        className
      )}
    >
      {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
      <span>{children}</span>
    </span>
  );
}

export function MetricCard({ icon, label, value, detail, tone = 'slate' }) {
  const IconComponent = icon;
  return (
    <div className="metric-card overflow-hidden rounded-[24px] p-4 sm:p-4.5 lg:p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">{label}</div>
          <div className="mt-2 font-display text-[1.35rem] font-semibold text-slate-900 sm:text-[1.78rem]">{value}</div>
        </div>
        <div className={cx('rounded-[18px] border p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]', TONE_CLASSES[tone] || TONE_CLASSES.slate)}>
          <IconComponent className="h-4.5 w-4.5" />
        </div>
      </div>
      <p className="mt-3 text-[13px] leading-5.5 text-[var(--text-soft)]">{detail}</p>
    </div>
  );
}

export function Panel({ eyebrow, title, subtitle, action, children, className = '' }) {
  return (
    <section className={cx('panel-surface relative rounded-[30px] p-4 sm:p-5 lg:p-6', className)}>
      {(eyebrow || title || subtitle || action) && (
        <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            {eyebrow ? <div className="text-[11px] uppercase tracking-[0.16em] text-[var(--text-muted)]">{eyebrow}</div> : null}
            {title ? <h2 className="mt-1.5 font-display text-[1.12rem] font-semibold text-slate-900 sm:text-[1.3rem]">{title}</h2> : null}
            {subtitle ? <p className="mt-1.5 max-w-2xl text-[14px] leading-6 text-[var(--text-soft)]">{subtitle}</p> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      )}
      {children}
    </section>
  );
}

export function InfoRow({ label, value, emphasis = false }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-[18px] border border-slate-200 bg-white px-3.5 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <span className="text-[13px] text-[var(--text-muted)]">{label}</span>
      <span className={cx('text-left text-[13px] sm:text-right', emphasis ? 'font-semibold text-slate-900' : 'text-[var(--text-soft)]')}>{value}</span>
    </div>
  );
}

export function EmptyState({ title, description }) {
  return (
    <div className="rounded-[24px] border border-dashed border-slate-300 bg-white px-5 py-7 text-center sm:px-6 sm:py-8">
      <div className="font-display text-[15px] font-semibold text-slate-900 sm:text-base">{title}</div>
      <p className="mx-auto mt-2 max-w-md text-[14px] leading-6 text-[var(--text-soft)]">{description}</p>
    </div>
  );
}

export function DetailToggle({ expanded, onClick, className = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-[var(--text-soft)] transition hover:border-slate-300 hover:bg-white hover:text-slate-900',
        className
      )}
    >
      {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      {expanded ? 'Thu gọn' : 'Xem thêm'}
    </button>
  );
}


