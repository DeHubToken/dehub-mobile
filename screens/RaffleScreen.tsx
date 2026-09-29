/**
 * RaffleScreen
 * ============
 * Native port of the web prize draws page (/raffle). Like the web page it
 * explains the mechanism and reads no live draw state: a screen that promises
 * "1 draw live now" and renders a zero is worse than one that explains how a
 * draw works and points at the feed, where the live draw is announced.
 *
 * Paid entry is left out of the App Store build (config/storefront): the DHB
 * ticket card and the staking route are hidden there. Every draw carries a
 * free entry route, so nothing a reader needs is lost.
 */
import React, { useCallback, useRef } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";
import Icon, { type IconName } from "../components/ui/Icon";
import ScreenHeader from "../components/ScreenHeader";
import { ScreenNames } from "../navigation/ScreenNames";
import type { AppStackParamList } from "../navigation/types";
import { DIGITAL_PURCHASES_ENABLED } from "../config/storefront";
import { WEBSITE_LINK } from "../config/links";
import { openInApp } from "../libs/links.utils";
import { useAuthActions } from "../context/AuthContext";

type Nav = NativeStackNavigationProp<AppStackParamList>;

interface Card {
  icon: IconName;
  titleKey: string;
  bodyKey: string;
  /** Where the card's "Open" link goes, if it has one. */
  open?: (nav: Nav) => void;
  /** Paid, or leads somewhere the App Store build leaves out. */
  paid?: boolean;
  /** Leads to a screen only signed-in users have, so a guest signs in first. */
  auth?: boolean;
}

const STEPS: Card[] = [
  { icon: "Scroll", titleKey: "raffle.step1Title", bodyKey: "raffle.step1Body" },
  { icon: "Ticket", titleKey: "raffle.step2Title", bodyKey: "raffle.step2Body" },
  { icon: "Target", titleKey: "raffle.step3Title", bodyKey: "raffle.step3Body" },
  { icon: "Trophy", titleKey: "raffle.step4Title", bodyKey: "raffle.step4Body" },
];

const ENTRY_ROUTES: Card[] = [
  { icon: "PenLine", titleKey: "raffle.postTitle", bodyKey: "raffle.postBody" },
  {
    icon: "Coins",
    titleKey: "raffle.stakeTitle",
    bodyKey: "raffle.stakeBody",
    open: (nav) => nav.navigate(ScreenNames.Dpay, { initialTab: "stake" }),
    paid: true,
    auth: true,
  },
  { icon: "Gamepad2", titleKey: "raffle.arcadeTitle", bodyKey: "raffle.arcadeBody", open: (nav) => nav.navigate(ScreenNames.Arcade) },
  { icon: "Mic", titleKey: "raffle.stagesTitle", bodyKey: "raffle.stagesBody", open: (nav) => nav.navigate(ScreenNames.Stages) },
  { icon: "Ticket", titleKey: "raffle.ticketTitle", bodyKey: "raffle.ticketBody", paid: true },
  { icon: "Gem", titleKey: "raffle.collectibleTitle", bodyKey: "raffle.collectibleBody" },
];

const FAIRNESS: Card[] = [
  { icon: "Timer", titleKey: "raffle.fair1Title", bodyKey: "raffle.fair1Body" },
  { icon: "Target", titleKey: "raffle.fair2Title", bodyKey: "raffle.fair2Body" },
  { icon: "ShieldCheck", titleKey: "raffle.fair3Title", bodyKey: "raffle.fair3Body" },
];

const ANATOMY = [
  ["raffle.anatomyPrize", "raffle.anatomyPrizeBody"],
  ["raffle.anatomyRoutes", "raffle.anatomyRoutesBody"],
  ["raffle.anatomyClosing", "raffle.anatomyClosingBody"],
  ["raffle.anatomySnapshot", "raffle.anatomySnapshotBody"],
  ["raffle.anatomyRandomness", "raffle.anatomyRandomnessBody"],
  ["raffle.anatomyClaim", "raffle.anatomyClaimBody"],
] as const;

