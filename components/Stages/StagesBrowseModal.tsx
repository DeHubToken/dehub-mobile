import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, Platform, Alert, Share } from "react-native";
import { TouchableOpacity } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useAudioPlayer } from "expo-audio";
import { configureForPlayback } from "../../libs/audioSession";
import Slider from "@react-native-community/slider";
import GlassModal from "../ui/GlassModal";
import Icon from "../ui/Icon";
import Avatar from "../common/Avatar";
import { getAvatarUrl } from "../../libs/misc";
import { ShareLinks } from "../../navigation/linking.config";
import { useStages } from "../../context/StageContext";
import { useAuth } from "../../context/AuthContext";
import type { AudioSpace } from "../../hooks/useStages";
import { StageTranscriptSheet } from "./StageTranscriptSheet";

const formatTimestamp = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const formatDate = (dateStr?: string | null) => {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch (e) {
    return "";
  }
};

const StagesBrowseModal: React.FC = () => {
  const {
    liveSpaces,
    pastSpaces,
    scheduledSpaces,
    isLoading,
    isModalOpen,
    initialModalView,
    currentSpace,
    joinSpace,
    openModal,
    closeModal,
    refreshSpaces,
    endSpace,
    startScheduledSpace,
    cancelScheduledSpace,
  } = useStages();

  const { user } = useAuth();
  const userAddress = user?.walletAddress || user?.address || "";

  // Selected past space for transcript sheet
  const [selectedPastSpace, setSelectedPastSpace] = useState<AudioSpace | null>(null);

  // List audio playback states
  // One long-lived player, source attached on demand via replace(). The hook
  // releases it on unmount, so there is no manual unload.
  const player = useAudioPlayer(null);
  const [playingSpaceId, setPlayingSpaceId] = useState<string | null>(null);
  const [isListAudioPlaying, setIsListAudioPlaying] = useState(false);
  // NOTE: this component works in MILLISECONDS throughout — the slider's
  // maximumValue/value and formatTimestamp(x / 1000) all assume it. expo-audio
  // reports SECONDS, so the conversion happens at the two boundaries below
  // (the status listener and seekListSound) and nothing else changes.
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [isAudioLoading, setIsAudioLoading] = useState(false);

  const unloadListSound = async () => {
    try {
      player.pause();
      await player.seekTo(0);
    } catch (e) {
      console.warn("Error stopping list sound", e);
    }
    setPlayingSpaceId(null);
    setIsListAudioPlaying(false);
    setPositionMs(0);
    setDurationMs(0);
  };

  const togglePlayPastSpace = async (space: AudioSpace) => {
    if (!space.recording_url) return;

    // Toggle play/pause if this is already the playing space. isLoaded and
    // playing are plain properties in expo-audio, and play()/pause() are
    // synchronous.
    if (playingSpaceId === space.id && player.isLoaded) {
      try {
        if (player.playing) player.pause();
        else player.play();
      } catch (e) {
        console.warn("Toggle play/pause failed", e);
      }
      return;
    }

    // Unload existing audio first
    await unloadListSound();
    setIsAudioLoading(true);
    setPlayingSpaceId(space.id);

    try {
      await configureForPlayback();
      // Status updates are delivered by the listener effect below rather than
      // a per-Sound callback.
      player.replace({ uri: space.recording_url });
      player.play();
    } catch (e) {
      console.warn("Error loading audio in list", e);
      setPlayingSpaceId(null);
    } finally {
      setIsAudioLoading(false);
    }
  };

  // The slider hands us MILLISECONDS; expo-audio's seekTo takes SECONDS.
  const seekListSound = async (val: number) => {
    try {
      await player.seekTo(val / 1000);
    } catch (e) {
      console.warn("Seek error", e);
    }
  };

  // Drives the scrubber. expo-audio reports currentTime/duration in SECONDS,
  // so both are converted to milliseconds to match this component's state.
  useEffect(() => {
    const sub = player.addListener("playbackStatusUpdate", (status) => {
      if (!status.isLoaded) return;
      setIsListAudioPlaying(status.playing);
      setPositionMs(status.currentTime * 1000);
      if (status.duration) {
        setDurationMs(status.duration * 1000);
      }
      if (status.didJustFinish) {
        unloadListSound();
      }
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player]);

  useEffect(() => {
    if (isModalOpen && initialModalView === "browse") {
      refreshSpaces();
    }
  }, [isModalOpen, initialModalView, refreshSpaces]);

  // Clean up playback when modal is closed
  useEffect(() => {
    if (!isModalOpen || initialModalView !== "browse") {
      unloadListSound();
    }
  }, [isModalOpen, initialModalView]);

  // Clean up playback when transcript sheet opens
  useEffect(() => {
    if (selectedPastSpace) {
      unloadListSound();
    }
  }, [selectedPastSpace]);

  // Stop playback on unmount. The native player itself is released by
  // useAudioPlayer, so there is nothing to unload here.
  useEffect(() => {
    return () => {
      try {
        player.pause();
      } catch {}
    };
  }, [player]);

  if (!isModalOpen || initialModalView !== "browse") return null;

  const handleCreate = () => openModal("create");

  /**
   * A stage that has been announced but has not started.
   *
   * The host gets Start now / Cancel inline; everyone else gets the
   * announcement and nothing to tap, because there is no room to walk into yet.
   *
   * Laid out as a card rather than a list row, matching web's
   * ScheduledStageCard: the cover is the point of an announcement, and behind
   * a 68pt row it was a letterbox strip of an image nobody could read. The
   * cover now backs a full card at the same 16:9-ish proportion web gives it,
   * under web's own bottom-anchored gradient rather than a flat 62% wash.
   */
  const renderScheduledItem = (item: AudioSpace) => {
    const isMySpace = item.host_wallet_address === userAddress;
    const starts = item.scheduled_at ? new Date(item.scheduled_at) : null;
    const isOverdue = !!starts && starts.getTime() < Date.now();
    const hostName = item.host_username || `${item.host_wallet_address?.slice(0, 6)}...`;
    const when = starts
      ? `${starts.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} · ${starts.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`
      : "";
    const hasCover = !!item.cover_image_url;

    return (
      <View
        key={item.id}
        style={[styles.scheduledCard, hasCover ? styles.scheduledCardCovered : styles.scheduledCardFlat]}
      >
        {hasCover && (
          <>
            <Image
              source={{ uri: item.cover_image_url! }}
              style={styles.scheduledCover}
              contentFit="cover"
              transition={180}
            />
            {/* Web's `bg-gradient-to-t from-black via-black/80 to-black/50` —
                densest at the bottom, where the title and buttons sit. */}
            <LinearGradient
              colors={["rgba(0,0,0,0.5)", "rgba(0,0,0,0.8)", "rgba(0,0,0,0.96)"]}
              locations={[0, 0.55, 1]}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
          </>
        )}

        <View style={styles.scheduledBody}>
          <View style={styles.scheduledTopRow}>
            <View style={styles.scheduledChip}>
              <Icon name="CalendarDays" size={12} color="#D4D4D8" />
              <Text style={styles.scheduledChipText}>
                {isOverdue ? "Starting soon" : "Upcoming"}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                Share.share({
                  message: `🎙️ ${item.title} — live on Stages${when ? ` ${when}` : ""}\n\n${ShareLinks.stage(item)}`,
                }).catch(() => {});
              }}
              hitSlop={8}
              style={styles.scheduledIconBtn}
              accessibilityRole="button"
              accessibilityLabel="Share invite link"
            >
              <Icon name="Link" size={14} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>
          </View>

          <View style={styles.scheduledHostRow}>
            <Avatar
              uri={item.host_avatar ? getAvatarUrl(item.host_avatar, 40) : null}
              size={40}
              name={item.host_username || item.host_wallet_address}
              borderWidth={2}
              borderColor="rgba(255,255,255,0.2)"
            />
            <View style={styles.scheduledHostText}>
              <Text style={styles.scheduledHostedBy}>Hosted by</Text>
              <Text style={styles.scheduledHostName} numberOfLines={1}>
                @{hostName}
              </Text>
            </View>
          </View>

          <Text style={styles.scheduledTitle} numberOfLines={2}>
            {item.title}
          </Text>
          {!!starts && (
            <View style={styles.scheduledWhenRow}>
              <Icon name="CalendarDays" size={12} color="#D4D4D8" />
              <Text style={styles.scheduledWhen} numberOfLines={1}>
                {when}
              </Text>
            </View>
          )}
          {!!item.description && (
            <Text style={styles.scheduledDesc} numberOfLines={2}>
              {item.description}
            </Text>
          )}

          {isMySpace && (
            <View style={styles.scheduledActions}>
              <TouchableOpacity
                onPress={() => {
                  startScheduledSpace(item.id).then((ok) => {
                    if (ok) openModal("live");
                  });
                }}
                style={styles.scheduledStartBtn}
                accessibilityRole="button"
              >
                <Icon name="Radio" size={15} color="#09090B" />
                <Text style={styles.scheduledStartText}>Start now</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  Alert.alert(
                    "Cancel stage?",
                    `"${item.title}" will be removed and its link stops working.`,
                    [
                      { text: "Keep it", style: "cancel" },
                      {
                        text: "Cancel stage",
                        style: "destructive",
                        onPress: () => { void cancelScheduledSpace(item.id); },
                      },
                    ],
                  );
                }}
                style={styles.scheduledCancelBtn}
                accessibilityRole="button"
                accessibilityLabel="Cancel scheduled stage"
              >
                <Text style={styles.scheduledCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    );
  };

  const renderLiveItem = (item: AudioSpace) => {
    const isMySpace = item.host_wallet_address === userAddress;
    const isCurrentSpace = currentSpace?.id === item.id;
    const totalListeners = item.listener_count || 0;
    const hostName = item.host_username || `${item.host_wallet_address?.slice(0, 6)}...`;

    return (
      <TouchableOpacity
        key={item.id}
        style={[styles.liveCard, isMySpace && styles.liveCardMine]}
        onPress={() => {
          if (isCurrentSpace || isMySpace) {
            openModal("live");
          } else {
            joinSpace(item.id).then((ok) => {
              if (ok) openModal("live");
            });
          }
        }}
        activeOpacity={0.85}
      >
        {!!item.cover_image_url && (
          <>
            <Image
              source={{ uri: item.cover_image_url }}
              style={styles.scheduledCover}
              contentFit="cover"
              transition={180}
            />
            <LinearGradient
              colors={["rgba(0,0,0,0.5)", "rgba(0,0,0,0.8)", "rgba(0,0,0,0.96)"]}
              locations={[0, 0.55, 1]}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
          </>
        )}

        <View style={styles.liveTopRow}>
          <View style={styles.liveChip}>
            <View style={styles.liveDot} />
            <Text style={styles.liveChipText}>
              {isCurrentSpace ? "IN THIS STAGE" : isMySpace ? "YOURS · LIVE" : "LIVE"}
            </Text>
          </View>
          <View style={styles.liveCountRow}>
            <Icon name="Users" size={13} color="rgba(255,255,255,0.5)" />
            {/* Web counts the host in; a stage with a host and no audience read
                as "0 listening" here while web showed 1. */}
            <Text style={styles.liveCountText}>
              {Math.max(1, (item.speaker_count || 1) + totalListeners)}
            </Text>
          </View>
        </View>

        <View style={styles.scheduledHostRow}>
          <Avatar
            uri={item.host_avatar ? getAvatarUrl(item.host_avatar, 40) : null}
            size={40}
            name={item.host_username || item.host_wallet_address}
            borderWidth={2}
            borderColor="rgba(255,255,255,0.2)"
          />
          <View style={styles.scheduledHostText}>
            <Text style={styles.scheduledHostedBy}>Hosted by</Text>
            <Text style={styles.scheduledHostName} numberOfLines={1}>
              @{hostName}
            </Text>
          </View>
          {isMySpace && (
            <TouchableOpacity
              onPress={endSpace}
              style={styles.liveEndBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="End this stage"
            >
              <Text style={styles.liveEndText}>End</Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.scheduledTitle} numberOfLines={2}>
          {item.title}
        </Text>
        {!!item.description && (
          <Text style={styles.scheduledDesc} numberOfLines={2}>
            {item.description}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  const renderPastItem = (item: AudioSpace) => {
    const isPlaying = playingSpaceId === item.id;
    const hostName = item.host_username || `${item.host_wallet_address?.slice(0, 6)}...`;
    const hasRecording = !!item.recording_url;

    return (
      <View key={item.id} style={styles.pastSpaceItem}>
        <View style={styles.pastSpaceRow}>
          <TouchableOpacity
            onPress={() => togglePlayPastSpace(item)}
            disabled={!hasRecording || (isAudioLoading && isPlaying)}
            style={[
              styles.playBtn,
              isPlaying && isListAudioPlaying && styles.playingBtn,
              !hasRecording && { opacity: 0.35, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.05)" }
            ]}
          >
            {isAudioLoading && isPlaying ? (
              <ActivityIndicator
                size="small"
                color={isListAudioPlaying ? "#09090B" : "#fff"}
              />
            ) : (
              <Icon
                name={isPlaying && isListAudioPlaying ? "Pause" : "Play"}
                size={16}
                color={
                  isPlaying && isListAudioPlaying
                    ? "#09090B"
                    : hasRecording
                      ? "#FFFFFF"
                      : "rgba(255,255,255,0.3)"
                }
                fill={(isPlaying && isListAudioPlaying) || !hasRecording ? undefined : "#FFFFFF"}
              />
            )}
          </TouchableOpacity>

          <View style={styles.pastSpaceInfo}>
            <Text style={styles.pastSpaceTitle} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.pastSpaceSub} numberOfLines={1}>
              @{hostName} · {formatDate(item.ended_at)}{!hasRecording && " · No recording"}
            </Text>
          </View>

          {hasRecording && (
            <TouchableOpacity onPress={() => setSelectedPastSpace(item)} style={styles.transcriptBtn}>
              <Icon name="FileText" size={12} color="#FFFFFF" />
              <Text style={styles.transcriptBtnText}>Transcript</Text>
            </TouchableOpacity>
          )}
        </View>

        {isPlaying && (
          <View style={styles.scrubberContainer}>
            <Slider
              minimumValue={0}
              maximumValue={durationMs || 1}
              value={positionMs}
              onSlidingComplete={seekListSound}
              minimumTrackTintColor="#D4D4D8"
              maximumTrackTintColor="rgba(255,255,255,0.12)"
              thumbTintColor="#D4D4D8"
              style={{ height: 16, marginHorizontal: -8 }}
            />
            <View style={styles.timeRow}>
              <Text style={styles.timeText}>{formatTimestamp(positionMs / 1000)}</Text>
              <Text style={styles.timeText}>{formatTimestamp(durationMs / 1000)}</Text>
            </View>
          </View>
        )}
      </View>
    );
  };

  return (
    <>
      <GlassModal visible={true} onClose={closeModal} presentation="bottom" maxHeight="90%">
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Stages</Text>
            <TouchableOpacity onPress={handleCreate} style={styles.createBtn}>
              <Icon name="Plus" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
            {/* Live Stages Section */}
            <Text style={styles.sectionTitle}>Live Stages</Text>
            {isLoading ? (
              <ActivityIndicator size="large" color="#FFFFFF" style={styles.loader} />
            ) : liveSpaces.length === 0 ? (
              <View style={styles.empty}>
                <Icon name="Radio" size={24} color="rgba(255,255,255,0.3)" />
                <Text style={styles.emptyText}>No live stages right now</Text>
                <TouchableOpacity onPress={handleCreate} style={styles.startBtn}>
                  <Text style={styles.startBtnText}>Start one</Text>
                </TouchableOpacity>
              </View>
            ) : (
              liveSpaces.map((item) => renderLiveItem(item))
            )}

            {/* Upcoming Stages Section — only when there are any, so the modal
                does not grow a permanently empty shelf for a feature most
                browsing users never touch. */}
            {scheduledSpaces.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Upcoming</Text>
                {scheduledSpaces.map((item) => renderScheduledItem(item))}
              </>
            )}

            {/* Past Stages Section */}
            <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Past Stages</Text>
            {pastSpaces.length === 0 ? (
              <View style={styles.empty}>
                <Icon name="FileText" size={24} color="rgba(255,255,255,0.3)" />
                <Text style={styles.emptyText}>No past stages recorded yet</Text>
              </View>
            ) : (
              pastSpaces.map((item) => renderPastItem(item))
            )}
          </ScrollView>
        </View>
      </GlassModal>

      {/* Transcript Sheet */}
      <StageTranscriptSheet
        space={selectedPastSpace}
        visible={!!selectedPastSpace}
        onClose={() => setSelectedPastSpace(null)}
      />
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
  },
  createBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  scrollView: {
    maxHeight: 520,
  },
  sectionTitle: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 1,
    opacity: 0.6,
  },
  // ── Live stage card ───────────────────────────────────────────────────────
  // Web's LiveStageCard shape: status chip + headcount, then host, then title.
  // The one piece not ported is the animated LiveWaveform strip along its
  // bottom — mobile has no shared waveform component for stages.
  liveCard: {
    borderRadius: 16,
    overflow: "hidden",
    padding: 14,
    marginBottom: 10,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  liveCardMine: {
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  liveTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  liveChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "rgba(239,68,68,0.2)",
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#EF4444",
  },
  liveChipText: {
    color: "#F87171",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  liveCountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  liveCountText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
  },
  liveEndBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "#EF4444",
  },
  liveEndText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },

  // ── Upcoming (scheduled) stage card ───────────────────────────────────────
  // The cover fills the card behind the content, so the card has to clip to
  // its own radius or the image squares off the corners.
  scheduledCard: {
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 10,
  },
  // With a cover, the card is given real height so the image reads as artwork
  // rather than as a tinted background. Without one there is nothing to show,
  // so it collapses to its content and keeps the modal's own surface treatment
  // instead of web's opaque zinc-900 (which would punch a hole in the glass).
  scheduledCardCovered: { minHeight: 176 },
  scheduledCardFlat: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  scheduledCover: { ...StyleSheet.absoluteFillObject },
  scheduledBody: {
    flex: 1,
    padding: 14,
    // Bottom-anchored, which is what makes the cover readable: the gradient is
    // densest at the bottom, so clustering the text there leaves the top of
    // the card as clear artwork instead of blacked-out empty space. With no
    // cover the card hugs its content and this has no effect.
    justifyContent: "flex-end",
  },
  scheduledTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  scheduledChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  scheduledChipText: {
    color: "#D4D4D8",
    fontSize: 11,
    fontWeight: "500",
  },
  scheduledIconBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  scheduledHostRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  scheduledHostText: { flex: 1, minWidth: 0 },
  scheduledHostedBy: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 10,
  },
  scheduledHostName: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "500",
  },
  scheduledTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 20,
  },
  scheduledWhenRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
  },
  scheduledWhen: {
    color: "#D4D4D8",
    fontSize: 12,
    flex: 1,
  },
  scheduledDesc: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
    marginTop: 4,
    lineHeight: 16,
  },
  scheduledActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  scheduledStartBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
  },
  scheduledStartText: {
    color: "#09090B",
    fontSize: 13,
    fontWeight: "600",
  },
  scheduledCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  scheduledCancelText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
  },
  loader: {
    paddingVertical: 20,
  },
  empty: {
    alignItems: "center",
    paddingVertical: 20,
    gap: 8,
  },
  emptyText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 13,
  },
  startBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    marginTop: 4,
  },
  startBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "500",
  },

  // Past stages styles
  pastSpaceItem: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  pastSpaceRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  playBtn: {
    width: 32,
    height: 32,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  playingBtn: {
    backgroundColor: "#D4D4D8",
  },
  pastSpaceInfo: {
    flex: 1,
    marginRight: 8,
  },
  pastSpaceTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "500",
  },
  pastSpaceSub: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 11,
    marginTop: 1,
  },
  transcriptBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  transcriptBtnText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "600",
  },
  scrubberContainer: {
    marginTop: 10,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  timeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 2,
  },
  timeText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 10,
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
  },
});

export default StagesBrowseModal;
