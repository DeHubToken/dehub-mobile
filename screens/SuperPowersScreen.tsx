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
 * **All thirteen powers are listed, not just the two that are built.** The
 * ladder is the product: the reason to climb a rung is knowing what the next
 * one holds.
 */
import React, { useMemo } from "react";
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

/** Total slot minutes a tier holds per cycle — the number worth comparing. */
function formatMinutes(total: number): string {
  if (total < 60) return `${total}m`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export default function SuperPowersScreen() {
  const navigation = useNavigation<any>();
  const { data: status, isLoading: loadingStatus } = useSuperpowers();
  const { data: ladder, isLoading: loadingLadder } = useSuperpowerLadder();
  const cancelBoost = useCancelBoost();

  // The public ladder carries every power; the signed-in one adds `unlocked`.
  // Prefer the personal copy so the screen lights up without a second render.
  const powers = status?.powers ?? ladder?.powers ?? [];

  const refillsOn = useMemo(() => {
    const iso = status?.cycleEndsAt ?? ladder?.cycleEndsAt;
    if (!iso) return null;
    return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long" });
  }, [status?.cycleEndsAt, ladder?.cycleEndsAt]);

  const liveBookings = status?.bookings.filter(b => b.status === "active") ?? [];
  const badgeArt = status?.tier ? getBadgeUrl(status.badgeBalance) : undefined;

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
          A badge buys more than the art beside your name. Every fortnight it grants boosts — each
          one puts a post in the slot at the top of the home feed. Thirteen tiers, thirteen powers,
          one unlock per rung.
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
              <View style={styles.countBlock}>
                <Text style={styles.count}>{status.boostsLeft}</Text>
                <Text style={styles.countLabel}>LEFT</Text>
              </View>
            </View>

            {!!refillsOn && (
              <Text style={styles.footnote}>
                Refills on {refillsOn} — the same moment for everybody.
              </Text>
            )}

            {liveBookings.length > 0 && (
              <View style={styles.bookings}>
                {liveBookings.map(booking => (
                  <View key={booking.id} style={styles.bookingRow}>
                    <Icon
                      name="Clock"
                      size={14}
                      color={booking.live ? "#4ADE80" : "#71717A"}
                    />
                    <Text style={styles.bookingId}>#{booking.tokenId}</Text>
                    <Text style={styles.bookingState}>
                      {booking.live
                        ? `live until ${new Date(booking.endsAt).toLocaleTimeString(undefined, {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}`
                        : "queued"}
                    </Text>
                    <Text style={styles.bookingSeen}>{booking.served} seen</Text>
                    <Pressable onPress={() => handleCancel(booking.id)} disabled={cancelBoost.isPending}>
                      <Text style={styles.cancel}>Cancel</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
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

        {/* ── The thirteen powers ──────────────────────────────────────── */}
        <Text style={styles.heading}>THE THIRTEEN POWERS</Text>
        <View style={styles.powerGrid}>
          {powers.map((power, index) => {
            const unlocked = !!power.unlocked && power.available;
            return (
              <View key={power.key} style={[styles.powerCard, unlocked && styles.powerCardOn]}>
                <View style={styles.powerTop}>
                  {/* Numbered because it IS a sequence: one power per rung. */}
                  <Text style={styles.rung}>{String(index + 1).padStart(2, "0")}</Text>
                  <Text style={[styles.powerName, !unlocked && styles.powerNameOff]}>
                    {power.label}
                  </Text>
                  <Icon
                    name={unlocked ? "Check" : "Lock"}
                    size={13}
                    color={unlocked ? "#4ADE80" : "#52525B"}
                  />
                </View>
                <Text style={styles.powerSummary}>{power.summary}</Text>
                <Text style={styles.powerTier}>
                  {power.tier}
                  {!power.available ? " · coming soon" : ""}
                </Text>
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
  countBlock: { alignItems: "flex-end" },
  count: { color: "#fff", fontSize: 24, fontWeight: "700" },
  countLabel: { color: "#71717A", fontSize: 9, letterSpacing: 1 },
  footnote: { color: "#71717A", fontSize: 12, lineHeight: 17 },
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

  bookings: { borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.1)", paddingTop: 10, gap: 8 },
  bookingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  bookingId: { color: "#fff", fontSize: 13 },
  bookingState: { color: "#71717A", fontSize: 12, flex: 1 },
  bookingSeen: { color: "#71717A", fontSize: 12 },
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
    padding: 14,
    gap: 5,
  },
  powerCardOn: {
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  powerTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  rung: { color: "#52525B", fontSize: 11 },
  powerName: { color: "#fff", fontSize: 14, fontWeight: "500", flex: 1 },
  powerNameOff: { color: "#A1A1AA" },
  powerSummary: { color: "#71717A", fontSize: 12.5, lineHeight: 17 },
  powerTier: { color: "#52525B", fontSize: 11 },

  table: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 14,
    overflow: "hidden",
  },
  tableHead: { flexDirection: "row", paddingHorizontal: 12, paddingVertical: 10 },
  th: { color: "#71717A", fontSize: 9, letterSpacing: 1 },
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
