/**
 * PremiumScreen
 * =============
 * Native port of the web Premium page (dehub.io/premium): the DeHub Extra,
 * Family and Extra Large memberships. Copy is the web's premium.* strings.
 *
 * Nothing is bought in the app. Where Google Play allows it (US users, see
 * hooks/useWebCheckout) each plan gets a button that goes through Play's
 * external content links flow to the web checkout. Everywhere else, iOS
 * included, the screen lists what each plan includes and nothing more: no
 * prices and no call to action.
 */
import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  UIManager,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import Icon, { type IconName } from "../components/ui/Icon";
import ScreenHeader from "../components/ScreenHeader";
import { KitButton, PageSection } from "../components/page/PageKit";
import { ScreenNames } from "../navigation/ScreenNames";
import { DIGITAL_PURCHASES_ENABLED } from "../config/storefront";
import { useWebCheckout } from "../hooks/useWebCheckout";
import { useAuthActions } from "../context/AuthContext";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface Perk {
  icon: IconName;
  key: string;
}

const EXTRA_PERKS: Perk[] = [
  { icon: "Shield", key: "adFree" },
  { icon: "CirclePlay", key: "background" },
  { icon: "Crown", key: "badge" },
  { icon: "Palette", key: "themes" },
  { icon: "Eye", key: "profileInsights" },
  { icon: "Heart", key: "followerInsights" },
  { icon: "Lock", key: "sneakPeeks" },
  { icon: "Rocket", key: "boost" },
  { icon: "MessageSquare", key: "assistantMsgs" },
  { icon: "Image", key: "aiImages" },
  { icon: "Video", key: "aiVideo" },
];

const FAMILY_PERKS: Perk[] = [
  { icon: "Users", key: "fiveSeats" },
  { icon: "Zap", key: "perksPerSeat" },
  { icon: "Shield", key: "oneBill" },
];

const XL_PERKS: Perk[] = [
  { icon: "Users", key: "twentySeats" },
  { icon: "Rocket", key: "maxBoosts" },
  { icon: "Infinity", key: "skyHighAi" },
  { icon: "Lock", key: "unlimitedPeeks" },
  { icon: "Palette", key: "allThemes" },
  { icon: "Eye", key: "proProfileInsights" },
  { icon: "Heart", key: "proFollowerInsights" },
];

const DEEP_DIVES: Perk[] = [
  { icon: "Shield", key: "adFree" },
  { icon: "CirclePlay", key: "background" },
  { icon: "Sparkles", key: "ai" },
];

/** `payInDhb` talks about how to pay, so it only shows where buying does. */
const FAQ_KEYS = ["whatIsAnAd", "switchPlans", "familySeats", "topTierStaker", "payInDhb"];
const PAYMENT_FAQ = "payInDhb";

interface Tier {
  priceId: string;
  /** Product name — not translated, it is what the plan is called. */
  name: string;
  icon: IconName;
  price: string;
  taglineKey: string;
  freeForKey: string;
  includesKey?: string;
  ctaKey: string;
  perks: Perk[];
  highlight?: boolean;
  cashback?: boolean;
}

const TIERS: Tier[] = [
  {
    priceId: "dehub_extra_monthly",
    name: "DeHub Extra",
    icon: "Crown",
    price: "$4.99",
    taglineKey: "premium.extraTagline",
    freeForKey: "premium.freeForTop7",
    ctaKey: "premium.getExtra",
    perks: EXTRA_PERKS,
  },
  {
    priceId: "dehub_family_monthly",
    name: "DeHub Family",
    icon: "Users",
    price: "$11.99",
    taglineKey: "premium.familyTagline",
    freeForKey: "premium.freeForTop4",
    includesKey: "premium.familyIncludes",
    ctaKey: "premium.getFamily",
    perks: FAMILY_PERKS,
    highlight: true,
  },
  {
    priceId: "dehub_xl_monthly",
    name: "DeHub Extra Large",
    icon: "Rocket",
    price: "$50.00",
    taglineKey: "premium.xlTagline",
    freeForKey: "premium.freeForTop2",
    includesKey: "premium.xlIncludes",
    ctaKey: "premium.getExtraLarge",
    perks: XL_PERKS,
    cashback: true,
  },
];

/** `adFree` → `premium.diveAdFreeTitle`, the web page's key scheme. */
function stem(prefix: string, key: string, suffix: string) {
  return `premium.${prefix}${key[0].toUpperCase()}${key.slice(1)}${suffix}`;
}

function PerkRow({ perk }: { perk: Perk }) {
  const { t } = useTranslation();
  return (
    <View style={styles.perkRow}>
      <View style={styles.perkIcon}>
        <Icon name={perk.icon} size={15} color="#FFFFFF" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.perkLabel}>{t(`premium.${perk.key}Label`)}</Text>
        <Text style={styles.perkDetail}>{t(`premium.${perk.key}Detail`)}</Text>
      </View>
    </View>
  );
}

