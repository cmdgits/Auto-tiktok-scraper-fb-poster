import {
  LogOut,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserPlus,
} from 'lucide-react';

import {
  cx,
  EmptyState,
  InfoRow,
  Panel,
  StatusPill,
} from './ui';

export default function SecuritySection({
  state,
  actions,
  helpers,
  classes,
}) {
  const {
    currentUser,
    sessionExpiresAt,
    passwordForm,
    actionState,
    isAdmin,
    userForm,
    users,
  } = state;
  const {
    handleLogout,
    handleChangePassword,
    setPasswordForm,
    handleCreateUser,
    setUserForm,
    handleUserUpdate,
    handleResetUserPassword,
    handleDeleteUser,
  } = actions;
  const { formatDateTime } = helpers;
  const { FIELD_CLASS, BUTTON_PRIMARY, BUTTON_SECONDARY, BUTTON_GHOST } = classes;

  return (
    <div className="grid gap-6 2xl:grid-cols-12">
      <Panel className="2xl:col-span-4" eyebrow="Phiên hiện tại" title="Tài khoản đang dùng">
        <div className="space-y-3">
          <InfoRow label="Tên đăng nhập" value={currentUser?.username || 'Chưa có'} emphasis />
          <InfoRow label="Tên hiển thị" value={currentUser?.display_name || 'Chưa đặt'} />
          <InfoRow label="Vai trò" value={currentUser?.role === 'admin' ? 'Quản trị viên' : 'Vận hành'} />
          <InfoRow label="Hết hạn phiên" value={formatDateTime(sessionExpiresAt)} />
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <StatusPill tone={currentUser?.must_change_password ? 'amber' : 'emerald'} icon={ShieldCheck}>{currentUser?.must_change_password ? 'Cần đổi mật khẩu' : 'Đã an toàn'}</StatusPill>
          <button type="button" className={BUTTON_GHOST} onClick={handleLogout}><LogOut className="h-4 w-4" />Đăng xuất</button>
        </div>
      </Panel>

      <Panel className="2xl:col-span-4" eyebrow="Đổi mật khẩu" title="Cập nhật thông tin đăng nhập">
        <form onSubmit={handleChangePassword} className="space-y-4" autoComplete="on">
          <label className="block space-y-2">
            <span className="text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">Mật khẩu hiện tại</span>
            <input
              type="password"
              name="current_password"
              autoComplete="current-password"
              spellCheck="false"
              required
              className={FIELD_CLASS}
              value={passwordForm.current_password}
              onChange={(event) => setPasswordForm((current) => ({ ...current, current_password: event.target.value }))}
            />
          </label>
          <label className="block space-y-2">
            <span className="text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">Mật khẩu mới</span>
            <input
              type="password"
              name="new_password"
              autoComplete="new-password"
              spellCheck="false"
              required
              className={FIELD_CLASS}
              value={passwordForm.new_password}
              onChange={(event) => setPasswordForm((current) => ({ ...current, new_password: event.target.value }))}
            />
          </label>
          <button type="submit" disabled={actionState['change-password']} className={cx(BUTTON_PRIMARY, 'w-full')}>
            <ShieldCheck className="h-4 w-4" />
            {actionState['change-password'] ? 'Đang cập nhật...' : 'Đổi mật khẩu'}
          </button>
        </form>
      </Panel>

      <Panel className="2xl:col-span-4" eyebrow="Quy tắc" title="Nhắc nhở bảo mật">
        <div className="space-y-3">
          <div className="rounded-[24px] border border-slate-200/80 bg-white/80 px-4 py-4 text-sm leading-7 text-[var(--text-soft)]">Đổi mật khẩu mặc định sau lần vào đầu.</div>
          <div className="rounded-[24px] border border-slate-200/80 bg-white/80 px-4 py-4 text-sm leading-7 text-[var(--text-soft)]">Chỉ admin được quản lý tài khoản.</div>
          <div className="rounded-[24px] border border-slate-200/80 bg-white/80 px-4 py-4 text-sm leading-7 text-[var(--text-soft)]">Reset sẽ tạo mật khẩu tạm.</div>
        </div>
      </Panel>

      <Panel className="2xl:col-span-12" eyebrow="Quản lý người dùng" title="Tài khoản vận hành trong hệ thống">
        {!isAdmin ? (
          <EmptyState title="Tài khoản hiện tại không có quyền quản trị" description="Cần quyền quản trị." />
        ) : (
          <div className="space-y-5">
            <form onSubmit={handleCreateUser} className="grid gap-4 lg:grid-cols-4" autoComplete="off">
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">Tên đăng nhập</span>
                <input type="text" required className={FIELD_CLASS} value={userForm.username} onChange={(event) => setUserForm((current) => ({ ...current, username: event.target.value }))} />
              </label>
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">Tên hiển thị</span>
                <input type="text" className={FIELD_CLASS} value={userForm.display_name} onChange={(event) => setUserForm((current) => ({ ...current, display_name: event.target.value }))} />
              </label>
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">Mật khẩu ban đầu</span>
                <input
                  type="password"
                  name="user-initial-password"
                  autoComplete="new-password"
                  spellCheck="false"
                  required
                  className={FIELD_CLASS}
                  value={userForm.password}
                  onChange={(event) => setUserForm((current) => ({ ...current, password: event.target.value }))}
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">Vai trò</span>
                <select className={FIELD_CLASS} value={userForm.role} onChange={(event) => setUserForm((current) => ({ ...current, role: event.target.value }))}>
                  <option value="operator" style={{ color: '#06101a' }}>Vận hành</option>
                  <option value="admin" style={{ color: '#06101a' }}>Quản trị viên</option>
                </select>
              </label>
              <div className="lg:col-span-4 flex justify-end">
                <button type="submit" disabled={actionState['create-user']} className={BUTTON_PRIMARY}>
                  <UserPlus className="h-4 w-4" />
                  {actionState['create-user'] ? 'Đang tạo...' : 'Tạo tài khoản mới'}
                </button>
              </div>
            </form>
            {users.length === 0 ? <EmptyState title="Chưa có thêm tài khoản" description="Tạo tài khoản để bắt đầu." /> : (
              <div className="grid gap-4 xl:grid-cols-2">
                {users.map((user) => (
                  <article key={user.id} className="rounded-[22px] border border-slate-200/80 bg-white/80 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="font-medium text-slate-900">{user.display_name || user.username}</div>
                        <div className="mt-1 text-xs text-[var(--text-muted)]">@{user.username}</div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <StatusPill tone={user.role === 'admin' ? 'emerald' : 'sky'}>{user.role === 'admin' ? 'Quản trị viên' : 'Vận hành'}</StatusPill>
                          <StatusPill tone={user.is_active ? 'emerald' : 'rose'}>{user.is_active ? 'Đang hoạt động' : 'Đã khóa'}</StatusPill>
                          {user.must_change_password ? <StatusPill tone="amber">Buộc đổi mật khẩu</StatusPill> : null}
                        </div>
                      </div>
                      <div className="rounded-[22px] border border-slate-200/80 bg-white/80 px-4 py-3 text-right">
                        <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--text-muted)]">Lần đăng nhập gần nhất</div>
                        <div className="mt-2 text-sm text-slate-900">{formatDateTime(user.last_login_at)}</div>
                      </div>
                    </div>
                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      <select className={FIELD_CLASS} value={user.role} onChange={(event) => handleUserUpdate(user.id, { role: event.target.value })} disabled={actionState[`user-update-${user.id}`]}>
                        <option value="operator" style={{ color: '#06101a' }}>Vận hành</option>
                        <option value="admin" style={{ color: '#06101a' }}>Quản trị viên</option>
                      </select>
                      <button type="button" className={BUTTON_GHOST} onClick={() => handleUserUpdate(user.id, { is_active: !user.is_active })} disabled={actionState[`user-update-${user.id}`]}>
                        {user.is_active ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}
                      </button>
                    </div>
                    <div className="mobile-action-stack mt-3">
                      <button type="button" className={BUTTON_SECONDARY} onClick={() => handleResetUserPassword(user.id)} disabled={actionState[`user-reset-${user.id}`]}>
                        <RefreshCw className="h-4 w-4" />
                        {actionState[`user-reset-${user.id}`] ? 'Đang đặt lại...' : 'Đặt lại mật khẩu'}
                      </button>
                      <button
                        type="button"
                        className={cx(BUTTON_GHOST, 'border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-400/30 hover:bg-rose-100')}
                        onClick={() => handleDeleteUser(user.id, user.username)}
                        disabled={actionState[`user-delete-${user.id}`] || currentUser?.id === user.id}
                      >
                        <Trash2 className="h-4 w-4" />
                        {actionState[`user-delete-${user.id}`] ? 'Đang xóa...' : 'Xóa vĩnh viễn'}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}
      </Panel>
    </div>
  );
}


