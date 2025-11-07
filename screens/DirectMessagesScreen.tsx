import React, { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import ScreenHeader from "../components/ScreenHeader";
import { useNavigation } from "@react-navigation/native";
import { ScreenNames } from "../navigation/ScreenNames";
import NewDMModal from "../components/DM/NewDMModal";
import DMSearchBox from "../components/DM/DMSearchBox";
import DMSettingsModal from "../components/DM/DMSettingsModal";
import DMSettingsMenu from "../components/DM/DMSettingsMenu";
import DMConversationItem from "../components/DM/DMConversationItem";
import { User, useAuth } from "../context/AuthContext";
import { truncateAddress } from "../libs/strings.util";
import { toastInfo } from "../libs/toast";
import { useDM } from "../hooks/useDM";
import { useUnreadCount } from "../store/dm.state";
import Avatar from "../components/common/Avatar";
import { getAvatarUrl } from "../libs/misc";
import { theme } from "../theme";
import { useUserProfileSheet } from "../context/UserProfileSheetContext";
import { useGateToHome } from "../hooks/useGateToHome";

type DmContact = {
  _id: string;
  conversationType: "dm" | "group";
  participants: Array<{
    participant: {
      _id: string;
      username?: string;
      address?: string;
      displayName?: string;
      avatarImageUrl?: string;
    };
  }>;
  lastMessageAt?: string;
  createdAt: string;
  updatedAt: string;
  messages?: Array<{
    _id: string;
    content?: string;
    createdAt: string;
    author?: "me" | "other";
  }>;
};

const formatRelativeTime = (ts: number): string => {
  const diff = Math.max(0, Date.now() - ts);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
    const { isSignedIn, needsUsername } = useAuth();
    const allow = isSignedIn && !needsUsername;
    useGateToHome(allow);
  const d = Math.floor(h / 24);
  return `${d}d`;
};

// Settings menu and conversation item extracted into components/DM

const DirectMessagesScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { conversations, contactsLoading, refreshContacts } = useDM();
  const [query, setQuery] = useState<string>("");
  const [menuVisible, setMenuVisible] = useState<boolean>(false);
  const [dnd, setDnd] = useState<boolean>(false);
  const [newDmVisible, setNewDmVisible] = useState<boolean>(false);
  const [dmSettingsVisible, setDmSettingsVisible] = useState<boolean>(false);

  // No input ref needed with DMSearchBox

  // Using only local demo conversations for now (disconnected from services/store)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? conversations.filter((c: DmContact) => {
          const other = c.participants?.[0]?.participant || {};
          const title = (
            other.displayName ||
            other.username ||
            other.address ||
            ""
          ).toLowerCase();
          const preview =
            c.messages && c.messages.length > 0
              ? c.messages[0].content || ""
              : "";
          return title.includes(q) || preview.toLowerCase().includes(q);
        })
      : conversations;
    return [...list].sort(
      (a: DmContact, b: DmContact) =>
        +new Date(b.updatedAt || b.lastMessageAt || 0) -
        +new Date(a.updatedAt || a.lastMessageAt || 0)
    );
  }, [conversations, query]);
  const hasConversations = useMemo(
    () => (conversations?.length || 0) > 0,
    [conversations]
  );

  const openMenu = useCallback(() => setMenuVisible(true), []);
  const closeMenu = useCallback(() => setMenuVisible(false), []);
  const toggleDnd = useCallback(() => setDnd((prev) => !prev), []);
  const openNewDM = useCallback(() => {
    closeMenu();
    setNewDmVisible(true);
  }, [closeMenu]);
  const openDmSettings = useCallback(() => {
    closeMenu();
    setDmSettingsVisible(true);
  }, [closeMenu]);
  const closeNewDM = useCallback(() => setNewDmVisible(false), []);
  const closeDmSettings = useCallback(() => setDmSettingsVisible(false), []);

  const handleOpenConversation = useCallback(
    (c: DmContact) => {
      const other = c.participants?.[0]?.participant || {};
      const title =
        other.displayName ||
        other.username ||
        truncateAddress(other.address || "");
      navigation.navigate(ScreenNames.Chat as any, {
        conversationId: c._id,
        title,
      });
    },
    [navigation]
  );

  const handleChangeQuery = useCallback((text: string) => setQuery(text), []);
  const clearQuery = useCallback(() => setQuery(""), []);

  const keyExtractor = useCallback((item: DmContact) => String(item._id), []);
  const renderItem = useCallback(
    ({ item }: { item: DmContact }) => (
      <DMConversationItem item={item as any} onPress={handleOpenConversation} />
    ),
    [handleOpenConversation]
  );

  const startDMWith = useCallback(
    (u: User) => {
      const addr = (u.walletAddress || (u as any).address || "").toLowerCase();
      const selfAddr = (
        (user as any)?.walletAddress ||
        (user as any)?.address ||
        ""
      ).toLowerCase();
      if (addr && addr === selfAddr) {
        toastInfo("You can’t message yourself");
        return;
      }
      const title =
        (u as any).displayName || (u as any).username || truncateAddress(addr);
      // Check if user already exists in contacts
      const existing = (conversations as any[]).find(
        (c: any) =>
          Array.isArray(c?.participants) &&
          c.participants.some(
            (p: any) => (p?.participant?.address || "").toLowerCase() === addr
          )
      );
      if (existing) {
        navigation.navigate(ScreenNames.Chat as any, {
          conversationId: existing._id,
          title,
        });
      } else {
        // Open chat screen in target-by-address mode (no existing conversation)
        navigation.navigate(ScreenNames.Chat as any, {
          targetAddress: addr,
          title,
          targetUser: u,
        });
      }
      setNewDmVisible(false);
    },
    [navigation, conversations]
  );

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

  const listEmpty = useMemo(() => {
    if (!hasConversations) {
      return (
        <View className="items-center mt-16 px-6">
          <Text className="text-theme-neutrals-400 mb-3">
            No conversations yet
          </Text>
          <TouchableOpacity
            onPress={openNewDM}
            activeOpacity={0.8}
            className="mt-3 flex-row items-center px-4 py-2 rounded-full bg-theme-accent"
          >
            <Ionicons name="chatbubbles" size={18} color="white" />
            <Text className="ml-2 text-theme-neutrals-100 font-medium">
              Start a new conversation
            </Text>
          </TouchableOpacity>
        </View>
      );
    }
    // Has conversations but none match search
    return (
      <View className="items-center mt-10">
        <Text className="text-theme-neutrals-400">No conversations found</Text>
      </View>
    );
  }, [hasConversations, filtered?.length, openNewDM]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
      style={{ flex: 1 }}
    >
      <View className="flex-1 bg-theme-neutrals-900">
        <ScreenHeader
          title="Messages"
          subtitle={dnd ? "Do Not Disturb is ON" : undefined}
          rightContent={RightHeader}
          canGoBack={false}
        />

        <View className="px-4 mt-2">
          {/* <DMSocketTest className="mb-3" /> */}
          {hasConversations ? (
            <DMSearchBox
              value={query}
              onChangeText={handleChangeQuery}
              onClear={clearQuery}
              placeholder="Search"
            />
          ) : null}
        </View>

        <FlatList
          data={filtered as any}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 24 }}
          className="flex-1"
          refreshControl={
            <RefreshControl
              refreshing={!!contactsLoading}
              onRefresh={refreshContacts}
              tintColor="#9CA3AF"
            />
          }
          ListEmptyComponent={listEmpty}
          ItemSeparatorComponent={() => (
            <View className="h-[1px] bg-theme-neutrals-800/70 mx-4" />
          )}
        />

        <DMSettingsMenu
          visible={menuVisible}
          onClose={closeMenu}
          onNewDM={openNewDM}
          onOpenDmSettings={openDmSettings}
          dnd={dnd}
          onToggleDnd={toggleDnd}
        />

        <NewDMModal
          open={newDmVisible}
          onOpenChange={setNewDmVisible}
          onSelect={startDMWith}
        />

        <DMSettingsModal
          open={dmSettingsVisible}
          onOpenChange={setDmSettingsVisible}
        />
      </View>
    </KeyboardAvoidingView>
  );
};

export default DirectMessagesScreen;
