import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  InteractionManager,
} from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import VideoPlayerSkeleton from "./VideoPlayerSkeleton";
import CommentItem from "./CommentItem";

type CommentsPanelProps = {
  comments: any[];
  nftLoading: boolean;
  onClose: () => void;
  // Called when user taps Reply on a comment
  onReply: (target: { id: number | string; label?: string }) => void;
  // Scroll/highlight coordination from parent after optimistic insert
  scrollTargetId: number | null;
  highlightedId: number | null;
  onHighlightDone: () => void;
  // Ask panel to expand a thread (e.g., when adding a reply)
  expandThreadId?: number | string | null;
};

const CommentsPanel: React.FC<CommentsPanelProps> = ({
  comments,
  nftLoading,
  onClose,
  onReply,
  scrollTargetId,
  highlightedId,
  onHighlightDone,
  expandThreadId = null,
}) => {
  // UI state
  const [expandedReplies, setExpandedReplies] = useState<
    Record<string | number, boolean>
  >({});

  // Scroll + highlight management
  const scrollRef = useRef<any>(null);
  const itemYRef = useRef<Record<number, number>>({});
  const highlightAnim = useRef(new Animated.Value(0)).current;

  // Compute top-level comments (exclude reply items)
  const replyIdSet = useMemo(() => {
    const set = new Set<number>();
    comments.forEach((c: any) => {
      if (Array.isArray(c?.replyIds)) {
        c.replyIds.forEach((id: any) => set.add(Number(id)));
      }
    });
    return set;
  }, [comments]);
  const topLevelComments = useMemo(
    () => comments.filter((c: any) => !replyIdSet.has(Number(c?.id))),
    [comments, replyIdSet]
  );

  // Scroll effect to the newly added comment/reply and blink it
  useEffect(() => {
    if (scrollTargetId == null) return;
    let cancelled = false;

    const tryScroll = (retries: number) => {
      if (cancelled) return;
      const y = itemYRef.current[Number(scrollTargetId)];
      if (typeof y === "number") {
        const offset = Math.max(y - 80, 0); // leave space for header/composer
        scrollRef.current?.scrollTo({ y: offset, animated: true });
        // Trigger blink animation
        highlightAnim.setValue(0);
        Animated.sequence([
          Animated.timing(highlightAnim, {
            toValue: 1,
            duration: 150,
            useNativeDriver: false,
          }),
          Animated.timing(highlightAnim, {
            toValue: 0,
            duration: 250,
            useNativeDriver: false,
          }),
          Animated.timing(highlightAnim, {
            toValue: 1,
            duration: 150,
            useNativeDriver: false,
          }),
          Animated.timing(highlightAnim, {
            toValue: 0,
            duration: 250,
            useNativeDriver: false,
          }),
        ]).start(() => {
          onHighlightDone?.();
        });
        return;
      }
      if (retries <= 0) return;
      setTimeout(() => tryScroll(retries - 1), 80);
    };

    InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(() => tryScroll(12));
    });

    return () => {
      cancelled = true;
    };
  }, [scrollTargetId, highlightAnim, onHighlightDone]);

  // Expand a thread if requested by parent (e.g., optimistic reply added)
  useEffect(() => {
    if (expandThreadId == null) return;
    setExpandedReplies((p) => ({ ...p, [expandThreadId as any]: true }));
  }, [expandThreadId]);

  return (
    <View className="flex-1 pt-3">
      <View className="px-4 flex-row items-center mb-4">
        <TouchableOpacity
          onPress={onClose}
          className="w-8 h-8 rounded-full items-center justify-center bg-theme-neutrals-800 mr-2"
        >
          <Ionicons name="chevron-back" size={18} color="#fff" />
        </TouchableOpacity>
        <Text className="text-theme-neutrals-100 font-semibold text-sm">
          Comments
        </Text>
        <Text className="text-theme-neutrals-500 text-[11px] ml-2">
          {topLevelComments.length}
        </Text>
      </View>

      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        <View className="px-4">
          {nftLoading ? (
            <VideoPlayerSkeleton variant="panel" actionCount={3} />
          ) : (
            topLevelComments.map((c: any) => {
              const replies: any[] = Array.isArray(c?.replyIds)
                ? c.replyIds
                    .map((id: any) =>
                      comments.find((x: any) => Number(x.id) === Number(id))
                    )
                    .filter(Boolean)
                : [];
              const isExpanded = !!expandedReplies[c.id];
              const replyIndent = 44; // avatar(32) + gap(12)
              const toggleReplies = () =>
                setExpandedReplies((prev) => ({
                  ...prev,
                  [c.id]: !prev[c.id],
                }));
              const handleReply = () =>
                onReply({ id: c.id, label: c?.writor?.username || c?.address });
              const rowHighlightStyle =
                highlightedId === Number(c.id)
                  ? {
                      backgroundColor: highlightAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [
                          "transparent",
                          "rgba(255,255,255,0.08)",
                        ],
                      }),
                      borderRadius: 8,
                    }
                  : undefined;
              return (
                <Animated.View
                  key={c.id}
                  className="flex w-full flex-col items-end justify-start gap-2 mb-5"
                  style={rowHighlightStyle as any}
                  onLayout={(e) => {
                    itemYRef.current[Number(c.id)] = e.nativeEvent.layout.y;
                  }}
                >
                  <CommentItem comment={c} onReply={handleReply} />
                  {replies.length > 0 && !isExpanded && (
                    <TouchableOpacity
                      onPress={toggleReplies}
                      activeOpacity={0.7}
                      style={{ marginLeft: replyIndent }}
                      className="flex-row items-center self-start mt-1"
                    >
                      <Text className="text-theme-neutrals-500 text-[11px] mr-1">
                        View {replies.length}{" "}
                        {replies.length === 1 ? "reply" : "replies"}
                      </Text>
                      <Ionicons
                        name="chevron-down"
                        size={14}
                        color="#A3A3A3"
                      />
                    </TouchableOpacity>
                  )}
                  {replies.length > 0 && isExpanded && (
                    <>
                      {replies.map((reply: any) => {
                        const replyRowHighlightStyle =
                          highlightedId === Number(reply.id)
                            ? {
                                backgroundColor: highlightAnim.interpolate({
                                  inputRange: [0, 1],
                                  outputRange: [
                                    "transparent",
                                    "rgba(255,255,255,0.08)",
                                  ],
                                }),
                                borderRadius: 8,
                              }
                            : undefined;
                        return (
                          <Animated.View
                            key={reply.id}
                            style={replyRowHighlightStyle as any}
                            onLayout={(e) => {
                              itemYRef.current[Number(reply.id)] =
                                e.nativeEvent.layout.y;
                            }}
                          >
                            <CommentItem comment={reply} isReply />
                          </Animated.View>
                        );
                      })}
                      <TouchableOpacity
                        onPress={toggleReplies}
                        activeOpacity={0.7}
                        style={{ marginLeft: replyIndent }}
                        className="flex-row items-center self-start mt-1"
                      >
                        <Text className="text-theme-neutrals-500 text-[11px] mr-1">
                          Hide replies
                        </Text>
                        <Ionicons
                          name="chevron-up"
                          size={14}
                          color="#A3A3A3"
                        />
                      </TouchableOpacity>
                    </>
                  )}
                </Animated.View>
              );
            })
          )}
        </View>
      </ScrollView>

  {/* Composer is handled by parent */}
    </View>
  );
};

export default CommentsPanel;
