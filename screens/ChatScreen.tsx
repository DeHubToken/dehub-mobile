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
  Platform,
  Keyboard,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useNavigation } from "@react-navigation/native";
import Icon from "../components/ui/Icon";

import ScreenHeader from "../components/ScreenHeader";
import CallButton from "../components/Call/CallButton";
import MessageBubble from "../components/DM/MessageBubble";
import ChatInputBar, {
  type ChatMediaAttachment,
} from "../components/DM/ChatInputBar";
import type { SmartReplyTurn } from "../services/ai.service";
import MessageContextMenu, {
  type MessageLayout,
} from "../components/DM/MessageContextMenu";
import ForwardPickerModal from "../components/DM/ForwardPickerModal";
import DmFeeBanner from "../components/DM/DmFeeBanner";
import NewChatIntro from "../components/DM/NewChatIntro";
import TipAmountSheet from "../components/DM/TipAmountSheet";
import PollCard from "../components/DM/PollCard";
import CreatePollSheet from "../components/DM/CreatePollSheet";
import FullScreenVideoPlayer from "../components/common/FullScreenVideoPlayer";
import { useVoiceRecorder, VoiceNoteRecordingOverlay } from "../components/Comments/VoiceNoteRecorder";
import type { VoiceNoteResult } from "../components/Comments/VoiceNoteRecorder";
import Avatar from "../components/common/Avatar";
import ChatHeaderMenuButton from "../components/Chat/ChatHeaderMenuButton";
import ChatMenu from "../components/Chat/ChatMenu";
import ConfirmBlockModal from "../components/common/ConfirmBlockModal";
import PinnedMessageBanner from "../components/DM/PinnedMessageBanner";

import { useUser, useAuthState, useAuthActions } from "../context/AuthContext";
import type { User } from "../context/AuthContext";
import { useWebSocket } from "../context/WebSocketContext";
import { useGateToHome } from "../hooks/useGateToHome";
import { useUserProfileSheet } from "../context/UserProfileSheetContext";
import {
  useWeb3Provider,
  useERC20Contract,
  useStreamControllerContract,
} from "../hooks/use-web3";
import { writeContractAA } from "../libs/aa.write";
import * as ethersImport from "ethers";
import { supportedTokens } from "../config/constants";
import { STREAM_CONTROLLER_CONTRACT_ADDRESSES } from "../config/web3.constants";

import { DMSocketEvent } from "../services/enums/dm-socket-events.enum";
import type {
  DmMessage,
  DmConversation,
  DmUser,
  DmFee,
  ID,
  OptimisticMessage,
  EditMessageResponse,
  DeleteMessageResponse,
  ReadReceiptResponse,
  DownloadReceiptResponse,
  FeeConfirmedPayload,
} from "../services/dm/dm.types";
import {
  getMessages,
  getDmUserStatus,
  addFreeAccess,
  removeFreeAccess,
  bulkDeleteMessages,
  type DmUserStatus,
} from "../services/dm/dm.api";
import {
  dmActions,
  dmState,
  useDmMessages,
  useDmContacts,
  useOptimisticMessages,
  getPeerPolicy,
} from "../store/dm.store";
import { dmSendQueue } from "../services/dm/dm.send";
import { getAccount, isFollowing as checkIsFollowing } from "../services/user.service";
import { blockUser, unblockUser } from "../services/block.service";
import { truncateAddress } from "../libs/strings.util";
import { getAvatarUrl } from "../libs/misc";
import { toastError, toastInfo, toastSuccess, toastWarning } from "../libs/toast";
import { useKeyboard } from "../hooks/useKeyboard";
import { createLogger } from "../libs/logger";
import { useDmPin } from "../hooks/useDmPin";
import { useCall } from "../context/CallContext";

/** Safely extract a plain string ID from either a raw string or a populated Mongoose document. */
function resolveConvId(...vals: unknown[]): string {
  for (const v of vals) {
    if (!v) continue;
    if (typeof v === 'string') return v;
    if (typeof v === 'object' && (v as any)._id) return String((v as any)._id);
  }
  return '';
}

export type ChatScreenProps = {
  route: {
    params?: {
      conversationId?: ID;
      targetAddress?: string;
      targetUser?: Partial<User>;
      title?: string;
      /** Pre-filled text for the message input (e.g. shared post URL) */
      sharedText?: string;
    };
  };
};


const PAGE_SIZE = 30;
const log = createLogger("ChatScreen");


