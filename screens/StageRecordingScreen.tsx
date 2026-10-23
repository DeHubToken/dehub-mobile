/**
 * StageRecordingScreen — an ended stage's own page
 * ===============================================
 * The app's twin of web's /stages/:n for a stage that has ended: the host's
 * artwork, the title, when it aired, what it drew, who hosted it, and the
 * recording with a scrub bar that has the whole width to itself.
 *
 * Before this there was nowhere for a recorded stage to go. Tapping a card in
 * the Recorded tab did nothing, and a link to an ended stage opened the Stages
 * hub, so the one thing you came for was a row in a list of twenty.
 *
 * Takes the row from the caller when it has one so the page paints at once,
 * and re-reads it by id either way (links only carry the id).
 *
 * @module screens/StageRecordingScreen
 */

import React, { useCallback, useState } from "react";
import { KeyboardAvoidingView, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import ScreenHeader from "../components/ScreenHeader";
import Icon from "../components/ui/Icon";
import { DeHubLoader } from "../components/DeHubLoader";
import { PageSection, ThemeIcon } from "../components/page/PageKit";
import StageCoverArt from "../components/Stages/StageCoverArt";
import StageRecordingPlayer from "../components/Stages/StageRecordingPlayer";
import { HostRow, formatStageDate, stageDuration } from "../components/Stages/StageCards";
import { StageTranscriptSheet } from "../components/Stages/StageTranscriptSheet";
import TVChatPanel from "../components/TV/TVChatPanel";
import { useAppTheme } from "../context/ThemeContext";
import { ShareLinks } from "../navigation/linking.config";
import { ScreenNames } from "../navigation/ScreenNames";
import type { AppStackParamList } from "../navigation/types";
import { supabase } from "../services/supabase";
import { radius } from "../theme/radius";
import type { AudioSpace } from "../hooks/useStages";

type Route = RouteProp<AppStackParamList, ScreenNames.StageRecording>;

export default function StageRecordingScreen() {
  const { t } = useTranslation();
  const { params } = useRoute<Route>();
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { isMinimal } = useAppTheme();
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  const { data: fetched, isLoading } = useQuery({
    queryKey: ["stage-recording", params.spaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audio_spaces")
        .select("*")
        .eq("id", params.spaceId)
        .maybeSingle();
      if (error) throw error;
      return (data as (AudioSpace & { total_listens?: number | null }) | null) ?? null;
    },
    staleTime: 60_000,
  });

  const space = (fetched ?? params.space ?? null) as (AudioSpace & { total_listens?: number | null }) | null;

  const share = useCallback(() => {
    if (!space) return;
    Share.share({ message: `🎙️ ${space.title}\n\n${ShareLinks.stage(space)}` }).catch(() => {});
  }, [space]);

  if (!space) {
    return (
      <View className="bg-theme-neutrals-900" style={styles.root}>
        <ScreenHeader icon="stages" title={t("stages.stageRecording")} />
        <View style={styles.center}>
          {isLoading ? <DeHubLoader size={56} /> : <Icon name="Mic" size={40} color="#3F3F46" />}
        </View>
      </View>
    );
  }

  const heads = Math.max(1, (space.speaker_count || 0) + (space.listener_count || 0));
  const duration = stageDuration(space);
  const aired = formatStageDate(space.ended_at);

  return (
    <View className="bg-theme-neutrals-900" style={styles.root}>
      <ScreenHeader icon="stages" title={t("stages.stageRecording")} />
      {/* Edge-to-edge Android doesn't resize for the keyboard; the comment
          box at the bottom would sit under it. */}
      <KeyboardAvoidingView behavior="padding" style={styles.root}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: 4, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        <PageSection flush>
          {!!space.cover_image_url && <StageCoverArt uri={space.cover_image_url} title={space.title} />}

          <View style={styles.body}>
            <View style={styles.chipRow}>
              <View style={[styles.chip, isMinimal && styles.outline]}>
                <Icon name="Clock" size={12} color="#D4D4D8" />
                <Text style={styles.chipText}>{t("stages.ended")}</Text>
              </View>
              {/* Back to the whole list, in the card's empty top-right corner. */}
              <TouchableOpacity
                onPress={() => nav.navigate(ScreenNames.Stages)}
                style={[styles.chip, isMinimal && styles.outline]}
                accessibilityRole="link"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <ThemeIcon icon="stages" size={14} />
                <Text style={styles.chipText}>{t("stages.allStages")}</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.title}>{space.title}</Text>
            {!!aired && <Text style={styles.aired}>{aired}</Text>}
            {!!space.description && <Text style={styles.description}>{space.description}</Text>}

            {/* What the stage drew. Icons and numbers only, like the cards. */}
            <View style={styles.stats}>
              <View style={styles.stat}>
                <Icon name="Users" size={15} color="rgba(255,255,255,0.5)" />
                <Text style={styles.statValue}>{heads}</Text>
              </View>
              {typeof space.total_listens === "number" && (
                <View style={styles.stat}>
                  <Icon name="Headphones" size={15} color="rgba(255,255,255,0.5)" />
                  <Text style={styles.statValue}>{space.total_listens}</Text>
                </View>
              )}
              {!!duration && (
                <View style={styles.stat}>
                  <Icon name="Clock" size={15} color="rgba(255,255,255,0.5)" />
                  <Text style={styles.statValue}>{duration}</Text>
                </View>
              )}
            </View>

            <HostRow space={space} />

            {/* The player gets the full width: the bar is what you drag. */}
            {!!space.recording_url && (
              <StageRecordingPlayer
                spaceId={space.id}
                recordingUrl={space.recording_url}
                title={space.title}
                startedAt={space.started_at}
                endedAt={space.ended_at}
                // Leaving this page is a choice, but stopping mid-sentence on
                // a back swipe reads as a bug; the corner player picks it up.
                whenGone="popOut"
                style={styles.player}
              />
            )}

            <View style={styles.actions}>
              {!!space.recording_url && (
                <TouchableOpacity
                  onPress={() => setTranscriptOpen(true)}
                  style={[styles.wideBtn, isMinimal && styles.outline]}
                  accessibilityRole="button"
                >
                  <Icon name="FileText" size={15} color="#FFFFFF" />
                  <Text style={styles.btnText}>{t("stages.viewTranscript")}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={share}
                style={[styles.squareBtn, isMinimal && styles.outline]}
                accessibilityRole="button"
                accessibilityLabel={t("stages.shareStage")}
              >
                <Icon name="Share2" size={16} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        </PageSection>

        {/* What the room said stays as the recording's comments, the same
            stage chat web shows under an ended stage. */}
        <PageSection flush>
          <View style={styles.comments}>
            <TVChatPanel
              channelId={space.id}
              room={{ table: "stage_chat_messages", column: "space_id", id: space.id, hostWallet: space.host_wallet_address }}
              transparent
              labels={{
                title: t("settings.comments"),
                placeholder: t("features.addComment"),
                empty: t("features.noComments"),
                signIn: t("features.signInToComment"),
              }}
            />
          </View>
        </PageSection>
      </ScrollView>
      </KeyboardAvoidingView>

      <StageTranscriptSheet space={transcriptOpen ? space : null} visible={transcriptOpen} onClose={() => setTranscriptOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: { padding: 16, gap: 12 },
  chip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.md,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  chipRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  chipText: { color: "#D4D4D8", fontSize: 11, fontWeight: "600" },
  outline: { backgroundColor: "transparent", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" },
  title: { color: "#FFFFFF", fontSize: 22, fontWeight: "700", lineHeight: 28 },
  aired: { color: "#A1A1AA", fontSize: 13, marginTop: -6 },
  description: { color: "#A1A1AA", fontSize: 14, lineHeight: 20 },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 18 },
  stat: { flexDirection: "row", alignItems: "center", gap: 6 },
  statValue: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  player: { marginTop: 4 },
  comments: { height: 440 },
  actions: { flexDirection: "row", gap: 8 },
  wideBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  squareBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.lg,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  btnText: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
});
