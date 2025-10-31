import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  FlatList,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Platform,
  KeyboardAvoidingView,
  Keyboard,
} from "react-native";
// import { useSafeAreaInsets } from "react-native-safe-area-context";
import ScreenHeader from "../components/ScreenHeader";
import MessageBubble from "../components/DM/MessageBubble";
import MessageInput from "../components/DM/MessageInput";
import { useAuth } from "../context/AuthContext";
import { useDM } from "../hooks/useDM";
import { dmActions, getPeerPolicy, getUnreadCount } from "../store/dm.state";
import { getAccount } from "../services/user.service";
import type { User } from "../context/AuthContext";
import { useNavigation } from "@react-navigation/native";
import { useWebSocket } from "../context/WebSocketContext";
import { DMSocketEvent } from "../services/enums/dm-socket-events.enum";
import { toastError, toastSuccess, toastWarning } from "../libs/toast";
import { truncateAddress } from "../libs/strings.util";
import { useUserProfileSheet } from "../context/UserProfileSheetContext";
// keyboard handling is managed via KeyboardAvoidingView at screen level
import ChatHeaderMenuButton from "../components/Chat/ChatHeaderMenuButton";
import ChatMenu from "../components/Chat/ChatMenu";
import ConfirmBlockModal from "../components/common/ConfirmBlockModal";
import { blockDm, unBlockDm } from "../services/dm.service";

type ID = string;
type UiMessage = {
  id: ID;
  tempId?: ID;
  conversationId: ID;
  senderId: ID;
  senderAddress?: string;
  author?: "me" | "other";
  kind: "text" | "media" | "system";
  text?: string;
  status: "sending" | "sent" | "delivered" | "read" | "failed";
  createdAt: string;
};

export type ChatScreenProps = {
  route: {
    params?: {
      conversationId?: ID;
      targetAddress?: string;
      targetUser?: Partial<User>;
      title?: string;
    };
  };
};

