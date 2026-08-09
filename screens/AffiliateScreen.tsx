/**
 * AffiliateScreen
 * ===============
 * Native port of the web AffiliatePage (/affiliate). Reads the same Supabase
 * tables through libs/affiliate (`loadAffiliateStats`), so the numbers here and
 * on the web are the same rows with the same tier maths.
 *
 * Parity notes vs web:
 *  - The per-user share image comes from the same `affiliate-share-image` edge
 *    function, requested as PNG (web uses SVG for its inline preview; RN cannot
 *    render remote SVG through <Image>).
 *  - Referral rows open the user profile bottom sheet instead of routing to
 *    /:username, which is how every other list in the app opens a profile.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import Icon from "../components/ui/Icon";
import ScreenHeader from "../components/ScreenHeader";
import Avatar from "../components/common/Avatar";
import { useUser, useAuthState } from "../context/AuthContext";
import { useUserProfileSheet } from "../context/UserProfileSheetContext";
import { useGateToHome } from "../hooks/useGateToHome";
import { getAccount } from "../services/user.service";
import { getAvatarUrl, shareProfile } from "../libs/misc";
import { copyToClipboard } from "../libs/clipboard.utils";
import { toastError, toastSuccess } from "../libs/toast";
import env from "../config/env";
import {
  AFFILIATE_L1_COMMISSION_PCT,
  AFFILIATE_L2_COMMISSION_PCT,
  buildInviteLink,
  buildInviteMessage,
  loadAffiliateStats,
  type AffiliateStats,
  type AffiliateReferralEntry,
} from "../libs/affiliate";

const AFFILIATES_PAGE_SIZE = 12;

function formatMoney(cents: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(2)}`;
  }
}

const truncateAddress = (address: string) =>
  address.length <= 10 ? address : `${address.slice(0, 6)}…${address.slice(-4)}`;

function formatReferralDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return null;
  }
}

function shareImageUrl(code: string, version: string): string {
  const base = `${env.SUPABASE_URL}/functions/v1/affiliate-share-image`;
  return `${base}?code=${encodeURIComponent(code)}&width=1200&height=630&format=png&v=${version}`;
}

// ── Pieces ──────────────────────────────────────────────────────────────────

const StatCard: React.FC<{
  icon: React.ComponentProps<typeof Icon>["name"];
  label: string;
  value: string | null;
  hint?: string;
}> = ({ icon, label, value, hint }) => (
  <View style={styles.statCard}>
    <View style={styles.statHead}>
      <Icon name={icon} size={13} color="#A1A1AA" />
      <Text style={styles.statLabel}>{label}</Text>
    </View>
    {value === null ? (
      <View style={styles.statSkeleton} />
    ) : (
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}
      </Text>
    )}
    {hint ? <Text style={styles.statHint}>{hint}</Text> : null}
  </View>
);

const Step: React.FC<{ n: number; title: string; body: string }> = ({ n, title, body }) => (
  <View style={styles.step}>
    <View style={styles.stepNum}>
      <Text style={styles.stepNumText}>{n}</Text>
    </View>
    <View style={{ flex: 1 }}>
      <Text style={styles.stepTitle}>{title}</Text>
      <Text style={styles.stepBody}>{body}</Text>
    </View>
  </View>
);

/**
 * One referred account. Resolves its own profile so the list paints instantly
 * from addresses and enriches with names/avatars as they load — react-query
 * dedupes across rows and caches between visits.
 */
