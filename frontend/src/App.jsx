import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  Bot,
  Clock,
  Globe2,
  LogOut,
  Menu,
  MessagesSquare,
  Play,
  Radio,
  RefreshCw,
  Server,
  Share2,
  ShieldCheck,
  Terminal,
  X,
  Zap,
} from 'lucide-react';

import CampaignSection from './components/dashboard/CampaignSection';
import EngagementSection from './components/dashboard/EngagementSection';
import LoginScreen from './components/dashboard/LoginScreen';
import MobileQuickPanel from './components/dashboard/MobileQuickPanel';
import MessagesSection from './components/dashboard/MessagesSection';
import OperationsSection from './components/dashboard/OperationsSection';
import OverviewSection from './components/dashboard/OverviewSection';
import QueueSection from './components/dashboard/QueueSection';
import SecuritySection from './components/dashboard/SecuritySection';
import SettingsSection from './components/dashboard/SettingsSection';
import {
  ConfirmDialog,
  cx,
  DetailToggle,
  InfoRow,
  MetricCard,
  Panel,
  StatusPill,
} from './components/dashboard/ui';

const API_URL = '/api';
const AUTO_REFRESH_MS = 5000;
const ENGAGEMENT_PAGE_SIZE = 10;
const WORKER_PAGE_SIZE = 2;
const TASK_PAGE_SIZE = 3;
const TASK_FETCH_LIMIT = 24;
const SYSTEM_EVENT_PAGE_SIZE = 3;
const SYSTEM_EVENT_FETCH_LIMIT = 24;
const FIELD_CLASS = 'field-input w-full rounded-2xl px-4 py-3 text-[14px] leading-5 text-slate-900';
const BUTTON_DISABLED = 'disabled:cursor-not-allowed disabled:opacity-50';
const BUTTON_PRIMARY = `btn-primary inline-flex min-h-10 items-center justify-center gap-2 rounded-full px-4 py-2.5 text-[13px] font-semibold ${BUTTON_DISABLED}`;
const BUTTON_SECONDARY = `btn-secondary inline-flex min-h-10 items-center justify-center gap-2 rounded-full px-4 py-2.5 text-[13px] font-medium ${BUTTON_DISABLED}`;
const BUTTON_GHOST = `btn-ghost inline-flex min-h-10 items-center justify-center gap-2 rounded-full px-4 py-2.5 text-[13px] font-medium ${BUTTON_DISABLED}`;

const DEFAULT_STATS = {
  total: 0,
  pending: 0,
  ready: 0,
  posted: 0,
  failed: 0,
  active_campaigns: 0,
  paused_campaigns: 0,
  connected_pages: 0,
  next_publish: null,
  queue_end: null,
  last_posted: null,
  by_source: {
    tiktok: { campaigns: 0, videos: 0, ready: 0 },
    youtube: { campaigns: 0, videos: 0, ready: 0 },
    unknown: { campaigns: 0, videos: 0, ready: 0 },
  },
  source_trends: {
    labels: [],
    series: {
      tiktok: { ready: [], posted: [], failed: [] },
      youtube: { ready: [], posted: [], failed: [] },
      unknown: { ready: [], posted: [], failed: [] },
    },
  },
};

const DEFAULT_TASK_SUMMARY = { queued: 0, processing: 0, completed: 0, failed: 0 };
const DEFAULT_RUNTIME_FORM = {
  BASE_URL: '',
  FB_VERIFY_TOKEN: '',
  FB_APP_SECRET: '',
  GEMINI_API_KEY: '',
  TUNNEL_TOKEN: '',
  TELEGRAM_BOT_TOKEN: '',
  TELEGRAM_CHAT_ID: '',
};

function buildReplyAutomationDraft(pageItem) {
  return {
    comment_auto_reply_enabled: pageItem?.comment_auto_reply_enabled ?? true,
    comment_ai_prompt: pageItem?.comment_ai_prompt || '',
    message_auto_reply_enabled: pageItem?.message_auto_reply_enabled ?? false,
    message_ai_prompt: pageItem?.message_ai_prompt || '',
    message_reply_schedule_enabled: pageItem?.message_reply_schedule_enabled ?? false,
    message_reply_start_time: pageItem?.message_reply_start_time || '08:00',
    message_reply_end_time: pageItem?.message_reply_end_time || '22:00',
    message_reply_cooldown_minutes: pageItem?.message_reply_cooldown_minutes ?? 0,
  };
}

function extractRuntimeForm(payload) {
  return {
    BASE_URL: payload?.settings?.BASE_URL?.value || '',
    FB_VERIFY_TOKEN: payload?.settings?.FB_VERIFY_TOKEN?.value || '',
    FB_APP_SECRET: payload?.settings?.FB_APP_SECRET?.value || '',
    GEMINI_API_KEY: payload?.settings?.GEMINI_API_KEY?.value || '',
    TUNNEL_TOKEN: payload?.settings?.TUNNEL_TOKEN?.value || '',
    TELEGRAM_BOT_TOKEN: payload?.settings?.TELEGRAM_BOT_TOKEN?.value || '',
    TELEGRAM_CHAT_ID: payload?.settings?.TELEGRAM_CHAT_ID?.value || '',
  };
}

function matchesEngagementFilter(log, filter) {
  switch (filter) {
    case 'ai_replied':
      return log.reply_source === 'ai';
    case 'operator_replied':
      return log.reply_source === 'operator';
    case 'ai_failed':
      return log.status === 'failed' && ((log.reply_mode || 'ai') === 'ai' || log.reply_source === 'ai');
    default:
      return true;
  }
}

const STATUS_FILTERS = [
  { value: 'all', label: 'Tất cả trạng thái' },
  { value: 'pending', label: 'Đang xử lý' },
  { value: 'ready', label: 'Sẵn sàng đăng' },
  { value: 'posted', label: 'Đã đăng' },
  { value: 'failed', label: 'Thất bại' },
];

const SOURCE_PLATFORM_FILTERS = [
  { value: 'all', label: 'Tất cả nguồn' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'youtube', label: 'YouTube Shorts' },
];

const NAV_ITEMS = [
  { id: 'overview', label: 'Tổng quan', description: 'Chỉ số và cảnh báo.', icon: Globe2 },
  { id: 'campaigns', label: 'Chiến dịch', description: 'Nguồn, trang và chiến dịch.', icon: Share2 },
  { id: 'queue', label: 'Lịch đăng', description: 'Video, lịch và caption.', icon: Clock },
  { id: 'engagement', label: 'Tương tác', description: 'Bình luận và phản hồi AI.', icon: Bot },
  { id: 'messages', label: 'Tin nhắn AI', description: 'Prompt và inbox tự động.', icon: MessagesSquare },
  { id: 'settings', label: 'Cài đặt', description: 'Fanpage, Meta app và runtime.', icon: Terminal },
  { id: 'operations', label: 'Vận hành', description: 'Worker, queue và log.', icon: Server },
  { id: 'security', label: 'Bảo mật', description: 'Phiên, mật khẩu, người dùng.', icon: ShieldCheck },
];

const STATUS_LABELS = {
  active: 'Đang chạy',
  paused: 'Tạm dừng',
  pending: 'Đang xử lý',
  downloading: 'Đang tải',
  queued: 'Đang chờ',
  processing: 'Đang chạy',
  completed: 'Hoàn tất',
  ready: 'Sẵn sàng',
  posted: 'Đã đăng',
  failed: 'Thất bại',
  replied: 'Đã trả lời',
  ignored: 'Bỏ qua',
  page_access_token: 'Token trang',
  user_access_token: 'Token người dùng',
  invalid_token: 'Token không hợp lệ',
  network_error: 'Lỗi kết nối',
  legacy_webhook: 'Webhook cũ',
  invalid_encryption: 'Lỗi giải mã',
  missing: 'Chưa có',
};

const PAGE_TOKEN_META = {
  page_access_token: { label: 'Token trang hợp lệ', tone: 'emerald' },
  user_access_token: { label: 'Đang dùng user token', tone: 'rose' },
  invalid_token: { label: 'Token không hợp lệ', tone: 'rose' },
  network_error: { label: 'Chưa kiểm tra được token', tone: 'amber' },
  legacy_webhook: { label: 'Dữ liệu webhook cũ', tone: 'amber' },
  invalid_encryption: { label: 'Lỗi giải mã token', tone: 'rose' },
  missing: { label: 'Chưa có token', tone: 'slate' },
};

const CONVERSATION_STATUS_META = {
  ai_active: { label: 'AI đang xử lý', tone: 'sky' },
  operator_active: { label: 'Cần operator', tone: 'rose' },
  resolved: { label: 'Đã xử lý', tone: 'emerald' },
};

const SOURCE_PLATFORM_META = {
  tiktok: { label: 'TikTok', tone: 'sky' },
  youtube: { label: 'YouTube Shorts', tone: 'rose' },
  unknown: { label: 'Chưa rõ nguồn', tone: 'slate' },
};

const SOURCE_KIND_LABELS = {
  tiktok_video: 'Video TikTok',
  tiktok_profile: 'Hồ sơ TikTok',
  tiktok_shortlink: 'Link TikTok rút gọn',
  tiktok_legacy: 'Nguồn TikTok cũ',
  youtube_short: 'YouTube Short',
  youtube_shorts_feed: 'Nguồn Shorts YouTube',
};

function parseMessage(payload, fallback) {
  return payload?.detail || payload?.message || fallback;
}

function summarizeText(value, fallback = 'Chưa có nội dung.', maxLength = 110) {
  const normalized = (value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return fallback;
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trim()}...`;
}

function formatDateTime(isoString, options = {}) {
  if (!isoString) return 'Chưa có';
  const date = new Date(`${isoString}${isoString.endsWith('Z') ? '' : 'Z'}`);
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    ...options,
  });
}

function normalizeLocalDateTimeToUtcIso(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function formatUtcIsoForDateTimeLocal(isoString) {
  if (!isoString) return '';
  const date = new Date(`${isoString}${isoString.endsWith('Z') ? '' : 'Z'}`);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatRelTime(isoString) {
  if (!isoString) return 'Chưa có';
  const date = new Date(`${isoString}${isoString.endsWith('Z') ? '' : 'Z'}`);
  const diffMinutes = Math.round((date.getTime() - Date.now()) / 60000);
  if (diffMinutes <= 0) return 'Đến lượt ngay';
  if (diffMinutes < 60) return `${diffMinutes} phút nữa`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} giờ nữa`;
  return `${Math.floor(diffHours / 24)} ngày nữa`;
}

