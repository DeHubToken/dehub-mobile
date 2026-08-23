/**
 * Reaction Info Sheet
 * ===================
 * Who reacted to a post, and with what — grouped by reaction. Opened from the
 * ⓘ at the end of the reaction tray (hold the thumbs-up to get there).
 *
 * AUTHOR-ONLY, ON BOTH SIDES
 * The ⓘ only appears on your own posts, but the gate that counts is the
 * server's: /api/post-likers answers everyone else with `canViewLikers: false`
 * and an empty list. So an empty `data` is ambiguous on its own — read
 * `canViewLikers` before deciding nobody reacted.
 *
 * The chrome here is the same construction as CommentBottomSheet (opaque
 * overlay, pan-to-dismiss off the grabber) so the two read as one
 * family; it is a separate sheet because reactions are no longer part of the
 * comments surface at all.
 */

import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  SectionList,
  ActivityIndicator,
  Dimensions,
  StyleSheet,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  runOnJS,
  Easing,
} from "react-native-reanimated";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "../ui/Icon";
import Avatar from "../common/Avatar";
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";
import { getPostLikers, type LikerUser } from "../../services/nft.service";
import { REACTION_LIST, type PostReaction } from "../../libs/reactions";
import { getAvatarUrl } from "../../libs/misc";
import { truncate } from "../../libs/strings.util";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const SHEET_FRACTION = 0.7;
const PAGE_LIMIT = 50;

interface ReactionInfoSheetProps {
  visible: boolean;
  onClose: () => void;
  tokenId: number | string;
}

interface ReactionSection {
  key: PostReaction;
  emoji: string;
  label: string;
  /** Total for the whole post — `data` is only what has loaded so far. */
  total: number;
  data: LikerUser[];
}

const PersonRow: React.FC<{ item: LikerUser; onPress: (address: string) => void }> = memo(
  ({ item, onPress }) => {
    const displayName = item.displayName || item.username || truncate(item.address, 12, "..");
    const handlePress = useCallback(() => onPress(item.address), [onPress, item.address]);

    return (
      <Pressable
        onPress={handlePress}
        style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10 }}
      >
        <Avatar uri={getAvatarUrl(item.avatarImageUrl)} size={38} rounded={false} name={displayName} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={{ color: "#F9FBFF", fontWeight: "600", fontSize: 14 }} numberOfLines={1}>
            {displayName}
          </Text>
          {!!item.username && (
            <Text style={{ color: "#8B8D90", fontSize: 13, marginTop: 1 }} numberOfLines={1}>
              @{item.username}
            </Text>
          )}
        </View>
        <Icon name="ChevronRight" size={16} color="#6F7174" />
      </Pressable>
    );
  },
);

