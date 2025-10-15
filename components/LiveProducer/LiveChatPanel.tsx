import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView } from 'react-native';
import { toastError } from '../../libs/toast';
import { X, ArrowUpCircle } from 'lucide-react-native';
import { LivestreamEvents, StreamActivityType } from '../../services/enums/livestream.enum';
import { useAuth } from '../../context/AuthContext';
import { useKeyboard } from '../../hooks/useKeyboard';
import { useWebSocket } from '../../context/WebSocketContext';

// Activity shape (loosely mirrors web implementation)
export interface ChatActivity {
  status: StreamActivityType | 'SYSTEM';
  address?: string;
  createdAt?: number;
  meta?: Record<string, any> & {
    username?: string;
    content?: string;
    amount?: number;
    avatarImageUrl?: string;
    message?: string;
  };
  // mark activities created locally before server confirmation
  optimistic?: boolean;
}

interface Props {
  streamId: string;
  live: boolean; // legacy flag; indicates component used in live context
  visible: boolean;
  onClose: () => void;
  chatEnabled?: boolean; // whether the user is allowed to send (auth/gating)
  // Stream phase controls behavior: live => can send; ended => show history, input disabled; scheduled => no history, disabled
  phase?: 'live' | 'ended' | 'scheduled';
  onEphemeral?: (msg: { id: string; user: string; message: string; createdAt: number }) => void; // hook into floating ephemeral feed
  // Inherit socket emit from parent; room join and bindings live in parent
  socketEmit: (evt: LivestreamEvents, payload?: any, ack?: (resp?: any, err?: any) => void) => void;
  // Centralized activities from parent
  activities: ChatActivity[];
  addActivity?: (a: ChatActivity) => void; // for optimistic echo
  mode?: 'panel' | 'stack';
  onGiftPress?: () => void;
  // Optional insets to avoid status bar/controls when in panel mode
  topOffset?: number;
  bottomOffset?: number;
  // Control whether the panel auto-joins the room on mount/reconnect (default true)
  autoJoinRoom?: boolean;
}

const panelBg = 'bg-black/60';