function getStatusClasses(status) {
  const map = {
    active: 'border-emerald-400/25 bg-emerald-50 text-emerald-700',
    paused: 'border-amber-400/25 bg-amber-50 text-amber-700',
    pending: 'border-cyan-400/25 bg-sky-50 text-sky-700',
    downloading: 'border-cyan-400/25 bg-sky-50 text-sky-700',
    queued: 'border-cyan-400/25 bg-sky-50 text-sky-700',
    processing: 'border-amber-400/25 bg-amber-50 text-amber-700',
    completed: 'border-emerald-400/25 bg-emerald-50 text-emerald-700',
    ready: 'border-amber-400/25 bg-amber-50 text-amber-700',
    posted: 'border-emerald-400/25 bg-emerald-50 text-emerald-700',
    failed: 'border-rose-400/25 bg-rose-50 text-rose-700',
    replied: 'border-emerald-400/25 bg-emerald-50 text-emerald-700',
    ignored: 'border-slate-200 bg-white text-slate-200',
    page_access_token: 'border-emerald-400/25 bg-emerald-50 text-emerald-700',
    user_access_token: 'border-rose-400/25 bg-rose-50 text-rose-700',
    invalid_token: 'border-rose-400/25 bg-rose-50 text-rose-700',
    network_error: 'border-amber-400/25 bg-amber-50 text-amber-700',
    legacy_webhook: 'border-amber-400/25 bg-amber-50 text-amber-700',
    invalid_encryption: 'border-rose-400/25 bg-rose-50 text-rose-700',
    missing: 'border-slate-200 bg-white text-slate-200',
  };
  return map[status] || 'border-slate-200 bg-white text-slate-200';
}

function getSyncStateMeta(status) {
  if (status === 'queued') return { tone: 'pending', label: 'Đang xếp hàng' };
  if (status === 'syncing') return { tone: 'pending', label: 'Đang đồng bộ' };
  if (status === 'completed') return { tone: 'posted', label: 'Đã đồng bộ' };
  if (status === 'failed') return { tone: 'failed', label: 'Đồng bộ lỗi' };
  return { tone: 'paused', label: 'Chưa đồng bộ' };
}

function getStatusLabel(status) {
  return STATUS_LABELS[status] || status || 'Chưa có';
}

function getPageTokenMeta(tokenKind) {
  return PAGE_TOKEN_META[tokenKind] || PAGE_TOKEN_META.missing;
}

function getSourcePlatformMeta(sourcePlatform) {
  return SOURCE_PLATFORM_META[sourcePlatform] || SOURCE_PLATFORM_META.unknown;
}

function getSourceKindLabel(sourceKind) {
  return SOURCE_KIND_LABELS[sourceKind] || sourceKind || 'Chưa rõ kiểu nguồn';
}

function summarizeSourceCounts(items, selector) {
  return items.reduce(
    (summary, item) => {
      const rawValue = selector(item);
      const key = rawValue === 'tiktok' || rawValue === 'youtube' ? rawValue : 'unknown';
      summary[key] += 1;
      return summary;
    },
    { tiktok: 0, youtube: 0, unknown: 0 },
  );
}

function formatIntentLabel(intent) {
  const normalized = (intent || '').trim();
  if (!normalized) return 'Chưa xác định';
  return normalized.replace(/_/g, ' ');
}

function getConversationFactEntries(conversation) {
  if (!conversation?.customer_facts || typeof conversation.customer_facts !== 'object') return [];
  return Object.entries(conversation.customer_facts).filter(([key, value]) => key && value);
}

function getConversationStatusMeta(status) {
  return CONVERSATION_STATUS_META[status] || { label: 'Chưa rõ trạng thái', tone: 'slate' };
}

function buildConversationTimeline(logs) {
  const events = [];
  logs.forEach((log) => {
    const customerText = (log.user_message || '').trim();
    if (customerText) {
      events.push({
        id: `${log.id}-customer`,
        type: 'customer',
        text: customerText,
        time: log.created_at,
        sourceLabel: 'Khách hàng',
        status: log.status,
      });
    }

    const replyText = (log.ai_reply || '').trim();
    const shouldShowReply = replyText && (log.status === 'replied' || log.facebook_reply_message_id || log.reply_source);
    if (shouldShowReply) {
      const isOperator = log.reply_source === 'operator';
      events.push({
        id: `${log.id}-reply`,
        type: isOperator ? 'operator' : 'ai',
        text: replyText,
        time: log.updated_at || log.created_at,
        sourceLabel: isOperator ? (log.reply_author?.display_name || 'Operator') : 'AI fanpage',
        status: log.status,
      });
    }
  });

  return events.sort((left, right) => new Date(left.time || 0).getTime() - new Date(right.time || 0).getTime());
}

function detectSourcePreview(rawUrl) {
  const candidate = (rawUrl || '').trim();
  if (!candidate) {
    return {
      status: 'idle',
      tone: 'slate',
      title: 'Chưa nhập nguồn',
      detail: 'Hỗ trợ TikTok và YouTube Shorts.',
    };
  }

  let normalized = candidate;
  if (!normalized.includes('://') && !normalized.startsWith('//')) {
    normalized = `https://${normalized}`;
  }

  try {
    const parsed = new URL(normalized);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.replace(/\/+$/, '') || '/';

    if (host.endsWith('tiktok.com')) {
      if (host === 'vm.tiktok.com' || host === 'vt.tiktok.com' || path.toLowerCase().startsWith('/t/')) {
        return {
          status: 'ok',
          tone: 'sky',
          title: 'TikTok shortlink',
          detail: 'Hệ thống sẽ mở shortlink và đồng bộ video từ đó.',
        };
      }
      if (/^\/@[^/]+\/(video|photo)\/[^/]+$/i.test(path)) {
        return {
          status: 'ok',
          tone: 'sky',
          title: 'Video TikTok đơn lẻ',
          detail: 'Phù hợp khi bạn muốn lấy đúng một video cụ thể.',
        };
      }
      if (/^\/@[^/]+$/i.test(path)) {
        return {
          status: 'ok',
          tone: 'sky',
          title: 'Hồ sơ TikTok',
          detail: 'Worker sẽ lấy danh sách video từ hồ sơ này.',
        };
      }
      return {
        status: 'warning',
        tone: 'amber',
        title: 'TikTok chưa đúng mẫu hỗ trợ',
        detail: 'Hãy dùng link video, hồ sơ hoặc shortlink TikTok hợp lệ.',
      };
    }

    if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(host)) {
      if (/^\/shorts\/[^/]+$/i.test(path)) {
        return {
          status: 'ok',
          tone: 'rose',
          title: 'YouTube Short đơn lẻ',
          detail: 'Phù hợp khi bạn muốn lấy đúng một short cụ thể.',
        };
      }
      if (/^\/(?:@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+)\/shorts$/i.test(path)) {
        return {
          status: 'ok',
          tone: 'rose',
          title: 'Nguồn YouTube Shorts',
          detail: 'Worker sẽ chỉ lấy các Shorts hợp lệ từ nguồn này.',
        };
      }
      return {
        status: 'warning',
        tone: 'amber',
        title: 'Link YouTube chưa đúng scope',
        detail: 'Chỉ hỗ trợ /shorts/... hoặc nguồn /@handle/shorts.',
      };
    }

    if (['youtu.be', 'www.youtu.be'].includes(host)) {
      return {
        status: 'warning',
        tone: 'amber',
        title: 'Link rút gọn YouTube chưa hỗ trợ',
        detail: 'Hãy dùng URL đầy đủ dạng youtube.com/shorts/...',
      };
    }

    return {
      status: 'warning',
      tone: 'amber',
      title: 'Nguồn chưa được hỗ trợ',
      detail: 'Hiện chỉ hỗ trợ TikTok và YouTube Shorts.',
    };
  } catch {
    return {
      status: 'warning',
      tone: 'amber',
      title: 'Link nguồn chưa hợp lệ',
      detail: 'Kiểm tra lại URL trước khi tạo chiến dịch.',
    };
  }
}

function getResolvedPageTokenKind(pageItem, validation) {
  return validation?.token_kind || pageItem?.token_kind || 'missing';
}

function getMessengerConnectionMeta(validation) {
  const connection = validation?.messenger_connection;
  if (!validation) {
    return {
      label: 'Webhook chưa kiểm tra',
      tone: 'slate',
      detail: 'Bấm xác minh để xem trạng thái webhook feed và messages.',
    };
  }
  if (validation.ok === false) {
    return {
      label: 'Token chưa đạt',
      tone: 'rose',
      detail: validation.message || 'Không thể kiểm tra kết nối webhook fanpage.',
    };
  }
  if (connection?.connected) {
    const appName = connection.connected_app?.name || 'app hiện tại';
    return {
      label: 'Webhook đã kết nối',
      tone: 'emerald',
      detail: `Đang nhận feed và messages qua ${appName}.`,
    };
  }
  return {
    label: 'Webhook chưa kết nối',
    tone: connection?.ok === false ? 'rose' : 'amber',
    detail: connection?.message || 'Fanpage chưa đăng ký nhận feed và messages.',
  };
}

function buildPageCheckSnapshot(payload) {
  return {
    ...payload?.validation,
    messenger_connection: payload?.messenger_connection || payload?.validation?.messenger_connection || null,
    checked_at: new Date().toISOString(),
  };
}