const FAQ = [
  ["raffle.faq1Q", "raffle.faqPurchaseAnswer"],
  ["raffle.faq2Q", "raffle.faq2A"],
  ["raffle.faq3Q", "raffle.faq3A"],
  ["raffle.faq4Q", "raffle.faq4A"],
  ["raffle.faq5Q", "raffle.faq5A"],
  ["raffle.faq6Q", "raffle.faq6A"],
] as const;

const linkAllowed = (card: Card) =>
  DIGITAL_PURCHASES_ENABLED || !card.paid;

function SectionHeading({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.sectionBody}>{body}</Text>
    </View>
  );
}

function InfoCard({ card, onOpen, openLabel }: { card: Card; onOpen?: () => void; openLabel: string }) {
  const { t } = useTranslation();
  return (
    <View style={styles.card}>
      <Icon name={card.icon} size={22} color="#FFFFFF" strokeWidth={1.6} />
      <Text style={styles.cardTitle}>{t(card.titleKey)}</Text>
      <Text style={styles.cardBody}>{t(card.bodyKey)}</Text>
      {onOpen && (
        <Pressable accessibilityRole="link" onPress={onOpen} style={styles.openLink} hitSlop={8}>
          <Text style={styles.openLinkText}>{openLabel}</Text>
          <Icon name="ArrowRight" size={14} color="#FFFFFF" />
        </Pressable>
      )}
    </View>
  );
}

