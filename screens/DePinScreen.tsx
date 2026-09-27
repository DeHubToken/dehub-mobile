/**
 * DePinScreen
 * ===========
 * Native port of the web DePin page (dehub.io/depin): what the community node
 * network is, the live network stats, and the signed-in wallet's own node
 * ledger.
 *
 * The node itself does not run here. On the web it is a browser tab holding
 * media in the Origin Private File System, answering challenges over a socket
 * for as long as the tab stays open — none of which a phone app can do in the
 * background. So the panel that is "Become a node" on the web is the ledger
 * (GET /depin/me) plus a way to open the page in a browser to run one. The
 * App Store build leaves that link out: it is an earn action (see
 * config/storefront).
 */
import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import Icon, { type IconName } from "../components/ui/Icon";
import ScreenHeader from "../components/ScreenHeader";
import { DeHubLoader } from "../components/DeHubLoader";
import { DeHubRefreshControl, DeHubRefreshMark } from "../components/Feed/DeHubRefreshControl";
import { useAuthState, useUser } from "../context/AuthContext";
import { DIGITAL_PURCHASES_ENABLED } from "../config/storefront";
import { WEBSITE_LINK } from "../config/links";
import { openInApp } from "../libs/links.utils";
import { ScreenNames } from "../navigation/ScreenNames";
import {
  getDepinMe,
  getDepinStats,
  isDepinUnavailable,
  type DepinMeResponse,
  type DepinStatsResponse,
} from "../services/depin.service";

const EDGE_NETWORK_IMAGE = require("../assets/depin/edge-network.webp");
const TRANSCODE_IMAGE = require("../assets/depin/transcode-workstation.webp");

