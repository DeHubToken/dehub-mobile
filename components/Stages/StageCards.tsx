/**
 * Stage cards — one shape per state, shared by every stage surface
 * ================================================================
 * The three cards the Stages screen is built from, plus the reminder bell they
 * share. Ported from dehubweb's StagesPage / PastStageCard so a stage reads the
 * same on both platforms.
 *
 * The thing that changed from the old bottom-sheet versions: **the cover
 * graphic leads the card**. It used to be a cropped fill *behind* the text
 * under a black gradient — so a host's artwork was cut off and dimmed at the
 * same time — and an ended stage had no artwork at all, which is why recorded
 * stages were an anonymous list of rows. Covers now go through StageCoverArt:
 * whole, 16:9, above the text, on every state including ended.
 *
 * @module components/Stages/StageCards
 */

import React, { useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";

import Avatar from "../common/Avatar";
import Icon from "../ui/Icon";
import StageCoverArt from "./StageCoverArt";
import StageRecordingPlayer from "./StageRecordingPlayer";
import { getAvatarUrl } from "../../libs/misc";
import { radius } from "../../theme/radius";
import { ShareLinks } from "../../navigation/linking.config";
import { useStageReminder } from "../../hooks/useStageReminder";
import type { AudioSpace } from "../../hooks/useStages";

/** How long the stage ran, from its own timestamps. Mirrors web's row. */
export function stageDuration(space: AudioSpace): string | null {
  if (!space.started_at || !space.ended_at) return null;
  const secs = Math.round(
    (new Date(space.ended_at).getTime() - new Date(space.started_at).getTime()) / 1000,
  );
  if (secs <= 0) return null;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/**
 * Dates go through the device's own formatter rather than a translated
 * template: every locale this app ships already knows how to write a date, and
 * a hand-built one would need a new key per shape in all 110 of them.
 */
export function formatStageDate(dateStr?: string | null): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function formatScheduledFor(dateStr?: string | null): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    const day = d.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    return `${day} · ${time}`;
  } catch {
    return "";
  }
}

const shareStage = (space: AudioSpace, when?: string) => {
  const whenPart = when ? ` ${when}` : "";
  Share.share({
    message: `🎙️ ${space.title} — live on Stages${whenPart}\n\n${ShareLinks.stage(space)}`,
  }).catch(() => {});
};

const hostHandle = (space: AudioSpace, fallback: string) =>
  space.host_username ||
  (space.host_wallet_address ? `${space.host_wallet_address.slice(0, 6)}…` : fallback);

/**
 * "Remind me" on an announced stage.
 *
 * Its own component because `useStageReminder` is a hook and each card watches
 * its own row — one query per visible announcement, which at the volume this
 * feature sees is a handful. Signed-out users get nothing rather than a control
 * that would fail: the row is keyed by wallet.
 */
export const StageReminderBell: React.FC<{ spaceId: string }> = ({ spaceId }) => {
  const { t } = useTranslation();
  const { hasReminder, canRemind, toggleReminder, isToggling } = useStageReminder(spaceId);
  if (!canRemind) return null;
  const label = hasReminder ? t("stages.removeReminder") : t("stages.remindMe");
  return (
    <TouchableOpacity
      onPress={toggleReminder}
      disabled={isToggling}
      hitSlop={8}
      style={styles.iconBtn}
      accessibilityRole="button"
      accessibilityState={{ selected: hasReminder, disabled: isToggling }}
      accessibilityLabel={label}
    >
      <Icon
        name={hasReminder ? "BellRing" : "Bell"}
        size={15}
        color={hasReminder ? "#FAFAFA" : "rgba(255,255,255,0.6)"}
      />
    </TouchableOpacity>
  );
};

const HostRow: React.FC<{ space: AudioSpace }> = ({ space }) => {
  const { t } = useTranslation();
  return (
    <View style={styles.hostRow}>
      <Avatar
        uri={space.host_avatar ? getAvatarUrl(space.host_avatar, 40) : null}
        size={40}
        name={space.host_username || space.host_wallet_address}
        borderWidth={2}
        borderColor="rgba(255,255,255,0.2)"
      />
      <View style={styles.hostText}>
        <Text style={styles.hostedBy}>{t("stages.hostedBy")}</Text>
        <Text style={styles.hostName} numberOfLines={1}>
          @{hostHandle(space, t("common.anonymous"))}
        </Text>
      </View>
    </View>
  );
};

// ── Live ────────────────────────────────────────────────────────────────────

