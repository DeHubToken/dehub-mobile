import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn } from "react-native-reanimated";
import ScreenHeader from "../components/ScreenHeader";
import { useNavigation } from "@react-navigation/native";
import { ScreenNames } from "../navigation/ScreenNames";
import NewDMModal from "../components/DM/NewDMModal";
import DMSearchBox from "../components/DM/DMSearchBox";
import DMSettingsModal from "../components/DM/DMSettingsModal";
import DMSettingsMenu from "../components/DM/DMSettingsMenu";
import ConversationItem from "../components/DM/ConversationItem";
import ConversationContextMenu from "../components/DM/ConversationContextMenu";
import AccentButtonGradient from "../components/ui/AccentButtonGradient";
import { useAuth, type User } from "../context/AuthContext";
import { useUserProfileSheet } from "../context/UserProfileSheetContext";
import { truncateAddress } from "../libs/strings.util";
import { toastInfo, toastSuccess, toastError } from "../libs/toast";
import { blockUser } from "../services/block.service";
import { deleteConversation, getDmUserStatus, addFreeAccess, removeFreeAccess, type DmUserStatus } from "../services/dm/dm.api";
import { useGateToHome } from "../hooks/useGateToHome";
import type {
  DmConversation,
  DmUser,
} from "../services/dm/dm.types";
import { getOtherParticipant } from "../services/dm/dm.types";
import { useDmContacts, dmActions } from "../store/dm.store";
import { useDMContext } from "../context/DMContext";

const DirectMessagesScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { user, isSignedIn, needsUsername } = useAuth();
  const allow = isSignedIn && !needsUsername;
  useGateToHome(allow);

  const { contactsLoading, refreshContacts } = useDMContext();
  const conversations = useDmContacts();
  const { showUserProfile } = useUserProfileSheet();

  const myUserId = (user as any)?.id as string | undefined;
  const myAddress = (
    (user as any)?.walletAddress || (user as any)?.address || ""
  ).toLowerCase();

  const [query, setQuery] = useState("");
  const [menuVisible, setMenuVisible] = useState(false);
  const [dnd, setDnd] = useState(false);
  const [newDmVisible, setNewDmVisible] = useState(false);
  const [dmSettingsVisible, setDmSettingsVisible] = useState(false);

  // Own DM status (for creator features like free access toggle)
  const [myDmStatus, setMyDmStatus] = useState<DmUserStatus | null>(null);

  // Conversation context menu state
  const [ctxConv, setCtxConv] = useState<DmConversation | null>(null);
  const [ctxUser, setCtxUser] = useState<DmUser | undefined>(undefined);

  // Fetch own DM status
  useEffect(() => {
    if (!myAddress) return;
    getDmUserStatus(myAddress)
      .then((s) => { if (s) setMyDmStatus(s); })
      .catch(() => {});
  }, [myAddress]);

  // Filtered & sorted conversations
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? conversations.filter((c) => {
          const other = getOtherParticipant(c, myUserId, myAddress);
          const title = (
            other?.displayName ||
            other?.username ||
            other?.address ||
            ""
          ).toLowerCase();
          const preview =
            c.messages?.[0]?.content?.toLowerCase() || "";
          return title.includes(q) || preview.includes(q);
        })
      : conversations;
    return [...list].sort(
      (a, b) =>
        +new Date(b.updatedAt || b.lastMessageAt || 0) -
        +new Date(a.updatedAt || a.lastMessageAt || 0),
    );
  }, [conversations, query, myUserId, myAddress]);

  const hasConversations = (conversations?.length || 0) > 0;


  const openMenu = useCallback(() => setMenuVisible(true), []);
  const closeMenu = useCallback(() => setMenuVisible(false), []);
  const toggleDnd = useCallback(() => setDnd((p) => !p), []);
  const openNewDM = useCallback(() => {
    closeMenu();
    setNewDmVisible(true);
  }, [closeMenu]);
  const openDmSettings = useCallback(() => {
    closeMenu();
    setDmSettingsVisible(true);
  }, [closeMenu]);


  const handleConvLongPress = useCallback(
    (conv: DmConversation, otherUser: DmUser | undefined) => {
      setCtxConv(conv);
      setCtxUser(otherUser);
    },
    [],
  );

  const handleAvatarPress = useCallback(
    (otherUser: DmUser | undefined) => {
      const id = otherUser?.username || otherUser?.address;
      if (id) showUserProfile(id, { source: "dm-list" });
    },
    [showUserProfile],
  );

  const closeCtx = useCallback(() => {
    setCtxConv(null);
    setCtxUser(undefined);
  }, []);

  const handleCtxOpenChat = useCallback(() => {
    if (!ctxConv) return;
    const title =
      ctxUser?.displayName ||
      ctxUser?.username ||
      truncateAddress(ctxUser?.address || "");
    navigation.navigate(ScreenNames.Chat as any, {
      conversationId: ctxConv._id,
      title,
    });
  }, [ctxConv, ctxUser, navigation]);

  const handleCtxBlock = useCallback(async () => {
    const addr = ctxUser?.address;
    if (!addr) return;
    try {
      await blockUser(addr, "Blocked from DM list");
      toastSuccess(`Blocked ${ctxUser?.displayName || ctxUser?.username || "user"}`);
    } catch (e) {
      toastError(e, "Failed to block");
    }
  }, [ctxUser]);

  const handleCtxDelete = useCallback(async () => {
    if (!ctxConv) return;
    try {
      await deleteConversation(ctxConv._id, myAddress);
      dmActions.removeConversation(ctxConv._id);
      toastSuccess("Conversation deleted");
    } catch (e) {
      toastError(e, "Failed to delete conversation");
    }
  }, [ctxConv, myAddress]);

  const handleCtxToggleFreeAccess = useCallback(async () => {
    const addr = (ctxUser?.address || "").toLowerCase();
    if (!addr) return;
    const currentlyFree = !!(myDmStatus?.freeAccessUsers?.some(
      (a: string) => a.toLowerCase() === addr,
    ));
    try {
      if (currentlyFree) {
        await removeFreeAccess(addr);
        setMyDmStatus((prev) =>
          prev ? { ...prev, freeAccessUsers: (prev.freeAccessUsers || []).filter((a) => a.toLowerCase() !== addr) } : prev,
        );
        toastSuccess(`Removed free access for ${ctxUser?.displayName || ctxUser?.username || "user"}`);
      } else {
        await addFreeAccess(addr);
        setMyDmStatus((prev) =>
          prev ? { ...prev, freeAccessUsers: [...(prev.freeAccessUsers || []), addr] } : prev,
        );
        toastSuccess(`Granted free access to ${ctxUser?.displayName || ctxUser?.username || "user"}`);
      }
    } catch (e) {
      toastError(e, "Failed to update free access");
    }
  }, [ctxUser, myDmStatus]);

  const handleOpenConversation = useCallback(
    (conv: DmConversation, otherUser: DmUser | undefined) => {
      const title =
        otherUser?.displayName ||
        otherUser?.username ||
        truncateAddress(otherUser?.address || "");
      navigation.navigate(ScreenNames.Chat as any, {
        conversationId: conv._id,
        title,
      });
    },
    [navigation],
  );

  const startDMWith = useCallback(
    (u: User) => {
      const addr = (
        (u as any).walletAddress || (u as any).address || ""
      ).toLowerCase();
      const selfAddr = myAddress;
      if (addr && addr === selfAddr) {
        toastInfo("You can't message yourself");
        return;
      }
      const title =
        (u as any).displayName || (u as any).username || truncateAddress(addr);
      // Check existing conversation
      const existing = conversations.find((c: DmConversation) =>
        c.participants?.some(
          (p) =>
            (p.participant?.address || "").toLowerCase() === addr,
        ),
      );
      if (existing) {
        navigation.navigate(ScreenNames.Chat as any, {
          conversationId: existing._id,
          title,
        });
      } else {
        navigation.navigate(ScreenNames.Chat as any, {
          targetAddress: addr,
          title,
          targetUser: u,
        });
      }
      setNewDmVisible(false);
    },
    [navigation, conversations, myAddress],
  );


  const handleOpenLiveChat = useCallback(() => {
    navigation.navigate(ScreenNames.LiveChat as any);
  }, [navigation]);

  const RightHeader = useMemo(
    () => (
      <View className="flex-row items-center">
        <TouchableOpacity
          className="w-10 h-10 items-center justify-center active:opacity-70"
          onPress={handleOpenLiveChat}
          accessibilityRole="button"
          accessibilityLabel="Open global chat"
        >
          <Ionicons name="chatbubbles-outline" size={21} color="#F9FBFF" />
        </TouchableOpacity>
        <TouchableOpacity
          className="w-10 h-10 items-center justify-center active:opacity-70"
          onPress={openMenu}
          accessibilityRole="button"
          accessibilityLabel="Open settings menu"
        >
          <Ionicons name="settings-outline" size={22} color="#F9FBFF" />
        </TouchableOpacity>
      </View>
    ),
    [openMenu, handleOpenLiveChat],
  );

  const renderItem = useCallback(
    ({ item }: { item: DmConversation }) => (
      <ConversationItem
        conversation={item}
        myUserId={myUserId}
        myAddress={myAddress}
        onPress={handleOpenConversation}
        onLongPress={handleConvLongPress}
        onAvatarPress={handleAvatarPress}
      />
    ),
    [myUserId, myAddress, handleOpenConversation, handleConvLongPress, handleAvatarPress],
  );

  const keyExtractor = useCallback(
    (item: DmConversation) => item._id,
    [],
  );

  const listEmpty = useMemo(() => {
    if (!hasConversations) {
      return (
        <View className="items-center mt-16 px-6">
          <Animated.View entering={FadeIn.duration(400)}>
            <Ionicons
              name="chatbubbles-outline"
              size={48}
              color="#8B8D90"
              style={{ alignSelf: "center", marginBottom: 12 }}
            />
            <Text className="text-theme-neutrals-400 text-center mb-4">
              No conversations yet
            </Text>
            <AccentButtonGradient>
              <TouchableOpacity
                onPress={openNewDM}
                activeOpacity={0.8}
                className="flex-row items-center px-5 py-2.5 rounded-full bg-transparent"
              >
                <Ionicons name="chatbubbles" size={18} color="white" />
                <Text className="ml-2 text-white font-medium">
                  Start a conversation
                </Text>
              </TouchableOpacity>
            </AccentButtonGradient>
          </Animated.View>
        </View>
      );
    }
    return (
      <View className="items-center mt-10">
        <Text className="text-theme-neutrals-400">No conversations found</Text>
      </View>
    );
  }, [hasConversations, openNewDM]);

  const itemSeparator = useCallback(
    () => <View className="h-[1px] bg-theme-neutrals-800/50 mx-4" />,
    [],
  );


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

        {hasConversations && (
          <View className="px-4 mt-3 mb-1">
            <DMSearchBox
              value={query}
              onChangeText={setQuery}
              onClear={() => setQuery("")}
              placeholder="Search"
            />
          </View>
        )}

        <FlatList
          data={filtered}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 24 }}
          className="flex-1"
          refreshControl={
            <RefreshControl
              refreshing={!!contactsLoading}
              onRefresh={refreshContacts}
              tintColor="#A6A9AC"
            />
          }
          ListEmptyComponent={listEmpty}
          ItemSeparatorComponent={itemSeparator}
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

        <ConversationContextMenu
          visible={!!ctxConv}
          conversation={ctxConv}
          otherUser={ctxUser}
          onClose={closeCtx}
          onOpenChat={handleCtxOpenChat}
          onBlock={handleCtxBlock}
          onDelete={handleCtxDelete}
          onToggleFreeAccess={handleCtxToggleFreeAccess}
          peerHasFreeAccess={
            !!(myDmStatus?.freeAccessUsers?.some(
              (a: string) => a.toLowerCase() === (ctxUser?.address || "").toLowerCase(),
            ))
          }
          isCreator={!!(myDmStatus?.perMessageFee && myDmStatus.perMessageFee > 0)}
        />
      </View>
    </KeyboardAvoidingView>
  );
};

export default DirectMessagesScreen;
