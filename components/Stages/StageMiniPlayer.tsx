import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { TouchableOpacity } from "react-native";
import Icon from "../ui/Icon";
import { useStages } from "../../context/StageContext";

const StageMiniPlayer: React.FC = () => {
  const { currentSpace, isConnected, myRole, leaveSpace, endSpace, openModal, screenShareUid } =
    useStages();

  if (!currentSpace || !isConnected) return null;

  const isHost = myRole === "host";
  // The screen only exists inside the full room, so the collapsed player says
  // one is up rather than reading as a stage with nothing to look at.
  const isWatchingScreen = screenShareUid != null;

  return (
    <TouchableOpacity activeOpacity={0.9} onPress={() => openModal("live")} style={styles.container}>
      <View style={styles.info}>
        <View style={styles.iconWrap}>
          <Icon name="Radio" size={14} color="#D4D4D8" />
        </View>
        <View>
          <Text style={styles.title} numberOfLines={1}>{currentSpace.title}</Text>
          <View style={styles.subtitleRow}>
            <Text style={styles.subtitle}>{isHost ? "Hosting" : myRole === "speaker" ? "Speaking" : "Listening"}</Text>
            {isWatchingScreen && (
              <>
                <Text style={styles.subtitle}>·</Text>
                <Icon name="ScreenShare" size={11} color="rgba(255,255,255,0.7)" />
              </>
            )}
          </View>
        </View>
      </View>
      <TouchableOpacity
        onPress={isHost ? endSpace : leaveSpace}
        style={[styles.leaveBtn, isHost && styles.endBtn]}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={[styles.leaveText, isHost && styles.endText]}>{isHost ? "End" : "Leave"}</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 80,
    left: 16,
    right: 16,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#0C0C0E",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    zIndex: 99,
  },
  info: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "500",
    maxWidth: 160,
  },
  subtitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  subtitle: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
  },
  leaveBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: "rgba(239,68,68,0.2)",
  },
  leaveText: {
    color: "#EF4444",
    fontSize: 12,
    fontWeight: "600",
  },
  endBtn: {
    backgroundColor: "#ef4444",
  },
  endText: {
    color: "#fff",
  },
});

export default StageMiniPlayer;