const ChatScreen: React.FC<ChatScreenProps> = ({ route }) => {
  // const insets = useSafeAreaInsets();
  const [headerHeight, setHeaderHeight] = useState<number>(0);
  const convId = route?.params?.conversationId as ID;
  const targetAddress = route?.params?.targetAddress as string | undefined;
  const { loadMessages, useMessages, conversations } = useDM();
  const dmMessages = useMessages(convId) as any[];
  const navigation = useNavigation<any>();
  const ws = useWebSocket();
  const list: UiMessage[] = useMemo(() => {
    // Adapt dm messages to UI message shape without mutating store
    return (dmMessages || []).map((m) => ({
      id: String(m._id),
      conversationId: String(m.conversation),
      senderId: String((m.sender && (m.sender._id || m.sender)) || "other"),
      senderAddress: String(
        (m as any)?.sender?.address ||
          (m as any)?.address ||
          (m as any)?.senderAddress ||
          "" ||
          ""
      ),
      author: (m as any)?.author,
      kind:
        Array.isArray(m.mediaUrls) && m.mediaUrls.length > 0 ? "media" : "text",
      text: m.content || "",
      status: "sent",
      createdAt: String(m.createdAt || new Date().toISOString()),
    }));
  }, [dmMessages]);
  // Show typing only for the other user (remote typing). Local typing should not trigger header subtitle.
  const [remoteTyping, setRemoteTyping] = useState(false);
  const { user, patchUser } = useAuth();
  const [target, setTarget] = useState<
    (Partial<User> & { _id?: string }) | null
  >(null);
  const [dmReason, setDmReason] = useState<string | null>(null);
  const [dmDisabled, setDmDisabled] = useState<boolean>(false);
  const [creating, setCreating] = useState<boolean>(false);
  const createdConvIdRef = useRef<ID | null>(null);
  const [pending, setPending] = useState<UiMessage[]>([]);
  const [menuVisible, setMenuVisible] = useState<boolean>(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmMode, setConfirmMode] = useState<"block" | "unblock">("block");
  const [blockActionLoading, setBlockActionLoading] = useState(false);
  const { showUserProfile } = useUserProfileSheet();
  
  const listRef = useRef<FlatList<any> | null>(null);
  const isAtBottomRef = useRef<boolean>(true);

  const onScroll = useCallback((e: any) => {
    try {
      const { contentOffset, layoutMeasurement, contentSize } =
        e.nativeEvent || {};
      if (!contentOffset || !layoutMeasurement || !contentSize) return;
      const paddingToBottom = 40; // px threshold
      const atBottom =
        contentOffset.y + layoutMeasurement.height >=
        (contentSize.height || 0) - paddingToBottom;
      isAtBottomRef.current = !!atBottom;
    } catch {}
  }, []);

  const scrollToBottomIfNeeded = useCallback(() => {
    try {
      if (!listRef.current) return;
      if (!isAtBottomRef.current) {
        requestAnimationFrame(() => {
          try {
            listRef.current?.scrollToEnd({ animated: true });
          } catch {}
        });
        // Re-issue once shortly after to catch fresh renders
        setTimeout(() => {
          try {
            listRef.current?.scrollToEnd({ animated: true });
          } catch {}
        }, 180);
      }
    } catch {}
  }, []);

  // Determine if DM should be disabled due to blocklist/admin status
  const computeBlockDmState = useCallback((acct: any): { disabled: boolean; reason: string | null } => {
    const myAddr = String((user as any)?.walletAddress || (user as any)?.address || "").toLowerCase();
    const peerAddr = String(acct?.address || (acct?.dmSettings?.address) || "").toLowerCase();
    const blockedArray: any[] = (acct?.blocklist?.blocked as any[]) || [];
    const theyBlockedMe = !!(myAddr && blockedArray.some((b: any) => String(b?.address || "").toLowerCase() === myAddr));
    const iBlockedThem = !!(peerAddr && ((user as any)?.blocklist?.blocked || []).some((b: any) => String(b?.address || "").toLowerCase() === peerAddr));
    const adminBlocked = Boolean(acct?.blocklist?.adminBlocked);
    if (iBlockedThem && theyBlockedMe) return { disabled: true, reason: "You’ve blocked this user and they’ve blocked you." };
    if (theyBlockedMe) return { disabled: true, reason: "This user has blocked you." };
    if (iBlockedThem) return { disabled: true, reason: "You’ve blocked this user." };
    if (adminBlocked) return { disabled: true, reason: "This account has been blocked and cannot receive messages." };
    return { disabled: false, reason: null };
  }, [user]);

  // iBlockedThem is computed after `peer` is available

  // Keep last message visible when the keyboard opens
  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const sub = Keyboard.addListener(showEvent as any, () => {
      requestAnimationFrame(() => {
        try { listRef.current?.scrollToEnd({ animated: true }); } catch {}
      });
    });
    return () => { try { sub.remove(); } catch {} };
  }, []);

  // Derive peer identifier (username/address) for actions
  const peer = useMemo(() => {
    // Prefer loaded target when in target-by-address flow
    const address = (
      targetAddress ||
      (target as any)?.address ||
      (target as any)?.walletAddress ||
      ""
    ).toLowerCase();
    const username =
      (target as any)?.username || (target as any)?.displayName || undefined;
    if (!convId) return { address, username };
    // Try to read from conversations store
    const c = (conversations as any[])?.find?.(
      (x: any) => String(x?._id) === String(convId)
    );
    const other = c?.participants?.[0]?.participant || {};
    return {
      address: String(other?.address || address || ""),
      username: String(other?.username || username || ""),
    };
  }, [convId, conversations, target, targetAddress]);

  const iBlockedThem = useMemo(() => {
    const peerAddr = String(
      (target as any)?.address || (target as any)?.walletAddress || peer?.address || ""
    ).toLowerCase();
    return !!(
      peerAddr && ((user as any)?.blocklist?.blocked || []).some((b: any) => String(b?.address || "").toLowerCase() === peerAddr)
    );
  }, [user, target, peer?.address]);

  const openMenu = useCallback(() => setMenuVisible(true), []);
  const closeMenu = useCallback(() => setMenuVisible(false), []);

  const onViewProfile = useCallback(() => {
    closeMenu();
    const id =
      (peer.username && String(peer.username)) ||
      (peer.address && String(peer.address)) ||
      "";
    if (!id) return;
    showUserProfile(id, { source: "chat-screen" });
  }, [peer, showUserProfile, closeMenu]);

  const onBlockUser = useCallback(() => {
    closeMenu();
    if (!convId) {
      toastWarning("Start a conversation before blocking");
      return;
    }
    setConfirmMode("block");
    setConfirmVisible(true);
  }, [closeMenu, convId]);

  const onUnblockUser = useCallback(() => {
    closeMenu();
    if (!convId) {
      toastWarning("Start a conversation before unblocking");
      return;
    }
    setConfirmMode("unblock");
    setConfirmVisible(true);
  }, [closeMenu, convId]);

  const peerLabel = useMemo(() => {
    return (
      (peer?.username && String(peer.username)) ||
      (peer?.address && truncateAddress(peer.address)) ||
      "user"
    );
  }, [peer?.username, peer?.address]);

  const applyLocalBlockToggle = useCallback(async (mode: "block" | "unblock") => {
    const addr = String(peer?.address || (target as any)?.address || "").toLowerCase();
    if (!addr) return;
    // Optimistic local update via patchUser
    await patchUser((prev) => {
      const current = prev || ({} as any);
      const bl = current.blocklist || { blocked: [], blockedBy: [], adminBlocked: false };
      const blocked = Array.isArray(bl.blocked) ? [...bl.blocked] : [];
      if (mode === "block") {
        if (!blocked.some((b: any) => String(b?.address || "").toLowerCase() === addr)) {
          blocked.push({ address: addr, username: peer?.username });
        }
        return { blocklist: { ...bl, blocked } } as any;
      }
      // unblock
      const next = blocked.filter((b: any) => String(b?.address || "").toLowerCase() !== addr);
      return { blocklist: { ...bl, blocked: next } } as any;
    });
    // Immediate UI feedback without waiting for context re-render:
    let nextDisabled = false;
    let nextReason: string | null = null;
    if (mode === "block") {
      nextDisabled = true;
      nextReason = "You’ve blocked this user.";
    } else {
      // After unblocking, still disabled if they blocked me or adminBlocked
      const myAddr = String((user as any)?.walletAddress || (user as any)?.address || "").toLowerCase();
      const theyBlockedMe = !!(myAddr && ((target as any)?.blocklist?.blocked || []).some((b: any) => String(b?.address || "").toLowerCase() === myAddr));
      const adminBlocked = Boolean((target as any)?.blocklist?.adminBlocked);
      if (theyBlockedMe) {
        nextDisabled = true;
        nextReason = "This user has blocked you.";
      } else if (adminBlocked) {
        nextDisabled = true;
        nextReason = "This account has been blocked and cannot receive messages.";
      } else {
        nextDisabled = false;
        nextReason = null;
      }
    }
    setDmDisabled(nextDisabled);
    setDmReason(nextReason);
    // Keep peer policy cache consistent with UI
    try {
      dmActions.setPeerPolicy(addr, {
        disabled: nextDisabled,
        reason: nextReason,
        status: nextDisabled ? "BLOCKLIST" : "ACTIVE_ALL",
      } as any);
    } catch {}
  }, [patchUser, peer?.address, peer?.username, target, computeBlockDmState]);

  const onConfirmBlockToggle = useCallback(async () => {
    let prevBlocked: any[] = [];
    try {
      setBlockActionLoading(true);
      const addr = String((user as any)?.walletAddress || (user as any)?.address || "").toLowerCase();
      if (!convId) {
        throw new Error("No conversation to (un)block");
      }
      // Snapshot for rollback and data we need (e.g., reportId)
      prevBlocked = ((user as any)?.blocklist?.blocked || []).map((x: any) => ({ ...x }));
      const peerAddr = String(peer?.address || (target as any)?.address || "").toLowerCase();
      const prevPolicy = getPeerPolicy(peerAddr);
      const existing = prevBlocked.find((b: any) => String(b?.address || "").toLowerCase() === peerAddr);
      const existingReportId = existing?.reportId as string | undefined;
      // Optimistic update
      await applyLocalBlockToggle(confirmMode);
      // Server call
      if (confirmMode === "block") {
        const resp = await blockDm(convId, addr, "Blocked from chat");
        const newReportId = (resp as any)?.reportId as string | undefined;
        if (newReportId) {
          // Store reportId on the blocked entry for future unblocking
          await patchUser((prev) => {
            const bl = (prev as any)?.blocklist || { blocked: [], blockedBy: [], adminBlocked: false };
            const blocked = Array.isArray(bl.blocked) ? [...bl.blocked] : [];
            const idx = blocked.findIndex((b: any) => String(b?.address || "").toLowerCase() === peerAddr);
            if (idx >= 0) blocked[idx] = { ...blocked[idx], reportId: newReportId };
            return { blocklist: { ...bl, blocked } } as any;
          });
        }
      } else {
        await unBlockDm(convId, addr, existingReportId);
      }
      toastSuccess(confirmMode === "block" ? `Blocked ${peerLabel}` : `Unblocked ${peerLabel}`);
    } catch (e) {
      // Rollback optimistic change
      try {
        await patchUser(() => {
          const bl = ((user as any)?.blocklist) || { blocked: [], blockedBy: [], adminBlocked: false };
          return { blocklist: { ...bl, blocked: prevBlocked } } as any;
        });
        const nextState = computeBlockDmState(target);
        setDmDisabled(nextState.disabled);
        setDmReason(nextState.reason);
        // Restore peer policy cache
        const peerAddr = String(peer?.address || (target as any)?.address || "").toLowerCase();
        if (peerAddr) {
          const snapshot = getPeerPolicy(peerAddr);
          if (snapshot) {
            dmActions.setPeerPolicy(peerAddr, snapshot as any);
          } else {
            dmActions.setPeerPolicy(peerAddr, {
              disabled: nextState.disabled,
              reason: nextState.reason,
              status: nextState.disabled ? "BLOCKLIST" : "ACTIVE_ALL",
            } as any);
          }
        }
      } catch {}
      toastError(e, confirmMode === "block" ? "Failed to block user" : "Failed to unblock user");
    } finally {
      setBlockActionLoading(false);
      setConfirmVisible(false);
    }
  }, [applyLocalBlockToggle, confirmMode, peerLabel, convId, user, patchUser, peer?.address, target, computeBlockDmState]);

  // Keep DM disabled state in sync with blocklist changes in auth user or target
  useEffect(() => {
    const state = computeBlockDmState(target);
    if (state.disabled) {
      setDmDisabled(true);
      setDmReason(state.reason);
    }
    // If state is not disabled, we don't forcibly enable here to preserve other DM policies
  }, [(user as any)?.blocklist, target, computeBlockDmState]);

  // Fetch target account info when opening by address (no conversation yet)
  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (convId || !targetAddress) return;
      try {
        const res: any = await getAccount(targetAddress);
        const acct: User | undefined = res?.data?.result || res?.result;
        console.log("Fetched target account for DM:", acct);
        if (!cancelled && acct) {
          setTarget(acct);
          // Blocklist/admin checks take precedence
          const blockState = computeBlockDmState(acct);
          if (blockState.disabled) {
            setDmDisabled(true);
            setDmReason(blockState.reason);
          } else {
            const disables = acct.dmSettings?.disables || [];
            if (disables.includes("ALL")) {
              setDmDisabled(true);
              setDmReason("This account has disabled all DMs");
            } else if (disables.includes("NEW_DM")) {
              setDmDisabled(true);
              setDmReason("This account doesn’t accept new DMs");
            } else {
              setDmDisabled(false);
              setDmReason("Start your message with this person");
            }
          }
        }
      } catch {
        if (!cancelled) {
          setDmDisabled(false);
          setDmReason("Start your message with this person");
        }
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [convId, targetAddress]);
  useEffect(() => {
    if (convId) {
      loadMessages(convId, { limit: 30 }).catch(() => {});
    }
  }, [convId, loadMessages]);

  // Always (re)check target account info when we know the peer address, even if a conversation already exists
  useEffect(() => {
    let cancelled = false;
    async function checkPeer() {
      const addr = (peer?.address || "").toLowerCase();
      if (!addr) return;
      // Prime UI with last-known policy before network
      const cached = getPeerPolicy(addr);
      if (cached) {
        setDmDisabled(!!cached.disabled);
        setDmReason(
          cached.reason ||
            (cached.disabled
              ? "This account is not accepting messages right now."
              : null)
        );
      }
      try {
        const res: any = await getAccount(addr);
        const acct: User | undefined = res?.data?.result || res?.result;
        if (!cancelled && acct) {
          const blockState = computeBlockDmState(acct);
          if (blockState.disabled) {
            setDmDisabled(true);
            setDmReason(blockState.reason);
            dmActions.setPeerPolicy(addr, {
              disabled: true,
              reason: blockState.reason,
              status: "BLOCKLIST",
            } as any);
          } else {
            const disables = acct.dmSettings?.disables || [];
            if (disables.includes("ALL")) {
              setDmDisabled(true);
              setDmReason("This account has disabled all DMs");
              dmActions.setPeerPolicy(addr, {
                disabled: true,
                reason: "This account has disabled all DMs",
                status: "ALL",
              });
            } else if (disables.includes("NEW_DM")) {
              if (!convId) {
                setDmDisabled(true);
                setDmReason("This account doesn’t accept new DMs");
                dmActions.setPeerPolicy(addr, {
                  disabled: true,
                  reason: "This account doesn’t accept new DMs",
                  status: "NEW_DM",
                });
              } else {
                setDmDisabled(false);
                setDmReason(null);
                dmActions.setPeerPolicy(addr, {
                  disabled: false,
                  reason: null,
                  status: "NEW_DM",
                });
              }
            } else {
              setDmDisabled(false);
              setDmReason(null);
              dmActions.setPeerPolicy(addr, {
                disabled: false,
                reason: null,
                status: "ACTIVE_ALL",
              });
            }
          }
        }
      } catch {
        // ignore
      }
    }
    checkPeer();
    return () => {
      cancelled = true;
    };
  }, [peer?.address, convId]);

  // Mark as read when entering the conversation: update local store and notify server
  useEffect(() => {
    if (!convId || !user) return;
    try {
      const unread = getUnreadCount(convId as any, (user as any)?.id);
      if (unread > 0) {
        ws.emitAuthed(DMSocketEvent.markAsRead, { dmId: convId });
        dmActions.markAllRead(convId as any, (user as any)?.id);
      }
    } catch {}
  }, [convId, user, ws]);

  // Message event subscription centralized in useDM hook

  const ensureTargetAccount = useCallback(async () => {
    if (target && target._id) return target;
    if (!targetAddress) return null;
    try {
      const res: any = await getAccount(targetAddress);
      const acct: any = res?.data?.result || res?.result;
      if (acct) setTarget(acct);
      return acct || null;
    } catch {
      return null;
    }
  }, [target, targetAddress]);

  const ensureConversation = useCallback(async (): Promise<ID> => {
    if (convId) return convId;
    if (createdConvIdRef.current) return createdConvIdRef.current;
    const acct = await ensureTargetAccount();
    if (!acct || !acct._id) throw new Error("Unable to identify recipient");
    if (creating) {
      // Wait briefly for an in-flight creation to finish
      await new Promise((r) => setTimeout(r, 250));
      if (createdConvIdRef.current) return createdConvIdRef.current;
    }
    setCreating(true);
    const newId: ID = await new Promise<ID>((resolve, reject) => {
      const handleOk = (resp: any) => {
        try {
          const data = resp?.data || resp;
          const id: ID = String(data?._id || data?.id || "");
          if (!id) throw new Error("Invalid server response");
          dmActions.upsertContacts([{ ...(data as any) }]);
          createdConvIdRef.current = id;
          navigation.setParams({ conversationId: id });
          resolve(id);
        } catch (e) {
          reject(e);
        } finally {
          try {
            ws.off(DMSocketEvent.CreateAndStart, handleOk);
          } catch {}
          try {
            ws.off(DMSocketEvent.Error, handleErr);
          } catch {}
        }
      };
      const handleErr = (err: any) => {
        try {
          reject(new Error(err?.msg || "Unable to start DM"));
        } finally {
          try {
            ws.off(DMSocketEvent.CreateAndStart, handleOk);
          } catch {}
          try {
            ws.off(DMSocketEvent.Error, handleErr);
          } catch {}
        }
      };
      ws.on(DMSocketEvent.CreateAndStart, handleOk);
      ws.on(DMSocketEvent.Error, handleErr);
      ws.emitAuthed(DMSocketEvent.CreateAndStart, { _id: acct._id });
    }).finally(() => setCreating(false));
    // Prefetch just in case
    loadMessages(newId, { limit: 1 }).catch(() => {});
    return newId;
  }, [convId, creating, ensureTargetAccount, ws, navigation, loadMessages]);

  const onSend = useCallback(
    async (text: string) => {
      const content = text?.trim();
      if (!content) return;
      if (dmDisabled) {
        toastWarning(dmReason || "Can't send messages right now");
        return;
      }
      try {
        // If no conversation yet (first time), optimistically show the message and create+send behind the scenes
        if (!convId) {
          const tempId: ID = `temp-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 8)}`;
          const uiMsg: UiMessage = {
            id: tempId,
            tempId,
            conversationId: "temp" as any,
            senderId: String((user as any)?.id || "me"),
            kind: "text",
            text: content,
            status: "sending",
            createdAt: new Date().toISOString(),
          };
          setPending((prev) => [...prev, uiMsg]);
          scrollToBottomIfNeeded();
          const id = await ensureConversation();
          ws.emitAuthed(DMSocketEvent.SendMessage, {
            dmId: id,
            content,
            type: "msg",
          });
          // Clear pending once we switched to real conversation; server event will populate store
          setPending([]);
          scrollToBottomIfNeeded();
          return;
        }
        // Existing conversation
        ws.emitAuthed(DMSocketEvent.SendMessage, {
          dmId: convId,
          content,
          type: "msg",
        });
        scrollToBottomIfNeeded();
      } catch (e) {
        toastError(e, "Failed to send message");
        // Clear any pending optimistic if we created one
        if (!convId) setPending([]);
      }
    },
    [convId, ws, ensureConversation, user]
  );

  const title =
    route?.params?.title ||
    (target
      ? target.username ||
        (target as any).displayName ||
        truncateAddress(target.address || "")
      : "Chat");
  const combinedList = useMemo(
    () => (convId ? list : [...list, ...pending]),
    [convId, list, pending]
  );

  // proceedToCreate no longer used; creation happens implicitly in onSend when needed

  const RightHeader = useMemo(
    () => <ChatHeaderMenuButton onPress={openMenu} />,
    [openMenu]
  );

  const Menu = useMemo(
    () => (
      <ChatMenu
        visible={menuVisible}
        onClose={closeMenu}
        onViewProfile={onViewProfile}
        isBlocked={iBlockedThem}
        onBlockUser={onBlockUser}
        onUnblockUser={onUnblockUser}
      />
    ),
    [menuVisible, closeMenu, onViewProfile, iBlockedThem, onBlockUser, onUnblockUser]
  );

  // Global socket error handler: toast the reason and re-check account info (useful if peer toggled DND/DMs)
  useEffect(() => {
    const onSocketError = (err: any) => {
      const msg: string = err?.msg || "Message failed";
      const normalized = msg.toLowerCase();
      const isDndOrDisabled =
        /disturb|dnd|can\'t receive|cannot receive|disabled/.test(normalized);
      if (isDndOrDisabled) {
        setDmDisabled(true);
        setDmReason(msg);
        toastWarning(msg);
      } else {
        toastError(msg);
      }
      // Re-check current peer to reflect updated server-side DM status
      const addr = (peer?.address || "").toLowerCase();
      if (addr) {
        getAccount(addr)
          .then((res: any) => {
            const acct: any = res?.data?.result || res?.result;
            const disables = acct?.dmSettings?.disables || [];
            if (disables.includes("ALL")) {
              setDmDisabled(true);
              setDmReason("This account has disabled all DMs");
              dmActions.setPeerPolicy(addr, {
                disabled: true,
                reason: "This account has disabled all DMs",
                status: "ALL",
              });
            } else if (disables.includes("NEW_DM")) {
              if (!convId) {
                setDmDisabled(true);
                setDmReason("This account doesn’t accept new DMs");
                dmActions.setPeerPolicy(addr, {
                  disabled: true,
                  reason: "This account doesn’t accept new DMs",
                  status: "NEW_DM",
                });
              } else {
                setDmDisabled(false);
                setDmReason(null);
                dmActions.setPeerPolicy(addr, {
                  disabled: false,
                  reason: null,
                  status: "NEW_DM",
                });
              }
            } else {
              setDmDisabled(false);
              setDmReason(null);
              dmActions.setPeerPolicy(addr, {
                disabled: false,
                reason: null,
                status: "ACTIVE_ALL",
              });
            }
          })
          .catch(() => {});
      }
    };
    try {
      ws.on(DMSocketEvent.Error, onSocketError);
    } catch {}
    return () => {
      try {
        ws.off(DMSocketEvent.Error, onSocketError);
      } catch {}
    };
  }, [ws, peer?.address, convId]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={"padding"}
      keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
    >
      <View className="flex-1 bg-theme-neutrals-900">
        <View onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}>
          <ScreenHeader
            title={title}
            rightContent={RightHeader}
            subtitle={remoteTyping ? "Typing…" : undefined}
          />
        </View>
        {Menu}
        <View className="flex-1">
          <FlatList
            ref={listRef}
            data={combinedList}
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => {
              const meId = String((user as any)?.id || "");
              const meAddr = String(
                (user as any)?.walletAddress || (user as any)?.address || ""
              ).toLowerCase();
              const isMine =
                item.author === "me" ||
                String(item.senderId) === meId ||
                (item.senderAddress || "").toLowerCase() === meAddr;
              return (
                <View className="px-3 py-2">
                  <MessageBubble msg={item as any} isMe={isMine} />
                </View>
              );
            }}
            contentContainerStyle={{ paddingVertical: 8 }}
            keyboardShouldPersistTaps="handled"
            onScroll={onScroll}
            scrollEventThrottle={16}
          />
          {dmDisabled ? (
            <View className="px-4 py-2 bg-theme-neutrals-800">
              <Text className="text-theme-neutrals-300 text-xs">
                {dmReason || "This account is not accepting messages right now."}
              </Text>
              {iBlockedThem && !!convId && (
                <TouchableOpacity
                  onPress={() => {
                    setConfirmMode("unblock");
                    setConfirmVisible(true);
                  }}
                  className="mt-1"
                >
                  <Text className="text-blue-300 text-xs">Tap to unblock</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <MessageInput
              onSend={onSend}
              // Intentionally omit onTypingChange so local typing does not show in the header.
              disabled={false}
            />
          )}
          <ConfirmBlockModal
            visible={confirmVisible}
            mode={confirmMode}
            targetLabel={peerLabel}
            onConfirm={onConfirmBlockToggle}
            onCancel={() => setConfirmVisible(false)}
            loading={blockActionLoading}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

export default ChatScreen;
