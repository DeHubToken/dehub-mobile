import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ScreenHeader from '../components/ScreenHeader';
import { useNavigation } from '@react-navigation/native';
import { ScreenNames } from '../navigation/ScreenNames';

type Conversation = {
  id: string;
  name: string;
  avatar: any; // Static require for demo
  verified?: boolean;
  lastMessage: string;
  updatedAt: number; // epoch ms
  unread: boolean;
  highlighted?: boolean;
};

type MenuProps = {
  visible: boolean;
  onClose: () => void;
  onNewDM: () => void;
  dnd: boolean;
  onToggleDnd: () => void;
};

const SettingsMenu: React.FC<MenuProps> = ({ visible, onClose, onNewDM, dnd, onToggleDnd }) => {
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity
        activeOpacity={1}
        onPress={onClose}
        className="flex-1 bg-black/40"
      >
        <View className="absolute right-3 top-16 w-44 rounded-xl bg-theme-neutrals-800 shadow-lg overflow-hidden">
          <TouchableOpacity
            className="flex-row items-center px-3 py-3 active:opacity-70"
            onPress={onNewDM}
            accessibilityRole="button"
          >
            <Ionicons name="chatbox-ellipses-outline" size={18} color="#E5E7EB" />
            <Text className="ml-2 text-theme-neutrals-100 text-sm">New DM</Text>
          </TouchableOpacity>
          <View className="h-[1px] bg-theme-neutrals-700/60" />
          <TouchableOpacity
            className="flex-row items-center px-3 py-3 active:opacity-70"
            onPress={onToggleDnd}
            accessibilityRole="button"
          >
            <Ionicons
              name={dnd ? 'moon' : 'moon-outline'}
              size={18}
              color={dnd ? '#60A5FA' : '#E5E7EB'}
            />
            <Text className="ml-2 text-theme-neutrals-100 text-sm">{dnd ? 'DND: On' : 'DND'}</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

const formatRelativeTime = (ts: number): string => {
  const diff = Math.max(0, Date.now() - ts);
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
};

type ConversationItemProps = {
  item: Conversation;
  onPress: (c: Conversation) => void;
};

const ConversationItem: React.FC<ConversationItemProps> = memo(({ item, onPress }) => {
  const handlePress = useCallback(() => onPress(item), [item, onPress]);
  return (
    <TouchableOpacity
      onPress={handlePress}
      className="flex-row items-center px-4 py-3"
      accessibilityRole="button"
    >
      <Image
        source={item.avatar}
        className="w-11 h-11 rounded-full mr-3"
        resizeMode="cover"
      />

      <View className="flex-1">
        <View className="flex-row items-center">
          <Text className="text-theme-neutrals-100 font-medium text-[15px]" numberOfLines={1}>
            {item.name}
          </Text>
          {item.verified ? (
            <Ionicons name="checkmark-circle" size={14} color="#9CA3AF" style={{ marginLeft: 6 }} />
          ) : null}
          <Text className="text-theme-neutrals-500 text-xs ml-2">{formatRelativeTime(item.updatedAt)}</Text>
        </View>

        {item.highlighted ? (
          <View className="mt-2 bg-theme-neutrals-800 rounded-2xl px-3 py-2">
            <Text className="text-theme-neutrals-200 text-[13px]" numberOfLines={2}>
              {item.lastMessage}
            </Text>
          </View>
        ) : (
          <Text className="text-theme-neutrals-300 text-[13px] mt-1" numberOfLines={1}>
            {item.lastMessage}
          </Text>
        )}
      </View>

      {item.unread ? <View className="w-2.5 h-2.5 rounded-full bg-blue-500 ml-2" /> : null}
    </TouchableOpacity>
  );
});
ConversationItem.displayName = 'ConversationItem';

const DirectMessagesScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [query, setQuery] = useState<string>('');
  const [menuVisible, setMenuVisible] = useState<boolean>(false);
  const [dnd, setDnd] = useState<boolean>(false);
  const [newDmVisible, setNewDmVisible] = useState<boolean>(false);
  const [newDmUser, setNewDmUser] = useState<string>('');

  // Local demo conversations for first render; replaced by store load/fetch below
  const [conversations, setConversations] = useState<Conversation[]>([
    {
      id: '1',
      name: 'Username',
  avatar: require('../assets/avatar.png'),
      verified: true,
      lastMessage: "You: Hi! I'm doing great.",
      updatedAt: Date.now() - 46 * 60000,
      unread: false,
      highlighted: true,
    },
    {
      id: '2',
      name: 'Username',
  avatar: require('../assets/default-avatar.png'),
      lastMessage: 'Sent an attachment',
      updatedAt: Date.now() - 2 * 60000,
      unread: true,
    },
    {
      id: '3',
      name: 'Username',
  avatar: require('../assets/banner.png'),
      lastMessage: 'Hey buddy! how have you be...',
      updatedAt: Date.now() - 45 * 60000,
      unread: false,
    },
    {
      id: '4',
      name: 'Username',
  avatar: require('../assets/bike.jpg'),
      lastMessage: 'Rae: Hey guys, just posted a...',
      updatedAt: Date.now() - 60 * 60000,
      unread: true,
    },
  ]);

  const searchRef = useRef<TextInput | null>(null);

  // Using only local demo conversations for now (disconnected from services/store)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? conversations.filter(
          c => c.name.toLowerCase().includes(q) || c.lastMessage.toLowerCase().includes(q)
        )
      : conversations;
    return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [conversations, query]);

  const openMenu = useCallback(() => setMenuVisible(true), []);
  const closeMenu = useCallback(() => setMenuVisible(false), []);
  const toggleDnd = useCallback(() => setDnd(prev => !prev), []);
  const openNewDM = useCallback(() => {
    closeMenu();
    setNewDmUser('');
    setNewDmVisible(true);
  }, [closeMenu]);
  const closeNewDM = useCallback(() => setNewDmVisible(false), []);

  const handleOpenConversation = useCallback(
    (c: Conversation) => {
      setConversations(prev => prev.map(p => (p.id === c.id ? { ...p, unread: false } : p)));
      navigation.navigate(ScreenNames.Chat as any, { conversationId: c.id, title: c.name });
    },
    [navigation]
  );

  const handleChangeQuery = useCallback((text: string) => setQuery(text), []);
  const clearQuery = useCallback(() => setQuery(''), []);

  const keyExtractor = useCallback((item: Conversation) => item.id, []);
  const renderItem = useCallback(
    ({ item }: { item: Conversation }) => (
      <ConversationItem item={item} onPress={handleOpenConversation} />
    ),
    [handleOpenConversation]
  );

  const handleCreateNewDM = useCallback(() => {
    const name = newDmUser.trim();
    if (!name) return;
    const newItem: Conversation = {
      id: `${Date.now()}`,
      name,
  avatar: require('../assets/default-avatar.png'),
      lastMessage: 'Say hi!',
      updatedAt: Date.now(),
      unread: false,
    };
    setConversations(prev => [newItem, ...prev]);
    setNewDmVisible(false);
    Alert.alert('New DM', `Started a new DM with ${name}`);
  }, [newDmUser]);

  const RightHeader = useMemo(
    () => (
      <TouchableOpacity
        className="w-10 h-10 items-center justify-center active:opacity-70"
        onPress={openMenu}
        accessibilityRole="button"
        accessibilityLabel="Open settings menu"
      >
        <Ionicons name="settings-outline" size={22} color="#E5E7EB" />
      </TouchableOpacity>
    ),
    [openMenu]
  );

  return (
    <View className="flex-1 bg-theme-neutrals-900">
      <ScreenHeader title="Messages" subtitle={dnd ? 'Do Not Disturb is ON' : undefined} rightContent={RightHeader} />

      {/* Search */}
      <View className="px-4 mt-2">
        <View className="flex-row items-center bg-theme-neutrals-800 rounded-full px-3 py-2">
          <Ionicons name="search" size={18} color="#9CA3AF" />
          <TextInput
            ref={searchRef}
            value={query}
            onChangeText={handleChangeQuery}
            placeholder="Search"
            placeholderTextColor="#9CA3AF"
            className="flex-1 text-theme-neutrals-100 px-2 text-[15px]"
            returnKeyType="search"
          />
          {query ? (
            <TouchableOpacity onPress={clearQuery} className="w-7 h-7 items-center justify-center">
              <Ionicons name="close-circle" size={18} color="#9CA3AF" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: 24 }}
        className="flex-1"
        ListEmptyComponent={
          <View className="items-center mt-10">
            <Text className="text-theme-neutrals-400">No conversations found</Text>
          </View>
        }
        ItemSeparatorComponent={() => <View className="h-[1px] bg-theme-neutrals-800/70 mx-4" />}
      />

      {/* Settings Menu */}
      <SettingsMenu
        visible={menuVisible}
        onClose={closeMenu}
        onNewDM={openNewDM}
        dnd={dnd}
        onToggleDnd={toggleDnd}
      />

      {/* New DM Modal */}
      <Modal visible={newDmVisible} transparent animationType="slide" onRequestClose={closeNewDM}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          className="flex-1 justify-end"
        >
          <TouchableOpacity className="flex-1 bg-black/40" activeOpacity={1} onPress={closeNewDM} />
          <View className="bg-theme-neutrals-800 rounded-t-2xl p-4">
            <Text className="text-theme-neutrals-100 text-lg font-medium mb-3">Start a new DM</Text>
            <View className="flex-row items-center bg-theme-neutrals-700 rounded-xl px-3 py-2">
              <Ionicons name="at" size={18} color="#D1D5DB" />
              <TextInput
                value={newDmUser}
                onChangeText={setNewDmUser}
                placeholder="Enter username"
                placeholderTextColor="#9CA3AF"
                className="flex-1 text-theme-neutrals-100 px-2 text-[15px]"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleCreateNewDM}
              />
            </View>
            <View className="flex-row justify-end mt-4">
              <TouchableOpacity onPress={closeNewDM} className="px-4 py-2 mr-2 rounded-xl bg-theme-neutrals-700 active:opacity-80">
                <Text className="text-theme-neutrals-100">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleCreateNewDM}
                disabled={!newDmUser.trim()}
                className="px-4 py-2 rounded-xl bg-blue-600 active:opacity-80 disabled:opacity-40"
              >
                <Text className="text-white">Start</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

export default DirectMessagesScreen;
