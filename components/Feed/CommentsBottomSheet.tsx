import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  FlatList,
  Animated,
  PanResponder,
  Dimensions,
  Pressable,
  InteractionManager,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import CommentItem, { Comment } from "./CommentItem";
import CommentInput, { CommentInputRef } from "./CommentInput";
import CommentsSkeleton from "./CommentsSkeleton";
import { useAuth } from "../../context/AuthContext";
import { getAvatarUrl } from "../../libs";
import { getCommentsForToken, postComment } from "../../services/nft.service";
import { formatDistance } from "date-fns";
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import useKeyboard from "../../hooks/useKeyboard";

type Props = {
  visible: boolean;
  onClose: () => void;
  tokenId: number | string | undefined;
  title?: string;
  // Notify parent to bump or revert top-level comment count
  onTopLevelCommentDelta?: (tokenId: number | string, delta: number) => void;
  commentCount?: number;
};
// style={{ paddingBottom: kbVisible ? kbHeight + 10 : 0 }}>
const CommentsBottomSheet: React.FC<Props> = ({
  visible,
  onClose,
  tokenId,
  title,
  onTopLevelCommentDelta,
  commentCount
}) => {
  const { user, requireAuth } = useAuth();
  const insets = useSafeAreaInsets();

  // Draggable height state (65% - 95%)
  const MIN_PCT = 0.65;
  const MAX_PCT = 0.95;
  const [heightPct, setHeightPct] = useState<number>(MIN_PCT);
  const heightPctRef = useRef<number>(MIN_PCT);
  const heightAnim = useRef(new Animated.Value(MIN_PCT)).current;
  const screenH = Dimensions.get("window").height;

  useEffect(() => {
    heightPctRef.current = heightPct;
  }, [heightPct]);

  useEffect(() => {
    Animated.timing(heightAnim, {
      toValue: heightPct,
      duration: 150,
      useNativeDriver: false,
    }).start();
  }, [heightPct, heightAnim]);
  // Reset to min height whenever reopened
  useEffect(() => {
    if (visible) setHeightPct(MIN_PCT);
  }, [visible]);

  const panY = useRef(0);
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          panY.current = 0;
        },
        onPanResponderMove: (_, gesture) => {
          panY.current = gesture.dy;
          // dy positive -> dragging down -> reduce height
          const denom = Math.max(300, screenH); // avoid over-sensitivity on small screens
          const deltaPct = -(gesture.dy / denom); // scale drag to percent of screen
          const next = Math.max(MIN_PCT, Math.min(MAX_PCT, heightPctRef.current + deltaPct));
          heightAnim.setValue(next);
        },
        onPanResponderRelease: (_, gesture) => {
          const closeByDistance = gesture.dy > 120; // pixels
          const closeByVelocity = gesture.vy > 1.2; // fling threshold
          if (closeByDistance || closeByVelocity) {
            onClose();
            return;
          }
          const denom = Math.max(300, screenH);
          const deltaPct = -(gesture.dy / denom);
          const next = Math.max(MIN_PCT, Math.min(MAX_PCT, heightPctRef.current + deltaPct));
          // snap to nearest of MIN or MAX if close, else keep
          const snap = Math.abs(next - MIN_PCT) < 0.08 ? MIN_PCT : Math.abs(next - MAX_PCT) < 0.08 ? MAX_PCT : next;
          setHeightPct(snap);
        },
      }),
    [heightAnim, onClose, screenH]
  );

  // NFT comments state
  const [loading, setLoading] = useState<boolean>(false);
  const [items, setItems] = useState<Comment[]>([]);
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [composerAutoFocus, setComposerAutoFocus] = useState<boolean>(false);
  const replyToLabel = replyTo?.user || undefined;
  const inputRef = useRef<CommentInputRef>(null);
  const { showUserProfile } = useUserProfileSheet();
  const { height: kbHeight, isVisible: kbVisible } = useKeyboard();

  const heightStyle = useMemo(() => {
    const baseHeight = Math.max(0, screenH - (insets.bottom || 0));
    return { height: Animated.multiply(heightAnim, baseHeight) as any };
  }, [heightAnim, insets.bottom, screenH]);

  const inputLift = useMemo(() => {
    if (!kbVisible) return 0;
    // Avoid double-counting the bottom safe-area when keyboard height already includes it.
    return Math.max(0, kbHeight);
  }, [insets.bottom, kbHeight, kbVisible]);

  const listBottomPadding = useMemo(() => {
    // Base accounts for the input height; add keyboard height when visible.
    const base = 88;
    return base + inputLift + (insets.bottom || 0);
  }, [insets.bottom, inputLift]);

  const shouldSkipFetch = useMemo(() => {
    // Only skip when we *know* there are zero comments.
    return visible && tokenId != null && commentCount === 0;
  }, [commentCount, tokenId, visible]);

  const lastTokenRef = useRef<number | string | undefined>(undefined);
  useEffect(() => {
    if (!visible) return;
    if (tokenId == null) return;
    if (lastTokenRef.current !== tokenId) {
      lastTokenRef.current = tokenId;
      setItems([]);
      setReplyTo(null);
      setComposerAutoFocus(false);
    }
  }, [tokenId, visible]);

  const buildFlatComments = useCallback((rawComments: any[]): Comment[] => {
    const safe: any[] = Array.isArray(rawComments) ? rawComments : [];

    const replyIdSet = new Set<number>();
    safe.forEach((c: any) =>
      Array.isArray(c?.replyIds) && c.replyIds.forEach((id: any) => replyIdSet.add(Number(id)))
    );

    const byId = new Map<number, any>();
    safe.forEach((c) => byId.set(Number(c?.id), c));
    const topLevel = safe.filter((c) => !replyIdSet.has(Number(c?.id)));

    const toComment = (c: any, parentId?: number | string): Comment => {
      const u = c?.writor?.username || c?.address || "";
      const avatar = getAvatarUrl(c?.writor?.avatarUrl) || undefined;
      const text = String(c?.content || "").replace(/<[^>]+>/g, "");
      const created = c?.createdAt ? new Date(c.createdAt) : undefined;
      const time = created ? formatDistance(created, new Date(), { addSuffix: true }) : "";
      return {
        id: String(c?.id),
        user: u,
        avatarUri: avatar,
        text,
        time,
        replyToId: parentId,
      };
    };

    const flat: Comment[] = [];
    topLevel.forEach((c) => {
      flat.push(toComment(c));
      if (Array.isArray(c?.replyIds)) {
        c.replyIds.forEach((rid: any) => {
          const rc = byId.get(Number(rid));
          if (rc) flat.push(toComment(rc, c?.id));
        });
      }
    });

    return flat;
  }, []);

  // Fetch on open (comments only)
  useEffect(() => {
    let cancelled = false;

    if (!visible) return;
    if (tokenId == null) return;
    if (shouldSkipFetch) {
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const task = InteractionManager.runAfterInteractions(async () => {
      try {
        const res = await getCommentsForToken(tokenId as any, { limit: 100 });
        if (cancelled) return;
        const payload: any = res?.result || res || {};
        const rawComments: any[] = Array.isArray(payload?.items) ? payload.items : [];
        const flat = buildFlatComments(rawComments);
        setItems(flat);
        setComposerAutoFocus(false);
      } catch (e) {
        console.error("CommentsBottomSheet: failed to fetch comments", e);
        setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      (task as any)?.cancel?.();
    };
  }, [visible, tokenId, shouldSkipFetch, buildFlatComments]);

  const handleUserPress = useCallback(
    (identifier: string) => {
      showUserProfile(identifier, { initialHeightPct: 0.4, source: "comment" });
    },
    [showUserProfile]
  );

  const handleReplyPress = useCallback((c: Comment) => {
    setReplyTo(c);
    setComposerAutoFocus(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: Comment }) => {
      return (
        <View className={item.replyToId ? "pl-6" : ""}>
          <CommentItem
            comment={item}
            onUserPress={handleUserPress}
            onReplyPress={handleReplyPress}
          />
        </View>
      );
    },
    [handleReplyPress, handleUserPress]
  );

  const keyExtractor = useCallback((c: Comment) => c.id, []);

  // Send handler with optimistic insert
  const handleSend = useCallback(
    (text: string) => {
      if (!text || tokenId == null) return;
      requireAuth?.(async () => {
        const tempId = `temp-${Date.now()}`;
        const temp: Comment = {
          id: tempId,
          user: user?.username || "you",
          avatarUri: getAvatarUrl(user?.avatarImageUrl || user?.avatarUrl) || undefined,
          text,
          time: "Just now",
          replyToId: replyTo?.id,
        };
        // optimistic list update: insert after parent if replying, else prepend
        setItems((prev) => {
          if (replyTo?.id) {
            const idx = prev.findIndex((c) => c.id === replyTo.id);
            if (idx >= 0) {
              const next = [...prev];
              next.splice(idx + 1, 0, temp);
              return next;
            }
          }
          return [temp, ...prev];
        });
        const replyTarget = replyTo;
        if (replyTarget) setReplyTo(null);
        // Bump count only for top-level comments
        if (!replyTarget) {
          try { onTopLevelCommentDelta?.(tokenId, 1); } catch {}
        }
        try {
          const payload = {
            streamTokenId: tokenId as any,
            content: text,
            commentId: replyTarget?.id,
          } as any;
          const res: any = await postComment(payload);
          const newId = res?.result?.id ?? res?.id ?? undefined;
          if (newId != null) {
            setItems((prev) => prev.map((c) => (c.id === tempId ? { ...c, id: String(newId) } : c)));
          }
        } catch (e) {
          // revert optimistic item
          setItems((prev) => prev.filter((c) => c.id !== tempId));
          // Revert bump if it was a top-level comment
          if (!replyTarget) {
            try { onTopLevelCommentDelta?.(tokenId, -1); } catch {}
          }
        }
      });
    },
    [requireAuth, tokenId, replyTo, user?.username, user?.avatarUrl, user?.avatarImageUrl, onTopLevelCommentDelta]
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end bg-black/50">
        {/* Tap outside to close */}
        <Pressable onPress={onClose} className="absolute inset-0" />

        <Animated.View
          // height = heightPct * screen height
          style={heightStyle}
          className="bg-theme-neutrals-900 rounded-t-2xl overflow-hidden border border-theme-neutrals-800"
        >
          <View className="flex-1" style={insets.bottom ? { paddingBottom: insets.bottom } : undefined}>
            {/* Header */}
            <View
              className="flex-row items-center justify-between px-4 py-3 border-b border-theme-neutrals-800"
              {...responder.panHandlers}
            >
              <View className="absolute left-0 right-0 -top-2 items-center">
                <View className="w-10 h-1.5 bg-theme-neutrals-700 rounded-full" />
              </View>
              <Text className="text-white font-semibold text-base">
                {title || "Comments"}
              </Text>
              <TouchableOpacity
                onPress={onClose}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            {/* Content */}
            <View className="flex-1">
              {loading ? (
                <CommentsSkeleton />
              ) : items.length === 0 ? (
                <View className="px-4 py-6">
                  <Text className="text-theme-neutrals-400 text-sm">
                    No comments yet, add yours.
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={items}
                  keyExtractor={keyExtractor}
                  renderItem={renderItem}
                  keyboardShouldPersistTaps="handled"
                  removeClippedSubviews={false}
                  initialNumToRender={10}
                  maxToRenderPerBatch={10}
                  windowSize={7}
                  contentContainerStyle={{ paddingBottom: listBottomPadding }}
                />
              )}
            </View>

            {/* Input */}
            <View style={inputLift ? { marginBottom: inputLift } : undefined}>
              <CommentInput
                ref={inputRef}
                onSend={handleSend}
                placeholder={replyTo ? "Replying…" : undefined}
                autoFocus={composerAutoFocus}
                replyToLabel={replyToLabel}
                onCancelReply={() => setReplyTo(null)}
              />
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

export default CommentsBottomSheet;
