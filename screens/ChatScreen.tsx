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
import FullScreenVideoPlayer from "../components/common/FullScreenVideoPlayer";
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
import { blockUser, unblockUser } from "../services/block.service";
import { copyPickedToLocal, setMapping } from "../libs/dm-media.local";
import { uploadDmMedia } from "../services/dm/upload";
import { guessMime } from "../libs/assets.util";
import { useGateToHome } from "../hooks/useGateToHome";
import * as FileSystem from "expo-file-system/legacy";

// DM media size limits (server is small)
const DM_MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
const DM_MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50 MB

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
  mediaUrls?: Array<{ url: string; type?: string; mimeType?: string }>;
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
  const { isSignedIn, needsUsername } = useAuth();
  const allow = isSignedIn && !needsUsername;
  useGateToHome(allow);
  const ws = useWebSocket();
  const list: UiMessage[] = useMemo(() => {
    // Adapt dm messages to UI message shape without mutating store
    const adapted = (dmMessages || []).map(
      (m) => {
        // Compute valid mediaUrls first, then derive kind from it
        const computedMedia = (() => {
          const rawMedia = (m as any)?.mediaUrls;
          if (Array.isArray(rawMedia) && rawMedia.length > 0) {
            const mapped = rawMedia
              .map((x: any) => ({
                url: x?.url,
                type: x?.type,
                mimeType: x?.mimeType,
              }))
              .filter((x: any) => !!x.url);
            if (mapped.length > 0) return mapped;
          }
          if ((m as any)?.msgType === "gif") {
            const gifUrl =
              rawMedia?.[0]?.url || (m as any)?.gif || undefined;
            if (gifUrl)
              return [{ url: gifUrl, type: "gif", mimeType: "image/gif" }];
          }
          // Server created a media message but mediaUrls not populated yet
          // (uploadStatus: 'pending' — async processing). Use a placeholder
          // so MessageBubble can resolve the local file via dm-media mapping.
          if ((m as any)?.msgType === "media") {
            return [{ url: "__pending__", type: "image", mimeType: "image/*" }];
          }
          return undefined;
        })();
        const hasMedia = Array.isArray(computedMedia) && computedMedia.length > 0;

        return {
          id: String(m._id),
          conversationId: String(m.conversation),
          senderId: String((m.sender && (m.sender._id || m.sender)) || "other"),
          senderAddress: String(
            (m as any)?.sender?.address ||
              (m as any)?.address ||
              (m as any)?.senderAddress ||
              ""
          ),
          author: (m as any)?.author,
          kind: hasMedia ? "media" : "text",
          text: m.content || "",
          mediaUrls: computedMedia,
          // server may provide this flag for received messages
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          isDownloaded: (m as any)?.isDownloaded === true,
          status: ((m as any)?.author === "me" && String((m as any)?.uploadStatus || "").toLowerCase() === "pending")
            ? ("pending" as any)
            : ("sent" as any),
          // preserve server msgType (e.g., gif, media) for downstream rendering hints
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          msgType: (m as any)?.msgType,
          createdAt: String(m.createdAt || new Date().toISOString()),
        } as UiMessage;
      }
    );
    // Sort newest first for inverted list rendering
    return adapted.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
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
  const [selectedVideoUri, setSelectedVideoUri] = useState<string | null>(null);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmMode, setConfirmMode] = useState<"block" | "unblock">("block");
  const [blockActionLoading, setBlockActionLoading] = useState(false);
  const { showUserProfile } = useUserProfileSheet();

  const listRef = useRef<FlatList<any> | null>(null);
  const isAtBottomRef = useRef<boolean>(true);
  const [showJumpButton, setShowJumpButton] = useState<boolean>(false);
  const inverted = true;

  // Force scroll to bottom regardless of current position
  const scrollToBottomNow = useCallback(() => {
    try {
      if (!listRef.current) return;
      requestAnimationFrame(() => {
        try {
          // With inverted list, bottom is offset 0
          listRef.current?.scrollToOffset({ offset: 0, animated: true });
        } catch {}
      });
      // Safety re-issue shortly after to catch fresh renders
      setTimeout(() => {
        try {
          listRef.current?.scrollToOffset({ offset: 0, animated: true });
        } catch {}
      }, 120);
    } catch {}
  }, []);

  const onScroll = useCallback((e: any) => {
    try {
      const { contentOffset, layoutMeasurement, contentSize } =
        e.nativeEvent || {};
      if (!contentOffset || !layoutMeasurement || !contentSize) return;
      const paddingToBottom = 40; // px threshold
      // For inverted list, bottom is near offset 0
      const atBottom = inverted
        ? contentOffset.y <= paddingToBottom
        : contentOffset.y + layoutMeasurement.height >=
          (contentSize.height || 0) - paddingToBottom;
      isAtBottomRef.current = !!atBottom;
      setShowJumpButton(!atBottom);
    } catch {}
  }, []);

  const scrollToBottomIfNeeded = useCallback(() => {
    try {
      if (!listRef.current) return;
      if (!isAtBottomRef.current) {
        requestAnimationFrame(() => {
          try {
            listRef.current?.scrollToOffset({ offset: 0, animated: true });
          } catch {}
        });
        // Re-issue once shortly after to catch fresh renders
        setTimeout(() => {
          try {
            listRef.current?.scrollToOffset({ offset: 0, animated: true });
          } catch {}
        }, 180);
      }
    } catch {}
  }, []);

  // Determine if DM should be disabled due to block status
  const computeBlockDmState = useCallback(
    (acct: any): { disabled: boolean; reason: string | null } => {
      // Use block flags from account info response
      const youBlockedFlag = !!(acct?.youBlocked);
      const blockedYouFlag = !!(acct?.blockedYou);
      const isBlockedFlag = !!(acct?.isBlocked);
      const adminBlocked = Boolean(acct?.blocklist?.adminBlocked);

      if (youBlockedFlag && blockedYouFlag)
        return {
          disabled: true,
          reason: "You've blocked this user and they've blocked you.",
        };
      if (blockedYouFlag)
        return { disabled: true, reason: "This user has blocked you." };
      if (youBlockedFlag)
        return { disabled: true, reason: "You've blocked this user." };
      if (isBlockedFlag)
        return { disabled: true, reason: "Messaging is restricted due to a block." };
      if (adminBlocked)
        return {
          disabled: true,
          reason: "This account has been blocked and cannot receive messages.",
        };
      return { disabled: false, reason: null };
    },
    []
  );

  // iBlockedThem is computed after `peer` is available

  // Keep last message visible when the keyboard opens
  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const onShow = () => {
      // Respect user position: only snap if already at bottom
      if (isAtBottomRef.current) scrollToBottomNow();
    };
    const onHide = () => {
      if (isAtBottomRef.current) scrollToBottomNow();
    };
    const subShow = Keyboard.addListener(showEvent as any, onShow);
    const subHide = Keyboard.addListener(hideEvent as any, onHide);
    return () => {
      try {
        subShow.remove();
      } catch {}
      try {
        subHide.remove();
      } catch {}
    };
  }, [scrollToBottomNow]);

  const onContentSizeChange = useCallback(() => {
    // Auto-scroll only when already at bottom; otherwise show jump button
    if (isAtBottomRef.current) {
      scrollToBottomNow();
    } else {
      setShowJumpButton(true);
    }
  }, [scrollToBottomNow]);

  const onPressJumpToBottom = useCallback(() => {
    scrollToBottomNow();
  }, [scrollToBottomNow]);

  // When the screen opens or conversation changes, scroll to most recent
  useEffect(() => {
    // Give a small delay for initial content render
    const t = setTimeout(() => scrollToBottomNow(), 150);
    return () => clearTimeout(t);
  }, [convId, scrollToBottomNow]);

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
    // Use block flags from target account info
    return !!(target as any)?.youBlocked;
  }, [target]);

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
    
    setConfirmMode("block");
    setConfirmVisible(true);
  }, [closeMenu]);

  const onUnblockUser = useCallback(() => {
    closeMenu();
    
    setConfirmMode("unblock");
    setConfirmVisible(true);
  }, [closeMenu]);

  const peerLabel = useMemo(() => {
    return (
      (peer?.username && String(peer.username)) ||
      (peer?.address && truncateAddress(peer.address)) ||
      "user"
    );
  }, [peer?.username, peer?.address]);

  const applyLocalBlockToggle = useCallback(
    async (mode: "block" | "unblock") => {
      const addr = String(
        peer?.address || (target as any)?.address || ""
      ).toLowerCase();
      if (!addr) return;

      // Immediate UI feedback
      let nextDisabled = false;
      let nextReason: string | null = null;
      if (mode === "block") {
        nextDisabled = true;
        nextReason = "You've blocked this user.";
      } else {
        // After unblocking, check if they still blocked us
        const blockedYouFlag = !!(target as any)?.blockedYou;
        const adminBlocked = Boolean((target as any)?.blocklist?.adminBlocked);
        if (blockedYouFlag) {
          nextDisabled = true;
          nextReason = "This user has blocked you.";
        } else if (adminBlocked) {
          nextDisabled = true;
          nextReason =
            "This account has been blocked and cannot receive messages.";
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
    },
    [peer?.address, target]
  );

  const onConfirmBlockToggle = useCallback(async () => {
    try {
      setBlockActionLoading(true);
      const peerAddr = String(
        peer?.address || (target as any)?.address || ""
      ).toLowerCase();
      if (!peerAddr) throw new Error("No peer address for block action");

      // Optimistic update
      await applyLocalBlockToggle(confirmMode);

      // Server call using platform block service
      if (confirmMode === "block") {
        await blockUser(peerAddr, "Blocked from chat");
      } else {
        await unblockUser(peerAddr);
      }
      toastSuccess(
        confirmMode === "block"
          ? `Blocked ${peerLabel}`
          : `Unblocked ${peerLabel}`
      );
    } catch (e) {
      // Rollback optimistic change
      try {
        const nextState = computeBlockDmState(target);
        setDmDisabled(nextState.disabled);
        setDmReason(nextState.reason);
        const peerAddr = String(
          peer?.address || (target as any)?.address || ""
        ).toLowerCase();
        if (peerAddr) {
          dmActions.setPeerPolicy(peerAddr, {
            disabled: nextState.disabled,
            reason: nextState.reason,
            status: nextState.disabled ? "BLOCKLIST" : "ACTIVE_ALL",
          } as any);
        }
      } catch {}
      toastError(
        e,
        confirmMode === "block"
          ? "Failed to block user"
          : "Failed to unblock user"
      );
    } finally {
      setBlockActionLoading(false);
      setConfirmVisible(false);
    }
  }, [
    applyLocalBlockToggle,
    confirmMode,
    peerLabel,
    peer?.address,
    target,
    computeBlockDmState,
  ]);

  // Keep DM disabled state in sync with target block flags
  useEffect(() => {
    const state = computeBlockDmState(target);
    if (state.disabled) {
      setDmDisabled(true);
      setDmReason(state.reason);
    }
    // If state is not disabled, we don't forcibly enable here to preserve other DM policies
  }, [target, computeBlockDmState]);

  // Fetch target account info when opening by address (no conversation yet)
  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (convId || !targetAddress) return;
      try {
        const res: any = await getAccount(targetAddress);
        const acct: User | undefined = res?.data?.result || res?.result;
        // console.log("Fetched target account for DM:", acct);
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
      loadMessages(convId, { limit: 30 })
        .then(() => {
          // When initial batch loads, jump to bottom
          scrollToBottomNow();
        })
        .catch(() => {});
    }
  }, [convId, loadMessages, scrollToBottomNow]);

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
      const tempId: ID = `temp-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      try {
        // Optimistic text bubble
        const optimistic: UiMessage = {
          id: tempId,
          tempId,
          conversationId: String(convId || "temp"),
          senderId: String((user as any)?.id || "me"),
          author: "me",
          kind: "text",
          text: content,
          status: "sending",
          createdAt: new Date().toISOString(),
        };
        (optimistic as any)._sig = { t: "msg", content, tempId };
        setPending((prev) => [optimistic, ...prev]);
        scrollToBottomNow();
        const id = await ensureConversation();
        ws.emitAuthed(DMSocketEvent.SendMessage, {
          dmId: id,
          content,
          type: "msg",
        });
      } catch (e) {
        toastError(e, "Failed to send message");
        // Remove the optimistic pending bubble on error
        setPending((prev) =>
          prev.filter((m) => m.tempId !== tempId)
        );
      }
    },
    [
      convId,
      ws,
      ensureConversation,
      user,
      scrollToBottomNow,
      dmDisabled,
      dmReason,
    ]
  );

  const onSendGif = useCallback(
    async (gifUrl: string, caption?: string) => {
      if (!gifUrl) return;
      if (dmDisabled) {
        toastWarning(dmReason || "Can't send messages right now");
        return;
      }
      const tempId: ID = `temp-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      try {
        // Optimistic GIF bubble
        const optimistic: UiMessage = {
          id: tempId,
          tempId,
          conversationId: String(convId || "temp"),
          senderId: String((user as any)?.id || "me"),
          author: "me",
          kind: "media",
          text: caption || "",
          mediaUrls: [{ url: gifUrl, type: "gif", mimeType: "image/gif" }],
          status: "sending",
          createdAt: new Date().toISOString(),
        };
        (optimistic as any)._sig = {
          t: "gif",
          gif: gifUrl,
          caption: caption || "",
          tempId,
        };
        setPending((prev) => [optimistic, ...prev]);
        scrollToBottomNow();
        const id = await ensureConversation();
        ws.emitAuthed(DMSocketEvent.SendMessage, {
          dmId: id,
          content: caption || "",
          type: "gif",
          gif: gifUrl,
        });
        scrollToBottomNow();
      } catch (e) {
        toastError(e, "Failed to send GIF");
        setPending((prev) => prev.filter((m) => m.tempId !== tempId));
      }
    },
    [
      convId,
      ws,
      ensureConversation,
      dmDisabled,
      dmReason,
      scrollToBottomNow,
      user,
    ]
  );

  const onSendImage = useCallback(
    async (uri: string, caption?: string) => {
      if (!uri || !user) return;
      if (dmDisabled) {
        toastWarning(dmReason || "Can't send messages right now");
        return;
      }
      const tempId: ID = `temp-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      try {
        // Check file size before uploading
        try {
          const info = await FileSystem.getInfoAsync(uri);
          const size = (info as any)?.size as number | undefined;
          if (size && size > DM_MAX_IMAGE_BYTES) {
            toastWarning(`Image is too large (${(size / 1024 / 1024).toFixed(1)} MB). Max is ${DM_MAX_IMAGE_BYTES / 1024 / 1024} MB.`);
            return;
          }
        } catch {}
        const id = await ensureConversation();
        // Copy into managed local folder first
        const copied = await copyPickedToLocal(uri, "image");
        // Optimistic bubble with local URI
        const optimistic: UiMessage = {
          id: tempId,
          tempId,
          conversationId: id,
          senderId: String((user as any)?.id || "me"),
          author: "me",
          kind: "media",
          text: caption || "",
          mediaUrls: [
            { url: copied.localUri, type: "image", mimeType: "image/*" },
          ],
          status: "sending",
          createdAt: new Date().toISOString(),
        };
        (optimistic as any)._sig = { t: "media", caption: caption || "", tempId };
        setPending((prev) => [optimistic, ...prev]);
        scrollToBottomNow();
        // Use the original picked URI for upload (more compatible on Android),
        // but keep the copied local file for display & mapping
        const mime = guessMime(uri, "image/jpeg");
        const file = { uri, name: copied.name, type: mime } as any;
        console.log("[DM] Upload file meta (image)", file);
        // Send to backend
        const resp: any = await uploadDmMedia({
          conversationId: id,
          senderId: user.address as string,
          files: [file],
          caption,
        });
        // Try to read messageId from response to persist mapping
        const serverMsg = resp?.data || resp?.message || resp;
        const msgId: string = String(
          serverMsg?._id || serverMsg?.id || ""
        );
        if (msgId) {
          await setMapping(msgId, copied.name, "image");
        }
        // Upsert the server message into the store WITH local media so it renders
        // immediately while the backend processes the upload asynchronously.
        if (msgId && id) {
          dmActions.upsertMessages(id, [{
            ...serverMsg,
            author: "me",
            mediaUrls: [{ url: copied.localUri, type: "image", mimeType: "image/*" }],
          } as any]);
        }
        // Now safe to remove the optimistic pending item — the store has our message.
        setPending((prev) => prev.filter((m) => m.tempId !== tempId));
        scrollToBottomNow();
      } catch (e) {
        toastError(e, "Failed to send image");
        setPending((prev) => prev.filter((m) => m.tempId !== tempId));
      }
    },
    [ensureConversation, dmDisabled, dmReason, scrollToBottomNow, user]
  );

  const onSendVideo = useCallback(
    async (uri: string, caption?: string) => {
      if (!uri || !user) return;
      if (dmDisabled) {
        toastWarning(dmReason || "Can't send messages right now");
        return;
      }
      const tempId: ID = `temp-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      try {
        // Check file size before uploading
        try {
          const info = await FileSystem.getInfoAsync(uri);
          const size = (info as any)?.size as number | undefined;
          if (size && size > DM_MAX_VIDEO_BYTES) {
            toastWarning(`Video is too large (${(size / 1024 / 1024).toFixed(1)} MB). Max is ${DM_MAX_VIDEO_BYTES / 1024 / 1024} MB.`);
            return;
          }
        } catch {}
        const id = await ensureConversation();
        const copied = await copyPickedToLocal(uri, "video");
        const optimistic: UiMessage = {
          id: tempId,
          tempId,
          conversationId: id,
          senderId: String((user as any)?.id || "me"),
          author: "me",
          kind: "media",
          text: caption || "",
          mediaUrls: [
            { url: copied.localUri, type: "video", mimeType: "video/*" },
          ],
          status: "sending",
          createdAt: new Date().toISOString(),
        };
        (optimistic as any)._sig = { t: "media", caption: caption || "", tempId };
        setPending((prev) => [optimistic, ...prev]);
        scrollToBottomNow();
        const mime = guessMime(uri, "video/mp4");
        const file = { uri, name: copied.name, type: mime } as any;
        // console.log("[DM] Upload file meta (video)", file);
        const resp: any = await uploadDmMedia({
          conversationId: id,
          senderId: user.address  as string,
          files: [file],
          caption,
        });
        const serverMsg = resp?.data || resp?.message || resp;
        const msgId: string = String(
          serverMsg?._id || serverMsg?.id || ""
        );
        if (msgId) {
          await setMapping(msgId, copied.name, "video");
        }
        // Upsert the server message into the store WITH local media so it renders
        // immediately while the backend processes the upload asynchronously.
        if (msgId && id) {
          dmActions.upsertMessages(id, [{
            ...serverMsg,
            author: "me",
            mediaUrls: [{ url: copied.localUri, type: "video", mimeType: "video/*" }],
          } as any]);
        }
        // Now safe to remove the optimistic pending item — the store has our message.
        setPending((prev) => prev.filter((m) => m.tempId !== tempId));
        scrollToBottomNow();
      } catch (e) {
        toastError(e, "Failed to send video");
        setPending((prev) => prev.filter((m) => m.tempId !== tempId));
      }
    },
    [ensureConversation, dmDisabled, dmReason, scrollToBottomNow, user]
  );

  // Reconcile pending items when server confirms
  useEffect(() => {
    const isMinePayload = (payload: any): boolean => {
      if (payload?.author === "me") return true;
      if (payload?.author === "other") return false;
      // Infer: compare sender to current user
      const senderId = String(
        payload?.sender?._id || payload?.sender || payload?.senderId || ""
      );
      const senderAddr = String(
        payload?.sender?.address ||
          payload?.address ||
          payload?.senderAddress ||
          ""
      ).toLowerCase();
      const meId = String((user as any)?.id || "");
      const meAddr = String(
        (user as any)?.walletAddress || (user as any)?.address || ""
      ).toLowerCase();
      return (
        (!!meId && senderId === meId) || (!!meAddr && senderAddr === meAddr)
      );
    };

    const onServerMessage = (payload: any) => {
      try {
        const cId = String(payload?.conversation || "");
        if (!cId || (convId && String(cId) !== String(convId))) return;
        if (!isMinePayload(payload)) return;
        const msgType = payload?.msgType;
        const content = payload?.content || "";
        const gif =
          Array.isArray(payload?.mediaUrls) &&
          payload.mediaUrls[0]?.type === "gif"
            ? payload.mediaUrls[0]?.url
            : undefined;
        setPending((prev) => {
          if (!prev.length) return prev;
          const idx = prev.findIndex((m: any) => {
            const sig = m?._sig;
            if (!sig) return false;
            if (msgType === "msg")
              return sig.t === "msg" && sig.content === content;
            if (msgType === "gif")
              return (
                sig.t === "gif" &&
                sig.gif === gif &&
                String(sig.caption || "") === String(content || "")
              );
            if (msgType === "media")
              return (
                sig.t === "media" &&
                String(sig.caption || "") === String(content || "")
              );
            return false;
          });
          if (idx < 0) return prev;
          const next = [...prev];
          next.splice(idx, 1);
          return next;
        });
      } catch {}
    };
    const onJobMessage = (payload: any) => {
      try {
        const message = payload?.message || payload;
        const cId = String(message?.conversation || payload?.dmId || "");
        if (!cId || (convId && String(cId) !== String(convId))) return;
        // Prefer matching by caption/content when available
        const content = message?.content || payload?.content || "";
        setPending((prev) => {
          if (!prev.length) return prev;
          let idx = prev.findIndex(
            (m: any) =>
              m?._sig?.t === "media" &&
              String(m?._sig?.caption || "") === String(content || "")
          );
          if (idx < 0) {
            // Fallback: remove the most recent media optimistic
            idx = prev.findIndex((m: any) => m?._sig?.t === "media");
          }
          if (idx < 0) return prev;
          const next = [...prev];
          next.splice(idx, 1);
          return next;
        });
      } catch {}
    };
    try {
      ws.on(DMSocketEvent.SendMessage, onServerMessage);
    } catch {}
    try {
      ws.on(DMSocketEvent.JobMessageId, onJobMessage);
    } catch {}
    return () => {
      try {
        ws.off(DMSocketEvent.SendMessage, onServerMessage);
      } catch {}
      try {
        ws.off(DMSocketEvent.JobMessageId, onJobMessage);
      } catch {}
    };
  }, [ws, convId, user]);

  const title =
    route?.params?.title ||
    (target
      ? target.username ||
        (target as any).displayName ||
        truncateAddress(target.address || "")
      : "Chat");
  const pendingSorted = useMemo(() => {
    return [...pending].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [pending]);

  const combinedList = useMemo(() => {
    const merged = [...pendingSorted, ...list];
    return merged.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [list, pendingSorted]);

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
    [
      menuVisible,
      closeMenu,
      onViewProfile,
      iBlockedThem,
      onBlockUser,
      onUnblockUser,
    ]
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
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
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
            inverted={inverted}
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
                  <MessageBubble
                    msg={item as any}
                    isMe={isMine}
                    onOpenVideo={(uri) => setSelectedVideoUri(uri)}
                  />
                </View>
              );
            }}
            contentContainerStyle={{ paddingVertical: 8 }}
            keyboardShouldPersistTaps="handled"
            onScroll={onScroll}
            scrollEventThrottle={16}
            // Keep newest in view only if already at bottom
            onContentSizeChange={onContentSizeChange}
          />
          {showJumpButton && !dmDisabled ? (
            <View className="absolute right-4 bottom-24">
              <TouchableOpacity
                onPress={onPressJumpToBottom}
                activeOpacity={0.8}
                className="bg-theme-neutrals-700/90 rounded-full px-3 py-2 flex-row items-center"
              >
                <Text className="text-theme-neutrals-100 text-sm">↓ New</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {dmDisabled ? (
            <View className="px-4 py-2 bg-theme-neutrals-800">
              <Text className="text-theme-neutrals-300 text-xs">
                {dmReason ||
                  "This account is not accepting messages right now."}
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
              onSendGif={onSendGif}
              onSendImage={onSendImage}
              onSendVideo={onSendVideo}
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
          {/* Shared full-screen video player */}
          <FullScreenVideoPlayer
            visible={!!selectedVideoUri}
            uri={selectedVideoUri}
            onClose={() => setSelectedVideoUri(null)}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

export default ChatScreen;
