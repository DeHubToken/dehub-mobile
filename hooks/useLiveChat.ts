import { useCallback, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { AppState, AppStateStatus } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import env from "../config/env";
import { getAuthToken } from "../libs/auth.utils";
import { useAuth } from "../context/AuthContext";
import { createLogger } from "../libs/logger";
import { toastError } from "../libs/toast";
import type {
  LiveChatMessageData,
  LiveChatRoom,
  LiveChatUser,
  SendMessagePayload,
  LiveChatRoomJoinedPayload,
} from "../services/livechat.service";
import { getLiveChatMessages, getLiveChatOnlineCount } from "../services/livechat.service";

const log = createLogger("LiveChat");

/** Ensure every message has _id (server may return `id` instead) */
const normalizeMsg = (m: any): LiveChatMessageData => ({
  ...m,
  _id: m._id || m.id,
});

const EVENTS = {
  // Client → Server
  JOIN: "livechat:joinRoom",
  LEAVE: "livechat:leaveRoom",
  SEND: "livechat:sendMessage",
  EDIT: "livechat:editMessage",
  DELETE: "livechat:deleteMessage",
  ADD_REACTION: "livechat:addReaction",
  REMOVE_REACTION: "livechat:removeReaction",
  TYPING: "livechat:typing",
  PING: "livechat:ping",
  // Server → Client
  ROOM_JOINED: "livechat:roomJoined",
  ROOM_LEFT: "livechat:roomLeft",
  NEW_MESSAGE: "livechat:newMessage",
  MESSAGE_EDITED: "livechat:messageEdited",
  MESSAGE_DELETED: "livechat:messageDeleted",
  REACTION_UPDATED: "livechat:reactionUpdated",
  USER_TYPING: "livechat:userTyping",
  USER_JOINED: "livechat:userJoined",
  USER_LEFT: "livechat:userLeft",
  ROOM_UPDATED: "livechat:roomUpdated",
  MESSAGE_PINNED: "livechat:messagePinned",
  MESSAGE_UNPINNED: "livechat:messageUnpinned",
  USER_BANNED: "livechat:userBanned",
  USER_UNBANNED: "livechat:userUnbanned",
  ERROR: "livechat:error",
  PONG: "livechat:pong",
} as const;

export interface UseLiveChatReturn {
  connected: boolean;
  joining: boolean;
  messages: LiveChatMessageData[];
  room: LiveChatRoom | null;
  myUser: LiveChatUser | null;
  isBanned: boolean;
  isModerator: boolean;
  canSend: boolean;
  typingUsers: LiveChatUser[];
  onlineCount: number;
  loadingMore: boolean;
  hasMore: boolean;
  sendMessage: (payload: SendMessagePayload) => void;
  editMessage: (messageId: string, content: string) => void;
  deleteMessage: (messageId: string) => void;
  addReaction: (messageId: string, emoji: string) => void;
  removeReaction: (messageId: string, emoji: string) => void;
  setTyping: (isTyping: boolean) => void;
  loadMoreMessages: () => Promise<void>;
  reconnect: () => void;
  updateBannedList: (address: string, banned: boolean) => void;
}

export const useLiveChat = (): UseLiveChatReturn => {
  const { user, isSignedIn } = useAuth();
  const isFocused = useIsFocused();

  const [connected, setConnected] = useState(false);
  const [joining, setJoining] = useState(false);
  const [messages, setMessages] = useState<LiveChatMessageData[]>([]);
  const [room, setRoom] = useState<LiveChatRoom | null>(null);
  const [myUser, setMyUser] = useState<LiveChatUser | null>(null);
  const [isBanned, setIsBanned] = useState(false);
  const [isModerator, setIsModerator] = useState(false);
  const [canSend, setCanSend] = useState(false);
  const [typingUsers, setTypingUsers] = useState<LiveChatUser[]>([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const socketRef = useRef<Socket | null>(null);
  const joinedRef = useRef(false);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const myAddressRef = useRef<string>("");

  myAddressRef.current = (user?.walletAddress || user?.address || "").toLowerCase();

  // Connect socket
  useEffect(() => {
    if (!isSignedIn) return;

    let cancelled = false;
    setJoining(true); // Show loading immediately

    const connect = async () => {
      const token = await getAuthToken();
      if (!token || cancelled) {
        setJoining(false);
        return;
      }

      const wsUrl = env.WEBSOCKET_URL || env.API_URL?.replace(/\/api$/, "");
      const socket = io(`${wsUrl}/livechat`, {
        auth: { token },
        transports: ["polling", "websocket"],
        reconnection: true,
        reconnectionAttempts: 15,
        reconnectionDelay: 2000,
        reconnectionDelayMax: 10000,
        forceNew: true,
      });

      socketRef.current = socket;

      socket.on("connect", () => {
        if (cancelled) return;
        log.debug("Connected");
        setConnected(true);
        socket.emit(EVENTS.JOIN);
        setJoining(true);
      });

      socket.on("connect_error", (err) => {
        log.debug("Connect error:", err.message);
        if (!cancelled) setJoining(false);
      });

      socket.on("disconnect", (reason) => {
        log.debug("Disconnected:", reason);
        setConnected(false);
        joinedRef.current = false;
        setJoining(false);
      });

      socket.on(EVENTS.PONG, (data: any) => {
        if (data?.isBanned) setIsBanned(true);
        if (data?.user?.isModerator) setIsModerator(true);
      });

      socket.on(EVENTS.ROOM_JOINED, (data: LiveChatRoomJoinedPayload) => {
        if (cancelled) return;
        log.debug("Room joined, messages:", data.messages?.length);
        setRoom(data.room);
        setMessages((data.messages || []).map(normalizeMsg).reverse());
        setMyUser(data.yourUser);
        setIsBanned(data.isBanned);
        setCanSend(data.canSendMessages);
        setIsModerator(data.yourUser?.isModerator || false);
        setOnlineCount(data.onlineCount || data.room?.onlineCount || 0);
        setHasMore((data.messages?.length || 0) >= 50);
        joinedRef.current = true;
        setJoining(false);

        // Fetch accurate online count from REST (Redis counter)
        getLiveChatOnlineCount()
          .then((res) => { if (res?.count) setOnlineCount(res.count); })
          .catch(() => {});
      });

      socket.on(EVENTS.NEW_MESSAGE, (msg: LiveChatMessageData) => {
        setMessages((prev) => [...prev, normalizeMsg(msg)]);
      });

      socket.on(EVENTS.MESSAGE_EDITED, (raw: LiveChatMessageData) => {
        const msg = normalizeMsg(raw);
        setMessages((prev) =>
          prev.map((m) => (m._id === msg._id ? msg : m))
        );
      });

      socket.on(EVENTS.MESSAGE_DELETED, ({ messageId }: { messageId: string }) => {
        setMessages((prev) => prev.filter((m) => m._id !== messageId));
      });

      socket.on(EVENTS.REACTION_UPDATED, ({
        messageId,
        reactions,
      }: {
        messageId: string;
        reactions: Record<string, string[]>;
      }) => {
        setMessages((prev) =>
          prev.map((m) => (m._id === messageId ? { ...m, reactions } : m))
        );
      });

      socket.on(EVENTS.USER_TYPING, ({ user: u, isTyping }: { user: LiveChatUser; isTyping: boolean }) => {
        setTypingUsers((prev) => {
          if (isTyping) {
            if (prev.some((t) => t.address === u.address)) return prev;
            return [...prev, u];
          }
          return prev.filter((t) => t.address !== u.address);
        });
      });

      socket.on(EVENTS.USER_JOINED, ({ user: u }: { user: LiveChatUser }) => {
        setOnlineCount((prev) => prev + 1);
      });

      socket.on(EVENTS.USER_LEFT, ({ user: u }: { user: LiveChatUser }) => {
        setOnlineCount((prev) => Math.max(0, prev - 1));
        setTypingUsers((prev) => prev.filter((t) => t.address !== u.address));
      });

      socket.on(EVENTS.ROOM_UPDATED, (updatedRoom: LiveChatRoom) => {
        setRoom(updatedRoom);
      });

      socket.on(EVENTS.MESSAGE_PINNED, (raw: LiveChatMessageData) => {
        const msg = normalizeMsg(raw);
        setMessages((prev) =>
          prev.map((m) => (m._id === msg._id ? msg : m))
        );
        // Keep room.pinnedMessages in sync
        setRoom((prev) => {
          if (!prev) return prev;
          const existing = prev.pinnedMessages || [];
          const already = existing.some((p) => (p._id || (p as any).id) === msg._id);
          return {
            ...prev,
            pinnedMessages: already
              ? existing.map((p) => ((p._id || (p as any).id) === msg._id ? msg : p))
              : [...existing, msg],
          };
        });
      });

      socket.on(EVENTS.MESSAGE_UNPINNED, ({ messageId }: { messageId: string }) => {
        setMessages((prev) =>
          prev.map((m) =>
            m._id === messageId ? { ...m, isPinned: false, pinnedBy: undefined, pinnedAt: undefined } : m
          )
        );
        setRoom((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            pinnedMessages: (prev.pinnedMessages || []).filter(
              (p) => (p._id || (p as any).id) !== messageId
            ),
          };
        });
      });

      socket.on(EVENTS.USER_BANNED, ({ message }: { message: string }) => {
        setIsBanned(true);
        setCanSend(false);
      });

      socket.on(EVENTS.USER_UNBANNED, ({ message }: { message: string }) => {
        setIsBanned(false);
        setCanSend(true);
      });

      socket.on(EVENTS.ERROR, ({ message, code, isBanned: banned }: { message: string; code?: string; isBanned?: boolean }) => {
        log.debug("Error:", message);
        if (code === "BANNED" || banned) {
          setIsBanned(true);
          setCanSend(false);
        }
        if (message) toastError(message);
      });

      // Heartbeat ping
      pingIntervalRef.current = setInterval(() => {
        if (socket.connected) socket.emit(EVENTS.PING);
      }, 25000);
    };

    connect();

    return () => {
      cancelled = true;
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      const socket = socketRef.current;
      if (socket) {
        socket.emit(EVENTS.LEAVE);
        socket.removeAllListeners();
        socket.disconnect();
        socketRef.current = null;
      }
      joinedRef.current = false;
      setConnected(false);
      setJoining(false);
    };
  }, [isSignedIn]);

  // Pause/resume on app background — reconnect + rejoin
  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      const socket = socketRef.current;
      if (!socket) return;
      if (nextState === "active") {
        if (!socket.connected) {
          socket.connect();
        } else if (!joinedRef.current) {
          socket.emit(EVENTS.JOIN);
          setJoining(true);
        }
      }
    };
    const sub = AppState.addEventListener("change", handleAppState);
    return () => sub.remove();
  }, []);

  const sendMessage = useCallback((payload: SendMessagePayload) => {
    socketRef.current?.emit(EVENTS.SEND, payload);
  }, []);

  const editMessage = useCallback((messageId: string, content: string) => {
    socketRef.current?.emit(EVENTS.EDIT, { messageId, content });
  }, []);

  const deleteMessageFn = useCallback((messageId: string) => {
    socketRef.current?.emit(EVENTS.DELETE, { messageId });
  }, []);

  const addReaction = useCallback((messageId: string, emoji: string) => {
    socketRef.current?.emit(EVENTS.ADD_REACTION, { messageId, emoji });
  }, []);

  const removeReaction = useCallback((messageId: string, emoji: string) => {
    socketRef.current?.emit(EVENTS.REMOVE_REACTION, { messageId, emoji });
  }, []);

  const setTyping = useCallback((isTyping: boolean) => {
    socketRef.current?.emit(EVENTS.TYPING, { isTyping });
    if (isTyping) {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        socketRef.current?.emit(EVENTS.TYPING, { isTyping: false });
      }, 3000);
    }
  }, []);

  const messagesRef = useRef<LiveChatMessageData[]>([]);
  messagesRef.current = messages;
  const hasMoreRef = useRef(true);
  hasMoreRef.current = hasMore;
  const loadingMoreRef = useRef(false);
  loadingMoreRef.current = loadingMore;

  const loadMoreMessages = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreRef.current || messagesRef.current.length === 0) return;
    setLoadingMore(true);
    try {
      const oldest = messagesRef.current[0];
      const res = await getLiveChatMessages({ before: oldest._id, limit: 50 });
      if (res.messages.length > 0) {
        setMessages((prev) => [...res.messages.map(normalizeMsg).reverse(), ...prev]);
      }
      setHasMore(res.hasMore);
    } catch (e) {
      log.debug("Failed to load more messages:", e);
    } finally {
      setLoadingMore(false);
    }
  }, []);

  const reconnect = useCallback(() => {
    const socket = socketRef.current;
    if (socket) {
      if (!socket.connected) {
        setJoining(true);
        socket.connect();
      } else if (!joinedRef.current) {
        setJoining(true);
        socket.emit(EVENTS.JOIN);
      }
    }
  }, []);

  const updateBannedList = useCallback((address: string, banned: boolean) => {
    if (!address) return;
    setRoom((prev) => {
      if (!prev) return prev;
      const addr = address.toLowerCase();
      const current = (prev.bannedUsers || []).filter(Boolean);
      if (banned) {
        if (current.some((a) => a?.toLowerCase() === addr)) return prev;
        return { ...prev, bannedUsers: [...current, address] };
      }
      return { ...prev, bannedUsers: current.filter((a) => a?.toLowerCase() !== addr) };
    });
  }, []);

  return {
    connected,
    joining,
    messages,
    room,
    myUser,
    isBanned,
    isModerator,
    canSend,
    typingUsers,
    onlineCount,
    loadingMore,
    hasMore,
    sendMessage,
    editMessage,
    deleteMessage: deleteMessageFn,
    addReaction,
    removeReaction,
    setTyping,
    loadMoreMessages,
    reconnect,
    updateBannedList,
  };
};
