import {
  Copy,
  Globe2,
  KeyRound,
  MessagesSquare,
  PlusCircle,
  RefreshCw,
  ShieldCheck,
  Terminal,
  Trash2,
} from 'lucide-react';

import { cx, EmptyState, InfoRow, Panel, StatusPill } from './ui';

function StepGuideCard({ step, title, detail, tone = 'slate', isCurrent = false }) {
  const toneClass = {
    slate: 'border-slate-200 bg-white',
    sky: 'border-sky-200 bg-sky-50/60',
    emerald: 'border-emerald-200 bg-emerald-50/60',
    amber: 'border-amber-200 bg-amber-50/60',
  }[tone] || 'border-slate-200 bg-white';

  const badgeClass = {
    slate: 'border-slate-200 bg-white text-slate-700',
    sky: 'border-sky-200 bg-sky-50 text-sky-700',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
  }[tone] || 'border-slate-200 bg-white text-slate-700';

  return (
    <div className={cx('rounded-[24px] border p-4 transition', toneClass, isCurrent && 'ring-2 ring-sky-100')}>
      <div className="flex items-start gap-3">
        <div className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-[13px] font-semibold', badgeClass)}>
          {step}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-[13px] font-semibold text-slate-900">{title}</div>
            {isCurrent ? <StatusPill tone="sky">Nên làm tiếp</StatusPill> : null}
          </div>
          <div className="mt-1 text-[13px] leading-6 text-[var(--text-soft)]">{detail}</div>
        </div>
      </div>
    </div>
  );
}

function RuntimeFieldCard({
  label,
  description,
  helper,
  type = 'text',
  value,
  onChange,
  placeholder,
  fieldClass,
  readOnly = false,
  action,
}) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-4">
      <div className="text-[13px] font-semibold text-slate-900">{label}</div>
      <div className="mt-1 text-[13px] leading-6 text-[var(--text-soft)]">{description}</div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          type={type}
          className={cx(fieldClass, readOnly ? 'bg-slate-50 text-slate-600' : '')}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          readOnly={readOnly}
          autoComplete={type === 'password' ? 'new-password' : 'off'}
          spellCheck="false"
        />
        {action ? <div className="sm:shrink-0">{action}</div> : null}
      </div>
      {helper ? <div className="mt-2 text-xs leading-5 text-[var(--text-muted)]">{helper}</div> : null}
    </div>
  );
}

function getSettingSourceLabel(setting) {
  return setting?.source === 'override' ? 'Dashboard' : 'Môi trường';
}

