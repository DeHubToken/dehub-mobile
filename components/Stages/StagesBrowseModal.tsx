import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, Platform } from "react-native";
import { TouchableOpacity } from "react-native";
import { Audio } from "expo-av";
import Slider from "@react-native-community/slider";
import GlassModal from "../ui/GlassModal";
import Icon from "../ui/Icon";
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
    isLoading,
    isModalOpen,
    initialModalView,
    currentSpace,
    joinSpace,
    openModal,
    closeModal,
    refreshSpaces,
    endSpace,
  } = useStages();

  const { user } = useAuth();
  const userAddress = user?.walletAddress || user?.address || "";

  // Selected past space for transcript sheet
  const [selectedPastSpace, setSelectedPastSpace] = useState<AudioSpace | null>(null);

  // List audio playback states
  const listSoundRef = useRef<Audio.Sound | null>(null);
  const [playingSpaceId, setPlayingSpaceId] = useState<string | null>(null);
  const [isListAudioPlaying, setIsListAudioPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [isAudioLoading, setIsAudioLoading] = useState(false);

  const unloadListSound = async () => {
    if (listSoundRef.current) {
      try {
        await listSoundRef.current.unloadAsync();
      } catch (e) {
        console.warn("Error unloading list sound", e);
      }
      listSoundRef.current = null;
    }
    setPlayingSpaceId(null);
    setIsListAudioPlaying(false);
    setPositionMs(0);
    setDurationMs(0);
  };

  const togglePlayPastSpace = async (space: AudioSpace) => {
    if (!space.recording_url) return;

    // Toggle play/pause if this is already the playing space
    if (playingSpaceId === space.id && listSoundRef.current) {
      try {
        const status = await listSoundRef.current.getStatusAsync();
        if (status.isLoaded) {
          if (status.isPlaying) {
            await listSoundRef.current.pauseAsync();
          } else {
            await listSoundRef.current.playAsync();
          }
        }
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
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      const { sound } = await Audio.Sound.createAsync(
        { uri: space.recording_url },
        { shouldPlay: true },
        (status) => {
          if (!status.isLoaded) return;
          setIsListAudioPlaying(status.isPlaying);
          setPositionMs(status.positionMillis);
          if (status.durationMillis) {
            setDurationMs(status.durationMillis);
          }
          if (status.didJustFinish) {
            unloadListSound();
          }
        }
      );
      listSoundRef.current = sound;
    } catch (e) {
      console.warn("Error loading audio in list", e);
      setPlayingSpaceId(null);
    } finally {
      setIsAudioLoading(false);
    }
  };

  const seekListSound = async (val: number) => {
    if (listSoundRef.current) {
      try {
        await listSoundRef.current.setPositionAsync(Math.round(val));
      } catch (e) {
        console.warn("Seek error", e);
      }
    }
  };

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

  // Clean up list audio on unmount
  useEffect(() => {
    return () => {
      if (listSoundRef.current) {
        listSoundRef.current.unloadAsync().catch(() => {});
      }
    };
  }, []);

  if (!isModalOpen || initialModalView !== "browse") return null;

  const handleCreate = () => openModal("create");

  const renderLiveItem = (item: AudioSpace) => {
    const isMySpace = item.host_wallet_address === userAddress;
    const isCurrentSpace = currentSpace?.id === item.id;
    const totalListeners = item.listener_count || 0;
    const hostName = item.host_username || `${item.host_wallet_address?.slice(0, 6)}...`;

    return (
      <TouchableOpacity
        key={item.id}
        style={[styles.spaceItem, isMySpace && styles.mySpaceItem]}
        onPress={() => {
          if (isCurrentSpace) {
            openModal("live");
          } else if (isMySpace) {
            openModal("live");
          } else {
            joinSpace(item.id).then((ok) => {
              if (ok) openModal("live");
            });
          }
        }}
        activeOpacity={0.7}
      >
        <View style={[styles.spaceAvatar, isMySpace && styles.mySpaceAvatar]}>
          <Icon name="Radio" size={20} color={isMySpace ? "#fff" : "#FFFFFF"} />
        </View>
        <View style={styles.spaceInfo}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={styles.spaceTitle} numberOfLines={1}>
              {item.title}
            </Text>
            {isMySpace && (
              <View style={{ backgroundColor: "#A855F7", borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 }}>
                <Text style={{ color: "#fff", fontSize: 9, fontWeight: "700" }}>YOURS</Text>
              </View>
            )}
          </View>
          <Text style={styles.spaceSub}>
            @{hostName} · {item.speaker_count} speaking · {totalListeners} listening
          </Text>
        </View>
        {isMySpace && (
          <TouchableOpacity
            onPress={endSpace}
            style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: "#ef4444" }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>End</Text>
          </TouchableOpacity>
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
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Icon
                name={isPlaying && isListAudioPlaying ? "Pause" : "Play"}
                size={16}
                color={hasRecording ? "#FFFFFF" : "rgba(255,255,255,0.3)"}
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
              minimumTrackTintColor="#A855F7"
              maximumTrackTintColor="rgba(255,255,255,0.12)"
              thumbTintColor="#A855F7"
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
  spaceItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 6,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  mySpaceItem: {
    borderColor: "rgba(168,85,247,0.35)",
    backgroundColor: "rgba(168,85,247,0.08)",
  },
  spaceAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  mySpaceAvatar: {
    backgroundColor: "rgba(168,85,247,0.25)",
  },
  spaceInfo: {
    flex: 1,
  },
  spaceTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "500",
  },
  spaceSub: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 13,
    marginTop: 2,
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
    borderRadius: 16,
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
    borderRadius: 16,
    backgroundColor: "rgba(168,85,247,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.25)",
  },
  playingBtn: {
    backgroundColor: "#A855F7",
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
    color: "rgba(255,255,255,0.4)",
    fontSize: 9,
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
  },
});

export default StagesBrowseModal;
