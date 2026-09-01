import React, { memo, useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Image,
  StyleSheet,
  Dimensions,
  Modal,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../ui/Icon';
import {
  fetchAssistantMedia,
  type AssistantMediaItem,
  type ConversationEntry,
} from '../../hooks/useAIConversation';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.7;
const MEDIA_COLUMNS = 3;
const MEDIA_TILE = (SCREEN_WIDTH - 32 - (MEDIA_COLUMNS - 1) * 6) / MEDIA_COLUMNS;

interface ChatHistorySheetProps {
  visible: boolean;
  onClose: () => void;
  conversations: ConversationEntry[];
  onSelect: (entry: ConversationEntry) => void;
  onDelete: (entry: ConversationEntry) => void;
  onClearAll: () => void;
  activeConversationId?: string | null;
  /** Wallet whose generated media the Media tab lists. */
  walletAddress?: string | null;
  /** Opens a generated image full-screen, same as tapping one in a thread. */
  onMediaPress?: (url: string, allUrls: string[]) => void;
}

const HistoryItem = memo<{
  item: ConversationEntry;
  isActive: boolean;
  onPress: () => void;
  onDelete: () => void;
}>(({ item, isActive, onPress, onDelete }) => {
  const isPostChat = !!item.postId;
  return (
    <TouchableOpacity
      style={[s.item, isActive && s.itemActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={s.itemLeft}>
        <Icon
          name={isPostChat ? 'FileText' : 'MessageCircle'}
          size={16}
          color={isActive ? '#F9FBFF' : '#6F7174'}
        />
        <View style={s.itemTextWrap}>
          <Text
            numberOfLines={1}
            style={[s.itemTitle, isActive && s.itemTitleActive]}
          >
            {item.title}
          </Text>
          {isPostChat && (
            <Text style={s.itemBadge}>Post Chat</Text>
          )}
        </View>
      </View>
      <TouchableOpacity
        onPress={onDelete}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={s.deleteBtn}
      >
        <Icon name="Trash2" size={14} color="#6F7174" />
      </TouchableOpacity>
    </TouchableOpacity>
  );
});

const ChatHistorySheetComponent: React.FC<ChatHistorySheetProps> = ({
  visible,
  onClose,
  conversations,
  onSelect,
  onDelete,
  onClearAll,
  activeConversationId,
  walletAddress,
  onMediaPress,
}) => {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<'chats' | 'media'>('chats');
  const [media, setMedia] = useState<AssistantMediaItem[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);

  // Fetched on open, as web does — the list is small and this keeps a media
  // item generated seconds ago from being missing.
  useEffect(() => {
    if (!visible || !walletAddress) return;
    let cancelled = false;
    setMediaLoading(true);
    fetchAssistantMedia(walletAddress)
      .then((items) => {
        if (!cancelled) setMedia(items);
      })
      .finally(() => {
        if (!cancelled) setMediaLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, walletAddress]);

  useEffect(() => {
    if (!visible) setActiveTab('chats');
  }, [visible]);
  const translateY = useSharedValue(SHEET_HEIGHT);
  const backdropOpacity = useSharedValue(0);
  const [isFullyClosed, setIsFullyClosed] = React.useState(!visible);

  React.useEffect(() => {
    if (visible) {
      setIsFullyClosed(false);
      translateY.value = withTiming(0, {
        duration: 250,
        easing: Easing.out(Easing.cubic),
      });
      backdropOpacity.value = withTiming(1, { duration: 200 });
    } else {
      translateY.value = withTiming(
        SHEET_HEIGHT,
        { duration: 220, easing: Easing.in(Easing.cubic) },
        () => runOnJS(setIsFullyClosed)(true),
      );
      backdropOpacity.value = withTiming(0, { duration: 180 });
    }
  }, [visible]);

  const closeSheet = useCallback(() => {
    translateY.value = withTiming(
      SHEET_HEIGHT,
      { duration: 220, easing: Easing.in(Easing.cubic) },
      () => runOnJS(onClose)(),
    );
    backdropOpacity.value = withTiming(0, { duration: 180 });
  }, [onClose]);

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY > 0) translateY.value = e.translationY;
    })
    .onEnd((e) => {
      if (e.translationY > 60 || e.velocityY > 500) {
        runOnJS(closeSheet)();
      } else {
        translateY.value = withTiming(0, {
          duration: 200,
          easing: Easing.out(Easing.cubic),
        });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const handleSelect = useCallback(
    (entry: ConversationEntry) => {
      closeSheet();
      setTimeout(() => onSelect(entry), 250);
    },
    [onSelect, closeSheet],
  );

  const renderItem = useCallback(
    ({ item }: { item: ConversationEntry }) => (
      <HistoryItem
        item={item}
        isActive={activeConversationId === item.id}
        onPress={() => handleSelect(item)}
        onDelete={() => onDelete(item)}
      />
    ),
    [handleSelect, onDelete, activeConversationId],
  );

  const keyExtractor = useCallback((item: ConversationEntry) => item.id, []);

  if (isFullyClosed && !visible) return null;

  return (
    <Modal
      visible={!isFullyClosed}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={closeSheet}
    >
      <GestureHandlerRootView style={StyleSheet.absoluteFill}>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: 'rgba(0,0,0,0.5)' },
            backdropStyle,
          ]}
        >
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={closeSheet}
          />
        </Animated.View>

        <Animated.View
          style={[s.sheet, { paddingBottom: insets.bottom }, sheetStyle]}
        >
          <View style={[StyleSheet.absoluteFill, s.overlay]} />

          <GestureDetector gesture={panGesture}>
            <Animated.View>
              <View style={s.handleWrap}>
                <View style={s.handle} />
              </View>
              <View style={s.header}>
                <Text style={s.headerTitle}>Chat History</Text>
                {conversations.length > 0 && (
                  <TouchableOpacity onPress={onClearAll} activeOpacity={0.7}>
                    <Text style={s.clearText}>Clear All</Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={s.tabs}>
                <TouchableOpacity
                  style={[s.tab, activeTab === 'chats' && s.tabActive]}
                  onPress={() => setActiveTab('chats')}
                  activeOpacity={0.7}
                >
                  <Text style={[s.tabText, activeTab === 'chats' && s.tabTextActive]}>Chats</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.tab, activeTab === 'media' && s.tabActive]}
                  onPress={() => setActiveTab('media')}
                  activeOpacity={0.7}
                >
                  <Text style={[s.tabText, activeTab === 'media' && s.tabTextActive]}>
                    Media{media.length > 0 ? ` (${media.length})` : ''}
                  </Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </GestureDetector>

          {activeTab === 'media' ? (
            media.length === 0 ? (
              <View style={s.empty}>
                <Icon name="Image" size={36} color="#3A3C3F" />
                <Text style={s.emptyText}>
                  {mediaLoading ? 'Loading media…' : 'Nothing generated yet'}
                </Text>
              </View>
            ) : (
              <FlatList
                data={media}
                numColumns={MEDIA_COLUMNS}
                keyExtractor={(item) => item.id}
                contentContainerStyle={s.mediaList}
                columnWrapperStyle={s.mediaRow}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={s.mediaTile}
                    activeOpacity={0.8}
                    disabled={item.type !== 'image'}
                    onPress={() => {
                      const images = media.filter((m) => m.type === 'image').map((m) => m.url);
                      onMediaPress?.(item.url, images);
                    }}
                  >
                    {item.type === 'image' ? (
                      <Image source={{ uri: item.url }} style={s.mediaImage} />
                    ) : (
                      <View style={[s.mediaImage, s.mediaPlaceholder]}>
                        <Icon
                          name={item.type === 'video' ? 'Video' : 'Music'}
                          size={20}
                          color="#6F7174"
                        />
                      </View>
                    )}
                  </TouchableOpacity>
                )}
              />
            )
          ) : conversations.length === 0 ? (
            <View style={s.empty}>
              <Icon name="MessageCircle" size={36} color="#3A3C3F" />
              <Text style={s.emptyText}>No conversations yet</Text>
            </View>
          ) : (
            <FlatList
              data={conversations}
              renderItem={renderItem}
              keyExtractor={keyExtractor}
              contentContainerStyle={s.list}
              showsVerticalScrollIndicator={false}
            />
          )}
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
};

const s = StyleSheet.create({
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: SHEET_HEIGHT,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  overlay: {
    backgroundColor: '#0C0C0E',
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  handleWrap: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerTitle: {
    color: '#F9FBFF',
    fontSize: 16,
    fontWeight: '700',
  },
  clearText: {
    color: '#F4F4F5',
    fontSize: 13,
    fontWeight: '500',
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  tabActive: { backgroundColor: 'rgba(255,255,255,0.14)' },
  tabText: { color: '#6F7174', fontSize: 13, fontWeight: '500' },
  tabTextActive: { color: '#F9FBFF' },
  mediaList: { paddingHorizontal: 16, paddingBottom: 16 },
  mediaRow: { gap: 6, marginBottom: 6 },
  mediaTile: { width: MEDIA_TILE, height: MEDIA_TILE, borderRadius: 10, overflow: 'hidden' },
  mediaImage: {
    width: '100%',
    height: '100%',
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  mediaPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 4,
  },
  itemActive: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  itemTextWrap: {
    flex: 1,
  },
  itemTitle: {
    color: '#A6A9AC',
    fontSize: 14,
  },
  itemTitleActive: {
    color: '#F9FBFF',
  },
  itemBadge: {
    color: '#A6A9AC',
    fontSize: 11,
    marginTop: 2,
  },
  deleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  emptyText: {
    color: '#A6A9AC',
    fontSize: 14,
  },
});

export default memo(ChatHistorySheetComponent);
