/**
 * SuperPowersScreen
 * =================
 * What a badge buys beyond the art next to your name. Your tier, the boosts it
 * grants this cycle, what you have spent them on, and the whole thirteen-rung
 * ladder lit against where you stand.
 *
 * Native port of web's `/app/superpowers`. Same two rules the web page follows:
 *
 * **It reads signed out and badgeless.** Somebody who has not staked is the
 * whole audience for this screen — greeting them with "connect a wallet" tells
 * them nothing about why they would want to. The ladder comes from the public
 * endpoint; only the allowance panel needs an account.
 *
 * All twelve powers are listed in unlock order. Killer Whale remains a badge
 * tier with a stronger allowance, but it does not add a separate power.
 */
import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Image,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import Icon from "../components/ui/Icon";
import ScreenHeader from "../components/ScreenHeader";
import { theme } from "../theme";
import { getBadgeUrl } from "../libs";
import { ScreenNames } from "../navigation/ScreenNames";
import {
  useCancelBoost,
  useSuperpowerLadder,
  useSuperpowers,
} from "../hooks/useSuperpowers";
import { toastError, toastSuccess } from "../libs";
import { useUser } from "../context/AuthContext";
import SpendPowerSheet from "../components/common/SpendPowerSheet";
import GlassModal from "../components/ui/GlassModal";
import {
  powerHome,
  type SuperPowerInfo,
  type SuperPowerKey,
} from "../services/superpower.service";

/**
 * What an unlocked power acts on, in one line under its name.
 *
 * Not directions any more. Every bento this account holds is a button that
 * opens the picker for its own target, so the only thing left worth saying on
 * the card is what kind of thing you are about to be asked to choose.
 * `powerHome` is the same table the sheet and the post options sheet read, so
 * the three cannot drift apart.
 */
function actsOn(
  key: SuperPowerKey,
  t: (k: string, o?: Record<string, unknown>) => string,
): string {
  switch (powerHome(key)) {
    case "gift":
      return t("superpowers.actsGift", {
        defaultValue: "A gift — it lands on somebody else's post. Tap to pick one.",
      });
    case "comment":
      return t("superpowers.actsComment", {
        defaultValue: "Acts on your comment in somebody else's thread. Tap to pick one.",
      });
    case "stage":
      return t("superpowers.actsStage", {
        defaultValue: "Acts on a Stage you host. Tap to pick one.",
      });
    case "page":
      return t("superpowers.actsCategory", {
        defaultValue: "Acts on one of your categories. Tap to pick one.",
      });
    default:
      return t("superpowers.actsPost", {
        defaultValue: "Acts on one of your posts. Tap to pick one.",
      });
  }
}