const LiveChatPanel: React.FC<Props> = ({
  streamId,
  live,
  visible,
  onClose,
  chatEnabled = true,
  phase,
  onEphemeral,
  socketEmit,
  activities,
  addActivity,
  mode = 'panel',
  onGiftPress,
  topOffset,
  bottomOffset,
  autoJoinRoom = true,
}) => {
  const { user } = useAuth();
  const { connected } = useWebSocket();
  const [message, setMessage] = useState('');
  const scrollRef = useRef<ScrollView | null>(null);
  const joinedRoomRef = useRef<string | null>(null);
  const joinedStreamRef = useRef<string | null>(null);

  // Back-compat: default to 'live' when live flag is true, else 'ended'
  const effectivePhase: 'live' | 'ended' | 'scheduled' = useMemo(() => {
    if (phase) return phase;
    return live ? 'live' : 'ended';
  }, [phase, live]);

  // Permissions and visibility
  const canSend = chatEnabled && effectivePhase === 'live';
  const showMessages = effectivePhase === 'live' || effectivePhase === 'ended';

  const isLiveEffective = useMemo(() => effectivePhase === 'live', [effectivePhase]);

  // Self-contained JoinRoom when visible (can be disabled when parent handles it)
  useEffect(() => {
    if (!autoJoinRoom) return;
    if (!visible || !streamId) return;
    if (joinedRoomRef.current === streamId) return;
    try {
      socketEmit(LivestreamEvents.JoinRoom, { streamId });
      joinedRoomRef.current = streamId;
    } catch {}
  }, [autoJoinRoom, visible, streamId, isLiveEffective, socketEmit]);

  // Re-emit JoinRoom on reconnect (no JoinStream from panel) when enabled
  useEffect(() => {
    if (!autoJoinRoom) return;
    if (!connected || !visible || !streamId) return;
    try { socketEmit(LivestreamEvents.JoinRoom, { streamId }); } catch {}
  }, [autoJoinRoom, connected, visible, streamId, socketEmit]);

  // Auto scroll to bottom when new activity arrives
  useEffect(() => {
    if (!scrollRef.current) return;
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    return () => clearTimeout(t);
  }, [activities.length]);

  const sendMessage = useCallback(() => {
    const content = message.trim();
    if (!content || !canSend) return;
    // Optimistic add immediately
    const tempId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const createdAt = Date.now();
    addActivity?.({
      status: StreamActivityType.MESSAGE,
      address: user?.address,
      meta: { username: (user as any)?.username || 'You', content, tempId },
      createdAt,
      optimistic: true,
    });
    onEphemeral?.({
      id: tempId,
      user: (user as any)?.username || 'You',
      message: content,
      createdAt,
    });
    // clear input immediately for snappier UX
    setMessage('');
    // Fire the socket emit (we're not relying on ack for UI responsiveness)
    socketEmit(
      LivestreamEvents.SendMessage,
      { streamId, content },
      (resp?: any, err?: any) => {
        if (err || resp?.error) {
          toastError('Failed to send message');
        }
      }
    );
  }, [message, canSend, socketEmit, streamId, user, addActivity, onEphemeral]);

  if (!visible) return null;

  // Deterministic color per username/address for vibrant name labels
  const usernamePalette = useMemo(
    () => [
      '#f87171', // red-400
      '#f59e0b', // amber-500
      '#10b981', // emerald-500
      '#3b82f6', // blue-500
      '#8b5cf6', // violet-500
      '#ec4899', // pink-500
      '#22d3ee', // cyan-400
      '#84cc16', // lime-500
      '#f97316', // orange-500
      '#a855f7', // purple-500
      '#06b6d4', // cyan-500
      '#ef4444', // red-500
      '#14b8a6', // teal-500
      '#0ea5e9', // sky-500
    ],
    []
  );
  const colorForUser = useCallback(
    (key?: string) => {
      if (!key) return '#e5e7eb'; // gray-200 fallback
      let hash = 0;
      for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
      const idx = hash % usernamePalette.length;
      return usernamePalette[idx];
    },
    [usernamePalette]
  );

  const renderActivity = (a: ChatActivity, idx: number) => {
    switch (a.status) {
      case StreamActivityType.MESSAGE:
        return (
          <View key={idx} className="mb-2 flex-row items-start">
            <Text
              className="text-[12px] font-semibold mr-2"
              style={{ color: colorForUser(a.meta?.username || a.address) }}
              numberOfLines={1}
            >
              {(a.meta?.username || shortAddr(a.address) || 'user') + ':'}
            </Text>
            {!!a.meta?.content && (
              <View className="flex-1 flex-row items-baseline">
                <Text
                  className={`flex-shrink text-white text-[12px] leading-5 ${a.optimistic ? 'opacity-70' : ''}`}
                  selectable
                >
                  {a.meta?.content}
                </Text>
                {a.optimistic ? (
                  <Text className="ml-2 text-white/40 text-[10px]">sending…</Text>
                ) : null}
              </View>
            )}
          </View>
        );
      case StreamActivityType.JOINED:
        return (
          <SystemLine
            key={idx}
            text={`${a.meta?.username || shortAddr(a.address)} joined the stream`}
            icon="👋"
          />
        );
      case StreamActivityType.LEFT:
        return (
          <SystemLine
            key={idx}
            text={`${a.meta?.username || shortAddr(a.address)} left the stream`}
            icon="👋"
          />
        );
      case StreamActivityType.TIP:
        return (
          <SystemLine
            key={idx}
            text={`${a.meta?.username || shortAddr(a.address)} tipped ${a.meta?.amount} DHB`}
            icon="💰"
          />
        );
      case StreamActivityType.START:
        return <SystemLine key={idx} text={`Stream has started`} icon="🔴" />;
      case StreamActivityType.END:
        return <SystemLine key={idx} text={`Stream has ended`} icon="⏹️" />;
      default:
        return null;
    }
  };

  const { height: keyboardHeight, isVisible: kbVisible } = useKeyboard();
  const inputBottom = kbVisible ? keyboardHeight : 0;

  const containerClass =
    mode === 'panel'
      ? `absolute right-0 ${panelBg} border-l border-white/10`
      : `relative w-full flex-1 ${panelBg}`;

  const containerStyle =
    mode === 'panel'
      ? [{ top: topOffset ?? 0, bottom: bottomOffset ?? 0, width: '70%' }]
      : undefined;

  return (
    <View className={containerClass} style={containerStyle as any}>
      {/* Header */}
      <View
        className={`flex-row items-center justify-between px-4 py-3 ${
          mode === 'panel' ? 'border-b border-white/10 bg-black/30' : ''
        }`}
      >
        <Text className="text-white font-semibold text-[12px] tracking-wide">LIVE CHAT</Text>
        {mode === 'panel' && (
          <TouchableOpacity onPress={onClose} className="px-2 py-1 rounded-full bg-white/10" activeOpacity={0.7}>
            <X color="white" size={14} />
          </TouchableOpacity>
        )}
      </View>

      {/* Body */}
      {effectivePhase === 'scheduled' ? (
        <CenterNotice text="Chat will open when the stream goes live" />
      ) : showMessages ? (
        <ScrollView
          ref={(r) => {
            scrollRef.current = r;
          }}
          className="flex-1 px-4"
          contentContainerStyle={{ paddingBottom: 64, paddingTop: 8 }}
        >
          {activities.map(renderActivity)}
        </ScrollView>
      ) : (
        <CenterNotice text="Stream is not live" />
      )}

      {/* Input anchored to bottom (both modes), lifted above keyboard */}
      <View className={`absolute left-0 right-0 px-3 pb-3 ${mode === 'panel' ? '' : ''}`} style={{ bottom: inputBottom }}>
        <View className="flex-row items-center bg-white/8 rounded-2xl px-3 py-2 border border-white/10">
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder={
              effectivePhase === 'live'
                ? 'Send a message'
                : effectivePhase === 'ended'
                ? 'Stream ended'
                : 'Scheduled'
            }
            placeholderTextColor="#7d7d7d"
            className="flex-1 text-white text-[12px] leading-5"
            editable={canSend}
            maxLength={240}
            multiline={false}
            returnKeyType="send"
            onSubmitEditing={() => sendMessage()}
            onKeyPress={(e) => {
              if (e.nativeEvent.key === 'Enter') {
                sendMessage();
              }
            }}
          />
          {/* <TouchableOpacity
            onPress={onGiftPress || (() => {})}
            disabled={!canSend}
            className="ml-2 px-2 py-2 rounded-full bg-white/10 disabled:opacity-50"
            activeOpacity={0.8}
          >
            <Gift color="#fff" size={18} />
          </TouchableOpacity> */}
          <TouchableOpacity
            onPress={sendMessage}
            disabled={!message.trim() || !canSend}
            className="ml-2 px-2 py-2 rounded-full bg-emerald-600/90 disabled:bg-white/10"
            activeOpacity={0.9}
          >
            <ArrowUpCircle color="#fff" size={20} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const CenterNotice: React.FC<{ text: string }> = ({ text }) => (
  <View className="flex-1 items-center justify-center px-4">
    <Text className="text-white/60 text-[11px] text-center leading-5">{text}</Text>
  </View>
);

const SystemLine: React.FC<{ text: string; icon?: string }> = ({ text, icon }) => (
  <View className="mb-2 flex-row items-center">
    {!!icon && <Text className="mr-2 text-[11px] opacity-80">{icon}</Text>}
    <Text className="text-white/45 text-[11px]" numberOfLines={3}>
      {text}
    </Text>
  </View>
);

// Helpers
const shortAddr = (addr?: string) => (addr ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : '');
const timeAgo = (ts: number) => {
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 60) return s + 's';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60);
  return h + 'h';
};

export default memo(LiveChatPanel);
