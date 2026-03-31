import { Terminal } from 'lucide-react';

import PageAutomationPanel from './messages/PageAutomationPanel';
import ConversationListPanel from './messages/ConversationListPanel';
import ConversationWorkspace from './messages/ConversationWorkspace';
import {
  InfoRow,
  Panel,
} from './ui';

export default function MessagesSection({
  state,
  actions,
  helpers,
  classes,
  refs,
}) {
  const {
    systemInfo,
    connectedMessagePages,
    fbPages,
    handoffConversations,
    resolvedConversations,
    conversationList,
  } = state;
  const { handleSectionChange } = actions;
  const { BUTTON_GHOST } = classes;

  return (
    <div className="space-y-6">
      <Panel
        eyebrow="Thiết lập theo fanpage"
        title="Prompt AI cho comment và inbox"
        action={(
          <button type="button" className={BUTTON_GHOST} onClick={() => handleSectionChange('settings')}>
            <Terminal className="h-4 w-4" />
            Quản lý fanpage
          </button>
        )}
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <InfoRow label="Inbox đang chờ" value={systemInfo?.pending_message_replies ?? 0} emphasis />
          <InfoRow label="Fanpage bật inbox AI" value={systemInfo?.message_auto_reply_pages ?? 0} />
          <InfoRow label="Webhook fanpage đã nối" value={`${connectedMessagePages}/${fbPages.length || 0}`} />
          <InfoRow label="Cần operator xử lý" value={handoffConversations.length} emphasis={handoffConversations.length > 0} />
          <InfoRow label="Đã xử lý" value={resolvedConversations.length} />
          <InfoRow label="Tổng conversation" value={conversationList.length} />
        </div>
      </Panel>

      <PageAutomationPanel
        state={state}
        actions={actions}
        helpers={helpers}
        classes={classes}
      />

      <Panel eyebrow="Hộp thư operator" title="Quản lý hội thoại theo conversation">
        <div className="grid gap-5 xl:grid-cols-[minmax(320px,0.92fr)_minmax(0,1.28fr)] 2xl:grid-cols-[minmax(360px,0.9fr)_minmax(0,1.3fr)]">
          <ConversationListPanel
            state={state}
            actions={actions}
            helpers={helpers}
            classes={classes}
          />
          <ConversationWorkspace
            state={state}
            actions={actions}
            helpers={helpers}
            classes={classes}
            refs={refs}
          />
        </div>
      </Panel>
    </div>
  );
}
