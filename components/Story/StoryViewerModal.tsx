import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  Dimensions,
  StatusBar,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { VideoView, useVideoPlayer } from "expo-video";
import { FEED_BUFFER_OPTIONS } from "../../libs/videoBuffering";
import { Image } from "expo-image";
import Icon from "../ui/Icon";
import { getAvatarUrl } from "../../libs";
import { formatRelativeFromNow } from "../../libs/date.util";
import type { Story } from "../../services/stories.service";
import { deleteStory } from "../../services/stories.service";
import { toastError, toastSuccess } from "../../libs/toast";

/** Resolve a story avatar (full URL as-is, otherwise via CDN helper). */
function resolveStoryAvatar(avatar?: string | null): string | undefined {
  if (!avatar) return undefined;
  if (avatar.startsWith("http")) return avatar;
  const url = getAvatarUrl(avatar);
  return url === "default-avatar" ? undefined : url;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

interface StorySlideProps {
  story: Story;
  isActive: boolean;
  onEnd: () => void;
  onProgress: (fraction: number) => void;
}

/** One story: plays its video and reports progress / completion. */
const StorySlide: React.FC<StorySlideProps> = ({ story, isActive, onEnd, onProgress }) => {
  const player = useVideoPlayer(story.video_url || null, (p) => {
    p.loop = false;
    p.muted = false;
    p.bufferOptions = FEED_BUFFER_OPTIONS;
  });

  useEffect(() => {
    if (!player) return;
    if (isActive) {
      try { player.currentTime = 0; player.play(); } catch {}
    } else {
      try { player.pause(); } catch {}
    }
  }, [isActive, player]);

  useEffect(() => {
    if (!player || !isActive) return;
    const id = setInterval(() => {
      try {
        const dur = player.duration || 0;
        const cur = player.currentTime || 0;
        if (dur > 0) {
          onProgress(Math.min(1, cur / dur));
          if (cur >= dur - 0.15) onEnd();
        }
      } catch {}
    }, 150);
    return () => clearInterval(id);
  }, [player, isActive, onEnd, onProgress]);

  return (
    <View style={StyleSheet.absoluteFill}>
      {story.thumbnail_url ? (
        <Image
          source={{ uri: story.thumbnail_url }}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          pointerEvents="none"
        />
      ) : null}
      {player ? (
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          nativeControls={false}
          pointerEvents="none"
        />
      ) : null}
    </View>
  );
};

interface StoryViewerModalProps {
  visible: boolean;
  stories: Story[];
  initialIndex?: number;
  onClose: () => void;
  /** Signed-in viewer wallet — enables delete on own stories */
  viewerWalletAddress?: string;
  onStoryShown?: (story: Story) => void;
  onStoriesChanged?: () => void;
}

const StoryViewerModal: React.FC<StoryViewerModalProps> = ({
  visible,
  stories,
  initialIndex = 0,
  onClose,
  viewerWalletAddress,
  onStoryShown,
  onStoriesChanged,
}) => {
  const insets = useSafeAreaInsets();
  const [liveStories, setLiveStories] = useState(stories);
  const [index, setIndex] = useState(initialIndex);
  const [progress, setProgress] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const indexRef = useRef(index);
  indexRef.current = index;

  useEffect(() => {
    setLiveStories(stories);
  }, [stories]);

  useEffect(() => {
    if (visible) {
      setIndex(initialIndex);
      setProgress(0);
    }
  }, [visible, initialIndex]);

  const current = liveStories[index];
  const isOwnStory =
    !!viewerWalletAddress &&
    !!current &&
    current.wallet_address.toLowerCase() === viewerWalletAddress.toLowerCase();

  useEffect(() => {
    if (visible && current) onStoryShown?.(current);
  }, [visible, current?.id, onStoryShown]);

  const handleDelete = useCallback(async () => {
    if (!current || !viewerWalletAddress || !isOwnStory || deleting) return;
    setDeleting(true);
    try {
      await deleteStory(current.id, viewerWalletAddress);
      toastSuccess("Story deleted");
      const nextStories = liveStories.filter((s) => s.id !== current.id);
      setLiveStories(nextStories);
      onStoriesChanged?.();
      if (nextStories.length === 0) {
        onClose();
      } else if (indexRef.current >= nextStories.length) {
        setIndex(nextStories.length - 1);
      }
    } catch (e: unknown) {
      toastError(e, "Failed to delete story");
    } finally {
      setDeleting(false);
    }
  }, [current, viewerWalletAddress, isOwnStory, deleting, liveStories, onClose, onStoriesChanged]);

  const goNext = useCallback(() => {
    setProgress(0);
    const next = indexRef.current + 1;
    if (next >= liveStories.length) {
      onClose();
    } else {
      setIndex(next);
    }
  }, [liveStories.length, onClose]);

  const goPrev = useCallback(() => {
    setProgress(0);
    setIndex((i) => Math.max(0, i - 1));
  }, []);

  if (!visible || liveStories.length === 0) return null;

  const avatar = resolveStoryAvatar(current?.avatar);

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} transparent={false} statusBarTranslucent>
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />

        <StorySlide
          key={current?.id || index}
          story={current}
          isActive
          onEnd={goNext}
          onProgress={setProgress}
        />

        {/* Progress segments */}
        <View style={[styles.progressRow, { top: insets.top + 12 }]}>
          {liveStories.map((s, i) => (
            <View key={s.id || i} style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: i < index ? "100%" : i === index ? `${progress * 100}%` : "0%" },
                ]}
              />
            </View>
          ))}
        </View>

        {/* Header: avatar + username + time + close */}
        <View style={[styles.header, { top: insets.top + 26 }]}>
          {avatar ? (
            <Image source={{ uri: avatar }} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={styles.avatar} />
          )}
          <View style={{ flex: 1, marginLeft: 8 }}>
            {!!current?.username && (
              <Text style={styles.username} numberOfLines={1}>@{current.username}</Text>
            )}
            <Text style={styles.timeAgo}>{formatRelativeFromNow(current?.created_at)}</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
            <Icon name="X" size={26} color="#fff" />
          </Pressable>
          {isOwnStory ? (
            <Pressable
              onPress={handleDelete}
              hitSlop={12}
              style={[styles.closeBtn, { marginLeft: 4 }]}
              disabled={deleting}
            >
              <Icon name="Trash2" size={22} color={deleting ? "#666" : "#fff"} />
            </Pressable>
          ) : null}
        </View>

        {/* Tap zones */}
        <Pressable style={styles.tapLeft} onPress={goPrev} />
        <Pressable style={styles.tapRight} onPress={goNext} />
      </View>
    </Modal>
  );
};

export default StoryViewerModal;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  progressRow: {
    position: "absolute",
    top: 12,
    left: 8,
    right: 8,
    flexDirection: "row",
    gap: 4,
    zIndex: 20,
  },
  progressTrack: {
    flex: 1,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.3)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#fff",
    borderRadius: 2,
  },
  header: {
    position: "absolute",
    top: 26,
    left: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    zIndex: 20,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#333",
  },
  username: { color: "#fff", fontSize: 14, fontWeight: "600" },
  timeAgo: { color: "rgba(255,255,255,0.7)", fontSize: 11 },
  closeBtn: { padding: 4 },
  tapLeft: {
    position: "absolute",
    left: 0,
    top: SCREEN_HEIGHT * 0.15,
    bottom: 0,
    width: SCREEN_WIDTH * 0.33,
    zIndex: 10,
  },
  tapRight: {
    position: "absolute",
    right: 0,
    top: SCREEN_HEIGHT * 0.15,
    bottom: 0,
    width: SCREEN_WIDTH * 0.67,
    zIndex: 10,
  },
});
