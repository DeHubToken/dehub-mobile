/**
 * Comment Likers Sheet
 * ====================
 * Who liked a comment. Opened by tapping the like button on your OWN comment —
 * the server refuses self-likes, so for the author that button is the door to
 * this list instead, matching web.
 *
 * AUTHOR-ONLY, ON BOTH SIDES
 * The server is the gate that counts: /comment-likers answers everyone but the
 * comment's author with `canViewLikers: false` and an empty list. An empty
 * `data` is therefore ambiguous on its own — read `canViewLikers` before
 * deciding nobody liked it.
 *
 * Same glass chrome as ReactionInfoSheet so the two read as one family.
 */

import React, { memo, useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  FlatList,
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
import { getCommentLikers, type CommentLiker } from "../../services/nft.service";
import { getAvatarUrl } from "../../libs/misc";
import { truncate } from "../../libs/strings.util";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const SHEET_FRACTION = 0.6;
const PAGE_LIMIT = 50;

interface CommentLikersSheetProps {
  visible: boolean;
  onClose: () => void;
  commentId: number | string | null;
}

const PersonRow: React.FC<{ item: CommentLiker; onPress: (address: string) => void }> = memo(
  ({ item, onPress }) => {
    const displayName = item.displayName || item.username || truncate(item.address, 12, "..");
    const handlePress = useCallback(() => onPress(item.address), [onPress, item.address]);

    return (
      <Pressable
        onPress={handlePress}
        style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10 }}
      >
        <Avatar uri={getAvatarUrl(item.avatarImageUrl || "")} size={38} rounded={false} name={displayName} />
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

const CommentLikersSheetComponent: React.FC<CommentLikersSheetProps> = ({
  visible,
  onClose,
  commentId,
}) => {
  const insets = useSafeAreaInsets();
  const { showUserProfile } = useUserProfileSheet();
  const SHEET_HEIGHT = SCREEN_HEIGHT * SHEET_FRACTION;
  const translateY = useSharedValue(SHEET_HEIGHT);
  const backdropOpacity = useSharedValue(0);
  const [isFullyClosed, setIsFullyClosed] = useState(!visible);

  const [people, setPeople] = useState<CommentLiker[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [canView, setCanView] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const fetchPage = useCallback(
    async (pageNum: number) => {
      if (commentId == null) return;
      if (pageNum === 0) setLoading(true);
      else setLoadingMore(true);
      try {
        const res = await getCommentLikers({ commentId, page: pageNum, limit: PAGE_LIMIT });
        setCanView(res.canViewLikers !== false);
        setTotalCount(res.pagination?.totalCount ?? res.data.length);
        setPeople((prev) => (pageNum === 0 ? res.data : [...prev, ...res.data]));
        setPage(pageNum);
        setHasMore(!!res.pagination?.hasMore);
      } catch (e) {
        console.error("[CommentLikersSheet] fetch error:", e);
        if (pageNum === 0) setPeople([]);
        setHasMore(false);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [commentId],
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
    // fetchPage is stable per commentId; re-running on every render would
    // refetch the list underneath the reader.
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
                Comment likes
                {totalCount > 0 && <Text style={{ color: "#8B8D90", fontWeight: "400" }}> · {totalCount}</Text>}
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
                Only the author can see who liked a comment.
              </Text>
            </View>
          ) : people.length === 0 ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: "#6F7174", fontSize: 14 }}>No likes yet.</Text>
            </View>
          ) : (
            <FlatList
              data={people}
              keyExtractor={(item, index) => `${item.address}-${index}`}
              renderItem={({ item }) => <PersonRow item={item} onPress={handlePersonPress} />}
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
});

export const CommentLikersSheet = memo(CommentLikersSheetComponent);
export default CommentLikersSheet;
