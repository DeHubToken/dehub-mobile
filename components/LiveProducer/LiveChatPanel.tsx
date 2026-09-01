import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, FlatList, Animated, Platform } from 'react-native';
import { toastError } from '../../libs/toast';
import { X, ArrowUpCircle } from 'lucide-react-native';
import { LivestreamEvents, StreamActivityType } from '../../services/enums/livestream.enum';
import { useUser } from '../../context/AuthContext';
import { useKeyboard } from '../../hooks/useKeyboard';
import { useWebSocket } from '../../context/WebSocketContext';
import AccentButtonGradient from '../ui/AccentButtonGradient';

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
  const user = useUser();
  const { connected } = useWebSocket();
  const [message, setMessage] = useState('');
  const listRef = useRef<FlatList<ChatActivity> | null>(null);
  const joinedRoomRef = useRef<string | null>(null);
  const joinedStreamRef = useRef<string | null>(null);
  const visibilityAnim = useRef(new Animated.Value(0)).current; // 0 hidden, 1 visible
  const [showSkeleton, setShowSkeleton] = useState(false);
  const wasVisibleRef = useRef(false);
  const shouldSnapToBottomRef = useRef(false);
  const [inputContainerHeight, setInputContainerHeight] = useState(0);

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

  // Animate visibility on toggle; show skeleton briefly to mask heavy mount work on first open
  useEffect(() => {
    if (visible) {
      if (!wasVisibleRef.current) {
        // First frame after becoming visible, ensure we snap to bottom
        shouldSnapToBottomRef.current = true;
        // Only show skeleton if we have no content to show
        setShowSkeleton(activities.length === 0);
      } else {
        setShowSkeleton(false);
      }
      Animated.timing(visibilityAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(visibilityAnim, {
        toValue: 0,
        duration: 120,
        useNativeDriver: true,
      }).start();
    }
    wasVisibleRef.current = visible;
  }, [visible, visibilityAnim, activities.length]);

  // Auto scroll to bottom when new activity arrives if visible (but skip if we're about to snap)
  useEffect(() => {
    if (!visible) return;
    if (shouldSnapToBottomRef.current) return;
    const t = setTimeout(() => listRef.current?.scrollToOffset?.({ offset: 0, animated: true }), 80);
    return () => clearTimeout(t);
  }, [activities.length, visible]);

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

  // Deterministic shade per username/address — the monochrome neutrals ramp,
  // the same one the viewer's chat uses (LiveViewerChat.USERNAME_PALETTE).
  const usernamePalette = useMemo(
    () => [
      '#F9FBFF', // neutrals-100
      '#D4D4D8', // neutrals ramp
      '#DDE0E3', // neutrals-200
      '#F4F4F5', // neutrals ramp
      '#D4D4D8', // neutrals ramp
      '#D4D4D8', // neutrals ramp
      '#D4D4D8', // neutrals ramp
      '#C2C4C7', // neutrals-300
      '#D4D4D8', // neutrals ramp
      '#D4D4D8', // neutrals ramp
      '#D4D4D8', // neutrals ramp
      '#F4F4F5', // zinc-100
      '#D4D4D8', // neutrals ramp
      '#D4D4D8', // neutrals ramp
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

  const renderItem = useCallback(
    ({ item }: { item: ChatActivity }) => <ChatRow a={item} colorForUser={colorForUser} />,
    [colorForUser]
  );
  const keyExtractor = useCallback((a: ChatActivity, idx: number) => {
    const t = a.createdAt || 0;
    const who = (a.address || a.meta?.username || '').toLowerCase();
    const contentKey = (a.meta?.content ? String(a.meta?.content).slice(0, 16) : '') || String(a.meta?.amount || '');
    return `${t}:${a.status}:${who}:${contentKey}:${idx}`;
  }, []);
  const dataReversed = useMemo(() => activities.slice().reverse(), [activities]);

  const { height: keyboardHeight, isVisible: kbVisible } = useKeyboard();
  // In 'stack' mode the parent wraps in KeyboardAvoidingView, but since our input is
  // absolutely positioned at the bottom of the chat container, we still need a small offset
  // on Android where KAV behavior="height" doesn't fully account for absolute children.
  // In 'panel' mode (absolute overlay) we offset the input by the full keyboard height.
  const inputBottom = useMemo(() => {
    if (!kbVisible) return 0;
    if (mode === 'panel') return keyboardHeight;
    // stack mode: on iOS the parent KAV handles it; on Android provide a fallback offset
    return Platform.OS === 'android' ? keyboardHeight : 0;
  }, [kbVisible, mode, keyboardHeight]);

  const containerClass =
    mode === 'panel'
      ? `absolute right-0 ${panelBg} border-l border-white/10`
      : `relative w-full flex-1 ${panelBg}`;

  const containerStyle =
    mode === 'panel'
      ? [{ top: topOffset ?? 0, bottom: bottomOffset ?? 0, width: '70%' }]
      : undefined;

  const animatedStyle = useMemo(() => {
    const translateX = visibilityAnim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] });
    const opacity = visibilityAnim;
    return { transform: [{ translateX }], opacity } as any;
  }, [visibilityAnim]);

  return (
    <Animated.View
      className={containerClass}
      style={[containerStyle as any, animatedStyle]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      {/* Header */}
      <View
        className={`flex-row items-center justify-between px-4 py-3 ${
          mode === 'panel' ? 'border-b border-white/10 bg-black/30' : ''
        }`}
      >
        <Text className="text-white font-semibold text-[12px] tracking-wide">LIVE CHAT</Text>
        {mode === 'panel' && (
          <TouchableOpacity onPress={onClose} className="px-2 py-1 rounded-lg bg-white/10" activeOpacity={0.7}>
            <X color="white" size={14} />
          </TouchableOpacity>
        )}
      </View>

      {/* Body */}
      {effectivePhase === 'scheduled' ? (
        <CenterNotice text="Chat will open when the stream goes live" />
      ) : showMessages ? (
        showSkeleton ? (
          <View className="flex-1 px-4 py-2">
            <View className="h-4 w-24 bg-white/10 rounded mb-3" />
            {Array.from({ length: 10 }).map((_, i) => (
              <View key={i} className="mb-3">
                <View className="h-3 w-16 bg-white/10 rounded mb-2" />
                <View className="h-4 w-3/4 bg-white/5 rounded" />
              </View>
            ))}
          </View>
        ) : (
          <FlatList
            ref={(r) => {
              // @ts-ignore FlatList has scrollToEnd
              listRef.current = r as any;
            }}
            data={dataReversed}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            className="flex-1 px-4"
            contentContainerStyle={{
              // Inverted list: add paddingTop to reserve space for the bottom input
              paddingTop: Math.max(64, inputContainerHeight + 12),
              paddingBottom: 8,
            }}
            initialNumToRender={16}
            maxToRenderPerBatch={24}
            windowSize={7}
            // No removeClippedSubviews here either — it detaches the very
            // children maintainVisibleContentPosition anchors against, so an
            // incoming message can shift a chat the reader is scrolled back in.
            inverted
            maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
            onContentSizeChange={() => {
              if (visible && shouldSnapToBottomRef.current) {
                listRef.current?.scrollToOffset?.({ offset: 0, animated: false });
                shouldSnapToBottomRef.current = false;
              }
            }}
            onLayout={() => {
              if (visible && shouldSnapToBottomRef.current) {
                listRef.current?.scrollToOffset?.({ offset: 0, animated: false });
                shouldSnapToBottomRef.current = false;
              }
            }}
          />
        )
      ) : (
        <CenterNotice text="Stream is not live" />
      )}

      {/* Input anchored to bottom (both modes), lifted above keyboard */}
      <View
        className={`absolute left-0 right-0 px-3 pb-3 ${mode === 'panel' ? '' : ''}`}
        style={{ bottom: inputBottom }}
        onLayout={(e) => setInputContainerHeight(e.nativeEvent.layout.height)}
      >
        <View className="flex-row items-center bg-theme-neutrals-900 rounded-xl px-3 py-2 border border-white/10">
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
          <AccentButtonGradient
            borderRadius={20}
            style={!message.trim() || !canSend ? { opacity: 0.4 } : undefined}
          >
            <TouchableOpacity
              onPress={sendMessage}
              disabled={!message.trim() || !canSend}
              className="ml-0 px-2 py-2"
              activeOpacity={0.85}
            >
              <ArrowUpCircle color="#fff" size={20} />
            </TouchableOpacity>
          </AccentButtonGradient>
        </View>
      </View>
    </Animated.View>
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

// Memoized row components
const ChatRow: React.FC<{ a: ChatActivity; colorForUser: (k?: string) => string }> = memo(({ a, colorForUser }) => {
  switch (a.status) {
    case StreamActivityType.MESSAGE:
      return (
        <View className="mb-2 flex-row items-start">
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
        <SystemLine text={`${a.meta?.username || shortAddr(a.address)} joined the stream`} icon="👋" />
      );
    case StreamActivityType.LEFT:
      return (
        <SystemLine text={`${a.meta?.username || shortAddr(a.address)} left the stream`} icon="👋" />
      );
    case StreamActivityType.TIP:
      return <SystemLine text={`${a.meta?.username || shortAddr(a.address)} tipped ${a.meta?.amount} DHB`} icon="💰" />;
    case StreamActivityType.START:
      return <SystemLine text={`Stream has started`} icon="🔴" />;
    case StreamActivityType.END:
      return <SystemLine text={`Stream has ended`} icon="⏹️" />;
    default:
      return null;
  }
});