function App() {
  const [campaigns, setCampaigns] = useState([]);
  const [videos, setVideos] = useState([]);
  const [interactions, setInteractions] = useState([]);
  const [conversationList, setConversationList] = useState([]);
  const [selectedConversationId, setSelectedConversationId] = useState(null);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [selectedConversationLogs, setSelectedConversationLogs] = useState([]);
  const [systemInfo, setSystemInfo] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    source_url: '',
    auto_post: false,
    target_page_id: '',
    schedule_interval: 30,
    schedule_start_at: '',
  });
  const [fbPages, setFbPages] = useState([]);
  const [campaignScheduleDrafts, setCampaignScheduleDrafts] = useState({});
  const [fbForm, setFbForm] = useState({ page_id: '', page_name: '', long_lived_access_token: '' });
  const [fbImportToken, setFbImportToken] = useState('');
  const [discoveredFbPages, setDiscoveredFbPages] = useState([]);
  const [selectedDiscoveredPageIds, setSelectedDiscoveredPageIds] = useState([]);
  const [discoverySubject, setDiscoverySubject] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [stats, setStats] = useState(DEFAULT_STATS);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filteredVideoTotal, setFilteredVideoTotal] = useState(0);
  const [filters, setFilters] = useState({ status: 'all', campaignId: 'all', sourcePlatform: 'all' });
  const [campaignSourceFilter, setCampaignSourceFilter] = useState('all');
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [sessionExpiresAt, setSessionExpiresAt] = useState(localStorage.getItem('token_expires_at'));
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');
  const [notice, setNotice] = useState(null);
  const [actionState, setActionState] = useState({});
  const [captionDrafts, setCaptionDrafts] = useState({});
  const [pageChecks, setPageChecks] = useState({});
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [healthInfo, setHealthInfo] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [taskSummary, setTaskSummary] = useState(DEFAULT_TASK_SUMMARY);
  const [events, setEvents] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [users, setUsers] = useState([]);
  const [runtimeConfig, setRuntimeConfig] = useState(null);
  const [runtimeForm, setRuntimeForm] = useState(DEFAULT_RUNTIME_FORM);
  const [tunnelVerification, setTunnelVerification] = useState(null);
  const [replyAutomationDrafts, setReplyAutomationDrafts] = useState({});
  const [commentReplyDrafts, setCommentReplyDrafts] = useState({});
  const [userForm, setUserForm] = useState({ username: '', display_name: '', password: '', role: 'operator' });
  const [passwordForm, setPasswordForm] = useState({ current_password: '', new_password: '' });
  const [activeSection, setActiveSection] = useState(localStorage.getItem('dashboard-active-section') || 'overview');
  const [workerPage, setWorkerPage] = useState(1);
  const [taskPage, setTaskPage] = useState(1);
  const [eventPage, setEventPage] = useState(1);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [expandedItems, setExpandedItems] = useState({});
  const [showAllMetrics, setShowAllMetrics] = useState(false);
  const [overviewSourceFilter, setOverviewSourceFilter] = useState('all');
  const [engagementPage, setEngagementPage] = useState(1);
  const [engagementFilter, setEngagementFilter] = useState('all');
  const [conversationStatusFilter, setConversationStatusFilter] = useState('all');
  const [manualReplyDraft, setManualReplyDraft] = useState('');
  const [conversationNoteDraft, setConversationNoteDraft] = useState('');
  const [conversationAssigneeDraft, setConversationAssigneeDraft] = useState('');
  const [pendingOperatorComposerId, setPendingOperatorComposerId] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const manualReplyPanelRef = useRef(null);
  const manualReplyInputRef = useRef(null);
  const confirmResolverRef = useRef(null);

  const isAdmin = currentUser?.role === 'admin';
  const staleWorkers = workers.filter((worker) => !worker.is_online);
  const onlineWorkers = workers.filter((worker) => worker.is_online).length;
  const currentSection = NAV_ITEMS.find((item) => item.id === activeSection) || NAV_ITEMS[0];
  const warningCount = systemInfo?.warnings?.length || 0;
  const invalidPages = fbPages.filter((pageItem) => getResolvedPageTokenKind(pageItem, pageChecks[pageItem.page_id]) !== 'page_access_token');
  const connectedMessagePages = fbPages.filter((pageItem) => pageChecks[pageItem.page_id]?.messenger_connection?.connected).length;
  const focusCampaignCandidates = campaigns.filter((campaign) => campaign.last_sync_status === 'failed' || campaign.video_counts?.failed > 0);
  const focusCampaigns = focusCampaignCandidates.slice(0, 3);
  const campaignSourceSummary = summarizeSourceCounts(campaigns, (campaign) => campaign.source_platform);
  const filteredCampaigns = campaigns.filter((campaign) => campaignSourceFilter === 'all' || campaign.source_platform === campaignSourceFilter);
  const overviewSourceBreakdown = [
    {
      platform: 'tiktok',
      ...getSourcePlatformMeta('tiktok'),
      campaigns: stats.by_source?.tiktok?.campaigns ?? 0,
      videos: stats.by_source?.tiktok?.videos ?? 0,
      ready: stats.by_source?.tiktok?.ready ?? 0,
      trend: stats.source_trends?.series?.tiktok || { ready: [], posted: [], failed: [] },
    },
    {
      platform: 'youtube',
      ...getSourcePlatformMeta('youtube'),
      campaigns: stats.by_source?.youtube?.campaigns ?? 0,
      videos: stats.by_source?.youtube?.videos ?? 0,
      ready: stats.by_source?.youtube?.ready ?? 0,
      trend: stats.source_trends?.series?.youtube || { ready: [], posted: [], failed: [] },
    },
  ];
  const visibleOverviewSources = overviewSourceFilter === 'all'
    ? overviewSourceBreakdown
    : overviewSourceBreakdown.filter((item) => item.platform === overviewSourceFilter);
  const overviewSourceMax = Math.max(
    1,
    ...visibleOverviewSources.flatMap((item) => [item.campaigns, item.videos, item.ready]),
  );
  const overviewFocusCampaigns = focusCampaignCandidates
    .filter((campaign) => overviewSourceFilter === 'all' || campaign.source_platform === overviewSourceFilter)
    .slice(0, 3);
  const runtimeSettings = runtimeConfig?.settings || {};
  const runtimeDerived = runtimeConfig?.derived || {};
  const runtimeOverrideCount = Object.values(runtimeSettings).filter((setting) => setting?.source === 'override').length;
  const pagesNeedingAttention = fbPages.filter((pageItem) => {
    const validation = pageChecks[pageItem.page_id];
    const tokenReady = getResolvedPageTokenKind(pageItem, validation) === 'page_access_token';
    const messengerReady = !!validation?.messenger_connection?.connected;
    return !tokenReady || !messengerReady;
  }).length;
  const navCounts = {
    overview: warningCount,
    campaigns: campaigns.length,
    queue: stats.ready ?? 0,
    engagement: systemInfo?.pending_comment_replies ?? 0,
    messages: systemInfo?.pending_message_replies ?? 0,
    settings: pagesNeedingAttention || fbPages.length || runtimeOverrideCount,
    operations: taskSummary.failed ?? 0,
    security: users.length || (currentUser ? 1 : 0),
  };
  const sortedInteractions = [...interactions].sort((left, right) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime());
  const filteredInteractions = sortedInteractions.filter((log) => matchesEngagementFilter(log, engagementFilter));
  const totalEngagementPages = Math.max(1, Math.ceil(filteredInteractions.length / ENGAGEMENT_PAGE_SIZE));
  const pagedInteractions = filteredInteractions.slice((engagementPage - 1) * ENGAGEMENT_PAGE_SIZE, engagementPage * ENGAGEMENT_PAGE_SIZE);
  const totalWorkerPages = Math.max(1, Math.ceil(workers.length / WORKER_PAGE_SIZE));
  const pagedWorkers = workers.slice((workerPage - 1) * WORKER_PAGE_SIZE, workerPage * WORKER_PAGE_SIZE);
  const totalTaskPages = Math.max(1, Math.ceil(tasks.length / TASK_PAGE_SIZE));
  const pagedTasks = tasks.slice((taskPage - 1) * TASK_PAGE_SIZE, taskPage * TASK_PAGE_SIZE);
  const totalEventPages = Math.max(1, Math.ceil(events.length / SYSTEM_EVENT_PAGE_SIZE));
  const pagedEvents = events.slice((eventPage - 1) * SYSTEM_EVENT_PAGE_SIZE, eventPage * SYSTEM_EVENT_PAGE_SIZE);
  const toggleExpandedItem = (key) => setExpandedItems((current) => ({ ...current, [key]: !current[key] }));
  const handoffConversations = conversationList.filter((conversation) => conversation.status === 'operator_active');
  const resolvedConversations = conversationList.filter((conversation) => conversation.status === 'resolved');
  const visibleConversations = conversationStatusFilter === 'all'
    ? conversationList
    : conversationList.filter((conversation) => conversation.status === conversationStatusFilter);
  const selectedConversationStatusMeta = getConversationStatusMeta(selectedConversation?.status);
  const selectedConversationTimeline = buildConversationTimeline(selectedConversationLogs);
  const assignableUsers = isAdmin ? users.filter((user) => user.is_active) : (currentUser ? [currentUser] : []);
  const allDiscoveredSelected = discoveredFbPages.length > 0
    && selectedDiscoveredPageIds.length === discoveredFbPages.length;

  const authFetch = async (url, options = {}) => {
    if (sessionExpiresAt && new Date(sessionExpiresAt).getTime() <= Date.now()) {
      setToken(null);
      setSessionExpiresAt(null);
      localStorage.removeItem('token');
      localStorage.removeItem('token_expires_at');
      throw new Error('Phiên đăng nhập đã hết hạn.');
    }
    const headers = { ...options.headers };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401) {
      setToken(null);
      setSessionExpiresAt(null);
      localStorage.removeItem('token');
      localStorage.removeItem('token_expires_at');
      throw new Error('Phiên đăng nhập đã hết hạn.');
    }
    return response;
  };

  const requestJson = async (url, options = {}) => {
    const response = await authFetch(url, options);
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (!response.ok) throw new Error(parseMessage(payload, 'Yêu cầu không thành công.'));
    return payload;
  };

  const setBusy = (key, value) => setActionState((current) => ({ ...current, [key]: value }));
  const showNotice = (type, message) => setNotice({ type, message });
  const closeConfirmDialog = (result) => {
    const resolver = confirmResolverRef.current;
    confirmResolverRef.current = null;
    setConfirmDialog(null);
    if (resolver) resolver(result);
  };

  const confirmAction = ({
    title,
    description,
    confirmLabel = 'Xác nhận',
    cancelLabel = 'Hủy',
    tone = 'sky',
  }) => new Promise((resolve) => {
    confirmResolverRef.current = resolve;
    setConfirmDialog({
      title,
      description,
      confirmLabel,
      cancelLabel,
      tone,
    });
  });

  const fetchDashboard = async () => {
    if (!token) return;
    setIsRefreshing(true);
    try {
      const meData = await requestJson(`${API_URL}/auth/me`);
      const params = new URLSearchParams({ page: String(page), limit: '10' });
      if (filters.status !== 'all') params.set('status', filters.status);
      if (filters.campaignId !== 'all') params.set('campaign_id', filters.campaignId);
      if (filters.sourcePlatform !== 'all') params.set('source_platform', filters.sourcePlatform);

      const [campaignsData, statsData, videosData, fbData, logsData, conversationsData, systemData, healthData, taskData, eventData, workerData, userData] = await Promise.all([
        requestJson(`${API_URL}/campaigns/`),
        requestJson(`${API_URL}/campaigns/stats`),
        requestJson(`${API_URL}/campaigns/videos?${params.toString()}`),
        requestJson(`${API_URL}/facebook/config`),
        requestJson(`${API_URL}/webhooks/logs`),
        requestJson(`${API_URL}/webhooks/conversations?limit=80`),
        requestJson(`${API_URL}/system/overview`),
        requestJson(`${API_URL}/system/health`),
        requestJson(`${API_URL}/system/tasks?limit=${TASK_FETCH_LIMIT}`),
        requestJson(`${API_URL}/system/events?limit=${SYSTEM_EVENT_FETCH_LIMIT}`),
        requestJson(`${API_URL}/system/workers`),
        meData?.role === 'admin' ? requestJson(`${API_URL}/users/`) : Promise.resolve({ users: [] }),
      ]);

      setCurrentUser(meData);
      setCampaigns(campaignsData);
      setStats(statsData);
      setVideos(videosData.videos);
      setFilteredVideoTotal(videosData.total ?? 0);
      setTotalPages(videosData.pages);
      setFbPages(fbData);
      setInteractions(logsData);
      setConversationList(conversationsData.conversations || []);
      setSystemInfo(systemData);
      setHealthInfo(healthData);
      setTasks(taskData.tasks || []);
      setTaskSummary(taskData.summary || DEFAULT_TASK_SUMMARY);
      setEvents(eventData.events || []);
      setWorkers(workerData.workers || []);
      setUsers(userData.users || []);
      setLastUpdatedAt(new Date().toISOString());
    } catch (error) {
      showNotice('error', error.message);
    } finally {
      setTimeout(() => setIsRefreshing(false), 250);
    }
  };

  const loadRuntimeConfig = async () => {
    if (!token || currentUser?.role !== 'admin') return;
    const payload = await requestJson(`${API_URL}/system/runtime-config`);
    setRuntimeConfig(payload);
    setRuntimeForm(extractRuntimeForm(payload));
  };

  const loadConversationDetail = async (conversationId, { silent = false } = {}) => {
    if (!token || !conversationId) {
      setSelectedConversation(null);
      setSelectedConversationLogs([]);
      return null;
    }

    try {
      const payload = await requestJson(`${API_URL}/webhooks/conversations/${conversationId}`);
      setSelectedConversation(payload.conversation || null);
      setSelectedConversationLogs(payload.logs || []);
      return payload;
    } catch (error) {
      if (!silent) showNotice('error', error.message);
      return null;
    }
  };

  const runAction = async (key, action) => {
    setBusy(key, true);
    try {
      const payload = await action();
      if (payload?.message) showNotice('success', payload.message);
      await fetchDashboard();
      return payload;
    } catch (error) {
      showNotice('error', error.message);
      return null;
    } finally {
      setBusy(key, false);
    }
  };

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = setTimeout(() => setNotice(null), 4200);
    return () => clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    localStorage.setItem('dashboard-active-section', activeSection);
  }, [activeSection]);

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [token, page, filters.status, filters.campaignId, filters.sourcePlatform]);
  /* eslint-enable react-hooks/exhaustive-deps */

  useEffect(() => {
    if (fbPages.length === 0) return;
    const selectedPageExists = fbPages.some((entry) => entry.page_id === formData.target_page_id);
    if (!selectedPageExists) setFormData((current) => ({ ...current, target_page_id: fbPages[0].page_id }));
  }, [fbPages, formData.target_page_id]);

  useEffect(() => {
    setReplyAutomationDrafts((current) => {
      const next = {};
      fbPages.forEach((pageItem) => {
        next[pageItem.page_id] = current[pageItem.page_id] || buildReplyAutomationDraft(pageItem);
      });
      return next;
    });
  }, [fbPages]);

  useEffect(() => {
    if (filters.campaignId === 'all') return;
    const exists = campaigns.some((campaign) => campaign.id === filters.campaignId);
    if (!exists) setFilters((current) => ({ ...current, campaignId: 'all' }));
  }, [campaigns, filters.campaignId]);

  useEffect(() => {
    setCampaignScheduleDrafts((current) => {
      const next = {};
      campaigns.forEach((campaign) => {
        next[campaign.id] = current[campaign.id] ?? formatUtcIsoForDateTimeLocal(campaign.schedule_start_at);
      });
      return next;
    });
  }, [campaigns]);

  useEffect(() => {
    setCommentReplyDrafts((current) => {
      const next = { ...current };
      const interactionIds = new Set(interactions.map((log) => log.id));
      let changed = false;

      Object.keys(next).forEach((logId) => {
        if (!interactionIds.has(logId)) {
          delete next[logId];
          changed = true;
        }
      });

      interactions.forEach((log) => {
        if (!(log.id in next)) {
          const shouldSeedDraft = log.reply_mode === 'operator'
            || log.status === 'replied'
            || (log.status === 'failed' && !!log.ai_reply);
          next[log.id] = shouldSeedDraft ? (log.ai_reply || '') : '';
          changed = true;
        }
      });

      return changed ? next : current;
    });
  }, [interactions]);

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!token || currentUser?.role !== 'admin') {
      setRuntimeConfig(null);
      setRuntimeForm(DEFAULT_RUNTIME_FORM);
      setTunnelVerification(null);
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        const payload = await requestJson(`${API_URL}/system/runtime-config`);
        if (cancelled) return;
        setRuntimeConfig(payload);
        setRuntimeForm(extractRuntimeForm(payload));
        setTunnelVerification(null);
      } catch (error) {
        if (!cancelled) showNotice('error', error.message);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [token, currentUser?.role]);
  /* eslint-enable react-hooks/exhaustive-deps */

  useEffect(() => {
    if (engagementPage > totalEngagementPages) {
      setEngagementPage(totalEngagementPages);
    }
  }, [engagementPage, totalEngagementPages]);

  useEffect(() => {
    setEngagementPage(1);
  }, [engagementFilter]);

  useEffect(() => {
    if (workerPage > totalWorkerPages) {
      setWorkerPage(totalWorkerPages);
    }
  }, [workerPage, totalWorkerPages]);

  useEffect(() => {
    if (taskPage > totalTaskPages) {
      setTaskPage(totalTaskPages);
    }
  }, [taskPage, totalTaskPages]);

  useEffect(() => {
    if (eventPage > totalEventPages) {
      setEventPage(totalEventPages);
    }
  }, [eventPage, totalEventPages]);

  useEffect(() => {
    setCaptionDrafts((current) => {
      const nextDrafts = { ...current };
      videos.forEach((video) => {
        if (!(video.id in nextDrafts) || (!nextDrafts[video.id] && video.ai_caption)) nextDrafts[video.id] = video.ai_caption || '';
      });
      return nextDrafts;
    });
  }, [videos]);

  useEffect(() => {
    if (conversationList.length === 0) {
      setSelectedConversationId(null);
      setSelectedConversation(null);
      setSelectedConversationLogs([]);
      return;
    }

    const exists = conversationList.some((conversation) => conversation.id === selectedConversationId);
    if (!exists) setSelectedConversationId(conversationList[0].id);
  }, [conversationList, selectedConversationId]);

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!token || !selectedConversationId) return;
    loadConversationDetail(selectedConversationId, { silent: true });
  }, [token, selectedConversationId, lastUpdatedAt]);
  /* eslint-enable react-hooks/exhaustive-deps */

  useEffect(() => {
    if (!selectedConversation) {
      setConversationNoteDraft('');
      setConversationAssigneeDraft('');
      setManualReplyDraft('');
      return;
    }

    setConversationNoteDraft(selectedConversation.internal_note || '');
    setConversationAssigneeDraft(
      selectedConversation.assigned_to_user_id
        || (!isAdmin && currentUser?.id ? currentUser.id : ''),
    );
  }, [selectedConversation, isAdmin, currentUser?.id]);

  useEffect(() => {
    if (
      !pendingOperatorComposerId
      || !selectedConversation
      || selectedConversation.id !== pendingOperatorComposerId
      || selectedConversation.status !== 'operator_active'
    ) {
      return;
    }

    setConversationStatusFilter('operator_active');
    const timeout = setTimeout(() => {
      manualReplyPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      manualReplyInputRef.current?.focus();
      setPendingOperatorComposerId(null);
    }, 120);

    return () => clearTimeout(timeout);
  }, [pendingOperatorComposerId, selectedConversation]);

  const handleSectionChange = (sectionId) => {
    setActiveSection(sectionId);
    setIsMobileNavOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCampaignSubmit = async (event) => {
    event.preventDefault();
    if (!formData.target_page_id) {
      showNotice('error', 'Vui lòng chọn trang đích.');
      return;
    }
    const scheduleStartAt = normalizeLocalDateTimeToUtcIso(formData.schedule_start_at);
    if (formData.schedule_start_at && !scheduleStartAt) {
      showNotice('error', 'Ngày giờ bắt đầu chưa hợp lệ.');
      return;
    }
    await runAction('create-campaign', async () => {
      const payloadToCreate = {
        ...formData,
        schedule_start_at: scheduleStartAt,
      };
      const payload = await requestJson(`${API_URL}/campaigns/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadToCreate),
      });
      setFormData((current) => ({
        ...current,
        name: '',
        source_url: '',
        auto_post: false,
        schedule_start_at: '',
      }));
      return payload;
    });
  };

  const handleFbSubmit = async (event) => {
    event.preventDefault();
    const confirmed = await confirmAction({
      title: 'Lưu cấu hình fanpage',
      description: `Fanpage "${fbForm.page_name || fbForm.page_id || 'mới'}" sẽ được lưu vào hệ thống.`,
      confirmLabel: 'Lưu fanpage',
      tone: 'sky',
    });
    if (!confirmed) return;

    const payload = await runAction('save-page', async () => {
      const response = await requestJson(`${API_URL}/facebook/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fbForm),
      });
      setFbForm({ page_id: '', page_name: '', long_lived_access_token: '' });
      return response;
    });
    if (payload?.page?.page_id && payload?.validation) {
      setPageChecks((current) => ({
        ...current,
        [payload.page.page_id]: buildPageCheckSnapshot(payload),
      }));
    }
  };

  const handleDiscoverFacebookPages = async (event) => {
    event.preventDefault();
    const userAccessToken = fbImportToken.trim();
    if (!userAccessToken) {
      showNotice('error', 'Bạn cần dán User Access Token trước khi tải danh sách fanpage.');
      return;
    }

    const payload = await runAction('discover-pages', () => requestJson(`${API_URL}/facebook/config/discover-pages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_access_token: userAccessToken }),
    }));

    if (payload) {
      const pages = payload.pages || [];
      setDiscoveredFbPages(pages);
      setDiscoverySubject({
        token_subject_id: payload.token_subject_id,
        token_subject_name: payload.token_subject_name,
      });
      const preferredSelection = pages
        .filter((pageItem) => !pageItem.already_configured)
        .map((pageItem) => pageItem.page_id);
      setSelectedDiscoveredPageIds(
        preferredSelection.length > 0
          ? preferredSelection
          : pages.map((pageItem) => pageItem.page_id),
      );
    }
  };

  const handleToggleDiscoveredPage = (pageId) => {
    setSelectedDiscoveredPageIds((current) => (
      current.includes(pageId)
        ? current.filter((item) => item !== pageId)
        : [...current, pageId]
    ));
  };

  const handleToggleAllDiscoveredPages = () => {
    setSelectedDiscoveredPageIds(
      allDiscoveredSelected
        ? []
        : discoveredFbPages.map((pageItem) => pageItem.page_id),
    );
  };

  const handleImportFacebookPages = async () => {
    const userAccessToken = fbImportToken.trim();
    if (!userAccessToken) {
      showNotice('error', 'Bạn cần dán User Access Token để import fanpage.');
      return;
    }
    if (selectedDiscoveredPageIds.length === 0) {
      showNotice('error', 'Hãy chọn ít nhất một fanpage để import.');
      return;
    }
    const confirmed = await confirmAction({
      title: 'Import fanpage đã chọn',
      description: `${selectedDiscoveredPageIds.length} fanpage sẽ được thêm vào hệ thống và lưu token tương ứng.`,
      confirmLabel: 'Import fanpage',
      tone: 'sky',
    });
    if (!confirmed) return;

    const payload = await runAction('import-pages', () => requestJson(`${API_URL}/facebook/config/import-pages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_access_token: userAccessToken,
        page_ids: selectedDiscoveredPageIds,
      }),
    }));

    if (payload?.imported_pages) {
      setPageChecks((current) => {
        const next = { ...current };
        payload.imported_pages.forEach((item) => {
          if (item?.page?.page_id && item?.validation) {
            next[item.page.page_id] = buildPageCheckSnapshot(item);
          }
        });
        return next;
      });
      setDiscoveredFbPages([]);
      setSelectedDiscoveredPageIds([]);
      setDiscoverySubject(null);
      setFbImportToken('');
    }
  };

  const handleRefreshFacebookPages = async () => {
    const userAccessToken = fbImportToken.trim();
    if (!userAccessToken) {
      showNotice('error', 'Bạn cần dán User Access Token để làm mới token fanpage.');
      return;
    }
    if (fbPages.length === 0) {
      showNotice('error', 'Chưa có fanpage nào trong hệ thống để làm mới token.');
      return;
    }
    const confirmed = await confirmAction({
      title: 'Làm mới token fanpage',
      description: `Hệ thống sẽ dùng User Access Token hiện tại để làm mới token cho ${fbPages.length} fanpage.`,
      confirmLabel: 'Làm mới token',
      tone: 'amber',
    });
    if (!confirmed) return;

    const payload = await runAction('refresh-pages', () => requestJson(`${API_URL}/facebook/config/refresh-pages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_access_token: userAccessToken,
        page_ids: fbPages.map((pageItem) => pageItem.page_id),
      }),
    }));

    if (payload?.refreshed_pages) {
      setPageChecks((current) => {
        const next = { ...current };
        payload.refreshed_pages.forEach((item) => {
          if (item?.page?.page_id && item?.validation) {
            next[item.page.page_id] = buildPageCheckSnapshot(item);
          }
        });
        return next;
      });
    }
  };

  const handleDeleteFacebookPage = async (pageId, pageName) => {
    const confirmed = await confirmAction({
      title: 'Xóa fanpage',
      description: `Fanpage "${pageName}" sẽ bị xóa khỏi hệ thống cùng toàn bộ dữ liệu liên quan có thể dọn theo.`,
      confirmLabel: 'Xóa fanpage',
      tone: 'rose',
    });
    if (!confirmed) return;

    const payload = await runAction(`delete-page-${pageId}`, () => requestJson(`${API_URL}/facebook/config/${pageId}`, {
      method: 'DELETE',
    }));

    if (payload?.page_id) {
      setPageChecks((current) => {
        const next = { ...current };
        delete next[payload.page_id];
        return next;
      });
      setReplyAutomationDrafts((current) => {
        const next = { ...current };
        delete next[payload.page_id];
        return next;
      });
      if (formData.target_page_id === payload.page_id) {
        setFormData((current) => ({ ...current, target_page_id: '' }));
      }
    }
  };

  const handleValidatePage = async (pageId) => {
    setBusy(`page-validate-${pageId}`, true);
    try {
      const payload = await requestJson(`${API_URL}/facebook/config/${pageId}/validate`);
      setPageChecks((current) => ({ ...current, [pageId]: buildPageCheckSnapshot({ validation: payload, messenger_connection: payload.messenger_connection }) }));
      showNotice('success', payload.message);
    } catch (error) {
      setPageChecks((current) => ({ ...current, [pageId]: { ok: false, message: error.message, checked_at: new Date().toISOString() } }));
      showNotice('error', error.message);
    } finally {
      setBusy(`page-validate-${pageId}`, false);
    }
  };

  const handleSubscribeMessages = async (pageId) => {
    setBusy(`page-subscribe-${pageId}`, true);
    try {
      const payload = await requestJson(`${API_URL}/facebook/config/${pageId}/subscribe-messages`, {
        method: 'POST',
      });
      setPageChecks((current) => ({
        ...current,
        [pageId]: buildPageCheckSnapshot(payload),
      }));
      showNotice('success', payload.message);
      await fetchDashboard();
    } catch (error) {
      showNotice('error', error.message);
    } finally {
      setBusy(`page-subscribe-${pageId}`, false);
    }
  };

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!token || fbPages.length === 0) return;

    const missingPageIds = fbPages
      .map((pageItem) => pageItem.page_id)
      .filter((pageId) => !pageChecks[pageId] && !actionState[`page-validate-${pageId}`]);

    if (missingPageIds.length === 0) return;

    let cancelled = false;
    const hydrateChecks = async () => {
      const results = await Promise.allSettled(
        missingPageIds.map((pageId) => requestJson(`${API_URL}/facebook/config/${pageId}/validate`)),
      );

      if (cancelled) return;

      setPageChecks((current) => {
        const next = { ...current };
        results.forEach((result, index) => {
          const pageId = missingPageIds[index];
          if (result.status === 'fulfilled') {
            next[pageId] = buildPageCheckSnapshot({
              validation: result.value,
              messenger_connection: result.value.messenger_connection,
            });
          } else {
            next[pageId] = {
              ok: false,
              message: result.reason?.message || 'Không thể kiểm tra fanpage.',
              checked_at: new Date().toISOString(),
            };
          }
        });
        return next;
      });
    };

    hydrateChecks();
    return () => {
      cancelled = true;
    };
  }, [fbPages, pageChecks, token, actionState]);
  /* eslint-enable react-hooks/exhaustive-deps */

  const handleReplyAutomationDraftChange = (pageId, key, value) => {
    setReplyAutomationDrafts((current) => ({
      ...current,
      [pageId]: {
        ...(current[pageId] || {}),
        [key]: value,
      },
    }));
  };

  const handleReplyAutomationReset = (pageItem) => {
    setReplyAutomationDrafts((current) => ({
      ...current,
      [pageItem.page_id]: buildReplyAutomationDraft(pageItem),
    }));
  };

  const handleReplyAutomationSave = async (pageId) => {
    const draft = replyAutomationDrafts[pageId];
    if (!draft) {
      showNotice('error', 'Không tìm thấy cấu hình fanpage để lưu.');
      return;
    }

    const payload = await runAction(`reply-automation-${pageId}`, () => requestJson(`${API_URL}/facebook/config/${pageId}/automation`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    }));

    if (payload?.page) {
      setReplyAutomationDrafts((current) => ({
        ...current,
        [pageId]: buildReplyAutomationDraft(payload.page),
      }));
    }
  };

  const handleConversationUpdate = async (conversationId, payload, keySuffix = 'update') => {
    if (!conversationId) {
      showNotice('error', 'Không tìm thấy cuộc trò chuyện để cập nhật.');
      return null;
    }

    const result = await runAction(`conversation-${keySuffix}-${conversationId}`, () => requestJson(`${API_URL}/webhooks/conversations/${conversationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }));
    if (result?.conversation) {
      setConversationList((current) => current.map((conversation) => (
        conversation.id === conversationId
          ? { ...conversation, ...result.conversation }
          : conversation
      )));
      if (selectedConversationId === conversationId) {
        setSelectedConversation((current) => ({ ...(current || {}), ...result.conversation }));
      }
      if (result.conversation.status === 'operator_active') {
        setConversationStatusFilter('operator_active');
        setPendingOperatorComposerId(conversationId);
      }
      await loadConversationDetail(conversationId, { silent: true });
    }
    return result;
  };

  const handleConversationStatusChange = async (conversationId, status, handoffReason = '') => {
    await handleConversationUpdate(conversationId, { status, handoff_reason: handoffReason }, `status-${status}`);
  };

  const handleConversationMetaSave = async () => {
    if (!selectedConversationId) {
      showNotice('error', 'Bạn chưa chọn cuộc trò chuyện nào.');
      return;
    }

    const payload = {
      assigned_to_user_id: conversationAssigneeDraft || '',
      internal_note: conversationNoteDraft,
    };
    await handleConversationUpdate(selectedConversationId, payload, 'meta');
  };

  const handleManualReply = async (markResolved = false) => {
    if (!selectedConversationId) {
      showNotice('error', 'Bạn chưa chọn cuộc trò chuyện nào.');
      return;
    }

    const message = manualReplyDraft.trim();
    if (message.length < 2) {
      showNotice('error', 'Nội dung phản hồi cần ít nhất 2 ký tự.');
      return;
    }

    const payload = await runAction(`conversation-reply-${selectedConversationId}`, () => requestJson(`${API_URL}/webhooks/conversations/${selectedConversationId}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, mark_resolved: markResolved }),
    }));
    if (payload?.conversation) {
      setManualReplyDraft('');
      await loadConversationDetail(selectedConversationId, { silent: true });
    }
  };

  const handlePrioritize = async (videoId) => {
    await runAction(`video-${videoId}`, () => requestJson(`${API_URL}/campaigns/videos/${videoId}/priority`, { method: 'POST' }));
  };

  const handleRetryVideo = async (videoId) => {
    await runAction(`video-retry-${videoId}`, () => requestJson(`${API_URL}/campaigns/videos/${videoId}/retry`, { method: 'POST' }));
  };

  const handleRegenerateCaption = async (videoId) => {
    const payload = await runAction(`video-generate-${videoId}`, () => requestJson(`${API_URL}/campaigns/videos/${videoId}/generate-caption`, { method: 'POST' }));
    if (payload?.video) setCaptionDrafts((current) => ({ ...current, [videoId]: payload.video.ai_caption || '' }));
  };

  const handleCaptionChange = (videoId, value) => setCaptionDrafts((current) => ({ ...current, [videoId]: value }));

  const handleSaveCaption = async (videoId) => {
    const ai_caption = (captionDrafts[videoId] || '').trim();
    if (ai_caption.length < 3) {
      showNotice('error', 'Chú thích cần ít nhất 3 ký tự.');
      return;
    }
    const payload = await runAction(`video-caption-${videoId}`, () => requestJson(`${API_URL}/campaigns/videos/${videoId}/caption`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ai_caption }),
    }));
    if (payload?.video) setCaptionDrafts((current) => ({ ...current, [videoId]: payload.video.ai_caption || '' }));
  };

  const handleCommentReplyDraftChange = (logId, value) => {
    setCommentReplyDrafts((current) => ({ ...current, [logId]: value }));
  };

  const handleCommentReplyModeChange = async (log, replyMode) => {
    if (!log?.id || log.status === 'replied' || log.reply_mode === replyMode) return;

    const payload = await runAction(`comment-mode-${log.id}`, () => requestJson(`${API_URL}/webhooks/comments/${log.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply_mode: replyMode }),
    }));

    if (payload?.log && replyMode === 'operator') {
      setCommentReplyDrafts((current) => ({
        ...current,
        [log.id]: current[log.id] ?? '',
      }));
    }
  };

  const handleGenerateCommentAiDraft = async (log) => {
    if (!log?.id || log.status === 'replied') return;

    const payload = await runAction(`comment-draft-${log.id}`, () => requestJson(`${API_URL}/webhooks/comments/${log.id}/draft`, {
      method: 'POST',
    }));

    if (payload?.log) {
      setCommentReplyDrafts((current) => ({
        ...current,
        [log.id]: payload.log.ai_reply || '',
      }));
    }
  };

  const handleCommentManualReply = async (log) => {
    if (!log?.id) return;

    const message = (commentReplyDrafts[log.id] || '').trim();
    if (message.length < 2) {
      showNotice('error', 'Nội dung phản hồi bình luận cần ít nhất 2 ký tự.');
      return;
    }

    const payload = await runAction(`comment-reply-${log.id}`, () => requestJson(`${API_URL}/webhooks/comments/${log.id}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    }));

    if (payload?.log) {
      setCommentReplyDrafts((current) => ({ ...current, [log.id]: payload.log.ai_reply || message }));
    }
  };

  const handleCampaignAction = async (campaign, action) => {
    if (action === 'delete') {
      const confirmed = await confirmAction({
        title: 'Xóa chiến dịch',
        description: `Chiến dịch "${campaign.name}" và toàn bộ video liên quan sẽ bị xóa.`,
        confirmLabel: 'Xóa chiến dịch',
        tone: 'rose',
      });
      if (!confirmed) return;
    }
    const config = {
      sync: { method: 'POST', path: `${API_URL}/campaigns/${campaign.id}/sync` },
      pause: { method: 'POST', path: `${API_URL}/campaigns/${campaign.id}/pause` },
      resume: { method: 'POST', path: `${API_URL}/campaigns/${campaign.id}/resume` },
      delete: { method: 'DELETE', path: `${API_URL}/campaigns/${campaign.id}` },
    }[action];
    await runAction(`campaign-${campaign.id}-${action}`, () => requestJson(config.path, { method: config.method }));
  };

  const handleCampaignScheduleDraftChange = (campaignId, value) => {
    setCampaignScheduleDrafts((current) => ({ ...current, [campaignId]: value }));
  };

  const handleCampaignScheduleReset = (campaign) => {
    setCampaignScheduleDrafts((current) => ({
      ...current,
      [campaign.id]: formatUtcIsoForDateTimeLocal(campaign.schedule_start_at),
    }));
  };

  const handleCampaignScheduleSave = async (campaign) => {
    const draftValue = campaignScheduleDrafts[campaign.id] || '';
    const scheduleStartAt = normalizeLocalDateTimeToUtcIso(draftValue);
    if (draftValue && !scheduleStartAt) {
      showNotice('error', 'Ngày giờ bắt đầu của chiến dịch chưa hợp lệ.');
      return;
    }

    const confirmed = await confirmAction({
      title: 'Cập nhật lịch bắt đầu campaign',
      description: draftValue
        ? `Hệ thống sẽ đổi ngày giờ bắt đầu của "${campaign.name}" và xếp lại các video chưa đăng theo lịch mới.`
        : `Hệ thống sẽ bỏ mốc bắt đầu cố định của "${campaign.name}" và xếp lại các video chưa đăng theo hàng chờ hiện tại.`,
      confirmLabel: 'Lưu lịch mới',
      tone: 'sky',
    });
    if (!confirmed) return;

    const payload = await runAction(
      `campaign-${campaign.id}-schedule`,
      () => requestJson(`${API_URL}/campaigns/${campaign.id}/schedule`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule_start_at: scheduleStartAt }),
      }),
    );
    if (payload?.campaign) {
      setCampaignScheduleDrafts((current) => ({
        ...current,
        [campaign.id]: formatUtcIsoForDateTimeLocal(payload.campaign.schedule_start_at),
      }));
    }
  };

  const handleCopy = async (text, label) => {
    if (!text) {
      showNotice('error', `${label} hiện chưa có dữ liệu để sao chép.`);
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      showNotice('success', `Đã sao chép ${label}.`);
    } catch {
      showNotice('error', `Không thể sao chép ${label}.`);
    }
  };

  const handleRuntimeFieldChange = (key, value) => {
    if (key === 'TUNNEL_TOKEN') setTunnelVerification(null);
    setRuntimeForm((current) => ({ ...current, [key]: value }));
  };

  const handleVerifyTunnelToken = async () => {
    const tunnelToken = (runtimeForm.TUNNEL_TOKEN || '').trim();
    if (!tunnelToken) {
      showNotice('error', 'Bạn cần nhập TUNNEL_TOKEN trước khi xác thực.');
      return;
    }
    const confirmed = await confirmAction({
      title: 'Lưu token và kết nối tunnel',
      description: 'Hệ thống sẽ lưu TUNNEL_TOKEN, ghi lại runtime.env và thử khởi động lại service tunnel.',
      confirmLabel: 'Lưu và kết nối',
      tone: 'amber',
    });
    if (!confirmed) return;

    setBusy('verify-tunnel-token', true);
    try {
      const payload = await requestJson(`${API_URL}/system/runtime-config/verify-tunnel-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tunnel_token: tunnelToken }),
      });
      setRuntimeConfig(payload);
      setRuntimeForm(extractRuntimeForm(payload));
      setTunnelVerification(payload.tunnel_verification || null);
      showNotice(payload.tunnel_restart?.ok ? 'success' : 'error', payload.message);
    } catch (error) {
      setTunnelVerification({ ok: false, message: error.message });
      showNotice('error', error.message);
    } finally {
      setBusy('verify-tunnel-token', false);
    }
  };

  const handleRuntimeConfigSave = async (event) => {
    event.preventDefault();
    const confirmed = await confirmAction({
      title: 'Lưu cấu hình hệ thống',
      description: 'Các thay đổi runtime hiện tại sẽ được ghi vào hệ thống và áp dụng cho những phần liên quan.',
      confirmLabel: 'Lưu cấu hình',
      tone: 'sky',
    });
    if (!confirmed) return;

    const payload = await runAction('save-runtime-config', () => requestJson(`${API_URL}/system/runtime-config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(runtimeForm),
    }));
    if (payload) {
      setRuntimeConfig(payload);
      setRuntimeForm(extractRuntimeForm(payload));
      await loadRuntimeConfig();
    }
  };

  const handleRestoreRuntimeConfig = async () => {
    const confirmed = await confirmAction({
      title: 'Làm trống form cấu hình',
      description: 'Toàn bộ giá trị đang nhập trong form sẽ được đưa về trạng thái trống để bạn nhập lại từ đầu. Cấu hình đang lưu trên server sẽ chưa thay đổi cho tới khi bạn bấm Lưu cấu hình.',
      confirmLabel: 'Làm trống form',
      tone: 'amber',
    });
    if (!confirmed) return;

    setBusy('restore-runtime-config', true);
    try {
      setRuntimeForm(DEFAULT_RUNTIME_FORM);
      setTunnelVerification(null);
      showNotice('success', 'Đã làm trống toàn bộ form cấu hình. Cấu hình lưu trên server vẫn được giữ nguyên cho tới khi bạn bấm Lưu cấu hình.');
    } finally {
      setBusy('restore-runtime-config', false);
    }
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUser, password: loginPass }),
      });
      const payload = await response.json();
      if (response.ok) {
        const expiresAt = payload.expires_in ? new Date(Date.now() + payload.expires_in * 1000).toISOString() : null;
        setToken(payload.access_token);
        setSessionExpiresAt(expiresAt);
        setCurrentUser(payload.user || null);
        localStorage.setItem('token', payload.access_token);
        if (expiresAt) localStorage.setItem('token_expires_at', expiresAt);
        else localStorage.removeItem('token_expires_at');
        setLoginError('');
      } else {
        setLoginError(parseMessage(payload, 'Mật khẩu không chính xác!'));
      }
    } catch {
      setLoginError('Lỗi kết nối server.');
    }
  };

  const handleLogout = () => {
    setToken(null);
    setSessionExpiresAt(null);
    setLoginPass('');
    setCurrentUser(null);
    setUsers([]);
    localStorage.removeItem('token');
    localStorage.removeItem('token_expires_at');
  };

  const handleChangePassword = async (event) => {
    event.preventDefault();
    const payload = await runAction('change-password', () => requestJson(`${API_URL}/auth/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(passwordForm),
    }));
    if (payload) {
      setPasswordForm({ current_password: '', new_password: '' });
      setCurrentUser((current) => (current ? { ...current, must_change_password: false } : current));
    }
  };

  const handleCreateUser = async (event) => {
    event.preventDefault();
    const payload = await runAction('create-user', () => requestJson(`${API_URL}/users/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userForm),
    }));
    if (payload) setUserForm({ username: '', display_name: '', password: '', role: 'operator' });
  };

  const handleUserUpdate = async (userId, changes) => {
    await runAction(`user-update-${userId}`, () => requestJson(`${API_URL}/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(changes),
    }));
  };

  const handleResetUserPassword = async (userId) => {
    const payload = await runAction(`user-reset-${userId}`, () => requestJson(`${API_URL}/users/${userId}/reset-password`, { method: 'POST' }));
    if (payload?.temporary_password) showNotice('success', `${payload.message} Mật khẩu tạm: ${payload.temporary_password}`);
  };

  const handleDeleteUser = async (userId, username) => {
    const confirmed = await confirmAction({
      title: 'Xóa tài khoản',
      description: `Tài khoản @${username} sẽ bị xóa vĩnh viễn. Thao tác này không thể hoàn tác.`,
      confirmLabel: 'Xóa tài khoản',
      tone: 'rose',
    });
    if (!confirmed) return;
    await runAction(`user-delete-${userId}`, () => requestJson(`${API_URL}/users/${userId}`, { method: 'DELETE' }));
  };

  const handleCleanupWorkers = async () => {
    if (staleWorkers.length === 0) {
      showNotice('success', 'Không có worker mất kết nối nào để dọn.');
      return;
    }
    const confirmed = await confirmAction({
      title: 'Dọn worker mất kết nối',
      description: `${staleWorkers.length} worker stale sẽ bị xóa khỏi danh sách theo dõi.`,
      confirmLabel: 'Dọn worker',
      tone: 'amber',
    });
    if (!confirmed) return;
    await runAction('cleanup-workers', () => requestJson(`${API_URL}/system/workers/cleanup`, { method: 'POST' }));
  };

  const renderOverviewSection = () => (
    <OverviewSection
      state={{
        systemInfo,
        healthInfo,
        isRefreshing,
        overviewSourceFilter,
        visibleOverviewSources,
        overviewSourceMax,
        stats,
        overviewFocusCampaigns,
        lastUpdatedAt,
        fbPages,
        connectedMessagePages,
        pagesNeedingAttention,
        runtimeOverrideCount,
        isAdmin,
      }}
      actions={{
        fetchDashboard,
        handleCopy,
        setOverviewSourceFilter,
        handleSectionChange,
      }}
      helpers={{
        formatDateTime,
        formatRelTime,
        getSourcePlatformMeta,
        getSyncStateMeta,
      }}
      constants={{
        SOURCE_PLATFORM_FILTERS,
      }}
      classes={{
        FIELD_CLASS,
        BUTTON_PRIMARY,
        BUTTON_SECONDARY,
        BUTTON_GHOST,
      }}
    />
  );

  const renderCampaignSection = () => (
    <CampaignSection
      state={{
        formData,
        fbPages,
        campaignScheduleDrafts,
        actionState,
        campaignSourceFilter,
        campaigns,
        campaignSourceSummary,
        filteredCampaigns,
        expandedItems,
      }}
      actions={{
        setFormData,
        handleCampaignSubmit,
        handleSectionChange,
        setCampaignSourceFilter,
        toggleExpandedItem,
        handleCampaignAction,
        handleCampaignScheduleDraftChange,
        handleCampaignScheduleReset,
        handleCampaignScheduleSave,
      }}
      helpers={{
        detectSourcePreview,
        getSyncStateMeta,
        getSourcePlatformMeta,
        getStatusClasses,
        getStatusLabel,
        getSourceKindLabel,
        formatDateTime,
        formatUtcIsoForDateTimeLocal,
      }}
      constants={{
        SOURCE_PLATFORM_FILTERS,
      }}
      classes={{
        FIELD_CLASS,
        BUTTON_PRIMARY,
        BUTTON_SECONDARY,
        BUTTON_GHOST,
      }}
    />
  );
  const renderQueueSection = () => (
    <QueueSection
      state={{
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
      }}
      actions={{
        setPage,
        setFilters,
        toggleExpandedItem,
        handleCaptionChange,
        handlePrioritize,
        handleRetryVideo,
        handleRegenerateCaption,
        handleSaveCaption,
      }}
      helpers={{
        formatRelTime,
        formatDateTime,
        summarizeText,
        getSourcePlatformMeta,
        getStatusClasses,
        getStatusLabel,
        getSourceKindLabel,
      }}
      constants={{
        STATUS_FILTERS,
        SOURCE_PLATFORM_FILTERS,
      }}
      classes={{
        FIELD_CLASS,
        BUTTON_PRIMARY,
        BUTTON_SECONDARY,
        BUTTON_GHOST,
      }}
    />
  );

  const renderEngagementSection = () => (
    <EngagementSection
      state={{
        systemInfo,
        interactions,
        filteredInteractions,
        engagementPage,
        engagementFilter,
        totalEngagementPages,
        pagedInteractions,
        stats,
        fbPages,
        expandedItems,
        actionState,
        commentReplyDrafts,
      }}
      actions={{
        setEngagementPage,
        setEngagementFilter,
        toggleExpandedItem,
        handleCommentReplyModeChange,
        handleGenerateCommentAiDraft,
        handleCommentReplyDraftChange,
        handleCommentManualReply,
      }}
      helpers={{
        formatDateTime,
        summarizeText,
        getStatusClasses,
        getStatusLabel,
      }}
      classes={{
        FIELD_CLASS,
        BUTTON_PRIMARY,
        BUTTON_SECONDARY,
        BUTTON_GHOST,
      }}
    />
  );
  const renderMessagesSection = () => (
    <MessagesSection
      state={{
        systemInfo,
        connectedMessagePages,
        fbPages,
        handoffConversations,
        resolvedConversations,
        conversationList,
        replyAutomationDrafts,
        pageChecks,
        expandedItems,
        actionState,
        conversationStatusFilter,
        visibleConversations,
        selectedConversationId,
        selectedConversation,
        selectedConversationStatusMeta,
        selectedConversationTimeline,
        selectedConversationLogs,
        isAdmin,
        assignableUsers,
        conversationAssigneeDraft,
        conversationNoteDraft,
        currentUser,
        manualReplyDraft,
      }}
      actions={{
        handleSectionChange,
        handleSubscribeMessages,
        handleValidatePage,
        toggleExpandedItem,
        handleReplyAutomationReset,
        handleReplyAutomationSave,
        handleReplyAutomationDraftChange,
        setConversationStatusFilter,
        setSelectedConversationId,
        handleConversationStatusChange,
        setConversationAssigneeDraft,
        setConversationNoteDraft,
        handleConversationMetaSave,
        setManualReplyDraft,
        handleManualReply,
      }}
      helpers={{
        buildReplyAutomationDraft,
        getPageTokenMeta,
        getResolvedPageTokenKind,
        getMessengerConnectionMeta,
        getConversationStatusMeta,
        formatIntentLabel,
        getConversationFactEntries,
        summarizeText,
        formatDateTime,
      }}
      classes={{
        FIELD_CLASS,
        BUTTON_PRIMARY,
        BUTTON_SECONDARY,
        BUTTON_GHOST,
      }}
      refs={{
        manualReplyPanelRef,
        manualReplyInputRef,
      }}
    />
  );

  const renderSettingsSection = () => (
    <SettingsSection
      state={{
        isAdmin,
        isRefreshing,
        pagesNeedingAttention,
        fbPages,
        connectedMessagePages,
        runtimeDerived,
        runtimeOverrideCount,
        runtimeForm,
        runtimeSettings,
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
      }}
      actions={{
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
        handleRestoreRuntimeConfig,
        handleRuntimeFieldChange,
        handleVerifyTunnelToken,
      }}
      helpers={{
        getPageTokenMeta,
        getResolvedPageTokenKind,
        getMessengerConnectionMeta,
        formatDateTime,
      }}
      classes={{
        FIELD_CLASS,
        BUTTON_PRIMARY,
        BUTTON_SECONDARY,
        BUTTON_GHOST,
      }}
    />
  );

  const renderOperationsSection = () => (
    <OperationsSection
      state={{
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
      }}
      actions={{
        handleCleanupWorkers,
        setWorkerPage,
        setTaskPage,
        setEventPage,
      }}
      helpers={{
        getStatusClasses,
        getStatusLabel,
        formatDateTime,
      }}
      classes={{
        BUTTON_GHOST,
      }}
    />
  );

  const renderSecuritySection = () => (
    <SecuritySection
      state={{
        currentUser,
        sessionExpiresAt,
        passwordForm,
        actionState,
        isAdmin,
        userForm,
        users,
      }}
      actions={{
        handleLogout,
        handleChangePassword,
        setPasswordForm,
        handleCreateUser,
        setUserForm,
        handleUserUpdate,
        handleResetUserPassword,
        handleDeleteUser,
      }}
      helpers={{
        formatDateTime,
      }}
      classes={{
        FIELD_CLASS,
        BUTTON_PRIMARY,
        BUTTON_SECONDARY,
        BUTTON_GHOST,
      }}
    />
  );

  const renderActiveSection = () => {
    switch (activeSection) {
      case 'campaigns': return renderCampaignSection();
      case 'queue': return renderQueueSection();
      case 'engagement': return renderEngagementSection();
      case 'messages': return renderMessagesSection();
      case 'settings': return renderSettingsSection();
      case 'operations': return renderOperationsSection();
      case 'security': return renderSecuritySection();
      case 'overview':
      default: return renderOverviewSection();
    }
  };

  const renderMobileQuickPanel = () => (
    <MobileQuickPanel
      state={{
        stats,
        onlineWorkers,
        focusCampaigns,
        pagesNeedingAttention,
        connectedMessagePages,
        fbPages,
        staleWorkers,
      }}
      actions={{
        handleSectionChange,
      }}
      helpers={{
        formatRelTime,
        formatDateTime,
      }}
    />
  );

  const metricCards = [
    { label: 'Chiến dịch đang chạy', value: stats.active_campaigns ?? 0, detail: `${stats.paused_campaigns ?? 0} chiến dịch đang tạm dừng`, icon: Share2, tone: 'emerald' },
    { label: 'Video sẵn sàng', value: stats.ready ?? 0, detail: stats.next_publish ? `Lượt gần nhất sẽ tới ${formatRelTime(stats.next_publish)}` : 'Chưa có video sẵn sàng đăng', icon: Clock, tone: 'amber' },
    { label: 'Fanpage kết nối', value: stats.connected_pages ?? 0, detail: invalidPages.length ? `${invalidPages.length} trang cần xem lại token` : 'Mọi fanpage đang ở trạng thái tốt', icon: Globe2, tone: invalidPages.length ? 'rose' : 'sky' },
    {
      label: 'Phản hồi chờ AI',
      value: systemInfo?.pending_replies ?? 0,
      detail: `${systemInfo?.pending_comment_replies ?? 0} comment • ${systemInfo?.pending_message_replies ?? 0} inbox`,
      icon: Bot,
      tone: 'sky',
    },
    {
      label: 'Nguồn TikTok',
      value: stats.by_source?.tiktok?.campaigns ?? 0,
      detail: `${stats.by_source?.tiktok?.ready ?? 0} video sẵn sàng`,
      icon: Share2,
      tone: 'sky',
    },
    {
      label: 'Nguồn Shorts',
      value: stats.by_source?.youtube?.campaigns ?? 0,
      detail: `${stats.by_source?.youtube?.ready ?? 0} video sẵn sàng`,
      icon: Play,
      tone: 'rose',
    },
    { label: 'Worker trực tuyến', value: onlineWorkers, detail: staleWorkers.length ? `${staleWorkers.length} worker stale cần dọn` : 'Không có worker mất kết nối', icon: Radio, tone: staleWorkers.length ? 'amber' : 'emerald' },
  ];
  const visibleMetricCards = showAllMetrics ? metricCards : metricCards.slice(0, 4);

  if (!token) {
    return (
      <LoginScreen
        loginUser={loginUser}
        setLoginUser={setLoginUser}
        loginPass={loginPass}
        setLoginPass={setLoginPass}
        loginError={loginError}
        handleLogin={handleLogin}
        classes={{
          FIELD_CLASS,
          BUTTON_PRIMARY,
        }}
      />
    );
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[var(--shell-bg)] text-slate-900">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.72),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.24)_0%,rgba(245,245,247,0.18)_100%)]" />
      </div>
      {isMobileNavOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="Đóng menu" className="absolute inset-0 bg-[#0f172a]/40" onClick={() => setIsMobileNavOpen(false)} />
          <div className="mobile-sheet absolute inset-x-3 bottom-3 top-3 rounded-[32px] border border-slate-200 bg-white p-4 shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-4">
              <div>
                <div className="text-[12px] uppercase tracking-[0.16em] text-[var(--text-muted)]">Điều hướng</div>
                <div className="mt-1 font-display text-xl font-semibold text-slate-900">Các khu vực làm việc</div>
              </div>
              <button type="button" className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-900" onClick={() => setIsMobileNavOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 space-y-2 overflow-y-auto">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const count = navCounts[item.id] || 0;
                return (
                  <button key={item.id} type="button" onClick={() => handleSectionChange(item.id)} className={cx('sidebar-link w-full rounded-[22px] px-4 py-3.5 text-left transition-all', activeSection === item.id && 'sidebar-link-active')}>
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 rounded-[16px] border border-slate-200 bg-white p-2.5"><Icon className="h-4 w-4" /></div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-medium text-slate-900">{item.label}</span>
                          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[12px] text-[var(--text-muted)]">{count}</span>
                        </div>
                        <div className="mt-1 text-sm text-[var(--text-soft)]">{item.description}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="mt-4 rounded-[24px] border border-slate-200 bg-white p-4">
              <div className="text-[12px] uppercase tracking-[0.16em] text-[var(--text-muted)]">Phiên hiện tại</div>
              <div className="mt-2 font-medium text-slate-900">{currentUser?.display_name || currentUser?.username || 'Người dùng'}</div>
              <div className="mt-1 text-sm text-[var(--text-soft)]">{currentUser?.role === 'admin' ? 'Quản trị viên' : 'Vận hành'}</div>
              <button type="button" className={cx(BUTTON_GHOST, 'mt-4 w-full')} onClick={handleLogout}><LogOut className="h-4 w-4" />Đăng xuất</button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="relative flex min-h-screen flex-col">
        <aside className="hidden border-r border-slate-200 bg-white px-4 py-4 lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:h-screen lg:w-[16rem] lg:flex-col lg:overflow-y-auto">
          <div className="panel-strong rounded-[30px] p-5">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-[20px] border border-slate-200 bg-white text-[#0071e3]"><Zap className="h-6 w-6" /></div>
              <div>
                <div className="text-[12px] uppercase tracking-[0.16em] text-[var(--text-muted)]">Social Workbench</div>
                <div className="mt-1 font-display text-xl font-semibold text-slate-900">Trạm điều phối</div>
              </div>
            </div>
          </div>
          <nav className="mt-6 space-y-2">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const count = navCounts[item.id] || 0;
              return (
                <button key={item.id} type="button" onClick={() => handleSectionChange(item.id)} className={cx('sidebar-link w-full rounded-[22px] px-4 py-3.5 text-left transition-all', activeSection === item.id && 'sidebar-link-active')}>
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-[16px] border border-slate-200 bg-white p-2.5"><Icon className="h-4 w-4" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium text-slate-900">{item.label}</span>
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[12px] text-[var(--text-muted)]">{count}</span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </nav>
          <div className="mt-auto rounded-[26px] border border-slate-200 bg-white p-4">
            <div className="text-[12px] uppercase tracking-[0.16em] text-[var(--text-muted)]">Phiên hiện tại</div>
            <div className="mt-3 font-medium text-slate-900">{currentUser?.display_name || currentUser?.username || 'Người dùng'}</div>
            <div className="mt-1 text-sm text-[var(--text-soft)]">{currentUser?.role === 'admin' ? 'Quản trị viên' : 'Vận hành'}</div>
            <button type="button" className={cx(BUTTON_GHOST, 'mt-4 w-full')} onClick={handleLogout}><LogOut className="h-4 w-4" />Đăng xuất</button>
          </div>
        </aside>
        <div className="min-w-0 flex-1 lg:pl-[16rem]">
          <div className="mx-auto flex min-h-screen w-full max-w-[1460px] flex-col px-3 py-3 sm:px-4 sm:py-4 lg:px-5 xl:px-5 min-[1800px]:max-w-[1660px]">
            <Panel className="sticky top-0 z-20 overflow-hidden border-slate-200 bg-white">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="flex items-start gap-3">
                  <button type="button" className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-900 lg:hidden" onClick={() => setIsMobileNavOpen(true)}>
                    <Menu className="h-5 w-5" />
                  </button>
                  <div className="min-w-0">
                    <StatusPill tone="sky" icon={Activity}>Dashboard vận hành</StatusPill>
                    <div className="mt-3 text-[12px] uppercase tracking-[0.14em] text-[var(--text-muted)]">{systemInfo?.project_name || 'Hệ thống tự động mạng xã hội'}</div>
                    <h1 className="mt-2 font-display text-[1.55rem] font-semibold text-slate-900 sm:text-[1.8rem] md:text-[2.15rem]">{currentSection.label}</h1>
                    <p className="mt-2 max-w-2xl text-[13px] leading-6 text-[var(--text-soft)] lg:hidden">{currentSection.description}</p>
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button type="button" className={cx(BUTTON_GHOST, 'lg:hidden')} onClick={() => handleSectionChange('overview')}>
                    <Globe2 className="h-4 w-4" />
                    Tổng quan
                  </button>
                  <button type="button" className={BUTTON_SECONDARY} onClick={() => fetchDashboard()}><RefreshCw className={cx('h-4 w-4', isRefreshing ? 'animate-spin' : '')} />Làm mới</button>
                </div>
              </div>
              {notice ? <div className={cx('mt-5 rounded-[20px] border px-4 py-4 text-[13px] leading-6', notice.type === 'success' ? 'border-emerald-200/80 bg-emerald-50/80 text-emerald-700' : 'border-rose-200/80 bg-rose-50/80 text-rose-700')}>{notice.message}</div> : null}
            </Panel>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {visibleMetricCards.map((metric) => <MetricCard key={metric.label} {...metric} />)}
            </div>
            {metricCards.length > 4 ? (
              <div className="mt-3 flex justify-start">
                <DetailToggle expanded={showAllMetrics} onClick={() => setShowAllMetrics((current) => !current)} />
              </div>
            ) : null}
            <div className="mt-5">{renderMobileQuickPanel()}</div>
            <div className="mt-5 grid gap-4 2xl:grid-cols-[minmax(0,1fr)_16.75rem] min-[1800px]:grid-cols-[minmax(0,1fr)_17.75rem]">
              <div className="min-w-0 space-y-6">{renderActiveSection()}</div>
              <aside className="hidden space-y-5 2xl:sticky 2xl:top-5 2xl:block 2xl:h-fit">
                <Panel eyebrow="Nhịp nhanh" title="Bảng điều phối">
                  <div className="space-y-3">
                    <InfoRow label="Server time" value={formatDateTime(systemInfo?.server_time)} />
                    <InfoRow label="Lần làm mới cuối" value={formatDateTime(lastUpdatedAt)} />
                    <InfoRow label="Đến lượt kế tiếp" value={formatRelTime(stats.next_publish)} />
                    <InfoRow label="Cuối hàng chờ" value={formatDateTime(stats.queue_end)} />
                    <InfoRow label="Bài đăng gần nhất" value={formatDateTime(stats.last_posted)} />
                  </div>
                </Panel>
                <Panel eyebrow="Nhịp vận hành" title="Mốc thời gian quan trọng">
                  <div className="space-y-3">
                    <InfoRow label="Lượt đăng kế tiếp" value={formatRelTime(stats.next_publish)} emphasis />
                    <InfoRow label="Mốc cuối hàng chờ" value={formatDateTime(stats.queue_end)} />
                    <InfoRow label="Bài đăng gần nhất" value={formatDateTime(stats.last_posted)} />
                    <InfoRow label="Tác vụ nền" value={systemInfo?.background_jobs_mode || 'Chưa có'} />
                    <InfoRow label="Bộ lập lịch" value={healthInfo?.config?.scheduler_enabled ? `Bật, quét ${systemInfo?.scheduler_interval_minutes || 0} phút/lần` : 'Đang tắt'} />
                  </div>
                </Panel>
                <Panel
                  eyebrow="Cài đặt"
                  title="Tình trạng cấu hình"
                  action={(
                    <button type="button" className={BUTTON_GHOST} onClick={() => handleSectionChange('settings')}>
                      <Terminal className="h-4 w-4" />
                      Mở
                    </button>
                  )}
                >
                  <div className="space-y-3">
                    <InfoRow label="Fanpage đã cấu hình" value={fbPages.length} emphasis />
                    <InfoRow label="Webhook đã nối" value={`${connectedMessagePages}/${fbPages.length || 0}`} />
                    <InfoRow label="Trang cần xử lý" value={pagesNeedingAttention} emphasis={pagesNeedingAttention > 0} />
                    <InfoRow label="Runtime ghi đè" value={runtimeOverrideCount} />
                    <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-4 text-[13px] leading-6 text-[var(--text-soft)]">
                      {pagesNeedingAttention > 0
                        ? 'Nên vào mục Cài đặt để kiểm tra lại token hoặc webhook của các fanpage đang cần xử lý.'
                        : 'Khu Cài đặt hiện đang là nơi tập trung toàn bộ phần fanpage, Meta app và runtime.'}
                    </div>
                  </div>
                </Panel>
              </aside>
            </div>
          </div>
        </div>
        <ConfirmDialog
          open={Boolean(confirmDialog)}
          title={confirmDialog?.title}
          description={confirmDialog?.description}
          confirmLabel={confirmDialog?.confirmLabel}
          cancelLabel={confirmDialog?.cancelLabel}
          tone={confirmDialog?.tone}
          onConfirm={() => closeConfirmDialog(true)}
          onCancel={() => closeConfirmDialog(false)}
        />
      </div>
    </div>
  );
}

export default App;