export default function SettingsSection({
  state,
  actions,
  helpers,
  classes,
}) {
  const {
    isAdmin,
    isRefreshing,
    pagesNeedingAttention,
    fbPages,
    connectedMessagePages,
    runtimeDerived,
    runtimeOverrideCount,
    runtimeForm,
    runtimeSettings,
    runtimeConfig,
    tunnelVerification,
    discoveredFbPages,
    selectedDiscoveredPageIds,
    allDiscoveredSelected,
    discoverySubject,
    fbImportToken,
    fbForm,
    actionState,
    pageChecks,
    systemInfo,
  } = state;
  const {
    fetchDashboard,
    handleCopy,
    handleDiscoverFacebookPages,
    setFbImportToken,
    handleRefreshFacebookPages,
    handleToggleAllDiscoveredPages,
    handleFbSubmit,
    setFbForm,
    handleImportFacebookPages,
    handleToggleDiscoveredPage,
    setDiscoveredFbPages,
    setSelectedDiscoveredPageIds,
    setDiscoverySubject,
    handleSubscribeMessages,
    handleValidatePage,
    handleDeleteFacebookPage,
    handleRuntimeConfigSave,
    handleRuntimeFieldChange,
    handleVerifyTunnelToken,
    setRuntimeForm,
  } = actions;
  const {
    getPageTokenMeta,
    getResolvedPageTokenKind,
    getMessengerConnectionMeta,
    formatDateTime,
    extractRuntimeForm,
  } = helpers;
  const { FIELD_CLASS, BUTTON_PRIMARY, BUTTON_SECONDARY, BUTTON_GHOST } = classes;

  const getRuntimeValue = (key) => {
    const candidate = runtimeForm?.[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    return runtimeSettings?.[key]?.value || '';
  };
  const isRuntimeConfigured = (key) => Boolean(getRuntimeValue(key) || runtimeSettings?.[key]?.is_configured);
  const buildSettingHelper = (key, extraText = '') => {
    const setting = runtimeSettings?.[key];
    const notes = [`Nguồn: ${getSettingSourceLabel(setting)}`];
    if (setting?.requires_restart) notes.push('Cần khởi động lại service liên quan sau khi thay đổi');
    if (extraText) notes.push(extraText);
    return notes.join(' • ');
  };

  const baseUrlValue = (getRuntimeValue('BASE_URL') || runtimeDerived.base_url || systemInfo?.base_url || '').replace(/\/+$/, '');
  const webhookUrl = baseUrlValue ? `${baseUrlValue}/webhooks/fb` : (runtimeDerived.webhook_url || systemInfo?.webhook_url || '');
  const verifyToken = getRuntimeValue('FB_VERIFY_TOKEN') || runtimeDerived.verify_token || systemInfo?.verify_token || '';
  const publicWebhookReady = /^https:\/\/.+/i.test(baseUrlValue || '');
  const signatureReady = Boolean(verifyToken && (isRuntimeConfigured('FB_APP_SECRET') || systemInfo?.webhook_signature_enabled));
  const aiReady = isRuntimeConfigured('GEMINI_API_KEY');
  const optionalConfiguredCount = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID']
    .filter((key) => isRuntimeConfigured(key))
    .length;
  const isPageReady = (pageItem) => {
    const validation = pageChecks[pageItem.page_id];
    const tokenReady = getResolvedPageTokenKind(pageItem, validation) === 'page_access_token';
    const messengerReady = !!validation?.messenger_connection?.connected;
    return tokenReady && messengerReady;
  };
  const readyPages = fbPages.filter((pageItem) => isPageReady(pageItem));
  const reviewPages = [...fbPages].sort((left, right) => Number(isPageReady(left)) - Number(isPageReady(right)));
  const readyPageCount = readyPages.length;

  const setupBlockingIssues = [];
  if (!publicWebhookReady) setupBlockingIssues.push('BASE_URL cần là HTTPS công khai để Facebook gọi webhook ổn định.');
  if (!verifyToken) setupBlockingIssues.push('Thiếu FB_VERIFY_TOKEN để Meta xác minh webhook.');
  if (!signatureReady) setupBlockingIssues.push('Thiếu FB_APP_SECRET nên chưa xác minh được chữ ký webhook.');
  if (!aiReady) setupBlockingIssues.push('Thiếu GEMINI_API_KEY nên caption và AI reply chưa hoạt động.');
  if (fbPages.length === 0) {
    setupBlockingIssues.push('Chưa có fanpage nào được thêm vào hệ thống.');
  } else if (readyPageCount === 0) {
    setupBlockingIssues.push('Chưa có fanpage nào đạt trạng thái sẵn sàng để vận hành.');
  } else if (pagesNeedingAttention > 0) {
    setupBlockingIssues.push(`${pagesNeedingAttention} fanpage còn thiếu token chuẩn hoặc webhook messages.`);
  }

  const runtimeStepReady = publicWebhookReady && signatureReady && aiReady;
  const pageSetupReady = fbPages.length > 0;
  const verificationStepReady = fbPages.length > 0 && readyPageCount > 0 && pagesNeedingAttention === 0;
  const nextRecommendedStep = !runtimeStepReady
    ? '01'
    : !pageSetupReady
      ? '02'
      : !verificationStepReady
        ? '03'
        : '04';
  const setupReadyCount = [runtimeStepReady, pageSetupReady, verificationStepReady, readyPageCount > 0]
    .filter(Boolean)
    .length;
  const setupSequence = [
    {
      step: '01',
      title: 'Cấu hình lõi hệ thống',
      detail: runtimeStepReady
        ? 'Webhook công khai và AI đã sẵn sàng.'
        : 'Nhập BASE_URL, verify token, app secret và Gemini để hệ thống có thể chạy.',
      tone: runtimeStepReady ? 'emerald' : 'amber',
    },
    {
      step: '02',
      title: 'Kết nối fanpage',
      detail: pageSetupReady
        ? `${fbPages.length} fanpage đã được thêm vào hệ thống.`
        : 'Import fanpage từ app Meta hoặc nhập tay tối thiểu một trang.',
      tone: pageSetupReady ? 'sky' : 'amber',
    },
    {
      step: '03',
      title: 'Kiểm tra token và webhook',
      detail: verificationStepReady
        ? 'Các fanpage hiện tại đã đạt chuẩn kết nối.'
        : pagesNeedingAttention > 0
          ? `Còn ${pagesNeedingAttention} fanpage cần xử lý token hoặc webhook.`
          : 'Sau khi thêm fanpage, hãy xác minh và đăng ký webhook cho từng trang.',
      tone: verificationStepReady ? 'emerald' : 'amber',
    },
    {
      step: '04',
      title: 'Bắt đầu dùng cho chiến dịch',
      detail: readyPageCount > 0
        ? `${readyPageCount} fanpage đã sẵn sàng để đưa vào campaign.`
        : 'Khi có ít nhất một fanpage đạt chuẩn, bạn có thể chuyển sang tạo chiến dịch.',
      tone: readyPageCount > 0 ? 'emerald' : 'slate',
    },
  ];
  const runtimeSummaryItems = [
    {
      label: 'Webhook công khai',
      value: webhookUrl || 'Chưa có',
      emphasis: publicWebhookReady,
    },
    {
      label: 'Mã xác minh',
      value: verifyToken || 'Chưa có',
      emphasis: Boolean(verifyToken),
    },
    {
      label: 'Ký webhook',
      value: signatureReady ? 'Đã cấu hình' : 'Chưa đủ',
      emphasis: signatureReady,
    },
    {
      label: 'Gemini AI',
      value: aiReady ? 'Đã cấu hình' : 'Chưa cấu hình',
      emphasis: aiReady,
    },
    {
      label: 'File runtime',
      value: runtimeDerived.runtime_env_file || 'backend/runtime.env',
      emphasis: false,
    },
    {
      label: 'Fanpage sẵn sàng',
      value: `${readyPageCount}/${fbPages.length || 0}`,
      emphasis: readyPageCount > 0,
    },
  ];

  return (
    <div className="grid gap-6 2xl:grid-cols-12">
      <Panel
        className="2xl:col-span-12"
        eyebrow="Cài đặt tập trung"
        title="Thiết lập để đưa hệ thống vào vận hành"
        subtitle="Phần này chỉ giữ lại các bước thực sự cần để người dùng mới có thể cấu hình webhook, AI và fanpage mà không phải đọc quá nhiều thông tin kỹ thuật."
        action={(
          <button type="button" className={BUTTON_SECONDARY} onClick={() => fetchDashboard()}>
            <RefreshCw className={cx('h-4 w-4', isRefreshing ? 'animate-spin' : '')} />
            Làm mới trạng thái
          </button>
        )}
      >
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="panel-strong rounded-[30px] p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone={setupBlockingIssues.length > 0 ? 'amber' : 'emerald'} icon={ShieldCheck}>
                {setupReadyCount}/4 bước chính đã hoàn tất
              </StatusPill>
              <StatusPill tone="sky" icon={Globe2}>{readyPageCount}/{fbPages.length || 0} fanpage sẵn sàng</StatusPill>
              <StatusPill tone="slate" icon={Terminal}>{runtimeOverrideCount} giá trị lưu từ dashboard</StatusPill>
            </div>
            <h3 className="mt-5 font-display text-[1.35rem] font-semibold leading-tight text-slate-900 sm:text-[1.7rem]">
              Làm lần lượt 4 bước để đưa hệ thống vào vận hành.
            </h3>
            <p className="mt-3 max-w-3xl text-[14px] leading-7 text-[var(--text-soft)]">
              Trình tự hợp lý nhất là: cấu hình webhook và AI trước, sau đó kết nối fanpage, kiểm tra token hoặc webhook, rồi mới đưa trang vào chiến dịch.
            </p>
            <div className="mt-5 text-[13px] font-semibold text-slate-900">Thứ tự cài đặt đề xuất</div>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              {setupSequence.map((item) => (
                <StepGuideCard
                  key={item.step}
                  step={item.step}
                  title={item.title}
                  detail={item.detail}
                  tone={item.tone}
                  isCurrent={item.step === nextRecommendedStep}
                />
              ))}
            </div>
            <div className="mt-5 mobile-action-stack">
              <button type="button" className={BUTTON_PRIMARY} onClick={() => handleCopy(webhookUrl || systemInfo?.webhook_url, 'đường dẫn webhook')}>
                <Copy className="h-4 w-4" />
                Copy webhook
              </button>
              <button type="button" className={BUTTON_GHOST} onClick={() => handleCopy(verifyToken || systemInfo?.verify_token, 'mã xác minh')}>
                <KeyRound className="h-4 w-4" />
                Copy verify token
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-[24px] border border-slate-200 bg-white p-4">
              <div className="text-[13px] font-semibold text-slate-900">Tóm tắt nhanh</div>
              <div className="mt-3 space-y-3">
                <InfoRow label="Bước đã hoàn tất" value={`${setupReadyCount}/4`} emphasis={setupReadyCount === 4} />
                <InfoRow label="Webhook đã nối" value={`${connectedMessagePages}/${fbPages.length || 0}`} emphasis={connectedMessagePages > 0} />
                <InfoRow label="Trang cần xử lý" value={pagesNeedingAttention} emphasis={pagesNeedingAttention > 0} />
                <InfoRow label="File runtime" value={runtimeDerived.runtime_env_file || 'backend/runtime.env'} />
              </div>
            </div>
            {setupBlockingIssues.length > 0 ? (
              <div className="rounded-[24px] border border-amber-200 bg-amber-50 p-4">
                <div className="text-[13px] font-semibold text-amber-800">Các mục còn thiếu trước khi vận hành</div>
                <div className="mt-3 grid gap-2">
                  {setupBlockingIssues.map((issue) => (
                    <div key={issue} className="rounded-[18px] border border-amber-200/80 bg-white/70 px-3 py-3 text-[13px] leading-6 text-amber-900">
                      {issue}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 p-4 text-[13px] leading-6 text-emerald-800">
                Cấu hình lõi đã đủ. Bước tiếp theo là xác minh fanpage, chạy chiến dịch và theo dõi worker trong phần Vận hành.
              </div>
            )}
          </div>
        </div>
      </Panel>

      <Panel
        className="order-3 2xl:col-span-12"
        eyebrow="Bước 2"
        title="Kết nối fanpage"
        subtitle="Bắt đầu bằng cách nhập một fanpage với Page Access Token. Nếu bạn quản lý nhiều trang từ cùng một Meta app, dùng mục import nâng cao ở bên phải."
      >
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <form onSubmit={handleFbSubmit} className="rounded-[24px] border border-slate-200 bg-white p-4 sm:p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[14px] font-semibold text-slate-900">Nhập tay fanpage</div>
                <div className="mt-2 text-[13px] leading-6 text-[var(--text-soft)]">
                  Đây là luồng chính, phù hợp nhất khi bạn đang cấu hình hệ thống lần đầu hoặc chỉ vận hành một vài fanpage.
                </div>
              </div>
              <StatusPill tone="sky">Luồng chính</StatusPill>
            </div>
            <div className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 text-[13px] leading-6 text-[var(--text-soft)]">
                  <div className="font-semibold text-slate-900">1. Page ID</div>
                  Dán đúng mã trang để hệ thống gắn campaign và webhook.
                </div>
                <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 text-[13px] leading-6 text-[var(--text-soft)]">
                  <div className="font-semibold text-slate-900">2. Tên trang</div>
                  Tên hiển thị giúp bạn dễ chọn đúng fanpage khi vận hành.
                </div>
                <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 text-[13px] leading-6 text-[var(--text-soft)]">
                  <div className="font-semibold text-slate-900">3. Page Access Token</div>
                  Token trang thật để đăng bài, phản hồi comment và xử lý inbox.
                </div>
              </div>
              <label className="block space-y-2">
                <span className="text-[13px] font-medium text-slate-700">Mã trang</span>
                <input required type="text" className={FIELD_CLASS} placeholder="Page ID" value={fbForm.page_id} onChange={(event) => setFbForm({ ...fbForm, page_id: event.target.value })} />
              </label>
              <label className="block space-y-2">
                <span className="text-[13px] font-medium text-slate-700">Tên trang</span>
                <input required type="text" className={FIELD_CLASS} placeholder="Tên fanpage" value={fbForm.page_name} onChange={(event) => setFbForm({ ...fbForm, page_name: event.target.value })} />
              </label>
              <label className="block space-y-2">
                <span className="text-[13px] font-medium text-slate-700">Page Access Token</span>
                <input
                  required
                  type="password"
                  className={FIELD_CLASS}
                  placeholder="Dán token trang Facebook thật"
                  value={fbForm.long_lived_access_token}
                  onChange={(event) => setFbForm({ ...fbForm, long_lived_access_token: event.target.value })}
                  autoComplete="new-password"
                  spellCheck="false"
                />
              </label>
              <button type="submit" disabled={actionState['save-page']} className={cx(BUTTON_PRIMARY, 'w-full')}>
                <Globe2 className="h-4 w-4" />
                {actionState['save-page'] ? 'Đang lưu token...' : 'Lưu cấu hình fanpage'}
              </button>
            </div>
          </form>

          <details className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4 open:bg-white [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex cursor-pointer list-none items-start justify-between gap-4">
              <div>
                <div className="text-[14px] font-semibold text-slate-900">Import nhiều fanpage từ Meta app</div>
                <div className="mt-2 text-[13px] leading-6 text-[var(--text-soft)]">
                  Chỉ dùng khi bạn quản lý nhiều fanpage từ cùng một app Meta và muốn lấy token hàng loạt thay vì nhập từng trang.
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {fbPages.length > 0 ? <StatusPill tone="slate">{fbPages.length} trang đã có</StatusPill> : null}
                <StatusPill tone="amber">Nâng cao</StatusPill>
              </div>
            </summary>

            <div className="mt-4 space-y-4 border-t border-slate-200 pt-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 text-[13px] leading-6 text-[var(--text-soft)]">
                  <div className="font-semibold text-slate-900">Dùng User Access Token</div>
                  Token nên có `pages_show_list` và các quyền quản trị trang liên quan.
                </div>
                <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 text-[13px] leading-6 text-[var(--text-soft)]">
                  <div className="font-semibold text-slate-900">Phù hợp khi có nhiều trang</div>
                  Hệ thống sẽ tải danh sách fanpage, chọn trang cần dùng rồi import một lần.
                </div>
              </div>

              <form onSubmit={handleDiscoverFacebookPages} className="rounded-[20px] border border-slate-200 bg-white p-4">
                <label className="block space-y-2">
                  <span className="text-[13px] font-medium text-slate-700">User Access Token</span>
                  <input
                    required
                    type="password"
                    className={FIELD_CLASS}
                    placeholder="Dán User Access Token có quyền pages_show_list"
                    value={fbImportToken}
                    onChange={(event) => setFbImportToken(event.target.value)}
                    autoComplete="off"
                    spellCheck="false"
                  />
                </label>
                <div className="mt-4 mobile-action-stack">
                  <button type="submit" disabled={actionState['discover-pages']} className={BUTTON_PRIMARY}>
                    <Globe2 className="h-4 w-4" />
                    {actionState['discover-pages'] ? 'Đang tải danh sách...' : 'Tải danh sách fanpage'}
                  </button>
                  <button
                    type="button"
                    className={BUTTON_SECONDARY}
                    onClick={handleRefreshFacebookPages}
                    disabled={fbPages.length === 0 || actionState['refresh-pages']}
                  >
                    <RefreshCw className="h-4 w-4" />
                    {actionState['refresh-pages'] ? 'Đang làm mới...' : 'Làm mới token fanpage đã có'}
                  </button>
                  {discoveredFbPages.length > 0 ? (
                    <button type="button" className={BUTTON_GHOST} onClick={handleToggleAllDiscoveredPages}>
                      {allDiscoveredSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                    </button>
                  ) : null}
                </div>
                {discoverySubject ? (
                  <div className="mt-4 rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-[13px] leading-6 text-[var(--text-soft)]">
                    Đang xem fanpage của <span className="font-medium text-slate-900">{discoverySubject.token_subject_name || discoverySubject.token_subject_id}</span>
                  </div>
                ) : (
                  <div className="mt-4 rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-[13px] leading-6 text-[var(--text-soft)]">
                    Sau khi tải xong, danh sách fanpage sẽ hiện bên dưới để bạn chọn import hàng loạt.
                  </div>
                )}
              </form>

              {discoveredFbPages.length > 0 ? (
                <div className="rounded-[20px] border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="text-[14px] font-semibold text-slate-900">Chọn fanpage cần import</div>
                      <div className="mt-2 text-[13px] leading-6 text-[var(--text-soft)]">
                        Hệ thống sẽ lấy luôn Page Access Token của từng fanpage được chọn từ User Access Token hiện tại.
                      </div>
                    </div>
                    <StatusPill tone="amber">{selectedDiscoveredPageIds.length}/{discoveredFbPages.length} đã chọn</StatusPill>
                  </div>
                  <div className="mt-4 space-y-3">
                    {discoveredFbPages.map((pageItem) => {
                      const isSelected = selectedDiscoveredPageIds.includes(pageItem.page_id);
                      return (
                        <label
                          key={pageItem.page_id}
                          className={cx(
                            'flex cursor-pointer items-start gap-3 rounded-[20px] border px-4 py-4 transition',
                            isSelected
                              ? 'border-sky-200 bg-sky-50'
                              : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/70',
                          )}
                        >
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={isSelected}
                            onChange={() => handleToggleDiscoveredPage(pageItem.page_id)}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="font-medium text-slate-900">{pageItem.page_name}</div>
                              {pageItem.already_configured ? <StatusPill tone="amber">Đã có trong hệ thống</StatusPill> : null}
                              {pageItem.has_page_access_token ? <StatusPill tone="emerald">Có Page Token</StatusPill> : <StatusPill tone="rose">Thiếu Page Token</StatusPill>}
                            </div>
                            <div className="mt-1 text-xs text-[var(--text-muted)]">{pageItem.page_id}</div>
                            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                              <InfoRow label="Danh mục" value={pageItem.category || 'Chưa rõ'} />
                              <InfoRow label="Quyền" value={(pageItem.tasks || []).join(', ') || 'Chưa có'} />
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                  <div className="mt-4 mobile-action-stack">
                    <button
                      type="button"
                      className={BUTTON_PRIMARY}
                      onClick={handleImportFacebookPages}
                      disabled={selectedDiscoveredPageIds.length === 0 || actionState['import-pages']}
                    >
                      <PlusCircle className="h-4 w-4" />
                      {actionState['import-pages'] ? 'Đang import...' : 'Import fanpage đã chọn'}
                    </button>
                    <button
                      type="button"
                      className={BUTTON_GHOST}
                      onClick={() => {
                        setDiscoveredFbPages([]);
                        setSelectedDiscoveredPageIds([]);
                        setDiscoverySubject(null);
                      }}
                    >
                      Xóa danh sách
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </details>
        </div>
      </Panel>

      <Panel
        className="order-5 2xl:col-span-12"
        eyebrow="Bước 4"
        title="Fanpage đang sẵn sàng"
        subtitle="Chỉ hiển thị các fanpage đã đạt chuẩn token trang và webhook messages để bạn chọn cho campaign."
      >
        <div className="space-y-4">
          {readyPages.length === 0 ? (
            <EmptyState title="Chưa có fanpage sẵn sàng" description="Hoàn tất bước kiểm tra ở trên để đưa ít nhất một fanpage vào trạng thái dùng được cho campaign." />
          ) : (
            readyPages.map((pageItem) => {
              const validation = pageChecks[pageItem.page_id];
              const tokenMeta = getPageTokenMeta(getResolvedPageTokenKind(pageItem, validation));
              const messengerMeta = getMessengerConnectionMeta(validation);
              return (
                <div key={pageItem.page_id} className="rounded-[24px] border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[14px] font-semibold text-slate-900">{pageItem.page_name}</div>
                      <div className="mt-1 text-xs text-[var(--text-muted)]">{pageItem.page_id}</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <StatusPill tone={tokenMeta.tone}>{tokenMeta.label}</StatusPill>
                        <StatusPill tone={messengerMeta.tone}>{messengerMeta.label}</StatusPill>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 text-[13px] leading-6 text-[var(--text-soft)]">{pageItem.token_preview || 'Chưa có token để hiển thị.'}</div>
                  <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-[13px] leading-6 text-[var(--text-soft)]">{messengerMeta.detail}</div>
                  <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-[13px] leading-6 text-emerald-700">
                    Fanpage này đã sẵn sàng dùng cho chiến dịch, đăng bài và AI reply.
                    {validation?.checked_at ? <div className="mt-1 text-xs opacity-80">Kiểm tra lúc {formatDateTime(validation.checked_at)}</div> : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Panel>

      <Panel
        className="order-4 2xl:col-span-12"
        eyebrow="Bước 3"
        title="Tình trạng kết nối theo fanpage"
        subtitle="Bảng này ưu tiên hiện các trang cần xử lý trước. Dùng để rà token, webhook feed/messages và xử lý từng fanpage sau khi import."
      >
        <div className="mb-4 grid gap-3 lg:grid-cols-3">
          <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 text-[13px] leading-6 text-[var(--text-soft)]">
            <div className="font-semibold text-slate-900">Fanpage đã thêm</div>
            <div className="mt-2 text-[1.4rem] font-semibold text-slate-900">{fbPages.length}</div>
          </div>
          <div className="rounded-[22px] border border-emerald-200 bg-emerald-50 px-4 py-4 text-[13px] leading-6 text-emerald-800">
            <div className="font-semibold">Webhook đã nối</div>
            <div className="mt-2 text-[1.4rem] font-semibold text-slate-900">{connectedMessagePages}</div>
          </div>
          <div className="rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-4 text-[13px] leading-6 text-amber-800">
            <div className="font-semibold">Cần xử lý</div>
            <div className="mt-2 text-[1.4rem] font-semibold text-slate-900">{pagesNeedingAttention}</div>
          </div>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {fbPages.length === 0 ? (
            <div className="xl:col-span-2">
              <EmptyState title="Chưa có fanpage nào" description="Thêm fanpage để bắt đầu kiểm tra trạng thái kết nối." />
            </div>
          ) : (
            reviewPages.map((pageItem) => {
              const validation = pageChecks[pageItem.page_id];
              const tokenMeta = getPageTokenMeta(getResolvedPageTokenKind(pageItem, validation));
              const messengerMeta = getMessengerConnectionMeta(validation);
              return (
                <div key={pageItem.page_id} className="rounded-[24px] border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-[14px] font-semibold text-slate-900">{pageItem.page_name}</div>
                      <div className="mt-1 text-xs text-[var(--text-muted)]">{pageItem.page_id}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill tone={tokenMeta.tone}>{tokenMeta.label}</StatusPill>
                      <StatusPill tone={messengerMeta.tone}>{messengerMeta.label}</StatusPill>
                    </div>
                  </div>
                  <div className="mt-3 text-[13px] leading-6 text-[var(--text-soft)]">{pageItem.token_preview || 'Chưa có token để hiển thị.'}</div>
                  <div className="mt-2 text-xs leading-6 text-[var(--text-muted)]">{messengerMeta.detail}</div>
                  <div className="mt-4 mobile-action-stack sm:justify-end">
                    <button type="button" className={BUTTON_SECONDARY} onClick={() => handleValidatePage(pageItem.page_id)} disabled={actionState[`page-validate-${pageItem.page_id}`]}>
                      <ShieldCheck className="h-4 w-4" />
                      {actionState[`page-validate-${pageItem.page_id}`] ? 'Đang kiểm tra...' : 'Xác minh & kiểm tra'}
                    </button>
                    <button
                      type="button"
                      className={cx(BUTTON_GHOST, 'border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-300 hover:bg-rose-100 hover:text-rose-800')}
                      onClick={() => handleDeleteFacebookPage(pageItem.page_id, pageItem.page_name)}
                      disabled={!isAdmin || actionState[`delete-page-${pageItem.page_id}`]}
                    >
                      <Trash2 className="h-4 w-4" />
                      {actionState[`delete-page-${pageItem.page_id}`] ? 'Đang xóa...' : 'Xóa fanpage'}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Panel>

      {isAdmin ? (
        <Panel
          className="order-2 2xl:col-span-12"
          eyebrow="Bước 1"
          title="Những mục cần cấu hình để chạy hệ thống"
          subtitle="Nếu bạn đi ra Internet qua Cloudflare Tunnel, hãy xác thực TUNNEL_TOKEN trước. Sau đó điền BASE_URL bằng hostname public đã cấu hình trên Cloudflare, rồi mới hoàn tất webhook và AI."
        >
          <form onSubmit={handleRuntimeConfigSave} className="space-y-5">
            <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
              <div className="space-y-4">
                <div className="rounded-[28px] border border-slate-200 bg-slate-50/70 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-[14px] font-semibold text-slate-900">Bước 1. URL công khai và webhook Meta</div>
                      <div className="mt-1 text-[13px] leading-6 text-[var(--text-soft)]">
                        Nếu dùng Cloudflare Tunnel, xác thực token trước. BASE_URL vẫn phải là hostname public bạn đã cấu hình trên Cloudflare.
                      </div>
                    </div>
                    <StatusPill tone={publicWebhookReady && signatureReady ? 'emerald' : 'amber'}>
                      {publicWebhookReady && signatureReady ? 'Đã đủ' : 'Còn thiếu'}
                    </StatusPill>
                  </div>
                  <div className="mt-4">
                    <RuntimeFieldCard
                      label="TUNNEL_TOKEN"
                      description="Dùng khi backend được public qua Cloudflare Tunnel. Bạn có thể dán trực tiếp token hoặc cả lệnh `cloudflared`."
                      helper={buildSettingHelper('TUNNEL_TOKEN', 'Token tunnel không tự chứa public hostname. Sau khi xác thực xong, nhập hostname public vào BASE_URL.')}
                      value={runtimeForm.TUNNEL_TOKEN}
                      onChange={(event) => handleRuntimeFieldChange('TUNNEL_TOKEN', event.target.value)}
                      placeholder="Cloudflare Tunnel token"
                      fieldClass={FIELD_CLASS}
                      type="password"
                      action={(
                        <button
                          type="button"
                          className={BUTTON_SECONDARY}
                          onClick={handleVerifyTunnelToken}
                          disabled={actionState['verify-tunnel-token']}
                        >
                          <ShieldCheck className="h-4 w-4" />
                          {actionState['verify-tunnel-token'] ? 'Đang kết nối...' : 'Lưu token & kết nối tunnel'}
                        </button>
                      )}
                    />
                    {tunnelVerification ? (
                      <div className={cx(
                        'mt-3 rounded-[22px] border px-4 py-4 text-[13px] leading-6',
                        tunnelVerification.ok && tunnelVerification.restart_ok
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                          : tunnelVerification.ok
                            ? 'border-amber-200 bg-amber-50 text-amber-800'
                          : 'border-rose-200 bg-rose-50 text-rose-800',
                      )}>
                        <div className="font-semibold text-slate-900">
                          {tunnelVerification.ok && tunnelVerification.restart_ok
                            ? 'TUNNEL_TOKEN đã được lưu và tunnel đang được kết nối'
                            : tunnelVerification.ok
                              ? 'TUNNEL_TOKEN hợp lệ nhưng tunnel chưa tự kết nối được'
                              : 'TUNNEL_TOKEN chưa hợp lệ'}
                        </div>
                        <div className="mt-1">{tunnelVerification.message}</div>
                        {tunnelVerification.ok ? (
                          <div className="mt-2 grid gap-2 sm:grid-cols-2">
                            <InfoRow label="Tunnel ID" value={tunnelVerification.tunnel_id || 'Chưa đọc được'} />
                            <InfoRow label="Account tag" value={tunnelVerification.account_tag || 'Chưa đọc được'} />
                          </div>
                        ) : null}
                        {tunnelVerification.restart_message ? (
                          <div className="mt-2 rounded-[18px] border border-white/60 bg-white/70 px-3 py-3 text-[13px] leading-6 text-slate-700">
                            {tunnelVerification.restart_message}
                          </div>
                        ) : null}
                        {tunnelVerification.manual_command ? (
                          <div className="mt-2 rounded-[18px] border border-white/60 bg-white/70 px-3 py-3 text-xs leading-6 text-slate-700">
                            Lệnh chạy tay: <span className="font-mono text-[12px] text-slate-900">{tunnelVerification.manual_command}</span>
                          </div>
                        ) : null}
                        {tunnelVerification.next_step ? (
                          <div className="mt-2 text-xs text-[var(--text-soft)]">{tunnelVerification.next_step}</div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="mt-3 rounded-[22px] border border-slate-200 bg-white px-4 py-4 text-[13px] leading-6 text-[var(--text-soft)]">
                        Nếu bạn dùng tunnel, hãy xác thực token trước rồi điền hostname public vào <span className="font-medium text-slate-900">BASE_URL</span>. Token chỉ giúp tunnel kết nối, không tự sinh domain public.
                      </div>
                    )}
                  </div>
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <RuntimeFieldCard
                      label="BASE_URL"
                      description="URL công khai thật của hệ thống. Nếu dùng tunnel, đây là hostname public bạn đã publish trên Cloudflare."
                      helper={buildSettingHelper('BASE_URL', 'Ví dụ: https://social.example.com')}
                      value={runtimeForm.BASE_URL}
                      onChange={(event) => handleRuntimeFieldChange('BASE_URL', event.target.value)}
                      placeholder="https://social.example.com"
                      fieldClass={FIELD_CLASS}
                      type="url"
                    />
                    <RuntimeFieldCard
                      label="Đường dẫn webhook"
                      description="URL Facebook sẽ dùng để đẩy sự kiện comment, inbox và xác minh webhook."
                      helper="Được tạo tự động từ `BASE_URL`."
                      value={webhookUrl || ''}
                      fieldClass={FIELD_CLASS}
                      readOnly
                      action={(
                        <button type="button" className={BUTTON_GHOST} onClick={() => handleCopy(webhookUrl, 'đường dẫn webhook')}>
                          <Copy className="h-4 w-4" />
                          Copy
                        </button>
                      )}
                    />
                    <RuntimeFieldCard
                      label="FB_VERIFY_TOKEN"
                      description="Mã xác minh sẽ được dán vào cấu hình webhook của app Meta."
                      helper={buildSettingHelper('FB_VERIFY_TOKEN', 'Nên dùng chuỗi riêng, khó đoán.')}
                      value={runtimeForm.FB_VERIFY_TOKEN}
                      onChange={(event) => handleRuntimeFieldChange('FB_VERIFY_TOKEN', event.target.value)}
                      placeholder="Mã xác minh webhook"
                      fieldClass={FIELD_CLASS}
                    />
                    <RuntimeFieldCard
                      label="FB_APP_SECRET"
                      description="App Secret của Meta app. Dùng để xác minh chữ ký webhook và bảo vệ request từ Meta."
                      helper={buildSettingHelper('FB_APP_SECRET')}
                      value={runtimeForm.FB_APP_SECRET}
                      onChange={(event) => handleRuntimeFieldChange('FB_APP_SECRET', event.target.value)}
                      placeholder="App Secret từ Meta app"
                      fieldClass={FIELD_CLASS}
                      type="password"
                    />
                  </div>
                </div>

                <div className="rounded-[28px] border border-slate-200 bg-slate-50/70 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-[14px] font-semibold text-slate-900">Bước 2. AI caption và phản hồi tự động</div>
                      <div className="mt-1 text-[13px] leading-6 text-[var(--text-soft)]">
                        Chỉ cần một khóa Gemini là worker có thể sinh caption và trả lời comment hoặc inbox bằng AI.
                      </div>
                    </div>
                    <StatusPill tone={aiReady ? 'emerald' : 'amber'}>{aiReady ? 'Đã đủ' : 'Còn thiếu'}</StatusPill>
                  </div>
                  <div className="mt-4">
                    <RuntimeFieldCard
                      label="GEMINI_API_KEY"
                      description="Khóa dùng cho caption AI, phản hồi comment và trả lời inbox tự động."
                      helper={buildSettingHelper('GEMINI_API_KEY', 'Nếu bỏ trống, các tác vụ AI sẽ không hoạt động.')}
                      value={runtimeForm.GEMINI_API_KEY}
                      onChange={(event) => handleRuntimeFieldChange('GEMINI_API_KEY', event.target.value)}
                      placeholder="Gemini API Key"
                      fieldClass={FIELD_CLASS}
                      type="password"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-[28px] border border-slate-200 bg-slate-50/70 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-[14px] font-semibold text-slate-900">Mở rộng khi cần</div>
                      <div className="mt-1 text-[13px] leading-6 text-[var(--text-soft)]">
                        Không bắt buộc để chạy lõi hệ thống. Phần này chỉ còn các tích hợp thông báo phụ trợ.
                      </div>
                    </div>
                    <StatusPill tone={optionalConfiguredCount > 0 ? 'sky' : 'slate'}>{optionalConfiguredCount}/2 đã dùng</StatusPill>
                  </div>
                  <div className="mt-4 space-y-4">
                    <RuntimeFieldCard
                      label="TELEGRAM_BOT_TOKEN"
                      description="Bot token để hệ thống gửi cảnh báo hoặc thông báo vận hành sang Telegram."
                      helper={buildSettingHelper('TELEGRAM_BOT_TOKEN')}
                      value={runtimeForm.TELEGRAM_BOT_TOKEN}
                      onChange={(event) => handleRuntimeFieldChange('TELEGRAM_BOT_TOKEN', event.target.value)}
                      placeholder="Bot Token từ BotFather"
                      fieldClass={FIELD_CLASS}
                      type="password"
                    />
                    <RuntimeFieldCard
                      label="TELEGRAM_CHAT_ID"
                      description="Chat ID người nhận thông báo từ bot Telegram."
                      helper={buildSettingHelper('TELEGRAM_CHAT_ID')}
                      value={runtimeForm.TELEGRAM_CHAT_ID}
                      onChange={(event) => handleRuntimeFieldChange('TELEGRAM_CHAT_ID', event.target.value)}
                      placeholder="Chat ID"
                      fieldClass={FIELD_CLASS}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="rounded-[28px] border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-[14px] font-semibold text-slate-900">Tóm tắt cấu hình hiện tại</div>
                  <div className="mt-1 text-[13px] leading-6 text-[var(--text-soft)]">
                    Kiểm tra nhanh toàn bộ điều kiện vận hành theo hàng ngang, không phải quét từng dòng dọc như trước.
                  </div>
                </div>
                <StatusPill tone={runtimeStepReady && readyPageCount > 0 ? 'emerald' : 'amber'}>
                  {runtimeStepReady && readyPageCount > 0 ? 'Sẵn sàng vận hành' : 'Cần bổ sung'}
                </StatusPill>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
                {runtimeSummaryItems.map((item) => (
                  <div key={item.label} className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4">
                    <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">{item.label}</div>
                    <div className={cx('mt-3 text-[14px] font-semibold leading-6', item.emphasis ? 'text-slate-900' : 'text-[var(--text-soft)]')}>
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 text-[13px] leading-6 text-[var(--text-soft)]">
                Để trống một ô rồi bấm lưu nếu muốn quay về giá trị đang lấy từ môi trường.
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className={BUTTON_GHOST} onClick={() => setRuntimeForm(extractRuntimeForm(runtimeConfig))}>
                Khôi phục giá trị đã lưu
              </button>
              <button type="submit" disabled={actionState['save-runtime-config']} className={BUTTON_PRIMARY}>
                <ShieldCheck className="h-4 w-4" />
                {actionState['save-runtime-config'] ? 'Đang lưu...' : 'Lưu cấu hình'}
              </button>
            </div>
          </form>
        </Panel>
      ) : null}
    </div>
  );
}


