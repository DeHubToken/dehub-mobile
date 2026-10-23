/**
 * Video transcript on the post info page, matching dehubweb's
 * post-info/TranscriptSection: collapsed by default, then the overview,
 * chapters, a search across the lines, and copy/share of the full text.
 * Viewer corrections stay web-only for now.
 */
import React, { useMemo, useState } from "react";
import { View, Text, Pressable, TextInput, StyleSheet, ActivityIndicator, Share } from "react-native";
import { useTranslation } from "react-i18next";
import Icon from "../ui/Icon";
import { useTranscript, type TranscriptSegment } from "../../hooks/useTranscript";
import { copyToClipboard } from "../../libs/clipboard.utils";
import { toastSuccess } from "../../libs/toast";

function formatTimestamp(seconds: number) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

function plainText(segments: TranscriptSegment[]) {
  return segments.map((s) => `[${formatTimestamp(s.start)}] ${s.text.trim()}`).join("\n");
}

export default function TranscriptSection({ tokenId }: { tokenId: number | string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { transcript, status, inFlight, canRetry, isLoading, start } = useTranscript("video", String(tokenId), open);

  const segments = transcript?.segments ?? [];
  const chapters = transcript?.chapters ?? [];
  const overview = transcript?.summary ?? null;
  const q = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    const indexed = segments.map((segment, index) => ({ segment, index }));
    return q ? indexed.filter(({ segment }) => segment.text.toLowerCase().includes(q)) : indexed;
  }, [segments, q]);

  const copyAll = () => copyToClipboard(plainText(segments));
  const shareAll = () => {
    Share.share({ message: plainText(segments) }).catch(() => {});
  };
  const copyLine = (s: TranscriptSegment) => {
    copyToClipboard(`[${formatTimestamp(s.start)}] ${s.text.trim()}`);
    toastSuccess(t("copy.dea0ff385abf", { defaultValue: " Copy" }).trim());
  };

  return (
    <View style={styles.wrap}>
      <Pressable onPress={() => setOpen((v) => !v)} style={styles.head} accessibilityRole="button">
        <View style={styles.headLeft}>
          <Icon name="FileText" size={16} color="rgba(255,255,255,0.7)" />
          <Text style={styles.title}>{t("copy.721164f0dc70", { defaultValue: "Transcript" })}</Text>
          {status === "ready" && (
            <Text style={styles.faint}>
              · {segments.length}
              {t("copy.d91fca0e24bb", { defaultValue: " lines" })}
            </Text>
          )}
          {inFlight && <ActivityIndicator size="small" color="rgba(255,255,255,0.6)" />}
        </View>
        <Icon name={open ? "ChevronUp" : "ChevronDown"} size={16} color="rgba(255,255,255,0.6)" />
      </Pressable>

      {open && (
        <View style={styles.body}>
          {isLoading && (
            <View style={styles.row}>
              <ActivityIndicator size="small" color="rgba(255,255,255,0.6)" />
              <Text style={styles.muted}>{t("copy.ba3bbbe10d8b", { defaultValue: "Loading…" })}</Text>
            </View>
          )}

          {!isLoading && status === "absent" && (
            <View style={styles.empty}>
              <Text style={styles.value}>{t("copy.5ae4bb109db7", { defaultValue: "No transcript yet" })}</Text>
              <Text style={[styles.muted, { textAlign: "center" }]}>
                {t("copy.60aac7666712", {
                  defaultValue: "A transcript is written automatically shortly after a video is posted.",
                })}
              </Text>
              <Pressable style={styles.button} onPress={() => start()}>
                <Text style={styles.buttonText}>{t("copy.6662a5411155", { defaultValue: "Write it now" })}</Text>
              </Pressable>
            </View>
          )}

          {inFlight && (
            <View style={styles.row}>
              <ActivityIndicator size="small" color="rgba(255,255,255,0.7)" />
              <Text style={styles.muted}>{t("copy.5561cf90d112", { defaultValue: "Transcribing" })}…</Text>
            </View>
          )}

          {status === "empty" && (
            <Text style={styles.muted}>
              {t("copy.4c2ea0ddf64b", {
                defaultValue: "This video has no speech in it, so there is nothing to transcribe.",
              })}
            </Text>
          )}

          {status === "failed" && (
            <View style={{ gap: 8 }}>
              <Text style={styles.error}>
                {t("copy.9fddb94edef5", { defaultValue: "Transcription failed: " })}
                {transcript?.error}
              </Text>
              {canRetry && (
                <Pressable style={[styles.button, styles.rowCenter]} onPress={() => start()}>
                  <Icon name="RefreshCw" size={14} color="#FFFFFF" />
                  <Text style={styles.buttonText}>{t("copy.55de39f882a3", { defaultValue: " Try again" }).trim()}</Text>
                </Pressable>
              )}
            </View>
          )}

          {status === "ready" && segments.length > 0 && (
            <>
              <View style={styles.row}>
                <Pressable style={[styles.smallButton, styles.rowCenter]} onPress={copyAll}>
                  <Icon name="Copy" size={13} color="#FFFFFF" />
                  <Text style={styles.buttonText}>{t("copy.dea0ff385abf", { defaultValue: " Copy" }).trim()}</Text>
                </Pressable>
                <Pressable style={[styles.smallButton, styles.rowCenter]} onPress={shareAll}>
                  <Icon name="Share2" size={13} color="#FFFFFF" />
                  <Text style={styles.buttonText}>{t("copy.d0bd6ec267f9", { defaultValue: " Text" }).trim()}</Text>
                </Pressable>
              </View>

              <View style={styles.search}>
                <Icon name="Search" size={14} color="rgba(255,255,255,0.5)" />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder={t("copy.2baeddfdc699", { defaultValue: "Search transcript…" })}
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  style={styles.searchInput}
                  autoCorrect={false}
                />
                {!!query && (
                  <Pressable onPress={() => setQuery("")} hitSlop={8}>
                    <Icon name="X" size={14} color="rgba(255,255,255,0.5)" />
                  </Pressable>
                )}
              </View>

              {!!overview && (
                <View style={[styles.card, styles.rowTop]}>
                  <Icon name="Sparkles" size={14} color="rgba(255,255,255,0.6)" />
                  <Text style={[styles.lineText, { flex: 1 }]}>{overview}</Text>
                </View>
              )}

              {chapters.length > 0 && !q && (
                <View style={styles.card}>
                  <View style={styles.rowCenter}>
                    <Icon name="AlignLeft" size={12} color="rgba(255,255,255,0.5)" />
                    <Text style={styles.faint}>{t("copy.7adf0298ab5e", { defaultValue: " Chapters" }).trim()}</Text>
                  </View>
                  {chapters.map((c, i) => (
                    <View key={i} style={styles.line}>
                      <Text style={styles.stamp}>{formatTimestamp(c.start)}</Text>
                      <Text style={styles.lineText}>{c.title}</Text>
                    </View>
                  ))}
                </View>
              )}

              {!!q && (
                <Text style={styles.faint}>
                  {filtered.length}{" "}
                  {filtered.length === 1
                    ? t("copy.4945a70fa7f9", { defaultValue: "match" })
                    : t("copy.a54084383e3c", { defaultValue: "matches" })}
                </Text>
              )}

              {filtered.length === 0 ? (
                <Text style={styles.muted}>{t("copy.14c5558a8cd9", { defaultValue: "No transcript matches" })}</Text>
              ) : (
                <View style={{ gap: 8 }}>
                  {filtered.slice(0, 400).map(({ segment: s, index }) => (
                    <Pressable key={index} style={styles.line} onLongPress={() => copyLine(s)}>
                      <Text style={styles.stamp}>{formatTimestamp(s.start)}</Text>
                      <Text style={styles.lineText}>{s.text.trim()}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderRadius: 14,
    overflow: "hidden",
  },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14 },
  headLeft: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 },
  title: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
  body: { paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  rowCenter: { flexDirection: "row", alignItems: "center", gap: 6 },
  rowTop: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  empty: { alignItems: "center", gap: 8, paddingVertical: 8 },
  value: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
  muted: { color: "rgba(255,255,255,0.6)", fontSize: 13, lineHeight: 18 },
  faint: { color: "rgba(255,255,255,0.5)", fontSize: 12 },
  error: { color: "#FCA5A5", fontSize: 13 },
  button: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.12)", alignSelf: "center" },
  smallButton: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.12)" },
  buttonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "600" },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  searchInput: { flex: 1, color: "#FFFFFF", fontSize: 14, paddingVertical: 8 },
  card: {
    gap: 6,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  line: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  stamp: { color: "rgba(255,255,255,0.5)", fontSize: 11, fontFamily: "monospace", paddingTop: 2, minWidth: 38 },
  lineText: { flex: 1, color: "rgba(255,255,255,0.85)", fontSize: 13, lineHeight: 19 },
});
