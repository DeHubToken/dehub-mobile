import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FlatList,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
  KeyboardAvoidingView,
  Platform,
  TextInput,
} from "react-native";
import { Image } from "expo-image";
import Icon from "../components/ui/Icon";
import GlassIndicator, { GLASS_SHADOW } from "../components/ui/GlassIndicator";
import { useNavigation } from "@react-navigation/native";
import { ScreenNames } from "../navigation/ScreenNames";
import NewDMModal from "../components/DM/NewDMModal";
import DMSettingsModal from "../components/DM/DMSettingsModal";
import DMSettingsMenu from "../components/DM/DMSettingsMenu";
import ConversationItem from "../components/DM/ConversationItem";
import ConversationContextMenu from "../components/DM/ConversationContextMenu";
import { useUser, useAuthState, type User } from "../context/AuthContext";
import { useUserProfileSheet } from "../context/UserProfileSheetContext";
import { truncateAddress } from "../libs/strings.util";
import { toastInfo, toastSuccess, toastError } from "../libs/toast";
import { blockUser } from "../services/block.service";
import { deleteConversation, getDmUserStatus, addFreeAccess, removeFreeAccess, type DmUserStatus } from "../services/dm/dm.api";
import SignInGate from "../components/auth/SignInGate";
import type {
  DmConversation,
  DmUser,
} from "../services/dm/dm.types";
import { getOtherParticipant } from "../services/dm/dm.types";
import { useDmContacts, dmActions } from "../store/dm.store";
import { useDMContext } from "../context/DMContext";

const DirectMessagesInner: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const user = useUser();
  const { isSignedIn, needsUsername } = useAuthState();

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

  const openSettings = useCallback(() => {
    openMenu();
  }, [openMenu]);

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

  const publicChatItem = useMemo(
    () => (
      <>
      <TouchableOpacity
        onPress={handleOpenLiveChat}
        activeOpacity={0.7}
        className="flex-row items-center px-4 py-3 gap-3"
      >
        {/* Logo styled like Avatar size={52} rounded={false} */}
        <View
          style={{ width: 52, height: 52, borderRadius: Math.round(52 * 0.16) }}
          className="bg-black items-center justify-center overflow-hidden"
        >
          <Image
            source={require("../assets/web-icons/dehub-logo-compact.png")}
            style={{ width: 30, height: 30 }}
            contentFit="contain"
          />
        </View>

        {/* Name + preview (matches ConversationItem layout) */}
        <View className="flex-1 justify-center">
          <View className="flex-row items-center gap-1.5">
            <Text className="text-theme-neutrals-100 text-[15px] font-semibold" numberOfLines={1}>
              Public Chat
            </Text>
          </View>
          <View className="flex-row items-center gap-1 mt-0.5">
            <Text className="text-theme-neutrals-400 text-[13px] flex-1" numberOfLines={1}>
              Join the community conversation
            </Text>
          </View>
        </View>
      </TouchableOpacity>
      <View className="h-[1px] bg-theme-neutrals-800/50 mx-4" />
      </>
    ),
    [handleOpenLiveChat],
  );

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
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 h-16">
          <View className="flex-row items-center gap-3">
            <Image
              source={require("../assets/web-icons/messages-3d-icon.png")}
              style={{ width: 36, height: 36 }}
              contentFit="contain"
            />
            <Text className="text-white text-xl font-bold">{t("messages.title")}</Text>
          </View>
          <TouchableOpacity
            onPress={openSettings}
            className="w-10 h-10 items-center justify-center active:opacity-70"
            accessibilityRole="button"
            accessibilityLabel="Settings"
          >
            <Icon name="Settings" size={22} color="#A1A1AA" />
          </TouchableOpacity>
        </View>

        {/* Search bar with + button */}
        <View className="px-4 mb-2">
          <View className="flex-row items-center bg-[#1F2124] rounded-xl h-11">
            <View className="pl-3 pr-2">
              <Icon name="Search" size={16} color="#71717A" />
            </View>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search conversations..."
              placeholderTextColor="#71717A"
              className="flex-1 text-white text-sm py-0"
              returnKeyType="search"
            />
            <TouchableOpacity
              onPress={openNewDM}
              className="w-7 h-7 rounded-xl items-center justify-center mr-1.5"
              style={GLASS_SHADOW}
              accessibilityRole="button"
              accessibilityLabel="New DM"
            >
              <GlassIndicator borderRadius={10} />
              <Icon name="Plus" size={16} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>

        <FlatList
          data={filtered}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 80 }}
          className="flex-1"
          ListHeaderComponent={publicChatItem}
          refreshControl={
            <RefreshControl
              refreshing={!!contactsLoading}
              onRefresh={refreshContacts}
              tintColor="#A6A9AC"
            />
          }
          ListEmptyComponent={
            hasConversations ? (
              <View className="items-center mt-10">
                <Text className="text-theme-neutrals-400">No conversations found</Text>
              </View>
            ) : null
          }
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

const DirectMessagesScreen: React.FC = () => (
  <SignInGate>
    <DirectMessagesInner />
  </SignInGate>
);

export default DirectMessagesScreen;
