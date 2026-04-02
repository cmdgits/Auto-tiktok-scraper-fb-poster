import {
  KeyRound,
  Share2,
  ShieldCheck,
  Terminal,
  Zap,
} from 'lucide-react';

import { cx, StatusPill } from './ui';

function LoginFeature({ icon, title, description }) {
  const IconComponent = icon;
  return (
    <div className="rounded-[24px] border border-slate-200/80 bg-white/80 p-4">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-sky-200 bg-sky-50 text-sky-700">
        <IconComponent className="h-5 w-5" />
      </div>
      <div className="font-display text-lg font-semibold text-slate-900">{title}</div>
      <p className="mt-2 text-sm leading-6 text-[var(--text-soft)]">{description}</p>
    </div>
  );
}

export default function LoginScreen({
  loginUser,
  setLoginUser,
  loginPass,
  setLoginPass,
  loginError,
  handleLogin,
  classes,
}) {
  const { FIELD_CLASS, BUTTON_PRIMARY } = classes;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--shell-bg)] text-slate-900">
      <div className="pointer-events-none absolute inset-0 opacity-80">
        <div className="absolute inset-y-0 left-0 w-1/2 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.16),transparent_58%)]" />
        <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_bottom_right,rgba(245,158,11,0.12),transparent_54%)]" />
      </div>
      <div className="relative mx-auto flex min-h-screen max-w-[1560px] items-center px-4 py-8 lg:px-8">
        <div className="grid w-full gap-6 lg:grid-cols-[minmax(0,1.15fr)_440px] xl:gap-8">
          <section className="panel-strong hidden rounded-[34px] p-8 lg:flex lg:flex-col lg:justify-between xl:p-10">
            <div>
              <StatusPill tone="sky" icon={Zap}>Trạm điều phối nội dung</StatusPill>
              <h1 className="mt-6 max-w-3xl font-display text-[1.9rem] font-semibold leading-tight text-slate-900 xl:text-[2.5rem]">
                Quản lý chiến dịch, lịch đăng và phản hồi Facebook trong một nơi.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-[var(--text-soft)]">
                Theo dõi queue, worker, webhook và cấu hình hệ thống từ cùng một dashboard.
              </p>
            </div>
            <div className="mt-10 grid gap-4 xl:grid-cols-3">
              <LoginFeature icon={Share2} title="Điều phối theo khu vực" description="Tách khu vực rõ ràng." />
              <LoginFeature icon={Terminal} title="Theo dõi sát worker" description="Theo dõi queue và worker." />
              <LoginFeature icon={ShieldCheck} title="Quản trị có kiểm soát" description="Quản lý phiên và quyền." />
            </div>
          </section>
          <section className="panel-surface mx-auto w-full max-w-[440px] rounded-[34px] p-6 sm:p-8">
            <div className="flex h-14 w-14 items-center justify-center rounded-[22px] border border-sky-200 bg-sky-50 text-sky-700">
              <KeyRound className="h-7 w-7" />
            </div>
            <div className="mt-6">
              <div className="text-[11px] uppercase tracking-[0.32em] text-[var(--text-muted)]">Đăng nhập vận hành</div>
              <h2 className="mt-3 font-display text-[1.55rem] font-semibold text-slate-900 sm:text-[1.7rem]">Vào trạm điều phối</h2>
              <p className="mt-3 text-sm leading-7 text-[var(--text-soft)]">Dùng tài khoản quản trị hoặc vận hành để bắt đầu.</p>
            </div>
            <form onSubmit={handleLogin} className="mt-8 space-y-4">
              <label className="block space-y-2">
                <span className="text-xs uppercase tracking-[0.28em] text-[var(--text-muted)]">Tên đăng nhập</span>
                <input
                  type="text"
                  name="username"
                  autoComplete="username"
                  required
                  className={FIELD_CLASS}
                  placeholder="Nhập tên đăng nhập"
                  value={loginUser}
                  onChange={(event) => setLoginUser(event.target.value)}
                />
              </label>
              <label className="block space-y-2">
                <span className="text-xs uppercase tracking-[0.28em] text-[var(--text-muted)]">Mật khẩu</span>
                <input
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  spellCheck="false"
                  required
                  className={FIELD_CLASS}
                  placeholder="••••••••"
                  value={loginPass}
                  onChange={(event) => setLoginPass(event.target.value)}
                />
              </label>
              {loginError ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{loginError}</div> : null}
              <button type="submit" className={cx(BUTTON_PRIMARY, 'w-full')}>
                <KeyRound className="h-4 w-4" />
                Đăng nhập vào hệ thống
              </button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}


