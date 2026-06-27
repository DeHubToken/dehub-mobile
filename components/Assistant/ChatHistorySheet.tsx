import React, { memo, useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Dimensions,
  Platform,
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
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../ui/Icon';
import type { ConversationEntry } from '../../hooks/useAIConversation';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.6;

interface ChatHistorySheetProps {
  visible: boolean;
  onClose: () => void;
  conversations: ConversationEntry[];
  onSelect: (entry: ConversationEntry) => void;
  onDelete: (entry: ConversationEntry) => void;
  onClearAll: () => void;
  activeConversationId?: string | null;
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
}) => {
  const insets = useSafeAreaInsets();
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
          <BlurView
            intensity={80}
            tint="dark"
            style={StyleSheet.absoluteFill}
            {...(Platform.OS === 'android'
              ? { experimentalBlurMethod: 'dimezisBlurView' }
              : {})}
          />
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
            </Animated.View>
          </GestureDetector>

          {conversations.length === 0 ? (
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
    backgroundColor: 'rgba(12,12,14,0.82)',
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
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '500',
  },
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
    color: '#6F7174',
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
    color: '#6F7174',
    fontSize: 14,
  },
});

export default memo(ChatHistorySheetComponent);
