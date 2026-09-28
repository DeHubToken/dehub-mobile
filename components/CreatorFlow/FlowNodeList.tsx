/**
 * A Creator Flow read on a phone.
 * ===============================
 * Web draws a flow on a pannable canvas. A canvas the width of a thumb is a
 * poor way to read one, so the phone lists the nodes in the order they run —
 * each after the nodes feeding it — with what each one holds: the prompt,
 * the reference, the result. Videos play in the app's own player.
 */
import React, { useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import SmartImage from "../common/SmartImage";
import Icon, { type IconName } from "../ui/Icon";
import VideoPlayerCore from "../VideoPlayerCore";
import { nodeOutput, orderNodes, type FlowEdge, type FlowNode } from "../../services/creator-flows.service";

const NODE_META: Record<string, { icon: IconName; labelKey: string }> = {
  promptNode: { icon: "Type", labelKey: "creatorFlow.nodeText" },
  imageInputNode: { icon: "Image", labelKey: "creatorFlow.nodeImageInput" },
  videoInputNode: { icon: "Video", labelKey: "creatorFlow.nodeVideoInput" },
  imageGenNode: { icon: "ImagePlus", labelKey: "creatorFlow.nodeImageGen" },
  videoGenNode: { icon: "Clapperboard", labelKey: "creatorFlow.nodeVideoGen" },
  assistantNode: { icon: "Sparkles", labelKey: "creatorFlow.nodeAssistant" },
};

const STATUS_KEYS: Record<string, string> = {
  pending: "creatorFlow.status_pending",
  running: "creatorFlow.status_running",
  done: "creatorFlow.status_done",
  error: "creatorFlow.status_error",
};

function VideoTile({ url, onPlay }: { url: string; onPlay: (url: string) => void }) {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("creatorFlow.playVideo")}
      onPress={() => onPlay(url)}
      style={styles.videoTile}
    >
      <View style={styles.playBtn}>
        <Icon name="Play" size={22} color="#000000" fill="#000000" />
      </View>
    </Pressable>
  );
}

export default function FlowNodeList({ nodes, edges }: { nodes: FlowNode[]; edges: FlowEdge[] }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [playing, setPlaying] = useState<string | null>(null);
  const ordered = useMemo(() => orderNodes(nodes, edges), [nodes, edges]);
  const labelOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const n of nodes) map.set(n.id, String(n.data?.label || t(NODE_META[n.type ?? ""]?.labelKey ?? "creatorFlow.node")));
    return map;
  }, [nodes, t]);

  if (ordered.length === 0) {
    return <Text style={styles.empty}>{t("creatorFlow.emptyFlow")}</Text>;
  }

  return (
    <View style={{ gap: 12 }}>
      {ordered.map((node) => {
        const meta = NODE_META[node.type ?? ""] ?? { icon: "Circle" as IconName, labelKey: "creatorFlow.node" };
        const d = node.data ?? {};
        const out = nodeOutput(node);
        const inputs = edges.filter((e) => e.target === node.id).map((e) => labelOf.get(e.source)).filter(Boolean);
        const prompt = node.type === "assistantNode" ? d.localPrompt : d.prompt;
        const statusKey = d.status ? STATUS_KEYS[d.status] : undefined;
        const hasOutput = !!(out.image || out.video || out.text);
        const isGenerator = node.type === "imageGenNode" || node.type === "videoGenNode" || node.type === "assistantNode";

        return (
          <View key={node.id} style={styles.card}>
            <View style={styles.cardHead}>
              <View style={styles.iconChip}>
                <Icon name={meta.icon} size={15} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.label} numberOfLines={1}>
                  {labelOf.get(node.id)}
                </Text>
                <Text style={styles.kind} numberOfLines={1}>
                  {t(meta.labelKey)}
                  {d.model ? ` · ${d.model}` : ""}
                </Text>
              </View>
              {statusKey && d.status !== "idle" && <Text style={styles.status}>{t(statusKey)}</Text>}
            </View>

            {inputs.length > 0 && (
              <Text style={styles.inputs} numberOfLines={2}>
                {t("creatorFlow.fedBy", { names: inputs.join(", ") })}
              </Text>
            )}

            {!!prompt && (
              <Text selectable style={styles.prompt} numberOfLines={12}>
                {prompt}
              </Text>
            )}

            {!!out.image && (
              <SmartImage source={{ uri: out.image }} recyclingKey={out.image} style={styles.image} contentFit="contain" />
            )}
            {!!out.video && <VideoTile url={out.video} onPlay={setPlaying} />}
            {!!out.text && (
              <View style={styles.outputText}>
                <Text style={styles.outputLabel}>{t("creatorFlow.output")}</Text>
                <Text selectable style={styles.prompt}>
                  {out.text}
                </Text>
              </View>
            )}
            {isGenerator && !hasOutput && <Text style={styles.empty}>{t("creatorFlow.noOutputYet")}</Text>}
          </View>
        );
      })}

      <Modal visible={!!playing} animationType="fade" onRequestClose={() => setPlaying(null)} supportedOrientations={["portrait", "landscape"]}>
        <View style={[styles.player, { paddingTop: insets.top }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("creatorFlow.close")}
            onPress={() => setPlaying(null)}
            hitSlop={12}
            style={[styles.closeBtn, { top: insets.top + 8 }]}
          >
            <Icon name="X" size={22} color="#FFFFFF" />
          </Pressable>
          {playing && (
            <VideoPlayerCore sourceUrl={playing} autoplay loop hideTopControls onClose={() => setPlaying(null)} />
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.03)",
    padding: 14,
    gap: 10,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconChip: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  label: { color: "#FFFFFF", fontSize: 13, fontWeight: "600", letterSpacing: 0.4 },
  kind: { color: "#71717A", fontSize: 12, marginTop: 1 },
  status: { color: "#A1A1AA", fontSize: 11 },
  inputs: { color: "#71717A", fontSize: 12 },
  prompt: { color: "#D4D4D8", fontSize: 14, lineHeight: 20 },
  image: { width: "100%", aspectRatio: 1, borderRadius: 10, backgroundColor: "#0B0C0E" },
  videoTile: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 10,
    backgroundColor: "#0B0C0E",
    alignItems: "center",
    justifyContent: "center",
  },
  playBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  outputText: { gap: 4 },
  outputLabel: { color: "#71717A", fontSize: 11, textTransform: "uppercase", letterSpacing: 1 },
  empty: { color: "#71717A", fontSize: 13 },
  player: { flex: 1, backgroundColor: "#000000", justifyContent: "center" },
  closeBtn: { position: "absolute", right: 16, zIndex: 10, padding: 6 },
});