const DEPIN_WEB_URL = `${WEBSITE_LINK}/depin`;
const DEPIN_DOCS_URL = `${WEBSITE_LINK}/docs/dapps#depin`;

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value >= 100 || exponent === 0 ? Math.round(value) : value.toFixed(1)} ${units[exponent]}`;
}

const JOBS: { icon: IconName; key: string }[] = [
  { icon: "HardDrive", key: "host" },
  { icon: "Radio", key: "deliver" },
];

const FALLBACK_STEPS: { icon: IconName; key: string; muted?: boolean }[] = [
  { icon: "Server", key: "origin" },
  { icon: "Layers", key: "availableReplicas" },
  { icon: "WifiOff", key: "offlineNode", muted: true },
  { icon: "Network", key: "viewer" },
];

const PRIVACY_ITEMS: { icon: IconName; key: string }[] = [
  { icon: "ShieldCheck", key: "protectedContent" },
  { icon: "Radio", key: "publicContent" },
  { icon: "HardDrive", key: "operatorControls" },
];

const VERIFICATION_ITEMS: { icon: IconName; key: string }[] = [
  { icon: "Radio", key: "deliveryReceipts" },
  { icon: "Gauge", key: "availability" },
  { icon: "Cpu", key: "validOutput" },
  { icon: "Coins", key: "revenuePool" },
];

const ROADMAP_KEYS = ["delivery", "adaptiveVideo", "desktopNodes", "baseSettlement"];

const FAQ_KEYS = ["Offline", "CanOperatorSee", "HowMuch", "SoftwareAvailable", "InstallNeeded"];

function SectionHeading({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.sectionHeading}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionBody}>{body}</Text>
    </View>
  );
}

/** Public network stats — shown to everyone, signed in or not. */
function StatsStrip({ data, loading }: { data?: DepinStatsResponse; loading: boolean }) {
  const { t } = useTranslation();
  const stats = data && !isDepinUnavailable(data) ? data : null;
  const unavailable = data && isDepinUnavailable(data) ? data : null;
  const rows: [string, string | null][] = [
    ["statNodesOnline", stats ? String(stats.onlineNodes) : null],
    ["statStored", stats ? formatBytes(stats.totalStoredBytes) : null],
    ["statVerified", stats ? formatBytes(stats.totalVerifiedBytes) : null],
  ];
  return (
    <View style={styles.statsRow}>
      {rows.map(([labelKey, value]) => (
        <View key={labelKey} style={styles.statCard}>
          <Text style={styles.eyebrow} numberOfLines={1}>{t(`depin.${labelKey}`)}</Text>
          {loading ? (
            <DeHubLoader size={22} />
          ) : (
            <Text style={styles.statValue} numberOfLines={1}>{value ?? "—"}</Text>
          )}
          {!!unavailable && (
            <Text style={styles.statNote}>
              {unavailable.reason === "unconfigured" ? t("depin.statNotTracked") : t("depin.statUnavailable")}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}

/** The wallet's ledger, or the way to get one. */
function NodePanel({ me }: { me?: DepinMeResponse }) {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { isSignedIn } = useAuthState();

  if (!isSignedIn) {
    return (
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>{t("depin.becomeANode")}</Text>
        <Text style={styles.panelBody}>{t("depin.appSignInBlurb")}</Text>
        <Pressable
          style={styles.primaryBtn}
          onPress={() => navigation.navigate(ScreenNames.SignIn)}
          accessibilityRole="button"
        >
          <Text style={styles.primaryBtnText}>{t("depin.signIn")}</Text>
        </Pressable>
      </View>
    );
  }

  const ledger = me && !isDepinUnavailable(me) ? me : null;
  const ledgerMissing = !!me && isDepinUnavailable(me);
  const value = (v: string | null) => (ledger ? v : ledgerMissing ? t("depin.notTrackedYet") : "—");
  const status = ledger?.status ?? "unregistered";
  const statusLabel =
    status === "online" ? t("depin.online") : status === "offline" ? t("depin.statusOffline") : t("depin.statusUnregistered");

  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <Text style={styles.panelTitle}>{t("depin.yourNode")}</Text>
        <View style={styles.statusPill}>
          <View style={[styles.statusDot, status === "online" ? styles.dotOnline : styles.dotIdle]} />
          <Text style={styles.statusText}>{statusLabel}</Text>
        </View>
      </View>

      <View style={styles.ledgerGrid}>
        {[
          ["verifiedBytes", ledger ? formatBytes(ledger.verifiedBytes) : null],
          ["totalStoredLedger", ledger ? formatBytes(ledger.storedBytes) : null],
          ["dhbEarnedThisPeriod", ledger ? String(ledger.dhbEarnedThisPeriod) : null],
        ].map(([key, v]) => (
          <View key={key as string} style={styles.ledgerCell}>
            <Text style={styles.eyebrow}>{t(`depin.${key}`)}</Text>
            <Text style={styles.ledgerValue}>{value(v)}</Text>
          </View>
        ))}
      </View>

      {DIGITAL_PURCHASES_ENABLED && (
        <>
          <Text style={[styles.panelBody, { marginTop: 16 }]}>{t("depin.appNodeBody")}</Text>
          <Pressable
            style={styles.primaryBtn}
            onPress={() => openInApp(DEPIN_WEB_URL)}
            accessibilityRole="link"
          >
            <Text style={styles.primaryBtnText}>{t("depin.openOnWeb")}</Text>
            <Icon name="ExternalLink" size={15} color="#09090B" />
          </Pressable>
        </>
      )}
    </View>
  );
}

function FaqItem({ stem }: { stem: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <Pressable
      style={[styles.faqItem, open && styles.faqItemOpen]}
      onPress={() => setOpen((o) => !o)}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
    >
      <View style={styles.faqHeader}>
        <Text style={styles.faqQuestion}>{t(`depin.faq${stem}Q`)}</Text>
        <Icon name={open ? "Minus" : "Plus"} size={18} color="#71717A" />
      </View>
      {open && <Text style={styles.faqAnswer}>{t(`depin.faq${stem}A`)}</Text>}
    </Pressable>
  );
}

export default function DePinScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { isSignedIn } = useAuthState();
  const user = useUser() as { walletAddress?: string; address?: string } | null;
  const wallet = (user?.walletAddress || user?.address || "").toLowerCase();

  const statsQuery = useQuery({
    queryKey: ["depin-stats"],
    queryFn: getDepinStats,
    refetchInterval: 60_000,
    staleTime: 45_000,
    retry: 1,
  });

  const meQuery = useQuery({
    queryKey: ["depin-me", wallet],
    queryFn: getDepinMe,
    enabled: isSignedIn,
    refetchInterval: 30_000,
  });

  const refreshing = statsQuery.isRefetching || meQuery.isRefetching;
  const onRefresh = () => {
    statsQuery.refetch();
    if (isSignedIn) meQuery.refetch();
  };

  return (
    <View style={styles.root}>
      <ScreenHeader title={t("depin.title")} subtitle={t("depin.heroEyebrow")} />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<DeHubRefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#ffffff" />}
      >
        {/* Hero */}
        <Text style={styles.heroTitle}>{t("depin.heroTitle")}</Text>
        <Text style={styles.heroBlurb}>{t("depin.heroBlurb")}</Text>
        <View style={styles.heroFigure}>
          <Image
            source={EDGE_NETWORK_IMAGE}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            accessibilityLabel={t("depin.heroImageAlt")}
          />
          <View style={styles.heroShade} />
          <Text style={styles.heroCaption}>{t("depin.heroCaption")}</Text>
        </View>

        {/* Early access */}
        <View style={styles.notice}>
          <View style={styles.noticeBadge}>
            <Icon name="Gauge" size={14} color="#FFFFFF" />
            <Text style={styles.noticeBadgeText}>{t("depin.earlyAccess")}</Text>
          </View>
          <Text style={styles.panelBody}>{t("depin.earlyAccessBody")}</Text>
        </View>

        {/* Network + your node */}
        <StatsStrip data={statsQuery.data} loading={statsQuery.isLoading} />
        <NodePanel me={meQuery.data} />

        {/* Three jobs */}
        <SectionHeading title={t("depin.threeJobsTitle")} body={t("depin.threeJobsBody")} />
        <View style={styles.transcodeCard}>
          <Image
            source={TRANSCODE_IMAGE}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            accessibilityLabel={t("depin.transcodeImageAlt")}
          />
          <View style={styles.transcodeShade} />
          <View style={styles.transcodeBody}>
            <Icon name="Cpu" size={26} color="#FFFFFF" />
            <Text style={styles.cardTitle}>{t("depin.transcode")}</Text>
            <Text style={styles.cardBodyLight}>{t("depin.transcodeBody")}</Text>
          </View>
        </View>
        {JOBS.map((job) => (
          <View key={job.key} style={styles.card}>
            <Icon name={job.icon} size={26} color="#FFFFFF" />
            <Text style={styles.cardTitle}>{t(`depin.${job.key}`)}</Text>
            <Text style={styles.cardBody}>{t(`depin.${job.key}Body`)}</Text>
          </View>
        ))}

        {/* Fallback path */}
        <SectionHeading title={t("depin.nodesLeaveTitle")} body={t("depin.nodesLeaveBody")} />
        <View style={styles.flow} accessibilityLabel={t("depin.fallbackFigureAria")}>
          {FALLBACK_STEPS.map((step, i) => (
            <React.Fragment key={step.key}>
              {i > 0 && step.key !== "offlineNode" && (
                <View style={styles.flowArrow}>
                  <Icon name="ArrowDown" size={16} color="#52525B" />
                </View>
              )}
              <View
                style={[
                  styles.flowStep,
                  step.key === "viewer" && styles.flowStepLight,
                  step.muted && styles.flowStepMuted,
                  step.key === "offlineNode" && { marginTop: 8 },
                ]}
              >
                <View style={styles.flowStepHead}>
                  <Icon name={step.icon} size={20} color={step.key === "viewer" ? "#09090B" : step.muted ? "#71717A" : "#FFFFFF"} />
                  {step.key === "availableReplicas" && (
                    <View style={styles.inlineStatus}>
                      <Icon name="Check" size={13} color="#D4D4D8" />
                      <Text style={styles.inlineStatusText}>{t("depin.online")}</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.flowTitle, step.key === "viewer" && styles.textDark, step.muted && styles.textMuted]}>
                  {t(`depin.${step.key}`)}
                </Text>
                <Text style={[styles.cardBody, step.key === "viewer" && styles.textDarkSoft]}>
                  {t(`depin.${step.key}Body`)}
                </Text>
              </View>
            </React.Fragment>
          ))}
        </View>

        {/* Privacy */}
        <View style={styles.privacyHead}>
          <Icon name="Lock" size={28} color="#FFFFFF" />
        </View>
        <SectionHeading title={t("depin.privacyTitle")} body={t("depin.privacyBody")} />
        {PRIVACY_ITEMS.map((item) => {
          const light = item.key === "operatorControls";
          return (
            <View key={item.key} style={[styles.card, light && styles.cardLight]}>
              <Icon name={item.icon} size={26} color={light ? "#09090B" : "#FFFFFF"} />
              <Text style={[styles.cardTitle, light && styles.textDark]}>{t(`depin.${item.key}`)}</Text>
              <Text style={[styles.cardBody, light && styles.textDarkSoft]}>{t(`depin.${item.key}Body`)}</Text>
            </View>
          );
        })}

        {/* Verified work */}
        <SectionHeading title={t("depin.verifiedWorkTitle")} body={t("depin.verifiedWorkBody")} />
        {VERIFICATION_ITEMS.map((item) => (
          <View key={item.key} style={styles.ruleRow}>
            <Icon name={item.icon} size={22} color="#FFFFFF" />
            <View style={{ flex: 1 }}>
              <Text style={styles.flowTitle}>{t(`depin.${item.key}`)}</Text>
              <Text style={styles.cardBody}>{t(`depin.${item.key}Body`)}</Text>
            </View>
          </View>
        ))}
        <View style={[styles.card, { marginTop: 16 }]}>
          <Text style={styles.disclaimer}>{t("depin.noFixedRate")}</Text>
          <Text style={[styles.cardBody, { marginTop: 10 }]}>{t("depin.runningCosts")}</Text>
        </View>

        {/* Roadmap */}
        <SectionHeading title={t("depin.safestWorkloadTitle")} body={t("depin.safestWorkloadBody")} />
        {ROADMAP_KEYS.map((key) => (
          <View key={key} style={styles.card}>
            <Text style={styles.flowTitle}>{t(`depin.${key}`)}</Text>
            <Text style={styles.cardBody}>{t(`depin.${key}Body`)}</Text>
          </View>
        ))}

        {/* FAQ */}
        <Text style={[styles.sectionTitle, { marginTop: 36, marginBottom: 14 }]}>{t("depin.faqHeading")}</Text>
        {FAQ_KEYS.map((stem) => (
          <FaqItem key={stem} stem={stem} />
        ))}

        {/* Closing */}
        <View style={styles.cta}>
          <Text style={styles.ctaTitle}>{t("depin.ctaTitle")}</Text>
          <Text style={[styles.sectionBody, { textAlign: "center" }]}>{t("depin.ctaBody")}</Text>
          <Pressable style={styles.secondaryBtn} onPress={() => openInApp(DEPIN_DOCS_URL)} accessibilityRole="link">
            <Text style={styles.secondaryBtnText}>{t("depin.readTheDocs")}</Text>
            <Icon name="ArrowRight" size={15} color="#FFFFFF" />
          </Pressable>
        </View>
        <Text style={styles.footerNote}>{t("depin.footerNote")}</Text>
      </ScrollView>
      <DeHubRefreshMark refreshing={refreshing} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#010305" },
  heroTitle: { color: "#FFFFFF", fontSize: 32, lineHeight: 36, fontWeight: "700", letterSpacing: -1, marginTop: 8 },
  heroBlurb: { color: "#D4D4D8", fontSize: 15, lineHeight: 23, marginTop: 12 },
  heroFigure: {
    marginTop: 20,
    height: 260,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "#18181B",
    justifyContent: "flex-end",
  },
  heroShade: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(9,9,11,0.35)" },
  heroCaption: { color: "#D4D4D8", fontSize: 13, lineHeight: 20, padding: 16 },
  notice: {
    marginTop: 20,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.03)",
    gap: 10,
  },
  noticeBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  noticeBadgeText: { color: "#FFFFFF", fontSize: 13, fontWeight: "600" },
  statsRow: { flexDirection: "row", gap: 8, marginTop: 20 },
  statCard: {
    flex: 1,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
    minHeight: 84,
  },
  eyebrow: { color: "#71717A", fontSize: 11, fontWeight: "600", letterSpacing: 1, textTransform: "uppercase" },
  statValue: { color: "#FFFFFF", fontSize: 20, fontWeight: "700", marginTop: 8 },
  statNote: { color: "#71717A", fontSize: 11, marginTop: 4 },
  panel: {
    marginTop: 12,
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "#18181B",
  },
  panelHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  panelTitle: { color: "#FFFFFF", fontSize: 19, fontWeight: "700" },
  panelBody: { color: "#A1A1AA", fontSize: 14, lineHeight: 21, marginTop: 8 },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  dotOnline: { backgroundColor: "#34D399" },
  dotIdle: { backgroundColor: "#FBBF24" },
  statusText: { color: "#D4D4D8", fontSize: 12, fontWeight: "500" },
  ledgerGrid: { marginTop: 16, gap: 8 },
  ledgerCell: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  ledgerValue: { color: "#FFFFFF", fontSize: 17, fontWeight: "600", marginTop: 4 },
  primaryBtn: {
    marginTop: 16,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#F4F4F5",
  },
  primaryBtnText: { color: "#09090B", fontSize: 14, fontWeight: "700" },
  secondaryBtn: {
    marginTop: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.20)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  secondaryBtnText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  sectionHeading: { marginTop: 40, marginBottom: 16 },
  sectionTitle: { color: "#FFFFFF", fontSize: 26, lineHeight: 31, fontWeight: "700", letterSpacing: -0.6 },
  sectionBody: { color: "#A1A1AA", fontSize: 15, lineHeight: 23, marginTop: 12 },
  card: {
    marginBottom: 10,
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  cardLight: { backgroundColor: "#F4F4F5", borderColor: "#F4F4F5" },
  cardTitle: { color: "#FFFFFF", fontSize: 20, fontWeight: "700", marginTop: 16 },
  cardBody: { color: "#A1A1AA", fontSize: 14, lineHeight: 21, marginTop: 6 },
  cardBodyLight: { color: "#D4D4D8", fontSize: 14, lineHeight: 21, marginTop: 6 },
  transcodeCard: {
    marginBottom: 10,
    height: 340,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "#18181B",
    justifyContent: "flex-end",
  },
  transcodeShade: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(9,9,11,0.55)" },
  transcodeBody: { padding: 18 },
  flow: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "#09090B",
  },
  flowArrow: { alignItems: "center", paddingVertical: 6 },
  flowStep: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  flowStepLight: { backgroundColor: "#F4F4F5", borderColor: "#F4F4F5" },
  flowStepMuted: { backgroundColor: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.08)" },
  flowStepHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  inlineStatus: { flexDirection: "row", alignItems: "center", gap: 4 },
  inlineStatusText: { color: "#D4D4D8", fontSize: 12, fontWeight: "500" },
  flowTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "700", marginTop: 10 },
  textDark: { color: "#09090B" },
  textDarkSoft: { color: "#52525B" },
  textMuted: { color: "#D4D4D8" },
  privacyHead: { marginTop: 40, marginBottom: -24 },
  ruleRow: {
    flexDirection: "row",
    gap: 14,
    paddingVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.15)",
  },
  disclaimer: { color: "#D4D4D8", fontSize: 15, lineHeight: 23 },
  faqItem: {
    marginBottom: 8,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "#09090B",
  },
  faqItemOpen: { borderColor: "rgba(255,255,255,0.20)" },
  faqHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  faqQuestion: { flex: 1, color: "#FFFFFF", fontSize: 15, fontWeight: "600", lineHeight: 21 },
  faqAnswer: { color: "#A1A1AA", fontSize: 14, lineHeight: 21, marginTop: 10 },
  cta: { alignItems: "center", marginTop: 44 },
  ctaTitle: { color: "#FFFFFF", fontSize: 28, lineHeight: 33, fontWeight: "700", letterSpacing: -0.8, textAlign: "center" },
  footerNote: { color: "#71717A", fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 32 },
});