const ReactionInfoSheetComponent: React.FC<ReactionInfoSheetProps> = ({
  visible,
  onClose,
  tokenId,
}) => {
  const insets = useSafeAreaInsets();
  const { showUserProfile } = useUserProfileSheet();
  const SHEET_HEIGHT = SCREEN_HEIGHT * SHEET_FRACTION;
  const translateY = useSharedValue(SHEET_HEIGHT);
  const backdropOpacity = useSharedValue(0);
  const [isFullyClosed, setIsFullyClosed] = useState(!visible);

  const [people, setPeople] = useState<LikerUser[]>([]);
  const [counts, setCounts] = useState<Partial<Record<PostReaction, number>> | null>(null);
  const [canView, setCanView] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const fetchPage = useCallback(
    async (pageNum: number) => {
      if (pageNum === 0) setLoading(true);
      else setLoadingMore(true);
      try {
        const res = await getPostLikers({ tokenId, page: pageNum, limit: PAGE_LIMIT });
        setCanView(res.canViewLikers);
        setCounts(res.reactionCounts);
        setPeople((prev) => (pageNum === 0 ? res.data : [...prev, ...res.data]));
        setPage(pageNum);
        setHasMore(!!res.pagination?.hasMore);
      } catch (e) {
        console.error("[ReactionInfoSheet] fetch error:", e);
        if (pageNum === 0) setPeople([]);
        setHasMore(false);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [tokenId],
  );

  useEffect(() => {
    if (visible) {
      setIsFullyClosed(false);
      fetchPage(0);
      translateY.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) });
      backdropOpacity.value = withTiming(1, { duration: 250 });
    } else {
      translateY.value = withTiming(
        SHEET_HEIGHT,
        { duration: 220, easing: Easing.in(Easing.cubic) },
        () => {
          runOnJS(setIsFullyClosed)(true);
        },
      );
      backdropOpacity.value = withTiming(0, { duration: 180 });
    }
    // fetchPage is stable per tokenId; re-running on every render would refetch
    // the list underneath the reader.
  }, [visible, translateY, backdropOpacity, SHEET_HEIGHT, fetchPage]);

  const closeSheet = useCallback(() => {
    translateY.value = withTiming(
      SHEET_HEIGHT,
      { duration: 220, easing: Easing.in(Easing.cubic) },
      () => {
        runOnJS(onClose)();
      },
    );
    backdropOpacity.value = withTiming(0, { duration: 180 });
  }, [translateY, backdropOpacity, onClose, SHEET_HEIGHT]);

  const gesture = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY > 0) translateY.value = e.translationY;
    })
    .onEnd((e) => {
      if (e.translationY > 100 || e.velocityY > 500) {
        runOnJS(closeSheet)();
      } else {
        translateY.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));

  const handlePersonPress = useCallback(
    (address: string) => {
      closeSheet();
      showUserProfile(address);
    },
    [closeSheet, showUserProfile],
  );

  /**
   * The server hands rows back already in taxonomy order, so sections only ever
   * gain members as later pages land — nothing reshuffles mid-scroll.
   */
  const sections = useMemo<ReactionSection[]>(() => {
    const byReaction = new Map<PostReaction, LikerUser[]>();
    people.forEach((person) => {
      const key = (person.reaction ?? "like") as PostReaction;
      const bucket = byReaction.get(key);
      if (bucket) bucket.push(person);
      else byReaction.set(key, [person]);
    });
    return REACTION_LIST.map((meta) => ({
      key: meta.key,
      emoji: meta.emoji,
      label: meta.label,
      total: counts?.[meta.key] ?? byReaction.get(meta.key)?.length ?? 0,
      data: byReaction.get(meta.key) ?? [],
    })).filter((section) => section.total > 0 || section.data.length > 0);
  }, [people, counts]);

  const totalReactions = useMemo(
    () => sections.reduce((sum, section) => sum + section.total, 0),
    [sections],
  );

  if (!visible && isFullyClosed) return null;

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={closeSheet}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.5)" }, backdropStyle]}>
          <Pressable style={{ flex: 1 }} onPress={closeSheet} />
        </Animated.View>

        <Animated.View
          style={[glassStyles.sheet, { height: SHEET_HEIGHT, paddingBottom: insets.bottom }, sheetStyle]}
        >
          <View style={[StyleSheet.absoluteFill, glassStyles.overlay]} />

          <GestureDetector gesture={gesture}>
            <Animated.View className="items-center py-2.5">
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)" }} />
              <Text style={{ color: "#F9FBFF", fontSize: 15, fontWeight: "600", marginTop: 8 }}>
                Reactions
                {totalReactions > 0 && <Text style={{ color: "#8B8D90", fontWeight: "400" }}> · {totalReactions}</Text>}
              </Text>
            </Animated.View>
          </GestureDetector>

          {loading ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <ActivityIndicator color="#8B8D90" />
            </View>
          ) : !canView ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
              <Text style={{ color: "#6F7174", fontSize: 14, textAlign: "center" }}>
                Only the author can see who reacted to a post.
              </Text>
            </View>
          ) : sections.length === 0 ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: "#6F7174", fontSize: 14 }}>No reactions yet.</Text>
            </View>
          ) : (
            <SectionList
              sections={sections}
              keyExtractor={(item, index) => `${item.address}-${index}`}
              renderItem={({ item }) => <PersonRow item={item} onPress={handlePersonPress} />}
              renderSectionHeader={({ section }) => (
                <View style={glassStyles.sectionHeader}>
                  <Text style={{ fontSize: 15 }}>{section.emoji}</Text>
                  <Text style={{ color: "#F9FBFF", fontSize: 13, fontWeight: "600", marginLeft: 8 }}>
                    {section.label}
                  </Text>
                  <Text style={{ color: "#8B8D90", fontSize: 13, marginLeft: 6 }}>{section.total}</Text>
                </View>
              )}
              stickySectionHeadersEnabled={false}
              onEndReached={() => {
                if (hasMore && !loadingMore && !loading) fetchPage(page + 1);
              }}
              onEndReachedThreshold={0.4}
              ListFooterComponent={
                loadingMore ? (
                  <View style={{ paddingVertical: 16 }}>
                    <ActivityIndicator color="#8B8D90" />
                  </View>
                ) : null
              }
              contentContainerStyle={{ paddingBottom: 24 }}
            />
          )}
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
};

const glassStyles = StyleSheet.create({
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
  },
  overlay: {
    backgroundColor: "#0C0C0E",
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
});

export const ReactionInfoSheet = memo(ReactionInfoSheetComponent);
export default ReactionInfoSheet;