const ChatScreen: React.FC<ChatScreenProps> = ({ route }) => {
  const navigation = useNavigation<any>();
  const user = useUser();
  const { isSignedIn, needsUsername } = useAuthState();
  const { patchUser } = useAuthActions();
  const allow = isSignedIn && !needsUsername;
  useGateToHome(allow);

  const ws = useWebSocket();
  const { showUserProfile } = useUserProfileSheet();
  const insets = useSafeAreaInsets();
  const { height: kbHeight, isVisible: kbVisible } = useKeyboard();

  const { provider, account, chainId } = useWeb3Provider();
  const ethers = useMemo(() => (ethersImport as any).ethers || ethersImport, []);
  const tokenMeta = useMemo(
    () => chainId ? supportedTokens.find((t) => t.chainId === chainId && t.symbol === "DHB") : undefined,
    [chainId],
  );
  const tokenAddress = tokenMeta?.address;
  const controllerAddress = useMemo(
    () => (chainId ? (STREAM_CONTROLLER_CONTRACT_ADDRESSES as Record<number, string>)[chainId] : undefined),
    [chainId],
  );
  const tokenContract = useERC20Contract(tokenAddress);
  const controllerContract = useStreamControllerContract();

  // With edge-to-edge enabled (Expo 54 / targetSdk 35) Android ignores
  // adjustResize — the window no longer shrinks when the keyboard opens —
  // so lift manually on both platforms (same as AIChatScreen/CommentsBottomSheet).
  const inputLift = kbVisible ? kbHeight : 0;
  const [inputBarHeight, setInputBarHeight] = useState(60);
  const listBottomPadding = inputBarHeight + inputLift;

  const convId = route?.params?.conversationId as ID | undefined;
  const targetAddress = route?.params?.targetAddress;

  const address = useMemo(
    () => ((user as any)?.walletAddress || (user as any)?.address || "").toLowerCase(),
    [user],
  );
  const userId = ((user as any)?._id || (user as any)?.id) as string | undefined;
  const { setCallMessageHandler } = useCall();

  const storeMessages = useDmMessages(convId || "");
  const conversations = useDmContacts();

  const [target, setTarget] = useState<(Partial<User> & { _id?: string }) | null>(
    (route?.params?.targetUser as any) || null,
  );
  const [dmDisabled, setDmDisabled] = useState(false);
  const [dmReason, setDmReason] = useState<string | null>(null);
  const [dmFee, setDmFee] = useState<DmFee | null>(null);
  const [creating, setCreating] = useState(false);
  const createdConvIdRef = useRef<ID | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialLoading, setInitialLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [remoteTyping, setRemoteTyping] = useState(false);

  // Context menu
  const [contextMessage, setContextMessage] = useState<DmMessage | null>(null);
  const [contextLayout, setContextLayout] = useState<MessageLayout | null>(null);
  const [contextIsMine, setContextIsMine] = useState(false);

  // Reply / edit
  const [replyTo, setReplyTo] = useState<DmMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<DmMessage | null>(null);

  // Forward
  const [forwardVisible, setForwardVisible] = useState(false);
  const [forwardMessage, setForwardMessage] = useState<DmMessage | null>(null);

  // Menu / block
  const [menuVisible, setMenuVisible] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmMode, setConfirmMode] = useState<"block" | "unblock">("block");
  const [blockLoading, setBlockLoading] = useState(false);

  // Video
  const [videoUri, setVideoUri] = useState<string | null>(null);

  // Tip
  const [tipAmount, setTipAmount] = useState(0);
  const [tipSheetVisible, setTipSheetVisible] = useState(false);

  // Poll
  const [pollSheetVisible, setPollSheetVisible] = useState(false);

  // Sending state — true while any job in the queue targets this conversation
  // (We keep this simple: the queue processes serially, so any active job = sending)
  const sending = false; // Queue handles async; no component-level sending state needed

  // Peer DM status (fetched for new chats to show intro)
  const [peerDmStatus, setPeerDmStatus] = useState<DmUserStatus | null>(null);

  // Current user's own DM status (for creator features like free access)
  const [myDmStatus, setMyDmStatus] = useState<DmUserStatus | null>(null);

  // Scroll
  const listRef = useRef<FlatList<DmMessage> | null>(null);
  const isAtBottomRef = useRef(true);
  const [showJumpBtn, setShowJumpBtn] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);


  const currentConvId = convId || createdConvIdRef.current;

  const currentConversation = useMemo(
    () => conversations.find((c) => c._id === currentConvId) ?? null,
    [conversations, currentConvId],
  );

  // Message pinning
  const { pinnedMessageId, pinMessage, unpinMessage } = useDmPin(
    currentConvId || undefined,
    address || undefined,
    currentConversation,
  );

  const handlePinMessage = useCallback(() => {
    if (contextMessage) pinMessage(contextMessage._id);
  }, [contextMessage, pinMessage]);

  const handleUnpinMessage = useCallback(() => {
    unpinMessage();
  }, [unpinMessage]);

  // DHB balance for display & validation in fee / tip UI
  const dhbBalance = useMemo(
    () => (user as any)?.tokenBalances?.DHB ?? null,
    [user],
  );

  // Optimistic messages (global store — survives navigation)
  const optimisticMsgs = useOptimisticMessages(currentConvId || "temp");

  const peer = useMemo(() => {
    const addr = (
      targetAddress ||
      (target as any)?.address ||
      (target as any)?.walletAddress ||
      ""
    ).toLowerCase();
    const displayName =
      (target as any)?.displayName || undefined;
    const username =
      (target as any)?.username || undefined;
    const avatarRaw = (target as any)?.avatarImageUrl || undefined;
    if (!currentConvId) return { address: addr, displayName, username, avatarImageUrl: avatarRaw };
    const c = conversations.find((x) => x._id === currentConvId);
    const other = c?.participants?.find(
      (p) =>
        p.participant &&
        String(p.participant._id) !== String(userId) &&
        String(p.participant.address || "").toLowerCase() !== address,
    )?.participant;
    return {
      address: String(other?.address || addr || ""),
      displayName: String(other?.displayName || displayName || ""),
      username: String(other?.username || username || ""),
      avatarImageUrl: other?.avatarImageUrl || avatarRaw,
    };
  }, [currentConvId, conversations, target, targetAddress, userId, address]);

  const peerLabel = useMemo(
    () => peer.displayName || peer.username || truncateAddress(peer.address) || "user",
    [peer],
  );

  const iBlockedThem = useMemo(() => !!(target as any)?.youBlocked, [target]);

  const title =
    route?.params?.title ||
    peer.displayName ||
    peer.username ||
    (peer.address ? truncateAddress(peer.address) : "Chat");

  // Build the combined list: optimistic + store (newest first for inverted FlatList)
  const messageList = useMemo(() => {
    const base = [...storeMessages].reverse(); // store is asc → flip to desc
    // Filter out any optimistic messages that the server has already confirmed
    const stillPending = optimisticMsgs.filter(
      (p) =>
        !base.some(
          (m) =>
            m._id === p._tempId ||
            (m.content === p.content &&
              m.author === "me" &&
              Math.abs(+new Date(m.createdAt) - +new Date(p.createdAt)) < 5000),
        ),
    );
    return [...(stillPending as DmMessage[]), ...base];
  }, [storeMessages, optimisticMsgs]);

  // Depends on messageList — must be declared after it
  const pinnedMessage = useMemo(
    () => (pinnedMessageId ? messageList.find((m) => m._id === pinnedMessageId) ?? null : null),
    [pinnedMessageId, messageList],
  );

  const isMine = useCallback(
    (msg: DmMessage): boolean => {
      if (msg.author === "me") return true;
      if (msg.author === "other") return false;
      const senderId =
        typeof msg.sender === "object" ? msg.sender?._id : msg.sender;
      if (userId && String(senderId) === String(userId)) return true;
      const senderAddr =
        typeof msg.sender === "object"
          ? (msg.sender?.address || "").toLowerCase()
          : "";
      if (address && senderAddr === address) return true;
      return false;
    },
    [userId, address],
  );

  /**
   * Tail of the thread handed to the reply drafter, oldest first. Text only —
   * an image or voice note carries nothing the model can reply to.
   *
   * messageList is newest-first for the inverted FlatList, so this takes the
   * head and flips it; slicing the tail would hand over the OLDEST twelve
   * messages in the conversation.
   */
  const smartReplyThread = useMemo<SmartReplyTurn[]>(
    () =>
      messageList
        .filter((m) => (m.msgType ?? "msg") === "msg" && !!m.content?.trim())
        .slice(0, 12)
        .reverse()
        .map((m) => {
          const mine = isMine(m);
          return {
            from: mine ? ("me" as const) : ("them" as const),
            name: mine ? undefined : peerLabel,
            text: m.content!.trim(),
          };
        }),
    [messageList, isMine, peerLabel],
  );


  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      try {
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
      } catch {}
    });
  }, []);

  const onScroll = useCallback((e: any) => {
    const { contentOffset } = e.nativeEvent || {};
    const atBottom = (contentOffset?.y || 0) <= 40;
    isAtBottomRef.current = atBottom;
    setShowJumpBtn(!atBottom);
  }, []);

  const highlightAndScroll = useCallback(
    (messageId: string) => {
      const idx = messageList.findIndex((m) => m._id === messageId);
      if (idx < 0) return;
      setHighlightedId(null);
      listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.3 });
      setTimeout(() => {
        setHighlightedId(messageId);
        setTimeout(() => setHighlightedId(null), 4000);
      }, 300);
    },
    [messageList],
  );

  // Depends on highlightAndScroll — must be declared after it
  const scrollToPinnedMessage = useCallback(() => {
    if (pinnedMessage) {
      highlightAndScroll(pinnedMessage._id);
    }
  }, [pinnedMessage, highlightAndScroll]);

  const handleReplyPress = useCallback(
    (messageId: string) => {
      highlightAndScroll(messageId);
    },
    [highlightAndScroll],
  );

  const onContentSizeChange = useCallback(() => {
    if (isAtBottomRef.current) scrollToBottom();
  }, [scrollToBottom]);


  useEffect(() => {
    const show = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hide = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const onKb = () => {
      if (isAtBottomRef.current) scrollToBottom();
    };
    const s1 = Keyboard.addListener(show as any, onKb);
    const s2 = Keyboard.addListener(hide as any, onKb);
    return () => {
      s1.remove();
      s2.remove();
    };
  }, [scrollToBottom]);


  useEffect(() => {
    const t = setTimeout(scrollToBottom, 150);
    return () => clearTimeout(t);
  }, [currentConvId, scrollToBottom]);


  const computeBlockDmState = useCallback(
    (acct: any): { disabled: boolean; reason: string | null } => {
      if (!!(acct?.youBlocked) && !!(acct?.blockedYou))
        return { disabled: true, reason: "You've blocked this user and they've blocked you." };
      if (!!(acct?.blockedYou))
        return { disabled: true, reason: "This user has blocked you." };
      if (!!(acct?.youBlocked))
        return { disabled: true, reason: "You've blocked this user." };
      if (!!(acct?.isBlocked))
        return { disabled: true, reason: "Messaging is restricted due to a block." };
      if (Boolean(acct?.blocklist?.adminBlocked))
        return { disabled: true, reason: "This account has been blocked." };
      return { disabled: false, reason: null };
    },
    [],
  );


  useEffect(() => {
    let cancelled = false;
    const addr = (peer.address || "").toLowerCase();
    if (!addr) return;

    // Prime from cache
    const cached = getPeerPolicy(addr);
    if (cached) {
      setDmDisabled(!!cached.disabled);
      setDmReason(cached.reason || null);
      if (cached.dmFee) {
        setDmFee(cached.dmFee);
      }
    }

    (async () => {
      try {
        const res: any = await getAccount(addr);
        const acct: any = res?.data?.result || res?.result;
        if (cancelled || !acct) return;
        setTarget(acct);
        const blockState = computeBlockDmState(acct);
        if (blockState.disabled) {
          setDmDisabled(true);
          setDmReason(blockState.reason);
          dmActions.setPeerPolicy(addr, { disabled: true, reason: blockState.reason, status: "BLOCKLIST" });
        } else {
          const disables = acct.dmSettings?.disables || [];
          if (disables.includes("ALL")) {
            setDmDisabled(true);
            setDmReason("This account has disabled all DMs");
            dmActions.setPeerPolicy(addr, { disabled: true, reason: "This account has disabled all DMs", status: "ALL" });
          } else if (disables.includes("NEW_DM") && !currentConvId) {
            setDmDisabled(true);
            setDmReason("This account doesn't accept new DMs");
            dmActions.setPeerPolicy(addr, { disabled: true, reason: "This account doesn't accept new DMs", status: "NEW_DM" });
          } else {
            setDmDisabled(false);
            setDmReason(null);
            dmActions.setPeerPolicy(addr, { disabled: false, reason: null, status: "ACTIVE_ALL" });
          }
        }

        // Private account check — can't DM without following
        if (acct.isPrivate && !blockState.disabled) {
          try {
            const followResult = await checkIsFollowing(addr);
            if (!cancelled && !followResult.isFollowing) {
              setDmDisabled(true);
              const reason = followResult.isFollowRequestPending
                ? "This is a private account. Your follow request is pending."
                : "This is a private account. Follow them to send messages.";
              setDmReason(reason);
            }
          } catch {
            /* ignore — allow messaging if check fails */
          }
        }
      } catch {
        /* ignore */
      }

      // Also fetch DM user status for fee info (especially for new chats)
      try {
        const rawStatus = await getDmUserStatus(addr);
        // The API may wrap the response — handle both shapes
        const status: DmUserStatus | undefined =
          (rawStatus as any)?.data ?? (rawStatus as any)?.result ?? rawStatus;
        if (!cancelled && status) {
          setPeerDmStatus(status);
          // Always derive fee from server status (authoritative source)
          if (status.perMessageFee && status.perMessageFee > 0) {
            const hasFree =
              Array.isArray(status.freeAccessUsers) &&
              status.freeAccessUsers.some(
                (a: string) => a.toLowerCase() === address,
              );
            const newFee: DmFee = {
              required: !hasFree,
              fee: status.perMessageFee,
              hasFreeAccess: hasFree,
            };
            setDmFee(newFee);
          } else if (status.perMessageFee === 0 || !status.perMessageFee) {
            // Peer has no fee — ensure we clear any stale fee
            setDmFee(null);
          }
        }
      } catch (feeErr) {
        log.error("getDmUserStatus error:", feeErr);
      }
    })();
    return () => { cancelled = true; };
  }, [peer.address, currentConvId, computeBlockDmState]);


  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    getDmUserStatus(address)
      .then((status) => {
        if (!cancelled && status) setMyDmStatus(status);
      })
      .catch(() => { /* non-critical */ });
    return () => { cancelled = true; };
  }, [address]);


  useEffect(() => {
    if (!currentConvId || !address) return;
    setInitialLoading(true);
    getMessages(currentConvId, { address, limit: PAGE_SIZE })
      .then((resp) => {
        const msgs = resp?.messages || [];
        if (msgs.length) {
          const normalized = msgs.map((m: any) => normalizeAuthor(m));
          const mineFromServer = normalized.filter((m: any) => m.author === "me");
          log.info("[TICK_DEBUG] initial fetch — my messages isRead states:", mineFromServer.map((m: any) => ({
            msgId: m._id,
            content: m.content?.slice(0, 30),
            isRead: m.isRead,
          })));
          dmActions.upsertMessages(currentConvId, normalized);
        }
        if (msgs.length < PAGE_SIZE) setHasMore(false);
        if (userId) dmActions.markAllRead(currentConvId, userId);
      })
      .catch((e) => log.error("fetch initial messages", e))
      .finally(() => setInitialLoading(false));
  }, [currentConvId, address]);


  const loadMore = useCallback(async () => {
    if (!currentConvId || !address || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const resp = await getMessages(currentConvId, {
        address,
        skip: storeMessages.length,
        limit: PAGE_SIZE,
      });
      const msgs = resp?.messages || [];
      if (msgs.length) {
        dmActions.upsertMessages(
          currentConvId,
          msgs.map((m: any) => normalizeAuthor(m)),
        );
      }
      if (msgs.length < PAGE_SIZE) setHasMore(false);
    } catch (e) {
      log.error("loadMore", e);
    } finally {
      setLoadingMore(false);
    }
  }, [currentConvId, address, storeMessages.length, loadingMore, hasMore]);

  // Re-emit whenever new messages arrive so the other user gets read receipts
  // even for messages sent while we're already viewing the conversation.
  const lastMsgId = useMemo(
    () => storeMessages.length ? storeMessages[storeMessages.length - 1]?._id : null,
    [storeMessages],
  );

  useEffect(() => {
    if (!currentConvId || !userId) return;
    log.info("[MARK_AS_READ] emitting markAsRead", { dmId: currentConvId, userId, lastMsgId });
    ws.emitAuthed(DMSocketEvent.markAsRead, { dmId: currentConvId });
    dmActions.markAllRead(currentConvId, userId);
  }, [currentConvId, userId, ws, lastMsgId]);


  useEffect(() => {
    const unsubs: Array<() => void> = [];

    // Typing indicator
    unsubs.push(
      ws.on(DMSocketEvent.Typing, (p: any) => {
        const cId = resolveConvId(p?.dmId, p?.conversation);
        if (cId !== currentConvId) return;
        const fromId = String(p?.userId || p?.sender || "");
        if (fromId === userId) return;
        setRemoteTyping(true);
      }),
    );
    unsubs.push(
      ws.on(DMSocketEvent.StopTyping, (p: any) => {
        const cId = resolveConvId(p?.dmId, p?.conversation);
        if (cId !== currentConvId) return;
        setRemoteTyping(false);
      }),
    );

    // Edit
    unsubs.push(
      ws.on(DMSocketEvent.EditMessage, (payload: EditMessageResponse) => {
        if (payload.dmId === currentConvId) {
          dmActions.applyEdit(payload);
        }
      }),
    );

    // Delete
    unsubs.push(
      ws.on(DMSocketEvent.DeleteMessage, (payload: DeleteMessageResponse) => {
        if (payload.dmId === currentConvId) {
          dmActions.removeMessage(payload);
        }
      }),
    );

    // Read receipt — ignore self-receipts (our own markAsRead echoed back)
    unsubs.push(
      ws.on(DMSocketEvent.readReceipt, (payload: ReadReceiptResponse) => {
        log.info("[READ_RECEIPT] received", {
          dmId: payload.dmId,
          readBy: payload.readBy,
          currentUserId: userId,
          isSelf: String(payload.readBy) === String(userId),
          matchesConvId: payload.dmId === currentConvId,
        });
        if (payload.dmId === currentConvId && String(payload.readBy) !== String(userId)) {
          log.info("[READ_RECEIPT] applying — peer read our messages");
          dmActions.applyReadReceipt(payload);
        }
      }),
    );

    // Download receipt
    unsubs.push(
      ws.on(DMSocketEvent.downloadReceipt, (payload: DownloadReceiptResponse) => {
        if (payload.dmId === currentConvId) {
          dmActions.applyDownloadReceipt(payload);
        }
      }),
    );

    // DM fee payment
    unsubs.push(
      ws.on(DMSocketEvent.DmFeePayment, (p: any) => {
        log.info("DmFeePayment", p);
      }),
    );

    // Fee / tip confirmed on-chain — update optimistic message status
    unsubs.push(
      ws.on(DMSocketEvent.FeeConfirmed, (data: FeeConfirmedPayload) => {
        log.debug("feeConfirmed:", data);
        if (data?.conversationId && data?.messageId) {
          dmActions.applyFeeConfirmed(
            data.conversationId,
            data.messageId,
            data.amount,
          );
        }
      }),
    );

    // Error
    unsubs.push(
      ws.on(DMSocketEvent.Error, (err: any) => {
        const msg: string = err?.msg || "Message failed";
        if (/disturb|dnd|can't receive|disabled/i.test(msg)) {
          setDmDisabled(true);
          setDmReason(msg);
          toastWarning(msg);
        } else if (
          err?.code === "DM_FEE_REQUIRED" &&
          /not yet confirmed/i.test(msg)
        ) {
          // Suppress toast — the send queue handles retries automatically
        } else {
          toastError(msg);
        }
      }),
    );

    return () => unsubs.forEach((u) => { try { u(); } catch {} });
  }, [ws, currentConvId, userId]);

  // Auto-clear typing after 5s silence
  useEffect(() => {
    if (!remoteTyping) return;
    const t = setTimeout(() => setRemoteTyping(false), 5000);
    return () => clearTimeout(t);
  }, [remoteTyping]);


  const normalizeAuthor = useCallback(
    (m: any): DmMessage => {
      if (m.author === "me" || m.author === "other") return m;
      const senderId = String(m?.sender?._id || m?.sender || "");
      const senderAddr = String(m?.sender?.address || "").toLowerCase();
      const mine =
        (userId && senderId === userId) ||
        (address && senderAddr === address);
      return { ...m, author: mine ? "me" : "other" };
    },
    [userId, address],
  );


  const ensureConversation = useCallback(async (): Promise<ID> => {
    if (currentConvId) return currentConvId;
    // Resolve target account
    let acct = target;
    if (!acct?._id && targetAddress) {
      const res: any = await getAccount(targetAddress);
      acct = res?.data?.result || res?.result;
      if (acct) setTarget(acct);
    }
    if (!acct?._id) throw new Error("Cannot identify recipient");

    if (creating) {
      await new Promise((r) => setTimeout(r, 300));
      if (createdConvIdRef.current) return createdConvIdRef.current;
    }
    setCreating(true);

    const newId: ID = await new Promise<ID>((resolve, reject) => {
      const handleOk = (resp: any) => {
        try {
          const data = resp?.data || resp;
          const id = String(data?._id || data?.id || "");
          if (!id) throw new Error("Invalid response");
          dmActions.upsertContacts([data as DmConversation]);
          createdConvIdRef.current = id;
          navigation.setParams({ conversationId: id } as any);
          // Extract DM fee
          if (data?.dmFee) {
            setDmFee(data.dmFee);
          }
          resolve(id);
        } catch (e) {
          reject(e);
        } finally {
          ws.off(DMSocketEvent.CreateAndStart, handleOk);
          ws.off(DMSocketEvent.Error, handleErr);
        }
      };
      const handleErr = (err: any) => {
        try {
          reject(new Error(err?.msg || "Unable to start DM"));
        } finally {
          ws.off(DMSocketEvent.CreateAndStart, handleOk);
          ws.off(DMSocketEvent.Error, handleErr);
        }
      };
      ws.on(DMSocketEvent.CreateAndStart, handleOk);
      ws.on(DMSocketEvent.Error, handleErr);
      ws.emitAuthed(DMSocketEvent.CreateAndStart, { _id: acct!._id });
    }).finally(() => setCreating(false));

    return newId;
  }, [currentConvId, creating, target, targetAddress, ws, navigation]);


  const payDmFee = useCallback(
    async (feeAmount: number): Promise<string> => {
      if (
        !provider || !account || !chainId ||
        !tokenContract || !controllerContract ||
        !tokenMeta || !tokenAddress || !controllerAddress
      ) {
        throw new Error("Wallet not connected. Please connect your wallet first.");
      }

      const amountBN = ethers.utils.parseUnits(
        String(feeAmount),
        tokenMeta.decimals || 18,
      );

      // Check balance
      const balance = await tokenContract.balanceOf(account);
      if (ethers.BigNumber.from(balance).lt(amountBN)) {
        throw new Error(`Insufficient DHB balance. Need ${feeAmount} DHB.`);
      }

      // Approve if needed
      const currentAllowance = await tokenContract.allowance(account, controllerAddress);
      if (ethers.BigNumber.from(currentAllowance).lt(amountBN)) {
        const userBal = await tokenContract.balanceOf(account);
        const approveAmount = userBal.gte(amountBN) ? userBal : amountBN;
        await writeContractAA(tokenContract, "approve", [controllerAddress, approveAmount], {
          context: "approve",
        });
      }

      // Execute sendTip(tokenId=0, amount, toAddress, tokenAddress)
      // Per docs: submit tx and return the hash immediately — do NOT wait for
      // on-chain confirmation. The server creates a pending record and the
      // Alchemy webhook confirms it automatically.
      const peerAddr = peer.address;
      if (!peerAddr) throw new Error("Recipient address unknown");
      const res = await writeContractAA(
        controllerContract,
        "sendTip",
        [0, amountBN, peerAddr, tokenAddress],
        { context: "dm-fee" },
      );
      const txHash = res.hash;
      if (!txHash) throw new Error("Transaction submitted but no hash returned");

      // Optimistically update local DHB balance
      try {
        await patchUser((prev) => ({
          tokenBalances: {
            ...(prev.tokenBalances || {}),
            DHB: Math.max(0, Number((prev.tokenBalances as any)?.DHB || 0) - feeAmount),
          },
        } as any));
      } catch { /* non-critical */ }

      return txHash;
    },
    [provider, account, chainId, tokenContract, controllerContract, tokenMeta, tokenAddress, controllerAddress, ethers, peer.address, patchUser],
  );

  // The queue is a module-level singleton that runs outside React lifecycle.
  // We inject ws, feePayer, and conversationResolver here so the queue
  // can use them even after this screen unmounts.

  useEffect(() => {
    dmSendQueue.init(ws);
  }, [ws]);

  useEffect(() => {
    dmSendQueue.setFeePayer(payDmFee);
    return () => { dmSendQueue.setFeePayer(null); };
  }, [payDmFee]);

  useEffect(() => {
    dmSendQueue.setConversationResolver(ensureConversation);
    return () => { dmSendQueue.setConversationResolver(null); };
  }, [ensureConversation]);

  // Register call message handler so call events appear as bubbles in this chat
  useEffect(() => {
    setCallMessageHandler((content) => {
      dmSendQueue.sendText({
        conversationId: currentConvId || "temp",
        userId: userId || "me",
        address,
        content,
      });
    });
    return () => setCallMessageHandler(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setCallMessageHandler, currentConvId, userId, address]);


  /** Dispatch a standalone tip (msgType: 'tip') — only used when user sends
   *  a tip with NO content attached (no text, no gif, no media). */
  const dispatchStandaloneTip = useCallback(() => {
    if (tipAmount <= 0) return;
    dmSendQueue.sendTip({
      conversationId: currentConvId || "temp",
      userId: userId || "me",
      address,
      tipAmount,
      dmFee,
    });
  }, [tipAmount, currentConvId, userId, address, dmFee]);

  const onSendText = useCallback(
    (text: string) => {
      const content = text.trim();

      // Allow tip-only sends (no text content) — dispatched as standalone tip
      if (!content && tipAmount <= 0) return;
      if (dmDisabled) {
        toastWarning(dmReason || "Can't send messages right now");
        return;
      }

      // Editing is still handled inline (not queued)
      if (editingMessage) {
        (async () => {
          try {
            const cId = await ensureConversation();
            ws.emitAuthed(DMSocketEvent.EditMessage, {
              dmId: cId,
              messageId: editingMessage._id,
              content,
            });
            dmActions.applyEdit({
              dmId: cId,
              messageId: editingMessage._id,
              content,
              isEdited: true,
              editedAt: new Date().toISOString(),
              author: "me",
            });
            setEditingMessage(null);
          } catch (e) {
            toastError(e, "Failed to edit");
          }
        })();
        return;
      }

      if (content) {
        // Text message — attach tipAmount so the queue pays tip on-chain
        // and includes tipTxHash in the sendMessage event
        dmSendQueue.sendText({
          conversationId: currentConvId || "temp",
          userId: userId || "me",
          address,
          content,
          replyTo,
          dmFee,
          tipAmount: tipAmount > 0 ? tipAmount : undefined,
        });
      } else {
        // No content but tipAmount > 0 — standalone tip (msgType: 'tip')
        dispatchStandaloneTip();
      }

      scrollToBottom();
      setReplyTo(null);
      setTipAmount(0);
    },
    [dmDisabled, dmReason, dmFee, editingMessage, currentConvId, userId, address, ensureConversation, ws, scrollToBottom, replyTo, tipAmount, dispatchStandaloneTip],
  );

  const onSendGif = useCallback(
    (gifUrl: string, caption?: string) => {
      if (!gifUrl || dmDisabled) {
        toastWarning(dmReason || "Can't send right now");
        return;
      }

      dmSendQueue.sendGif({
        conversationId: currentConvId || "temp",
        userId: userId || "me",
        address,
        gifUrl,
        caption: caption?.trim(),
        replyTo,
        dmFee,
        tipAmount: tipAmount > 0 ? tipAmount : undefined,
      });

      scrollToBottom();
      setReplyTo(null);
      setTipAmount(0);
    },
    [dmDisabled, dmReason, dmFee, currentConvId, userId, address, scrollToBottom, replyTo, tipAmount],
  );

  const onSendMedia = useCallback(
    (attachment: ChatMediaAttachment, caption?: string) => {
      if (!attachment.uri || !user || dmDisabled) {
        toastWarning(dmReason || "Can't send right now");
        return;
      }

      dmSendQueue.sendMedia({
        conversationId: currentConvId || "temp",
        userId: userId || "me",
        address,
        uri: attachment.uri,
        thumbnailUri: attachment.thumbnailUri,
        mediaType:
          attachment.type === "video" ? "video" : attachment.type === "file" ? "file" : "image",
        mimeType: attachment.mimeType,
        fileName: attachment.name,
        fileSize: attachment.size,
        caption: caption?.trim(),
        replyTo,
        dmFee,
        tipAmount: tipAmount > 0 ? tipAmount : undefined,
      });

      scrollToBottom();
      setReplyTo(null);
      setTipAmount(0);
    },
    [user, address, dmDisabled, dmReason, dmFee, currentConvId, userId, scrollToBottom, replyTo, tipAmount],
  );

  const handleVoiceComplete = useCallback(
    (result: VoiceNoteResult) => {
      if (!user || dmDisabled || !result.uri) return;
      dmSendQueue.sendMedia({
        conversationId: currentConvId || "temp",
        userId: userId || "me",
        address,
        uri: result.uri,
        mediaType: "image",
        mimeType: result.mimeType,
        msgType: "voice",
        voiceDuration: Math.round(result.durationMs / 1000),
        replyTo,
        dmFee,
      });
      scrollToBottom();
      setReplyTo(null);
    },
    [user, dmDisabled, currentConvId, userId, address, replyTo, dmFee, scrollToBottom],
  );

  const handleVoiceCancel = useCallback(() => {}, []);

  const voiceRecorder = useVoiceRecorder({
    onRecordingComplete: handleVoiceComplete,
    onCancel: handleVoiceCancel,
  });

  const onStartVoice = useCallback(() => {
    voiceRecorder.startRecording();
  }, [voiceRecorder]);


  const onLongPressMessage = useCallback(
    (message: DmMessage, layout: MessageLayout, mine: boolean) => {
      setContextMessage(message);
      setContextLayout(layout);
      setContextIsMine(mine);
    },
    [],
  );

  const closeContextMenu = useCallback(() => {
    setContextMessage(null);
    setContextLayout(null);
  }, []);

  const handleReply = useCallback(() => {
    if (contextMessage) setReplyTo(contextMessage);
    closeContextMenu();
  }, [contextMessage, closeContextMenu]);

  const handleEdit = useCallback(() => {
    if (contextMessage) setEditingMessage(contextMessage);
    closeContextMenu();
  }, [contextMessage, closeContextMenu]);

  const handleDelete = useCallback(() => {
    if (!contextMessage || !currentConvId) return;
    ws.emitAuthed(DMSocketEvent.DeleteMessage, {
      dmId: currentConvId,
      messageId: contextMessage._id,
    });
    dmActions.removeMessage({ dmId: currentConvId, messageId: contextMessage._id });
    toastSuccess("Message deleted");
    closeContextMenu();
  }, [contextMessage, currentConvId, ws, closeContextMenu]);

  const handleForward = useCallback(() => {
    if (contextMessage) setForwardMessage(contextMessage);
    setForwardVisible(true);
    closeContextMenu();
  }, [contextMessage, closeContextMenu]);

  const onForwardSelect = useCallback(
    (targetConvId: ID) => {
      if (!forwardMessage) return;
      ws.emitAuthed(DMSocketEvent.ForwardMessage, {
        messageId: forwardMessage._id,
        targetDmId: targetConvId,
      });
      toastSuccess("Message forwarded");
      setForwardVisible(false);
      setForwardMessage(null);
    },
    [forwardMessage, ws],
  );


  const onTypingChange = useCallback(
    (isTyping: boolean) => {
      if (!currentConvId) return;
      ws.emitAuthed(
        isTyping ? DMSocketEvent.Typing : DMSocketEvent.StopTyping,
        { dmId: currentConvId },
      );
    },
    [currentConvId, ws],
  );


  useEffect(() => {
    const convId = currentConvId;
    if (!convId) return;
    const onServerMsg = (payload: any) => {
      const cId = resolveConvId(payload?.conversation, payload?.dmId);
      if (cId !== convId) return;
      // The queue already removes optimistic on success.
      // This is a safety net for edge cases (e.g. queue finished
      // but the store wasn't cleaned up — reconcile by content match).
      const list = (dmState as any).optimisticByConversation?.[convId] as OptimisticMessage[] | undefined;
      if (!list?.length) return;
      const content = payload?.content || "";
      const msgType = payload?.msgType || "";
      const match = list.find((p) => {
        if (msgType === "msg") return p.msgType === "msg" && p.content === content;
        if (msgType === "gif") return p.msgType === "gif";
        if (msgType === "media") return p.msgType === "media";
        return false;
      });
      if (match) dmActions.removeOptimistic(convId, match._tempId);
    };
    const onJob = (payload: any) => {
      const raw = payload?.message || payload;
      const cId = resolveConvId(raw?.conversation, payload?.dmId);
      if (cId !== convId) return;
      const list = (dmState as any).optimisticByConversation?.[convId] as OptimisticMessage[] | undefined;
      if (!list?.length) return;
      const match = list.find((p) => p.msgType === "media");
      if (match) dmActions.removeOptimistic(convId, match._tempId);
    };
    const u1 = ws.on(DMSocketEvent.SendMessage, onServerMsg);
    const u2 = ws.on(DMSocketEvent.JobMessageId, onJob);
    return () => {
      try { u1(); } catch {}
      try { u2(); } catch {}
    };
  }, [ws, currentConvId]);


  const openMenu = useCallback(() => setMenuVisible(true), []);
  const closeMenu = useCallback(() => setMenuVisible(false), []);

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


  const onClearChat = useCallback(async () => {
    closeMenu();
    if (!currentConvId || !address) return;
    Alert.alert(
      "Clear messages",
      "Delete all messages in this conversation? This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            try {
              const allIds = storeMessages.map((m) => m._id).filter(Boolean);
              if (allIds.length) {
                await bulkDeleteMessages(currentConvId, allIds, address);
              }
              dmActions.clearMessages(currentConvId);
              // Also clear any in-flight optimistic messages for this conversation
              const optimistic = (dmState as any).optimisticByConversation?.[currentConvId] as OptimisticMessage[] | undefined;
              if (optimistic?.length) {
                for (const m of optimistic) dmActions.removeOptimistic(currentConvId, m._tempId);
              }
              toastSuccess("Messages cleared");
            } catch (e) {
              toastError(e, "Failed to clear messages");
            }
          },
        },
      ],
    );
  }, [currentConvId, address, storeMessages, closeMenu]);

  const onToggleFreeAccess = useCallback(async () => {
    closeMenu();
    const addr = (peer.address || "").toLowerCase();
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
        toastSuccess(`Removed free access for ${peerLabel}`);
      } else {
        await addFreeAccess(addr);
        setMyDmStatus((prev) =>
          prev ? { ...prev, freeAccessUsers: [...(prev.freeAccessUsers || []), addr] } : prev,
        );
        toastSuccess(`Granted free access to ${peerLabel}`);
      }
    } catch (e) {
      toastError(e, "Failed to update free access");
    }
  }, [peer.address, myDmStatus, peerLabel, closeMenu]);

  const onSearchChat = useCallback(() => {
    closeMenu();
    toastInfo("Search coming soon");
  }, [closeMenu]);

  const onConfirmBlock = useCallback(async () => {
    const addr = peer.address;
    if (!addr) return;
    setBlockLoading(true);
    try {
      if (confirmMode === "block") {
        setDmDisabled(true);
        setDmReason("You've blocked this user.");
        await blockUser(addr, "Blocked from chat");
        setTarget((prev: any) => prev ? { ...prev, youBlocked: true } : prev);
        toastSuccess(`Blocked ${peerLabel}`);
      } else {
        setDmDisabled(false);
        setDmReason(null);
        await unblockUser(addr);
        setTarget((prev: any) => prev ? { ...prev, youBlocked: false } : prev);
        toastSuccess(`Unblocked ${peerLabel}`);
      }
    } catch (e) {
      const rollback = computeBlockDmState(target);
      setDmDisabled(rollback.disabled);
      setDmReason(rollback.reason);
      toastError(e, confirmMode === "block" ? "Failed to block" : "Failed to unblock");
    } finally {
      setBlockLoading(false);
      setConfirmVisible(false);
    }
  }, [peer.address, confirmMode, peerLabel, target, computeBlockDmState]);


  const peerAvatarUri = useMemo(() => {
    const url = getAvatarUrl(peer.avatarImageUrl);
    return url && url !== "default-avatar" ? url : undefined;
  }, [peer.avatarImageUrl]);

  const LeftHeader = useMemo(
    () => (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => {
          const id = peer.username || peer.address;
          if (id) showUserProfile(id, { source: "chat-header" });
        }}
      >
        <Avatar uri={peerAvatarUri} size={32} rounded={false} name={peer.displayName || peer.username} />
      </TouchableOpacity>
    ),
    [peerAvatarUri, peer.username, peer.address, showUserProfile, peer.displayName],
  );

  const RightHeader = useMemo(
    () => (
      <View className="flex-row items-center">
        {peer.address ? <CallButton recipientAddress={peer.address} /> : null}
        <ChatHeaderMenuButton onPress={openMenu} />
      </View>
    ),
    [openMenu, peer.address],
  );

  const handleSwipeToReply = useCallback(
    (msg: DmMessage) => {
      setReplyTo(msg);
    },
    [],
  );

  const renderMessage = useCallback(
    ({ item }: { item: DmMessage }) => {
      const mine = isMine(item);
      // Poll messages use a dedicated card
      if (item.msgType === "poll" && item.poll?.tokenId) {
        return (
          <View>
            <PollCard
              tokenId={item.poll.tokenId}
              pollOwnerAddress={
                typeof item.sender === "object"
                  ? item.sender?.address ?? ""
                  : ""
              }
            />
          </View>
        );
      }
      return (
        <View>
          <MessageBubble
            message={item}
            isMine={mine}
            onLongPress={onLongPressMessage}
            onVideoPress={setVideoUri}
            localMediaUri={(item as OptimisticMessage)?._localMediaUri}
            onSwipeToReply={handleSwipeToReply}
            onReplyPress={handleReplyPress}
            highlighted={highlightedId === item._id}
          />
        </View>
      );
    },
    [isMine, onLongPressMessage, handleSwipeToReply, handleReplyPress, highlightedId],
  );

  const keyExtractor = useCallback((item: DmMessage) => item._id, []);

  const listFooter = useMemo(
    () =>
      loadingMore ? (
        <View className="py-4 items-center">
          <ActivityIndicator size="small" color="#F4F4F5" />
        </View>
      ) : null,
    [loadingMore],
  );


  // Determine whether to show the NewChatIntro (no existing conversation, no messages)
  const showNewChatIntro = !currentConvId && messageList.length === 0;

  // Build policy info for NewChatIntro
  const peerPolicy = useMemo(() => ({
    dmEnabled: !dmDisabled,
    dmDisabledReason: dmReason,
    perMessageFee: peerDmStatus?.perMessageFee ?? dmFee?.fee ?? 0,
    hasFreeAccess: dmFee?.hasFreeAccess ?? false,
    isBlocked: iBlockedThem,
  }), [dmDisabled, dmReason, peerDmStatus, dmFee, iBlockedThem]);

  // Tip handlers — selecting a tip amount "attaches" it to the next send.
  // The tip is dispatched alongside the message (or standalone if no content).
  const handleTipPress = useCallback(() => setTipSheetVisible(true), []);
  const handleClearTip = useCallback(() => setTipAmount(0), []);

  const handlePollCreated = useCallback(
    (_tokenId: number) => {
      setPollSheetVisible(false);
      scrollToBottom();
    },
    [scrollToBottom],
  );
  const handleTipConfirm = useCallback((amount: number) => {
    setTipAmount(amount);
    setTipSheetVisible(false);
  }, []);

  return (
    <View style={{ flex: 1 }} className="bg-theme-neutrals-900">
      <ScreenHeader
        title={title}
        leftContent={LeftHeader}
        rightContent={RightHeader}
        subtitle={remoteTyping ? "typing…" : undefined}
      />

      <ChatMenu
          visible={menuVisible}
          onClose={closeMenu}
          isBlocked={iBlockedThem}
          onBlockUser={onBlockUser}
          onUnblockUser={onUnblockUser}
          onClearChat={currentConvId ? onClearChat : undefined}
          onToggleFreeAccess={myDmStatus?.perMessageFee && myDmStatus.perMessageFee > 0 ? onToggleFreeAccess : undefined}
          peerHasFreeAccess={
            !!(myDmStatus?.freeAccessUsers?.some(
              (a: string) => a.toLowerCase() === (peer.address || "").toLowerCase(),
            ))
          }
          isCreator={!!(myDmStatus?.perMessageFee && myDmStatus.perMessageFee > 0)}
        />

        {/* Per-message fee banner — always visible when fee info exists */}
        <DmFeeBanner dmFee={dmFee} peerDisplayName={peer.displayName} />

        {/* Pinned message banner */}
        {pinnedMessage && (
          <PinnedMessageBanner
            pinnedMessage={pinnedMessage}
            onPress={scrollToPinnedMessage}
            onUnpin={handleUnpinMessage}
          />
        )}

        <View className="flex-1">
          {/* New chat intro — shown before first message */}
          {showNewChatIntro ? (
            <NewChatIntro
              peer={{
                address: peer.address,
                displayName: peer.displayName,
                username: peer.username,
                avatarImageUrl: peerAvatarUri,
              }}
              policy={peerPolicy}
            />
          ) : initialLoading && messageList.length === 0 ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator size="small" color="#F4F4F5" />
            </View>
          ) : (
            <FlatList
              ref={listRef}
              inverted
              data={messageList}
              keyExtractor={keyExtractor}
              renderItem={renderMessage}
              contentContainerStyle={{ paddingTop: listBottomPadding, paddingBottom: 8 }}
              keyboardShouldPersistTaps="handled"
              onScroll={onScroll}
              scrollEventThrottle={16}
              onContentSizeChange={onContentSizeChange}
              onEndReached={loadMore}
              onEndReachedThreshold={0.3}
              ListFooterComponent={listFooter}
            />
          )}

          {/* Jump to bottom */}
          {showJumpBtn && !dmDisabled && !showNewChatIntro && (
            <Animated.View
              entering={FadeIn.duration(200)}
              exiting={FadeOut.duration(150)}
              className="absolute right-4"
              style={{ bottom: inputLift + 100 }}
            >
              <TouchableOpacity
                onPress={scrollToBottom}
                activeOpacity={0.8}
                hitSlop={8}
                className="bg-theme-neutrals-700/90 rounded-full px-3 py-2 flex-row items-center"
              >
                <Icon name="ChevronDown" size={16} color="#E5E7EB" />
                <Text className="text-theme-neutrals-100 text-xs ml-1">New</Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* Input or disabled banner — absolutely positioned, lifts with keyboard */}
          <View
            className="absolute left-0 right-0 bottom-0 bg-theme-neutrals-900"
            style={{ marginBottom: inputLift, paddingBottom: kbVisible ? 0 : insets.bottom }}
            onLayout={(e) => setInputBarHeight(e.nativeEvent.layout.height)}
          >
            {voiceRecorder.isRecording ? (
              <VoiceNoteRecordingOverlay recorder={voiceRecorder} />
            ) : dmDisabled ? (
              <View className="px-4 py-3 bg-theme-neutrals-800 border-t border-theme-neutrals-700/50">
                <Text className="text-theme-neutrals-400 text-xs">
                  {dmReason || "This account is not accepting messages right now."}
                </Text>
                {iBlockedThem && !!currentConvId && (
                  <TouchableOpacity
                    onPress={() => {
                      setConfirmMode("unblock");
                      setConfirmVisible(true);
                    }}
                    className="mt-1"
                  >
                    <Text className="text-theme-blue-300 text-xs font-medium">
                      Tap to unblock
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <ChatInputBar
                onSendText={onSendText}
                onSendMedia={onSendMedia}
                onSendGif={onSendGif}
                onStartVoice={onStartVoice}
                onTypingChange={onTypingChange}
                disabled={creating}
                sending={sending}
                replyTo={replyTo}
                onCancelReply={() => setReplyTo(null)}
                editingMessage={editingMessage}
                onCancelEdit={() => setEditingMessage(null)}
                dmFee={dmFee}
                tipAmount={tipAmount}
                onTipPress={handleTipPress}
                onClearTip={handleClearTip}
                dhbBalance={dhbBalance}
                onPollPress={() => setPollSheetVisible(true)}
                initialText={route?.params?.sharedText}
                thread={smartReplyThread}
                peerName={peerLabel}
              />
            )}
          </View>
        </View>

        {/* Context menu */}
        <MessageContextMenu
          visible={!!contextMessage}
          message={contextMessage}
          layout={contextLayout}
          isMine={contextIsMine}
          peerUser={{
            displayName: peer.displayName,
            username: peer.username,
            avatarImageUrl: peer.avatarImageUrl,
          }}
          myUser={{
            displayName: (user as any)?.displayName || (user as any)?.username,
            username: (user as any)?.username,
            avatarImageUrl: (user as any)?.avatarImageUrl,
          }}
          onClose={closeContextMenu}
          onReply={handleReply}
          onEdit={handleEdit}
          onForward={handleForward}
          onDelete={handleDelete}
          onPin={handlePinMessage}
          onUnpin={handleUnpinMessage}
          isPinned={contextMessage ? pinnedMessageId === contextMessage._id : false}
        />

        {/* Forward picker */}
        <ForwardPickerModal
          visible={forwardVisible}
          onClose={() => {
            setForwardVisible(false);
            setForwardMessage(null);
          }}
          onSelect={onForwardSelect}
          conversations={conversations}
          myUserId={userId}
          myAddress={address}
        />

        {/* Block confirmation */}
        <ConfirmBlockModal
          visible={confirmVisible}
          mode={confirmMode}
          targetLabel={peerLabel}
          onConfirm={onConfirmBlock}
          onCancel={() => setConfirmVisible(false)}
          loading={blockLoading}
        />

        {/* Full-screen video player */}
        <FullScreenVideoPlayer
          visible={!!videoUri}
          uri={videoUri}
          onClose={() => setVideoUri(null)}
        />

        {/* Tip amount sheet */}
        <TipAmountSheet
          visible={tipSheetVisible}
          onClose={() => setTipSheetVisible(false)}
          onConfirm={handleTipConfirm}
          currentAmount={tipAmount}
          dhbBalance={dhbBalance}
          minAmount={dmFee?.required && !dmFee?.hasFreeAccess ? (dmFee?.fee ?? 1) : 1}
        />

        {/* Create poll sheet */}
        <CreatePollSheet
          visible={pollSheetVisible}
          onClose={() => setPollSheetVisible(false)}
          onCreated={handlePollCreated}
        />
    </View>
  );
};

export default ChatScreen;