/** Total slot minutes a tier holds per cycle — the number worth comparing. */
function formatMinutes(total: number): string {
  if (total < 60) return `${total}m`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export default function SuperPowersScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const { data: status, isLoading: loadingStatus, refetch: refetchStatus } = useSuperpowers();
  const { data: ladder, isLoading: loadingLadder } = useSuperpowerLadder();
  const cancelBoost = useCancelBoost();

  // The public ladder carries every power; the signed-in one adds `unlocked`.
  // Prefer the personal copy so the screen lights up without a second render.
  const powers = (status?.powers ?? ladder?.powers ?? []).filter(
    power => String(power.key) !== "golden_hour",
  );

  const refillsOn = useMemo(() => {
    const iso = status?.cycleEndsAt ?? ladder?.cycleEndsAt;
    if (!iso) return null;
    return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long" });
  }, [status?.cycleEndsAt, ladder?.cycleEndsAt]);

  // One sheet for all twelve. It resolves the target a power needs — a
  // post, a comment, a Stage, a category — and books it; the server re-checks
  // every one of those, so this only decides what is worth offering.
  const user = useUser();
  const myAddress = (user?.walletAddress || user?.address || null) as string | null;
  const [spending, setSpending] = useState<SuperPowerInfo | null>(null);
  const [historyPower, setHistoryPower] = useState<SuperPowerInfo | null>(null);

  const badgeArt = status?.tier ? getBadgeUrl(status.badgeBalance) : undefined;
  const historyBookings = historyPower
    ? (status?.bookings.filter(booking => booking.power === historyPower.key) ?? [])
    : [];

  const handleCancel = (id: string) =>
    cancelBoost.mutate(id, {
      onSuccess: ({ refunded }) =>
        toastSuccess(
          refunded
            ? "Boost cancelled and returned to your allowance"
            : "Boost cancelled. It had already started, so it stays spent.",
        ),
      onError: (error: any) => toastError(error?.message || "Could not cancel that boost"),
    });

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="SuperPowers"
        subtitle="Spend your badge on the top of the feed"
        rightContent={<Icon name="Rocket" size={22} color={theme.colors.accent} />}
      />

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>
          A badge buys more than the art beside your name. Every fortnight it grants boosts that
          put posts at the top of the home feed. Thirteen tiers, twelve powers, and a stronger
          allowance at every rung.
        </Text>

        {/* ── Your allowance ───────────────────────────────────────────── */}
        {loadingStatus ? (
          <View style={styles.loading}>
            <ActivityIndicator color="#fff" />
          </View>
        ) : status?.tier ? (
          <View style={styles.panel}>
            <View style={styles.tierRow}>
              {!!badgeArt && <Image source={badgeArt} style={styles.badge} resizeMode="contain" />}
              <View style={styles.tierText}>
                <Text style={styles.tierName}>{status.tier}</Text>
                <Text style={styles.muted}>
                  {status.boostsPerCycle} × {status.minutesPerBoost} minutes a cycle
                </Text>
              </View>
            </View>

            {!!refillsOn && (
              <Text style={styles.footnote}>
                Refills on {refillsOn} — the same moment for everybody.
              </Text>
            )}
          </View>
        ) : (
          // No badge — this screen's real audience. Say what it costs and where.
          <View style={styles.panel}>
            <Text style={styles.body}>
              You have no badge yet, so no boosts. Staking DHB unlocks the ladder below.
            </Text>
            <Pressable
              onPress={() => navigation.navigate(ScreenNames.Dpay, { initialTab: "stake" })}
              style={styles.cta}
            >
              <Text style={styles.ctaText}>Stake DHB</Text>
            </Pressable>
          </View>
        )}

        {/* ── The twelve powers ────────────────────────────────────────── */}
        <Text style={styles.heading}>THE TWELVE POWERS</Text>
        <View style={styles.powerGrid}>
          {powers.map((power, index) => {
            // Held AND built. A locked card stays inert rather than opening a
            // picker for something the server would refuse.
            const unlocked = !!power.unlocked && power.available;
            const allowance =
              power.key === "signal_flare"
                ? (status?.signalsLeft ?? status?.boostsLeft)
                : status?.boostsLeft;
            return (
              <View
                key={power.key}
                style={[styles.powerCard, unlocked && styles.powerCardOn]}
              >
                <Pressable
                  disabled={!unlocked}
                  onPress={() => setSpending(power)}
                  style={({ pressed }) => [styles.powerBody, pressed && unlocked && styles.powerBodyPressed]}
                >
                  <View style={styles.powerTop}>
                    {/* Numbered because it IS a sequence: one power per rung. */}
                    <Text style={styles.rung}>{String(index + 1).padStart(2, "0")}</Text>
                    <Text style={[styles.powerName, !unlocked && styles.powerNameOff]}>
                      {power.label}
                    </Text>
                    <Icon
                      name={unlocked ? "Check" : "Lock"}
                      size={13}
                      color={unlocked ? "#F4F4F5" : "#52525B"}
                    />
                  </View>
                  <Text style={styles.powerSummary}>{power.summary}</Text>
                  {unlocked ? (
                    <Text style={styles.powerWhere}>{actsOn(power.key, t)}</Text>
                  ) : null}
                </Pressable>
                <View style={styles.powerFooter}>
                  <Text style={[styles.powerCount, !unlocked && styles.powerCountOff]}>
                    {unlocked && allowance !== undefined
                      ? `${allowance} ${allowance === 1 ? "use" : "uses"} left`
                      : !power.available
                        ? "Coming soon"
                        : "Locked"}
                  </Text>
                  <Pressable
                    onPress={() => {
                      setHistoryPower(power);
                      void refetchStatus();
                    }}
                    disabled={!status?.tier}
                    accessibilityRole="button"
                    accessibilityLabel={`Show past ${power.label} usage`}
                    style={({ pressed }) => [
                      styles.historyLink,
                      !status?.tier && styles.historyLinkDisabled,
                      pressed && styles.historyLinkPressed,
                    ]}
                  >
                    <Text style={styles.historyLinkText}>Past usage</Text>
                    <Icon name="ChevronRight" size={14} color="#A1A1AA" />
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>

        {/* ── The ladder ───────────────────────────────────────────────── */}
        <Text style={styles.heading}>WHAT EACH TIER GRANTS</Text>
        {loadingLadder ? (
          <View style={styles.loading}>
            <ActivityIndicator color="#fff" />
          </View>
        ) : (
          <View style={styles.table}>
            <View style={styles.tableHead}>
              <Text style={[styles.th, styles.colTier]}>TIER</Text>
              <Text style={[styles.th, styles.colNum]}>BOOSTS</Text>
              <Text style={[styles.th, styles.colNum]}>EACH</Text>
              <Text style={[styles.th, styles.colNum]}>PER CYCLE</Text>
            </View>
            {(ladder?.tiers ?? [])
              .filter(tier => tier.name)
              .map(tier => {
                const mine = status?.tier === tier.name;
                return (
                  <View key={tier.name} style={[styles.tr, mine && styles.trMine]}>
                    <Text style={[styles.td, styles.colTier, mine && styles.tdMine]}>
                      {tier.name}
                    </Text>
                    <Text style={[styles.td, styles.colNum, mine && styles.tdMine]}>
                      {tier.boostsPerCycle}
                    </Text>
                    <Text style={[styles.td, styles.colNum, mine && styles.tdMine]}>
                      {tier.minutesPerBoost}m
                    </Text>
                    <Text style={[styles.td, styles.colNum, mine && styles.tdMine]}>
                      {formatMinutes(tier.boostsPerCycle * tier.minutesPerBoost)}
                    </Text>
                  </View>
                );
              })}
          </View>
        )}

        {/* The honest sentence, once, where the numbers are. */}
        <Text style={styles.footnote}>
          The boost slot rotates. When several boosts are running, viewers are dealt one weighted by
          badge tier — a higher tier is shown more often, and everybody gets the window they were
          granted.
        </Text>
      </ScrollView>

      <SpendPowerSheet
        power={spending}
        address={myAddress}
        onClose={() => setSpending(null)}
      />

      <GlassModal
        visible={!!historyPower}
        onClose={() => setHistoryPower(null)}
        presentation="bottom"
      >
        <View style={styles.historySheet}>
          <View style={styles.historyHeader}>
            <View style={styles.historyHeaderText}>
              <Text style={styles.historyTitle}>{historyPower?.label} usage</Text>
              <Text style={styles.historySubtitle}>This cycle and anything still active.</Text>
            </View>
            <Pressable
              onPress={() => setHistoryPower(null)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Icon name="X" size={18} color="#A1A1AA" />
            </Pressable>
          </View>

          <ScrollView style={styles.historyList} contentContainerStyle={styles.historyListContent}>
            {historyBookings.length === 0 ? (
              <View style={styles.historyEmpty}>
                <Icon name="History" size={25} color="#71717A" />
                <Text style={styles.historyEmptyText}>No past usage for this power yet.</Text>
              </View>
            ) : (
              historyBookings.map(booking => {
                const flare = booking.power === "signal_flare";
                const result = flare
                  ? booking.signalDeliveryStatus === "sent"
                    ? `${booking.signalRecipients ?? 0} notified`
                    : booking.signalDeliveryStatus === "failed"
                      ? "Delivery retrying"
                      : "Notifying followers"
                  : `${booking.served} seen`;
                const subject = booking.tokenId != null
                  ? `Post #${booking.tokenId}`
                  : booking.category || historyPower?.label || booking.power;

                return (
                  <View key={booking.id} style={styles.historyRow}>
                    <Icon name="Clock" size={16} color="#71717A" />
                    <View style={styles.historySubject}>
                      <Text numberOfLines={1} style={styles.historySubjectText}>{subject}</Text>
                      <Text style={styles.historyDate}>
                        {new Date(booking.startsAt).toLocaleString(undefined, {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </Text>
                    </View>
                    <View style={styles.historyResult}>
                      <Text style={styles.historyResultText}>{result}</Text>
                      {!flare ? (
                        <Text style={styles.historyState}>
                          {booking.live ? "Live" : booking.status === "active" ? "Queued" : "Finished"}
                        </Text>
                      ) : null}
                    </View>
                    {booking.status === "active" && !flare ? (
                      <Pressable
                        onPress={() => handleCancel(booking.id)}
                        disabled={cancelBoost.isPending}
                        hitSlop={8}
                      >
                        <Text style={styles.cancel}>Cancel</Text>
                      </Pressable>
                    ) : null}
                  </View>
                );
              })
            )}
          </ScrollView>
        </View>
      </GlassModal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#010305" },
  content: { padding: 16, paddingBottom: 48, gap: 16 },
  intro: { color: "#A1A1AA", fontSize: 13, lineHeight: 19 },
  loading: { paddingVertical: 32, alignItems: "center" },

  panel: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },
  tierRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  badge: { width: 44, height: 44 },
  tierText: { flex: 1, minWidth: 0 },
  tierName: { color: "#fff", fontSize: 15, fontWeight: "600" },
  muted: { color: "#A1A1AA", fontSize: 12, marginTop: 2 },
  footnote: { color: "#808089", fontSize: 12, lineHeight: 17 },
  body: { color: "#fff", fontSize: 13, lineHeight: 19 },

  cta: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  ctaText: { color: "#fff", fontSize: 13 },

  spendRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  spendCol: { gap: 6 },
  spendText: { flex: 1, minWidth: 0, gap: 2 },
  spendTitle: { color: "#fff", fontSize: 14 },
  spendBtn: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  spendBtnText: { color: "#fff", fontSize: 13 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
  chip: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipPicked: { borderColor: "rgba(255,255,255,0.4)", backgroundColor: "rgba(255,255,255,0.15)" },
  chipText: { color: "#A1A1AA", fontSize: 11 },
  chipTextPicked: { color: "#fff" },
  cancel: { color: "#A1A1AA", fontSize: 12 },

  heading: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.2,
    marginTop: 8,
  },

  powerGrid: { gap: 8 },
  powerCard: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.02)",
    borderRadius: 14,
    overflow: "hidden",
  },
  powerCardOn: {
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  powerBody: { padding: 14, paddingBottom: 12, gap: 5 },
  powerBodyPressed: { backgroundColor: "rgba(255,255,255,0.06)" },
  powerTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  rung: { color: "#52525B", fontSize: 11 },
  powerName: { color: "#fff", fontSize: 14, fontWeight: "500", flex: 1 },
  powerNameOff: { color: "#A1A1AA" },
  powerSummary: { color: "#808089", fontSize: 12.5, lineHeight: 17 },
  powerWhere: { color: "#A1A1AA", fontSize: 11, lineHeight: 15 },
  powerFooter: {
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  powerCount: { color: "#F4F4F5", fontSize: 12, fontWeight: "600" },
  powerCountOff: { color: "#71717A" },
  historyLink: { flexDirection: "row", alignItems: "center", gap: 2 },
  historyLinkDisabled: { opacity: 0.35 },
  historyLinkPressed: { opacity: 0.65 },
  historyLinkText: { color: "#A1A1AA", fontSize: 12 },

  historySheet: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32 },
  historyHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  historyHeaderText: { flex: 1, minWidth: 0 },
  historyTitle: { color: "#fff", fontSize: 18, fontWeight: "600" },
  historySubtitle: { color: "#71717A", fontSize: 12, marginTop: 3 },
  historyList: { maxHeight: 440 },
  historyListContent: { gap: 8 },
  historyEmpty: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 32,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 14,
  },
  historyEmptyText: { color: "#D4D4D8", fontSize: 13, textAlign: "center" },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 14,
  },
  historySubject: { flex: 1, minWidth: 0 },
  historySubjectText: { color: "#fff", fontSize: 13 },
  historyDate: { color: "#71717A", fontSize: 10.5, marginTop: 3 },
  historyResult: { alignItems: "flex-end" },
  historyResultText: { color: "#E4E4E7", fontSize: 12, fontWeight: "500" },
  historyState: { color: "#71717A", fontSize: 10, marginTop: 2 },

  table: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 14,
    overflow: "hidden",
  },
  tableHead: { flexDirection: "row", paddingHorizontal: 12, paddingVertical: 10 },
  th: { color: "#808089", fontSize: 9, letterSpacing: 1 },
  tr: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
  },
  trMine: { backgroundColor: "rgba(255,255,255,0.1)" },
  td: { color: "#A1A1AA", fontSize: 13 },
  tdMine: { color: "#fff", fontWeight: "500" },
  colTier: { flex: 1.6 },
  colNum: { flex: 1, textAlign: "right" },
});
