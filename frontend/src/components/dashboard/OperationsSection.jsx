import { Trash2 } from 'lucide-react';

import {
  cx,
  EmptyState,
  InfoRow,
  Panel,
  StatusIcon,
  StatusPill,
} from './ui';

export default function OperationsSection({
  state,
  actions,
  helpers,
  classes,
}) {
  const {
    healthInfo,
    onlineWorkers,
    staleWorkers,
    isAdmin,
    actionState,
    workers,
    workerPage,
    totalWorkerPages,
    pagedWorkers,
    taskSummary,
    taskPage,
    totalTaskPages,
    tasks,
    pagedTasks,
    eventPage,
    totalEventPages,
    events,
    pagedEvents,
  } = state;
  const {
    handleCleanupWorkers,
    setWorkerPage,
    setTaskPage,
    setEventPage,
  } = actions;
  const {
    getStatusClasses,
    getStatusLabel,
    formatDateTime,
  } = helpers;
  const { BUTTON_GHOST } = classes;

  return (
    <div className="grid gap-6 2xl:grid-cols-12">
      <Panel className="2xl:col-span-4" eyebrow="Health" title="Sức khỏe hệ thống">
        <div className="space-y-3">
          <InfoRow label="Database" value={healthInfo?.database?.ok ? 'Kết nối ổn' : 'Có lỗi'} emphasis />
          <InfoRow label="Worker trực tuyến" value={onlineWorkers} />
          <InfoRow label="Worker stale" value={staleWorkers.length} />
          <InfoRow label="Task queue poll" value={`${healthInfo?.config?.task_queue_poll_seconds ?? 0} giây`} />
          <InfoRow label="Xác minh chữ ký webhook" value={healthInfo?.config?.webhook_signature_enabled ? 'Đang bật' : 'Chưa bật'} />
          <InfoRow label="Chế độ nền" value={healthInfo?.worker?.expected_mode || 'Chưa có'} />
        </div>
      </Panel>

      <Panel className="2xl:col-span-4" eyebrow="Worker" title="Theo dõi tiến trình nền" action={isAdmin ? <button type="button" className={BUTTON_GHOST} onClick={handleCleanupWorkers} disabled={actionState['cleanup-workers'] || staleWorkers.length === 0}><Trash2 className="h-4 w-4" />{actionState['cleanup-workers'] ? 'Đang dọn...' : 'Dọn worker cũ'}</button> : null}>
        <div className="space-y-3">
          {workers.length === 0 ? (
            <EmptyState title="Chưa ghi nhận worker" description="Worker sẽ hiện tại đây." />
          ) : (
            pagedWorkers.map((worker) => (
              <div key={worker.worker_name} className="rounded-[24px] border border-slate-200/80 bg-white/80 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-slate-900">{worker.worker_name}</div>
                    <div className="mt-1 text-xs text-[var(--text-muted)]">{worker.hostname || 'Không có hostname'}</div>
                  </div>
                  <span className={cx('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium', getStatusClasses(worker.is_online ? 'posted' : 'failed'))}>
                    <StatusIcon status={worker.is_online ? 'posted' : 'failed'} />
                    {worker.is_online ? 'Trực tuyến' : 'Mất kết nối'}
                  </span>
                </div>
                <div className="mt-4 grid gap-3">
                  <InfoRow label="Trạng thái" value={worker.status} />
                  <InfoRow label="Lần cuối heartbeat" value={formatDateTime(worker.last_seen_at)} />
                  {worker.current_task_type ? <InfoRow label="Đang làm" value={worker.current_task_type} /> : null}
                </div>
              </div>
            ))
          )}
        </div>
        {totalWorkerPages > 1 ? (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 pt-5">
            <div className="text-sm text-[var(--text-soft)]">
              Hiển thị {pagedWorkers.length} / {workers.length} worker.
            </div>
            <div className="flex gap-2">
              <button type="button" disabled={workerPage <= 1} onClick={() => setWorkerPage((current) => Math.max(1, current - 1))} className={BUTTON_GHOST}>
                Trước
              </button>
              <button type="button" disabled={workerPage >= totalWorkerPages} onClick={() => setWorkerPage((current) => Math.min(totalWorkerPages, current + 1))} className={BUTTON_GHOST}>
                Sau
              </button>
            </div>
          </div>
        ) : null}
      </Panel>

      <Panel className="2xl:col-span-4" eyebrow="Queue summary" title="Nhịp hàng đợi nền">
        <div className="grid gap-3 sm:grid-cols-2">
          <InfoRow label="Queued" value={taskSummary.queued ?? 0} emphasis />
          <InfoRow label="Processing" value={taskSummary.processing ?? 0} />
          <InfoRow label="Completed" value={taskSummary.completed ?? 0} />
          <InfoRow label="Failed" value={taskSummary.failed ?? 0} />
        </div>
      </Panel>

      <Panel className="2xl:col-span-6" eyebrow="Task queue" title="Tác vụ gần nhất" action={<div className="rounded-[22px] border border-slate-200/80 bg-white/80 px-4 py-3 text-sm text-[var(--text-soft)]">Trang {taskPage} / {totalTaskPages}</div>}>
        <div className="space-y-3">
          {tasks.length === 0 ? <EmptyState title="Chưa có tác vụ nền" description="Tác vụ sẽ hiện tại đây." /> : pagedTasks.map((task) => (
            <div key={task.id} className="rounded-[24px] border border-slate-200/80 bg-white/80 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-medium text-slate-900">{task.task_type}</div>
                  <div className="mt-1 text-xs text-[var(--text-muted)]">{task.entity_type || 'khác'}: {task.entity_id || 'n/a'}</div>
                </div>
                <span className={cx('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium', getStatusClasses(task.status))}>
                  <StatusIcon status={task.status} />
                  {getStatusLabel(task.status)}
                </span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <InfoRow label="Số lần chạy" value={`${task.attempts}/${task.max_attempts}`} />
                <InfoRow label="Ưu tiên" value={task.priority} />
                <InfoRow label="Tạo lúc" value={formatDateTime(task.created_at)} />
                <InfoRow label="Worker nhận" value={task.locked_by || 'Chưa nhận'} />
              </div>
              {task.last_error ? <div className="mt-4 rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-7 text-rose-700">{task.last_error}</div> : null}
            </div>
          ))}
        </div>
        {totalTaskPages > 1 ? (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 pt-5">
            <div className="text-sm text-[var(--text-soft)]">
              Hiển thị {pagedTasks.length} / {tasks.length} tác vụ gần nhất.
            </div>
            <div className="flex gap-2">
              <button type="button" disabled={taskPage <= 1} onClick={() => setTaskPage((current) => Math.max(1, current - 1))} className={BUTTON_GHOST}>
                Trước
              </button>
              <button type="button" disabled={taskPage >= totalTaskPages} onClick={() => setTaskPage((current) => Math.min(totalTaskPages, current + 1))} className={BUTTON_GHOST}>
                Sau
              </button>
            </div>
          </div>
        ) : null}
      </Panel>

      <Panel className="2xl:col-span-6" eyebrow="System events" title="Nhật ký hệ thống" action={<div className="rounded-[22px] border border-slate-200/80 bg-white/80 px-4 py-3 text-sm text-[var(--text-soft)]">Trang {eventPage} / {totalEventPages}</div>}>
        <div className="space-y-3">
          {events.length === 0 ? <EmptyState title="Chưa có sự kiện" description="Sự kiện sẽ hiện tại đây." /> : pagedEvents.map((event) => (
            <div key={event.id} className="rounded-[24px] border border-slate-200/80 bg-white/80 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-medium text-slate-900">{event.message}</div>
                  <div className="mt-1 text-xs text-[var(--text-muted)]">{event.scope} • {event.level}</div>
                </div>
                <StatusPill tone={event.level === 'ERROR' ? 'rose' : event.level === 'WARNING' ? 'amber' : 'emerald'}>{event.level}</StatusPill>
              </div>
              <div className="mt-3 text-sm text-[var(--text-soft)]">{formatDateTime(event.created_at)}</div>
              {event.details && Object.keys(event.details).length > 0 ? <pre className="mt-4 overflow-x-auto rounded-[20px] border border-slate-200/80 bg-slate-50/95 px-4 py-3 text-xs text-[var(--text-soft)]">{JSON.stringify(event.details, null, 2)}</pre> : null}
            </div>
          ))}
        </div>
        {totalEventPages > 1 ? (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 pt-5">
            <div className="text-sm text-[var(--text-soft)]">
              Hiển thị {pagedEvents.length} / {events.length} sự kiện gần nhất.
            </div>
            <div className="flex gap-2">
              <button type="button" disabled={eventPage <= 1} onClick={() => setEventPage((current) => Math.max(1, current - 1))} className={BUTTON_GHOST}>
                Trước
              </button>
              <button type="button" disabled={eventPage >= totalEventPages} onClick={() => setEventPage((current) => Math.min(totalEventPages, current + 1))} className={BUTTON_GHOST}>
                Sau
              </button>
            </div>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}