const AffiliateRow: React.FC<{ entry: AffiliateReferralEntry }> = ({ entry }) => {
  const { showUserProfile } = useUserProfileSheet();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["affiliate-profile", entry.address],
    queryFn: async () => {
      const res: any = await getAccount(entry.address);
      return (res?.data?.result ?? null) as
        | { username?: string; displayName?: string; avatarImageUrl?: string }
        | null;
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const username = profile?.username || null;
  const name = profile?.displayName || username || truncateAddress(entry.address);
  const joined = formatReferralDate(entry.createdAt);

  return (
    <Pressable
      style={styles.row}
      onPress={() => showUserProfile(username || entry.address, { source: "affiliate" })}
    >
      <Avatar
        uri={getAvatarUrl(profile?.avatarImageUrl)}
        size={40}
        name={name}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        {isLoading && !profile ? (
          <View style={styles.rowNameSkeleton} />
        ) : (
          <Text style={styles.rowName} numberOfLines={1}>
            {name}
          </Text>
        )}
        <Text style={styles.rowSub} numberOfLines={1}>
          {username ? `@${username}` : truncateAddress(entry.address)}
          {joined ? ` · joined ${joined}` : ""}
        </Text>
      </View>
      <Icon name="ChevronRight" size={16} color="#52525B" />
    </Pressable>
  );
};

// ── Screen ──────────────────────────────────────────────────────────────────

export default function AffiliateScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const user = useUser() as any;
  const { isSignedIn, needsUsername } = useAuthState();
  useGateToHome(isSignedIn && !needsUsername);

  const wallet: string | null = user?.walletAddress || user?.address || null;
  const displayName: string | null = user?.displayName || user?.username || null;

  const [stats, setStats] = useState<AffiliateStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<"direct" | "secondary">("direct");
  const [visible, setVisible] = useState(AFFILIATES_PAGE_SIZE);
  const [imgVersion, setImgVersion] = useState("1");
  const [imgLoaded, setImgLoaded] = useState(false);

  const statsRef = useRef(stats);
  useEffect(() => {
    statsRef.current = stats;
  }, [stats]);

  const load = useCallback(
    async (opts?: { refreshImage?: boolean }) => {
      if (!wallet) {
        setLoading(false);
        return;
      }
      if (!statsRef.current) setLoading(true);
      try {
        const fallbackName = `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
        const s = await loadAffiliateStats(wallet, displayName ?? fallbackName);
        setStats(s);
        if (opts?.refreshImage && s.code) {
          setImgLoaded(false);
          setImgVersion(String(Date.now()));
        }
      } catch (e) {
        toastError(t("affiliate.loadFailed", "Could not load affiliate stats"));
      } finally {
        setLoading(false);
      }
    },
    [wallet, displayName, t],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setVisible(AFFILIATES_PAGE_SIZE);
  }, [tab]);

  const inviteLink = useMemo(() => (stats?.code ? buildInviteLink(stats.code) : ""), [stats?.code]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load({ refreshImage: true }).finally(() => setRefreshing(false));
  }, [load]);

  const onCopy = useCallback(() => {
    if (!inviteLink) return;
    copyToClipboard(inviteLink);
    toastSuccess(t("affiliate.linkCopied", "Invite link copied"));
  }, [inviteLink, t]);

  const onShare = useCallback(() => {
    if (!stats?.code || !inviteLink) return;
    void shareProfile(inviteLink, buildInviteMessage(stats.code, inviteLink));
  }, [stats?.code, inviteLink]);

  const l1List = stats?.l1List ?? [];
  const l2List = stats?.l2List ?? [];
  const list = tab === "direct" ? l1List : l2List;
  const activeCount = tab === "direct" ? stats?.referrals ?? 0 : stats?.l2Referrals ?? 0;
  // A positive count with no rows means the list is still hydrating — show a
  // spinner rather than an "empty" state that would read as wrong.
  const hydrating = list.length === 0 && (loading || activeCount > 0);
  const hasSecondary = l2List.length > 0 || (stats?.l2Referrals ?? 0) > 0;
  const shown = list.slice(0, visible);

  return (
    <View style={styles.root}>
      <ScreenHeader
        title={t("nav.affiliate", "Affiliate")}
        subtitle={t("affiliate.subtitle", "Earn from everyone you invite — forever")}
      />

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32, paddingTop: 4 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#ffffff" />
        }
      >
        {/* Per-user share image — the exact card people see when the link unfurls */}
        <View style={styles.shareImageWrap}>
          {stats?.code ? (
            <Image
              source={{ uri: shareImageUrl(stats.code, imgVersion) }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={300}
              onLoadEnd={() => setImgLoaded(true)}
            />
          ) : null}
          {(!stats?.code || !imgLoaded) && (
            <View style={styles.shareImagePlaceholder}>
              <ActivityIndicator color="#FFFFFF" />
            </View>
          )}
        </View>

        <Text style={styles.headline}>
          {t("affiliate.headline", {
            defaultValue:
              "Earn {{l1}}% from everyone you invite — and {{l2}}% from everyone they invite.",
            l1: AFFILIATE_L1_COMMISSION_PCT,
            l2: AFFILIATE_L2_COMMISSION_PCT,
          })}
        </Text>
        <Text style={styles.intro}>
          {t(
            "affiliate.intro",
            "Every time someone uses any DeHub revenue-generating feature, you earn residually and perpetually.",
          )}
        </Text>

        {/* Stats */}
        <View style={styles.statGrid}>
          <StatCard
            icon="Users"
            label={t("affiliate.direct", "Direct")}
            value={loading ? null : String(stats?.referrals ?? 0)}
            hint={`${AFFILIATE_L1_COMMISSION_PCT}%`}
          />
          <StatCard
            icon="Users"
            label={t("affiliate.secondary", "Secondary")}
            value={loading ? null : String(stats?.l2Referrals ?? 0)}
            hint={`${AFFILIATE_L2_COMMISSION_PCT}%`}
          />
          <StatCard
            icon="Wallet"
            label={t("affiliate.totalEarned", "Total earned")}
            value={loading ? null : formatMoney(stats?.totalEarnedCents ?? 0, stats?.currency || "USD")}
            hint={
              loading || !stats
                ? undefined
                : `T1 ${formatMoney(stats.l1EarnedCents, stats.currency || "USD")} · T2 ${formatMoney(
                    stats.l2EarnedCents,
                    stats.currency || "USD",
                  )}`
            }
          />
          <StatCard
            icon="Sparkles"
            label={t("affiliate.commission", "Commission")}
            value={`${AFFILIATE_L1_COMMISSION_PCT}% + ${AFFILIATE_L2_COMMISSION_PCT}%`}
            hint={t("affiliate.residual", "residual · perpetual")}
          />
        </View>

        {/* Invite link */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("affiliate.yourLink", "Your invite link")}</Text>
          <Text style={styles.cardSub}>
            {t("affiliate.yourLinkSub", {
              defaultValue:
                "Share anywhere. You earn {{l1}}% of every dollar your invites ever spend on DeHub, plus {{l2}}% from everyone they invite.",
              l1: AFFILIATE_L1_COMMISSION_PCT,
              l2: AFFILIATE_L2_COMMISSION_PCT,
            })}
          </Text>

          {loading ? (
            <View style={styles.linkSkeleton} />
          ) : stats?.code ? (
            <>
              <Pressable
                style={styles.linkBox}
                onPress={onCopy}
                accessibilityRole="button"
                accessibilityLabel={inviteLink}
                accessibilityHint="Copies invite link"
              >
                <Text style={styles.linkText} numberOfLines={1}>
                  {inviteLink}
                </Text>
                <Icon name="Copy" size={15} color="#A1A1AA" />
              </Pressable>
              <View style={styles.linkActions}>
                <Pressable style={styles.secondaryBtn} onPress={onRefresh} disabled={refreshing}>
                  <Icon name="RefreshCw" size={15} color="#E4E4E7" />
                  <Text style={styles.secondaryBtnText}>{t("affiliate.refresh", "Refresh")}</Text>
                </Pressable>
                <Pressable style={styles.primaryBtn} onPress={onShare}>
                  <Icon name="Share2" size={15} color="#000000" />
                  <Text style={styles.primaryBtnText}>{t("affiliate.share", "Share")}</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <Text style={styles.cardSub}>
              {t("affiliate.noCode", "Could not generate a code. Pull down to refresh.")}
            </Text>
          )}
        </View>

        {/* Your affiliates */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("affiliate.yourAffiliates", "Your affiliates")}</Text>
          <Text style={styles.cardSub}>
            {t("affiliate.yourAffiliatesSub", "The accounts you've referred to DeHub.")}
          </Text>

          {hasSecondary && (
            <View style={styles.tabs}>
              <Pressable
                onPress={() => setTab("direct")}
                style={[styles.tab, tab === "direct" && styles.tabActive]}
              >
                <Text style={[styles.tabText, tab === "direct" && styles.tabTextActive]}>
                  {t("affiliate.direct", "Direct")} ({stats?.referrals ?? 0})
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setTab("secondary")}
                style={[styles.tab, tab === "secondary" && styles.tabActive]}
              >
                <Text style={[styles.tabText, tab === "secondary" && styles.tabTextActive]}>
                  {t("affiliate.secondary", "Secondary")} ({stats?.l2Referrals ?? 0})
                </Text>
              </Pressable>
            </View>
          )}

          {hydrating ? (
            <ActivityIndicator color="#FFFFFF" style={{ marginVertical: 24 }} />
          ) : list.length === 0 ? (
            <View style={styles.empty}>
              <Icon name="Users" size={32} color="#3F3F46" />
              <Text style={styles.emptyTitle}>
                {tab === "direct"
                  ? t("affiliate.emptyDirect", "No affiliates yet")
                  : t("affiliate.emptySecondary", "No secondary affiliates yet")}
              </Text>
              <Text style={styles.emptyBody}>
                {tab === "direct"
                  ? t(
                      "affiliate.emptyDirectBody",
                      "Share your invite link — everyone who joins through it shows up here.",
                    )
                  : t(
                      "affiliate.emptySecondaryBody",
                      "When your affiliates invite their own friends, they'll appear here.",
                    )}
              </Text>
            </View>
          ) : (
            <>
              {shown.map((entry) => (
                <AffiliateRow key={entry.address} entry={entry} />
              ))}
              {visible < list.length && (
                <Pressable
                  style={styles.showMore}
                  onPress={() => setVisible((v) => v + AFFILIATES_PAGE_SIZE)}
                >
                  <Text style={styles.showMoreText}>
                    {t("affiliate.showMore", "Show more")} ({list.length - visible})
                  </Text>
                </Pressable>
              )}
            </>
          )}
        </View>

        {/* How it works */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("affiliate.howItWorks", "How it works")}</Text>
          <Step
            n={1}
            title={t("affiliate.step1Title", "Share your link")}
            body={t(
              "affiliate.step1Body",
              "Drop your invite link into Discord, X, YouTube, your stream — anywhere.",
            )}
          />
          <Step
            n={2}
            title={t("affiliate.step2Title", "They join DeHub")}
            body={t(
              "affiliate.step2Body",
              "Anyone who lands via your link is permanently attributed to you (first-touch wins, 90-day cookie).",
            )}
          />
          <Step
            n={3}
            title={t("affiliate.step3Title", {
              defaultValue: "Earn {{l1}}% direct",
              l1: AFFILIATE_L1_COMMISSION_PCT,
            })}
            body={t("affiliate.step3Body", {
              defaultValue:
                "You receive {{l1}}% of every dollar of revenue your invites ever generate on DeHub.",
              l1: AFFILIATE_L1_COMMISSION_PCT,
            })}
          />
          <Step
            n={4}
            title={t("affiliate.step4Title", {
              defaultValue: "Earn {{l2}}% secondary",
              l2: AFFILIATE_L2_COMMISSION_PCT,
            })}
            body={t("affiliate.step4Body", {
              defaultValue:
                "When your invites invite their friends, you also earn {{l2}}% of their revenue. Recurring, lifetime.",
              l2: AFFILIATE_L2_COMMISSION_PCT,
            })}
          />
        </View>

        {wallet ? (
          <Text style={styles.footer}>
            {t("affiliate.wallet", "Affiliate wallet")}: {truncateAddress(wallet)}
            {displayName ? ` · ${displayName}` : ""}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#010305" },

  shareImageWrap: {
    width: "100%",
    aspectRatio: 1200 / 630,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#0A0A0A",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    marginBottom: 16,
  },
  shareImagePlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
  },

  headline: { color: "#FFFFFF", fontSize: 20, fontWeight: "700", lineHeight: 27 },
  intro: { color: "#A1A1AA", fontSize: 13, lineHeight: 19, marginTop: 6, marginBottom: 16 },

  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  statCard: {
    flexGrow: 1,
    flexBasis: "47%",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    borderRadius: 12,
    padding: 14,
  },
  statHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  statLabel: {
    color: "#A1A1AA",
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  statValue: { color: "#FFFFFF", fontSize: 22, fontWeight: "700", marginTop: 8 },
  statHint: { color: "#A1A1AA", fontSize: 12, marginTop: 4 },
  statSkeleton: {
    height: 26,
    width: 80,
    marginTop: 8,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.08)",
  },

  card: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
  cardSub: { color: "#A1A1AA", fontSize: 12.5, lineHeight: 18, marginTop: 4 },

  linkSkeleton: {
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginTop: 14,
  },
  linkBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginTop: 14,
  },
  linkText: { flex: 1, color: "#FFFFFF", fontSize: 13 },
  linkActions: { flexDirection: "row", gap: 8, marginTop: 10 },
  secondaryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  secondaryBtnText: { color: "#E4E4E7", fontSize: 13, fontWeight: "600" },
  primaryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
  },
  primaryBtnText: { color: "#000000", fontSize: 13, fontWeight: "700" },

  tabs: {
    flexDirection: "row",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 999,
    padding: 3,
    marginTop: 14,
  },
  tab: { flex: 1, paddingVertical: 7, borderRadius: 999, alignItems: "center" },
  tabActive: { backgroundColor: "rgba(255,255,255,0.15)" },
  tabText: { color: "#A1A1AA", fontSize: 12.5, fontWeight: "600" },
  tabTextActive: { color: "#FFFFFF" },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    borderRadius: 14,
    padding: 10,
    marginTop: 8,
  },
  rowName: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  rowNameSkeleton: {
    height: 14,
    width: 120,
    borderRadius: 5,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  rowSub: { color: "#A1A1AA", fontSize: 12, marginTop: 3 },

  empty: { alignItems: "center", paddingVertical: 28 },
  emptyTitle: { color: "#D4D4D8", fontSize: 14, fontWeight: "600", marginTop: 10 },
  emptyBody: {
    color: "#A1A1AA",
    fontSize: 12,
    textAlign: "center",
    marginTop: 4,
    paddingHorizontal: 16,
    lineHeight: 17,
  },

  showMore: { alignItems: "center", paddingVertical: 12, marginTop: 4 },
  showMoreText: { color: "#A1A1AA", fontSize: 13, fontWeight: "600" },

  step: { flexDirection: "row", gap: 12, marginTop: 14 },
  stepNum: {
    width: 26,
    height: 26,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  stepTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  stepBody: { color: "#A1A1AA", fontSize: 12.5, lineHeight: 18, marginTop: 3 },

  footer: { color: "#71717A", fontSize: 12, textAlign: "center", marginTop: 4 },
});
