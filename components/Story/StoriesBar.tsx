import React, { useCallback, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Image } from "expo-image";
import ShimmerBorder from "./ShimmerBorder";
// import AddStorySheet from "./AddStorySheet";
import Avatar from "../common/Avatar";
import { getAvatarUrl } from "../../libs";
import { theme } from "../../theme";
import { useStoriesFeed, type StoryUserGroup } from "../../hooks/useStoriesFeed";
import { useWatchedStories } from "../../hooks/useWatchedStories";
import { useStoryViewer } from "../../context/StoryViewerContext";
import { useUser } from "../../context/AuthContext";
// import { ScreenNames } from "../../navigation/ScreenNames";

const BUBBLE = 60;

interface StoriesBarProps {
  /** Refresh when parent uploads a story */
  refreshKey?: number;
}

const StoriesBar: React.FC<StoriesBarProps> = ({ refreshKey = 0 }) => {
  const user = useUser() as any;
  const walletAddress = user?.walletAddress || user?.address || "";
  const { storyUsers, flatStories, loading, refresh } = useStoriesFeed(true);
  const { markWatched, isWatched } = useWatchedStories();
  const { openStories } = useStoryViewer();

  // Story create/upload hidden for now — view-only.
  // const [addOpen, setAddOpen] = useState(false);

  React.useEffect(() => {
    refresh();
  }, [refreshKey, refresh]);

  const sortedUsers = useMemo(() => {
    const copy = [...storyUsers];
    copy.sort((a, b) => {
      const aWatched = isWatched(a.previewStory.id);
      const bWatched = isWatched(b.previewStory.id);
      if (aWatched !== bWatched) return aWatched ? 1 : -1;
      return (
        new Date(b.previewStory.created_at).getTime() -
        new Date(a.previewStory.created_at).getTime()
      );
    });
    return copy;
  }, [storyUsers, isWatched]);

  const openGroup = useCallback(
    (group: StoryUserGroup) => {
      if (!flatStories.length) return;
      const idx = flatStories.findIndex(
        (s) =>
          (s.wallet_address || "").toLowerCase() ===
          (group.wallet_address || "").toLowerCase(),
      );
      markWatched(group.previewStory.id);
      openStories(flatStories, {
        initialIndex: idx >= 0 ? idx : 0,
        viewerWalletAddress: walletAddress,
        onStoryShown: (story) => markWatched(story.id),
        onStoriesChanged: refresh,
      });
    },
    [flatStories, markWatched, openStories, walletAddress, refresh],
  );

  // const handleCreatePress = useCallback(() => {
  //   if (!isSignedIn) {
  //     navigation.navigate(ScreenNames.SignIn as never);
  //     return;
  //   }
  //   setAddOpen(true);
  // }, [isSignedIn, navigation]);

  const resolveThumb = useCallback((group: StoryUserGroup) => {
    const thumb = group.previewStory.thumbnail_url;
    if (thumb) return thumb;
    const avatar = group.avatar;
    if (!avatar) return undefined;
    if (avatar.startsWith("http")) return avatar;
    const url = getAvatarUrl(avatar);
    return url === "default-avatar" ? undefined : url;
  }, []);

  const resolveAvatar = useCallback((group: StoryUserGroup) => {
    const avatar = group.avatar;
    if (!avatar) return undefined;
    if (avatar.startsWith("http")) return avatar;
    const url = getAvatarUrl(avatar);
    return url === "default-avatar" ? undefined : url;
  }, []);

  if (loading && sortedUsers.length === 0) {
    return (
      <View style={styles.loadingRow}>
        <ActivityIndicator color={theme.colors.accent} size="small" />
      </View>
    );
  }

  if (!loading && sortedUsers.length === 0) {
    return null;
  }

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {/* Create story — disabled for now
        <Pressable style={styles.item} onPress={handleCreatePress}>
          <View style={styles.createOuter}>
            <View style={styles.createInner}>
              <Ionicons name="add" size={26} color="#fff" />
            </View>
          </View>
          <Text style={styles.label} numberOfLines={1}>
            Create
          </Text>
        </Pressable>
        */}

        {sortedUsers.map((group) => {
          const unwatched = !isWatched(group.previewStory.id);
          const thumb = resolveThumb(group);
          const avatar = resolveAvatar(group);
          const label =
            group.username ||
            `${group.wallet_address.slice(0, 6)}…`;

          return (
            <Pressable
              key={group.wallet_address}
              style={styles.item}
              onPress={() => openGroup(group)}
            >
              <ShimmerBorder active={unwatched} size={BUBBLE} borderRadius={12}>
                {thumb ? (
                  <Image
                    source={{ uri: thumb }}
                    style={styles.thumb}
                    contentFit="cover"
                    recyclingKey={thumb}
                    cachePolicy="memory-disk"
                  />
                ) : (
                  <Avatar uri={avatar} size={BUBBLE - 4} name={label} rounded={false} />
                )}
              </ShimmerBorder>
              <Text style={styles.label} numberOfLines={1}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* <AddStorySheet
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        walletAddress={walletAddress}
        username={user?.username}
        avatar={user?.avatarImageUrl}
        onUploaded={refresh}
      /> */}
    </>
  );
};

export default StoriesBar;

const styles = StyleSheet.create({
  loadingRow: { paddingVertical: 14, alignItems: "center" },
  scroll: { paddingHorizontal: 12, paddingVertical: 10, gap: 10 },
  item: { width: 68, alignItems: "center" },
  createOuter: {
    width: BUBBLE,
    height: BUBBLE,
    borderRadius: 12,
    padding: 2,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  createInner: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  thumb: { width: "100%", height: "100%" },
  label: {
    marginTop: 6,
    fontSize: 11,
    color: "#9CA3AF",
    textAlign: "center",
    width: 64,
  },
});