export default function RaffleScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { requireAuth } = useAuthActions();
  const scrollRef = useRef<ScrollView>(null);
  const howY = useRef(0);

  const goHome = useCallback(() => {
    navigation.navigate(ScreenNames.Root, { screen: ScreenNames.Home }, { pop: true });
  }, [navigation]);

  const entryRoutes = ENTRY_ROUTES.filter((card) => DIGITAL_PURCHASES_ENABLED || !card.paid);

  return (
    <View style={styles.root}>
      <ScreenHeader title={t("raffle.title")} />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <Text style={styles.eyebrow}>{t("raffle.eyebrow")}</Text>
        <Text style={styles.heroTitle} accessibilityRole="header">
          {t("raffle.heroTitle")}
        </Text>
        <Text style={styles.heroBody}>{t("raffle.heroBody")}</Text>
        <View style={styles.ctaRow}>
          <Pressable
            accessibilityRole="button"
            style={styles.primaryBtn}
            onPress={() => scrollRef.current?.scrollTo({ y: howY.current, animated: true })}
          >
            <Text style={styles.primaryText}>{t("raffle.seeHowItWorks")}</Text>
            <Icon name="ArrowDown" size={15} color="#09090B" />
          </Pressable>
          <Pressable accessibilityRole="button" style={styles.secondaryBtn} onPress={goHome}>
            <Text style={styles.secondaryText}>{t("raffle.findLiveDraw")}</Text>
            <Icon name="ArrowRight" size={15} color="#FFFFFF" />
          </Pressable>
        </View>
        <Text style={styles.finePrint}>{t("raffle.noPurchase")}</Text>

        {/* Anatomy */}
        <View style={[styles.card, styles.anatomy]}>
          <Text style={styles.anatomyEyebrow}>{t("raffle.anatomyTitle")}</Text>
          {ANATOMY.map(([term, detail], i) => (
            <View key={term} style={[styles.anatomyRow, i === ANATOMY.length - 1 && styles.anatomyRowLast]}>
              <Text style={styles.anatomyTerm}>{t(term)}</Text>
              <Text style={styles.cardBody}>{t(detail)}</Text>
            </View>
          ))}
        </View>

        {/* How it works */}
        <View onLayout={(e) => (howY.current = e.nativeEvent.layout.y)}>
          <SectionHeading title={t("raffle.howTitle")} body={t("raffle.howBody")} />
        </View>
        {STEPS.map((card) => (
          <InfoCard key={card.titleKey} card={card} openLabel={t("raffle.open")} />
        ))}

        {/* Entries */}
        <SectionHeading title={t("raffle.entriesTitle")} body={t("raffle.entriesBody")} />
        {entryRoutes.map((card) => (
          <InfoCard
            key={card.titleKey}
            card={card}
            openLabel={t("raffle.open")}
            onOpen={
              card.open && linkAllowed(card)
                ? () => (card.auth ? requireAuth(() => card.open!(navigation)) : card.open!(navigation))
                : undefined
            }
          />
        ))}

        {/* Fairness */}
        <SectionHeading title={t("raffle.fairnessTitle")} body={t("raffle.fairnessBody")} />
        {FAIRNESS.map((card) => (
          <InfoCard key={card.titleKey} card={card} openLabel={t("raffle.open")} />
        ))}
        <View style={styles.card}>
          <Text style={[styles.cardTitle, styles.flushTitle]}>{t("raffle.neverPayTitle")}</Text>
          <Text style={styles.cardBody}>{t("raffle.neverPayBody")}</Text>
        </View>

        {/* FAQ */}
        <SectionHeading title={t("raffle.faqTitle")} body={t("raffle.faqBody")} />
        {FAQ.map(([q, a]) => (
          <View key={q} style={styles.card}>
            <Text style={styles.faqQ}>{t(q)}</Text>
            <Text style={styles.cardBody}>{t(a)}</Text>
          </View>
        ))}

        {/* Close */}
        <SectionHeading title={t("raffle.ctaTitle")} body={t("raffle.ctaBody")} />
        <View style={styles.ctaRow}>
          <Pressable accessibilityRole="button" style={styles.primaryBtn} onPress={goHome}>
            <Text style={styles.primaryText}>{t("raffle.goToFeed")}</Text>
            <Icon name="ArrowRight" size={15} color="#09090B" />
          </Pressable>
          <Pressable
            accessibilityRole="link"
            style={styles.secondaryBtn}
            onPress={() => void openInApp(`${WEBSITE_LINK}/docs/token/overview`)}
          >
            <Text style={styles.secondaryText}>{t("raffle.readAboutTokens")}</Text>
          </Pressable>
        </View>

        <Text style={[styles.finePrint, styles.legal]}>{t("raffle.legal")}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#010305" },
  eyebrow: {
    color: "#A1A1AA",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 2,
    textTransform: "uppercase",
    marginTop: 12,
  },
  heroTitle: { color: "#FFFFFF", fontSize: 36, lineHeight: 38, fontWeight: "700", letterSpacing: -1.5, marginTop: 14 },
  heroBody: { color: "#D4D4D8", fontSize: 15, lineHeight: 23, marginTop: 16 },
  ctaRow: { gap: 10, marginTop: 22 },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: "#F4F4F5",
  },
  primaryText: { color: "#09090B", fontSize: 14, fontWeight: "700" },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.20)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  secondaryText: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  finePrint: { color: "#71717A", fontSize: 13, lineHeight: 20, marginTop: 16 },
  anatomy: { marginTop: 24 },
  anatomyEyebrow: {
    color: "#71717A",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  anatomyRow: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.10)",
  },
  anatomyRowLast: { borderBottomWidth: 0, paddingBottom: 0 },
  anatomyTerm: { color: "#FFFFFF", fontSize: 14, fontWeight: "600", marginBottom: 2 },
  sectionHead: { marginTop: 40, marginBottom: 16 },
  sectionTitle: { color: "#FFFFFF", fontSize: 26, lineHeight: 30, fontWeight: "700", letterSpacing: -0.8 },
  sectionBody: { color: "#A1A1AA", fontSize: 14, lineHeight: 22, marginTop: 10 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.03)",
    padding: 18,
    marginBottom: 12,
  },
  cardTitle: { color: "#FFFFFF", fontSize: 17, fontWeight: "600", marginTop: 14, letterSpacing: -0.3 },
  flushTitle: { marginTop: 0 },
  cardBody: { color: "#A1A1AA", fontSize: 14, lineHeight: 21, marginTop: 6 },
  openLink: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12, alignSelf: "flex-start" },
  openLinkText: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  faqQ: { color: "#FFFFFF", fontSize: 15, fontWeight: "600", lineHeight: 21 },
  legal: { marginTop: 32, fontSize: 12, lineHeight: 18 },
});