export const LiveStageCard: React.FC<{
  space: AudioSpace;
  isCurrent: boolean;
  isMine: boolean;
  /** Joining this room. The card is inert and says so rather than doing nothing. */
  isBusy?: boolean;
  onOpen: () => void;
  /** Present only for a host looking at their own room from outside it. */
  onEnd?: () => void;
}> = ({ space, isCurrent, isMine, isBusy = false, onOpen, onEnd }) => {
  const { t } = useTranslation();
  // Web counts the host in; a stage with a host and no audience read as
  // "0 listening" here while web showed 1.
  const heads = Math.max(1, (space.speaker_count || 1) + (space.listener_count || 0));

  const confirmEnd = useCallback(() => {
    Alert.alert(t("stages.endThisStage"), t("stages.endSpaceConfirm", { title: space.title }), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("stages.end"), style: "destructive", onPress: onEnd },
    ]);
  }, [onEnd, space.title, t]);

  return (
    <TouchableOpacity
      style={[styles.card, isMine && styles.cardMine, isBusy && styles.cardBusy]}
      onPress={onOpen}
      disabled={isBusy}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityState={{ disabled: isBusy }}
    >
      {!!space.cover_image_url && <StageCoverArt uri={space.cover_image_url} title={space.title} />}

      <View style={styles.body}>
        <View style={styles.topRow}>
          <View style={styles.liveChip}>
            <View style={styles.liveDot} />
            <Text style={styles.liveChipText}>
              {isCurrent ? t("stages.inThisStage") : t("stages.live")}
            </Text>
          </View>
          <View style={styles.topActions}>
            <View style={styles.countRow}>
              {isBusy ? (
                <ActivityIndicator size="small" color="rgba(255,255,255,0.5)" />
              ) : (
                <Icon name="Users" size={13} color="rgba(255,255,255,0.5)" />
              )}
              <Text style={styles.countText}>{heads}</Text>
            </View>
            <TouchableOpacity
              onPress={() => shareStage(space)}
              hitSlop={8}
              style={styles.iconBtn}
              accessibilityRole="button"
              accessibilityLabel={t("stages.shareStage")}
            >
              <Icon name="Share2" size={15} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>
            {!!onEnd && (
              <TouchableOpacity
                onPress={confirmEnd}
                hitSlop={8}
                style={styles.endBtn}
                accessibilityRole="button"
                accessibilityLabel={t("stages.endThisStage")}
              >
                <Text style={styles.endText}>{t("stages.end")}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <HostRow space={space} />

        <Text style={styles.title} numberOfLines={2}>
          {space.title}
        </Text>
        {!!space.description && (
          <Text style={styles.description} numberOfLines={2}>
            {space.description}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
};

// ── Upcoming ────────────────────────────────────────────────────────────────

export const ScheduledStageCard: React.FC<{
  space: AudioSpace;
  isMine: boolean;
  /** Starting or cancelling this stage; both controls go inert while it runs. */
  isBusy?: boolean;
  onStart: () => void;
  onCancel: () => void;
}> = ({ space, isMine, isBusy = false, onStart, onCancel }) => {
  const { t } = useTranslation();
  const startsAt = space.scheduled_at ? new Date(space.scheduled_at) : null;
  const isOverdue = !!startsAt && startsAt.getTime() < Date.now();
  const when = formatScheduledFor(space.scheduled_at);

  const confirmCancel = useCallback(() => {
    Alert.alert(t("common.cancel"), t("stages.cancelConfirm", { title: space.title }), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.confirm"), style: "destructive", onPress: onCancel },
    ]);
  }, [onCancel, space.title, t]);

  return (
    <View style={styles.card}>
      {!!space.cover_image_url && <StageCoverArt uri={space.cover_image_url} title={space.title} />}

      <View style={styles.body}>
        <View style={styles.topRow}>
          <View style={styles.chip}>
            <Icon name="CalendarDays" size={12} color="#D4D4D8" />
            <Text style={styles.chipText}>
              {isOverdue ? t("stages.startingSoon") : t("stages.tabUpcoming")}
            </Text>
          </View>
          <View style={styles.topActions}>
            {/* The host is already going; a bell on your own stage is noise. */}
            {!isMine && <StageReminderBell spaceId={space.id} />}
            <TouchableOpacity
              onPress={() => shareStage(space, when)}
              hitSlop={8}
              style={styles.iconBtn}
              accessibilityRole="button"
              accessibilityLabel={t("stages.shareStage")}
            >
              <Icon name="Share2" size={15} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>
          </View>
        </View>

        <HostRow space={space} />

        <Text style={styles.title} numberOfLines={2}>
          {space.title}
        </Text>
        {!!when && (
          <View style={styles.metaRow}>
            <Icon name="CalendarDays" size={12} color="#D4D4D8" />
            <Text style={styles.metaText} numberOfLines={1}>
              {when}
            </Text>
          </View>
        )}
        {!!space.description && (
          <Text style={styles.description} numberOfLines={2}>
            {space.description}
          </Text>
        )}

        {isMine && (
          <View style={styles.actions}>
            <TouchableOpacity
              onPress={onStart}
              disabled={isBusy}
              style={[styles.primaryBtn, isBusy && styles.btnBusy]}
              accessibilityRole="button"
              accessibilityState={{ disabled: isBusy }}
            >
              {isBusy ? (
                <ActivityIndicator size="small" color="#09090B" />
              ) : (
                <Icon name="Radio" size={15} color="#09090B" />
              )}
              <Text style={styles.primaryBtnText}>{t("stages.startNow")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={confirmCancel}
              disabled={isBusy}
              style={[styles.secondaryBtn, isBusy && styles.btnBusy]}
              accessibilityRole="button"
              accessibilityState={{ disabled: isBusy }}
            >
              <Text style={styles.secondaryBtnText}>{t("common.cancel")}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
};

// ── Recorded ────────────────────────────────────────────────────────────────

export const RecordedStageCard: React.FC<{
  space: AudioSpace;
  isMine: boolean;
  onOpenTranscript: () => void;
  onDelete: () => void;
}> = ({ space, isMine, onOpenTranscript, onDelete }) => {
  const { t } = useTranslation();
  const heads = Math.max(1, (space.speaker_count || 0) + (space.listener_count || 0));
  const duration = stageDuration(space);
  const hasRecording = !!space.recording_url;
  const meta = [formatStageDate(space.ended_at), duration].filter(Boolean).join(" · ");

  const confirmDelete = useCallback(() => {
    Alert.alert(t("stages.deleteStage"), t("stages.deleteRecordingConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.delete"), style: "destructive", onPress: onDelete },
    ]);
  }, [onDelete, t]);

  return (
    <View style={styles.card}>
      {!!space.cover_image_url && <StageCoverArt uri={space.cover_image_url} title={space.title} />}

      <View style={styles.body}>
        <View style={styles.topRow}>
          <View style={styles.chip}>
            <Icon name="Clock" size={12} color="#D4D4D8" />
            <Text style={styles.chipText}>{t("stages.ended")}</Text>
          </View>
          <View style={styles.topActions}>
            <View style={styles.countRow}>
              <Icon name="Users" size={13} color="rgba(255,255,255,0.5)" />
              <Text style={styles.countText}>{heads}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.title} numberOfLines={2}>
          {space.title}
        </Text>

        <HostRow space={space} />

        {!!meta && (
          <Text style={styles.metaText} numberOfLines={1}>
            {meta}
          </Text>
        )}

        {/* The player is its own line rather than a chip in the title row: web
            stacks the same way at phone widths, and a 90-bar scrub bar needs
            the whole width to be worth dragging.

            `whenGone="popOut"` because this row lives in a FlatList: scrolling
            a playing recording out of the window unmounts it, and stopping the
            audio for that would read as the list eating your playback. The
            corner player picks it up instead. */}
        {hasRecording && (
          <StageRecordingPlayer
            spaceId={space.id}
            recordingUrl={space.recording_url}
            title={space.title}
            startedAt={space.started_at}
            endedAt={space.ended_at}
            whenGone="popOut"
            style={styles.player}
          />
        )}

        <View style={styles.actions}>
          {hasRecording && (
            <TouchableOpacity
              onPress={onOpenTranscript}
              style={styles.secondaryBtn}
              accessibilityRole="button"
            >
              <Icon name="FileText" size={13} color="#FFFFFF" />
              <Text style={styles.secondaryBtnText}>{t("stages.viewTranscript")}</Text>
            </TouchableOpacity>
          )}
          {isMine && (
            <TouchableOpacity
              onPress={confirmDelete}
              style={styles.deleteBtn}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t("stages.deleteStage")}
            >
              <Icon name="Trash2" size={15} color="rgba(255,255,255,0.45)" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  cardMine: {
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  cardBusy: {
    opacity: 0.6,
  },
  btnBusy: {
    opacity: 0.6,
  },
  body: {
    padding: 14,
    gap: 10,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  topActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.md,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  chipText: {
    color: "#D4D4D8",
    fontSize: 11,
    fontWeight: "600",
  },
  liveChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.md,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FAFAFA",
  },
  liveChipText: {
    color: "#F4F4F5",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  countRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  countText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
  },
  iconBtn: {
    width: 28,
    height: 28,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  endBtn: {
    paddingHorizontal: 10,
    height: 28,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  endText: {
    color: "#FAFAFA",
    fontSize: 11,
    fontWeight: "700",
  },
  hostRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  hostText: {
    flex: 1,
    minWidth: 0,
  },
  hostedBy: {
    color: "#71717A",
    fontSize: 10,
  },
  hostName: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
  title: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
  },
  description: {
    color: "#A1A1AA",
    fontSize: 12,
    lineHeight: 17,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metaText: {
    color: "#A1A1AA",
    fontSize: 12,
    flex: 1,
  },
  player: {
    marginTop: 2,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  primaryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 11,
    borderRadius: radius.lg,
    backgroundColor: "#FFFFFF",
  },
  primaryBtnText: {
    color: "#09090B",
    fontSize: 13,
    fontWeight: "700",
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.lg,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  secondaryBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
});