function FaqItem({ k }: { k: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((v) => !v);
  }, []);
  return (
    <View style={styles.faqItem}>
      <Pressable style={styles.faqHead} onPress={toggle} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <Text style={styles.faqQ}>{t(stem("faq", k, "Q"))}</Text>
        <Icon name={open ? "ChevronUp" : "ChevronDown"} size={16} color="#A1A1AA" />
      </Pressable>
      {open && <Text style={styles.faqA}>{t(stem("faq", k, "A"))}</Text>}
    </View>
  );
}

export default function PremiumScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { canBuy, checking, opening, openCheckout } = useWebCheckout();
  const { requireAuth } = useAuthActions();

  // The wallet only exists in the signed-in navigator, so a guest signs in first.
  const openStaking = useCallback(() => {
    requireAuth(() => navigation.navigate(ScreenNames.Dpay, { initialTab: "stake" }));
  }, [navigation, requireAuth]);

  return (
    <View style={styles.root}>
      <ScreenHeader title={t("nav.premium")} icon="subscriptions" />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 32, paddingTop: 4 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.pill}>
            <Icon name="Sparkles" size={13} color="#D4D4D8" />
            <Text style={styles.pillText}>{t("premium.introducing")}</Text>
          </View>
          <Text style={styles.heroTitle}>{t("premium.heroLineOne")}</Text>
          <Text style={[styles.heroTitle, styles.heroTitleDim]}>{t("premium.heroLineTwo")}</Text>
          <Text style={styles.heroBlurb}>{t("premium.heroBlurb")}</Text>
          {DIGITAL_PURCHASES_ENABLED && (
            <Text style={styles.heroStaker}>
              {t("premium.alreadyTopStaker")}{" "}
              <Text style={styles.link} onPress={openStaking}>
                {t("premium.itsOnUs")}
              </Text>
            </Text>
          )}
        </View>

        {checking && (
          <View style={styles.checking}>
            <ActivityIndicator size="small" color="#A1A1AA" />
          </View>
        )}

        {/* Tiers */}
        {TIERS.map((tier) => (
          <PageSection key={tier.priceId}>
            <View style={styles.tierHead}>
              <Icon name={tier.icon} size={16} color="#FFFFFF" />
              <Text style={styles.tierName}>{tier.name}</Text>
              {tier.highlight && (
                <View style={styles.bestValue}>
                  <Text style={styles.bestValueText}>{t("premium.bestValue")}</Text>
                </View>
              )}
            </View>
            <Text style={styles.tagline}>{t(tier.taglineKey)}</Text>

            {canBuy && (
              <View style={styles.priceRow}>
                <Text style={styles.price}>{tier.price}</Text>
                <Text style={styles.per}>{t("premium.perMonth")}</Text>
              </View>
            )}
            <Text style={styles.freeFor}>{t(tier.freeForKey)}</Text>

            {canBuy && tier.cashback && (
              <View style={styles.cashback}>
                <View style={styles.cashbackHead}>
                  <Icon name="Sparkles" size={11} color="rgba(255,255,255,0.8)" />
                  <Text style={styles.cashbackTitle}>{t("premium.firstFiftyOnly")}</Text>
                </View>
                <Text style={styles.cashbackText}>{t("premium.cashback")}</Text>
              </View>
            )}

            {tier.includesKey && (
              <View style={styles.includes}>
                <Text style={styles.includesText}>{t(tier.includesKey)}</Text>
              </View>
            )}

            <View style={styles.perks}>
              {tier.perks.map((p) => (
                <PerkRow key={p.key} perk={p} />
              ))}
            </View>

            {canBuy && (
              <Pressable
                style={[styles.cta, tier.highlight && styles.ctaPrimary, !!opening && { opacity: 0.6 }]}
                onPress={() => openCheckout("premium", tier.priceId)}
                disabled={!!opening}
                accessibilityRole="button"
              >
                {opening === tier.priceId ? (
                  <ActivityIndicator size="small" color={tier.highlight ? "#000000" : "#FFFFFF"} />
                ) : (
                  <>
                    <Text style={[styles.ctaText, tier.highlight && styles.ctaTextPrimary]}>{t(tier.ctaKey)}</Text>
                    <Icon name="ExternalLink" size={13} color={tier.highlight ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.5)"} />
                  </>
                )}
              </Pressable>
            )}
          </PageSection>
        ))}

        {/* Before the user leaves the app, say where they are going and why
            (Play's program terms ask for this on top of its own screen). */}
        {canBuy ? (
          <Text style={styles.notice}>{t("premium.checkoutNotice")}</Text>
        ) : (
          !checking && <Text style={styles.notice}>{t("premium.notAvailableHere")}</Text>
        )}

        {/* Deep dives */}
        <PageSection>
        <View style={styles.dives}>
          {DEEP_DIVES.map((d) => (
            <View key={d.key} style={styles.dive}>
              <View style={styles.diveIcon}>
                <Icon name={d.icon} size={22} color="#FFFFFF" />
              </View>
              <Text style={styles.diveTitle}>{t(stem("dive", d.key, "Title"))}</Text>
              <Text style={styles.diveBody}>{t(stem("dive", d.key, "Body"))}</Text>
            </View>
          ))}
        </View>
        </PageSection>

        {/* Staker reward — staking is itself a purchase flow, so it follows
            the App Store gate like the wallet does. */}
        {DIGITAL_PURCHASES_ENABLED && (
          <PageSection style={styles.center}>
            <View style={styles.stakerHead}>
              <Icon name="Crown" size={13} color="#A1A1AA" />
              <Text style={styles.stakerKicker}>{t("premium.stakerThankYou")}</Text>
            </View>
            <Text style={styles.stakerTitle}>{t("premium.stakeGetPremium")}</Text>
            <Text style={styles.stakerBlurb}>{t("premium.stakeBlurb")}</Text>
            <KitButton
              style={styles.stakerCta}
              onPress={openStaking}
              label={t("premium.viewStakingTiers")}
            />
          </PageSection>
        )}

        {/* FAQ */}
        <PageSection title={t("premium.questions")}>
          {FAQ_KEYS.filter((k) => canBuy || k !== PAYMENT_FAQ).map((k) => (
            <FaqItem key={k} k={k} />
          ))}
        </PageSection>

        <View style={styles.footer}>
          <Text style={styles.footerText}>{t("premium.footerNote")}</Text>
          <Text style={styles.footerText}>
            {t("premium.lookingForCreatorPlans")}{" "}
            <Text style={styles.link} onPress={() => navigation.navigate(ScreenNames.Pricing)}>
              {t("premium.seeCreatorPricing")}
            </Text>
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#010305" },
  hero: { alignItems: "center", paddingTop: 12, paddingBottom: 20, paddingHorizontal: 16 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    marginBottom: 14,
  },
  pillText: { color: "#D4D4D8", fontSize: 11 },
  heroTitle: { color: "#FFFFFF", fontSize: 34, fontWeight: "800", textAlign: "center", lineHeight: 38 },
  heroTitleDim: { color: "rgba(255,255,255,0.6)" },
  heroBlurb: { color: "#A1A1AA", fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 12 },
  heroStaker: { color: "#71717A", fontSize: 12, textAlign: "center", marginTop: 12 },
  link: { color: "#D4D4D8", textDecorationLine: "underline" },
  checking: { paddingVertical: 8, alignItems: "center" },
  center: { alignItems: "center" },
  stakerCta: { alignSelf: "stretch", marginTop: 18 },
  bestValue: {
    marginLeft: "auto",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
  },
  bestValueText: { color: "#000000", fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  tierHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  tierName: { color: "#FFFFFF", fontSize: 17, fontWeight: "700" },
  tagline: { color: "#A1A1AA", fontSize: 13, lineHeight: 19 },
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: 4, marginTop: 14 },
  price: { color: "#FFFFFF", fontSize: 32, fontWeight: "800" },
  per: { color: "#A1A1AA", fontSize: 13 },
  freeFor: { color: "#71717A", fontSize: 12, marginTop: 6 },
  cashback: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    backgroundColor: "rgba(255,255,255,0.10)",
    padding: 10,
  },
  cashbackHead: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 3 },
  cashbackTitle: { color: "rgba(255,255,255,0.8)", fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  cashbackText: { color: "#FFFFFF", fontSize: 12, lineHeight: 17 },
  includes: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.05)",
    padding: 10,
  },
  includesText: { color: "#D4D4D8", fontSize: 12, lineHeight: 17 },
  perks: { marginTop: 14, gap: 12 },
  perkRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  perkIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  perkLabel: { color: "#FFFFFF", fontSize: 13, fontWeight: "600" },
  perkDetail: { color: "#A1A1AA", fontSize: 12, lineHeight: 17, marginTop: 1 },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "stretch",
    gap: 8,
    height: 46,
    borderRadius: 14,
    marginTop: 18,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  ctaPrimary: { backgroundColor: "#FFFFFF", borderColor: "#FFFFFF" },
  ctaText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  ctaTextPrimary: { color: "#000000" },
  notice: { color: "#71717A", fontSize: 12, lineHeight: 17, textAlign: "center", marginTop: 8, marginBottom: 20, paddingHorizontal: 16 },
  dives: { gap: 22 },
  dive: { gap: 6 },
  diveIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    marginBottom: 4,
  },
  diveTitle: { color: "#FFFFFF", fontSize: 19, fontWeight: "700" },
  diveBody: { color: "#A1A1AA", fontSize: 13, lineHeight: 20 },
  stakerHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  stakerKicker: { color: "#A1A1AA", fontSize: 12 },
  stakerTitle: { color: "#FFFFFF", fontSize: 20, fontWeight: "700", textAlign: "center" },
  stakerBlurb: { color: "#A1A1AA", fontSize: 13, lineHeight: 20, textAlign: "center", marginTop: 8 },
  faqItem: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.10)",
  },
  faqHead: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 14 },
  faqQ: { flex: 1, color: "#FFFFFF", fontSize: 13, fontWeight: "600" },
  faqA: { color: "#A1A1AA", fontSize: 13, lineHeight: 20, paddingBottom: 14 },
  footer: { marginTop: 20, gap: 8, alignItems: "center", paddingHorizontal: 16 },
  footerText: { color: "#71717A", fontSize: 12, textAlign: "center", lineHeight: 18 },
});
