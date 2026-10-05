/**
 * PricingScreen
 * =============
 * Native port of the web Pricing page (dehub.io/pricing): the Creator Studio
 * AI plans — Creator, Ultra, Team and Scale. Copy is the web's pricing.*
 * strings, and the allowances must match web's PricingSection, which in turn
 * matches the server's AI_PLANS (that is what actually sends the tokens).
 *
 * Buying follows the same rule as Premium (hooks/useWebCheckout): a button to
 * the web checkout only where Google Play allows the link-out; elsewhere the
 * plans are listed without prices or calls to action.
 */
import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import Icon from "../components/ui/Icon";
import ScreenHeader from "../components/ScreenHeader";
import { PageSection, PageTabs } from "../components/page/PageKit";
import { ScreenNames } from "../navigation/ScreenNames";
import { useWebCheckout } from "../hooks/useWebCheckout";
import { aiPlanBreakdownVars, getAiPlanOffer, type AiPlanTier } from "../libs/aiPlanOffers";

type Billing = "monthly" | "annual";

/** A translated line: a key plus whatever numbers or model names it interpolates. */
interface Line {
  key: string;
  vars?: Record<string, string | number>;
}

interface Plan {
  id: AiPlanTier;
  /** Product tier name. Not translated — it is what the plan is called. */
  name: string;
  discountPct: number;
  taglineKey?: string;
  headlineKey: string;
  breakdown: Line[];
  monthly: number;
  annual: number;
  perLabelKey: string;
  cta: Line;
  savingsUsd?: number;
  seats?: number;
  featured?: boolean;
  groups: { titleKey: string; items: Line[] }[];
  monthlyPriceId: string;
  annualPriceId: string;
}

// Mirrors `plans` in dehubweb src/components/pricing/PricingSection.tsx.
const PLANS: Plan[] = [
  {
    id: "creator",
    name: "Creator",
    monthlyPriceId: "creator_monthly",
    annualPriceId: "creator_annual",
    discountPct: 21,
    headlineKey: "pricing.headlineCreator",
    breakdown: [
      { key: "pricing.dhbPerMonth" },
      { key: "pricing.equivalence" },
      { key: "pricing.realDhbSpendAnywhere" },
    ],
    monthly: 19,
    annual: 15,
    perLabelKey: "pricing.perMonthBilledAnnually",
    cta: { key: "pricing.ctaGet", vars: { plan: "Creator" } },
    groups: [
      {
        titleKey: "pricing.groupIncluded",
        items: [
          { key: "pricing.accessAllModels" },
          { key: "pricing.parallelGenerations", vars: { videos: 4, images: 4 } },
          { key: "pricing.topUpAnyTime" },
          { key: "pricing.publishStraightToDehub" },
        ],
      },
    ],
  },
  {
    id: "ultra",
    name: "Ultra",
    monthlyPriceId: "ultra_monthly",
    annualPriceId: "ultra_annual",
    discountPct: 23,
    taglineKey: "pricing.bestValue",
    headlineKey: "pricing.headlineUltra",
    breakdown: [
      { key: "pricing.dhbPerMonth" },
      { key: "pricing.equivalence" },
      { key: "pricing.realDhbNeverExpires" },
    ],
    monthly: 129,
    annual: 99,
    perLabelKey: "pricing.perMonthBilledAnnually",
    cta: { key: "pricing.ctaChangeCommitment" },
    featured: true,
    groups: [
      {
        titleKey: "pricing.groupIncluded",
        items: [
          { key: "pricing.parallelGenerations", vars: { videos: 8, images: 8 } },
          { key: "pricing.accessSupercomputer" },
          { key: "pricing.accessAllSeedance" },
          { key: "pricing.accessAllModels" },
          { key: "pricing.earlyAccess" },
          { key: "pricing.unlimitedMarketplace" },
        ],
      },
      {
        titleKey: "pricing.groupSeedance20",
        items: [
          { key: "pricing.seedanceFullAccess", vars: { model: "Seedance 2.0" } },
          { key: "pricing.seedanceFullAccess", vars: { model: "Seedance 2.0 Fast" } },
        ],
      },
    ],
  },
  {
    id: "team",
    name: "Team",
    monthlyPriceId: "team_monthly",
    annualPriceId: "team_annual",
    discountPct: 18,
    headlineKey: "pricing.headlineTeam",
    breakdown: [
      { key: "pricing.dhbPerSeat" },
      { key: "pricing.equivalence" },
      { key: "pricing.pooledNeverExpires" },
    ],
    monthly: 79,
    annual: 65,
    perLabelKey: "pricing.perSeatBilledAnnually",
    cta: { key: "pricing.ctaGet", vars: { plan: "Team" } },
    savingsUsd: 168,
    seats: 2,
    groups: [
      {
        titleKey: "pricing.groupWorkspace",
        items: [
          { key: "pricing.membersRange", vars: { min: 2, max: 9 } },
          { key: "pricing.parallelGenerations", vars: { videos: 16, images: 16 } },
          { key: "pricing.accessAllFeatures" },
          { key: "pricing.sharedDhbPool" },
          { key: "pricing.sharedWorkspace" },
          { key: "pricing.earlyAccess" },
          { key: "pricing.accessSeedance20" },
          { key: "pricing.accessSupercomputer" },
        ],
      },
      {
        titleKey: "pricing.groupAnalytics",
        items: [{ key: "pricing.basicAnalytics" }, { key: "pricing.prioritySupport" }],
      },
      {
        titleKey: "pricing.groupAdmin",
        items: [{ key: "pricing.sso" }, { key: "pricing.adminSpendControl" }, { key: "pricing.priorityQueue" }],
      },
      {
        titleKey: "pricing.groupSecurity",
        items: [
          { key: "pricing.delegatedTopUp" },
          { key: "pricing.indemnification" },
          { key: "pricing.noTraining" },
          { key: "pricing.soc2" },
          { key: "pricing.aiEducator" },
        ],
      },
    ],
  },
  {
    id: "scale",
    name: "Scale",
    monthlyPriceId: "scale_monthly",
    annualPriceId: "scale_annual",
    discountPct: 30,
    headlineKey: "pricing.headlineScale",
    breakdown: [
      { key: "pricing.dhbPerSeat" },
      { key: "pricing.equivalence" },
      { key: "pricing.pooledNeverExpires" },
    ],
    monthly: 215,
    annual: 150,
    perLabelKey: "pricing.perSeatBilledAnnually",
    cta: { key: "pricing.ctaGet", vars: { plan: "Scale" } },
    savingsUsd: 780,
    seats: 5,
    groups: [
      {
        titleKey: "pricing.groupWorkspace",
        items: [
          { key: "pricing.membersRange", vars: { min: 5, max: 15 } },
          { key: "pricing.parallelGenerations", vars: { videos: 20, images: 24 } },
          { key: "pricing.accessAllFeatures" },
          { key: "pricing.sharedDhbPool" },
          { key: "pricing.sharedWorkspace" },
          { key: "pricing.earlyAccess" },
          { key: "pricing.accessSeedance20" },
          { key: "pricing.accessSupercomputer" },
        ],
      },
      {
        titleKey: "pricing.groupAnalytics",
        items: [{ key: "pricing.detailedAnalytics" }, { key: "pricing.prioritySupport" }],
      },
      {
        titleKey: "pricing.groupAdmin",
        items: [{ key: "pricing.sso" }, { key: "pricing.adminSpendControl" }, { key: "pricing.priorityQueueFast" }],
      },
      {
        titleKey: "pricing.groupSecurity",
        items: [
          { key: "pricing.delegatedTopUp" },
          { key: "pricing.indemnification" },
          { key: "pricing.noTraining" },
          { key: "pricing.soc2" },
          { key: "pricing.aiEducator" },
        ],
      },
    ],
  },
];

function PlanCard({
  plan,
  billing,
  canBuy,
  opening,
  onSelect,
}: {
  plan: Plan;
  billing: Billing;
  canBuy: boolean;
  opening: string | null;
  onSelect: (priceId: string) => void;
}) {
  const { t } = useTranslation();
  const annual = billing === "annual";
  const price = getAiPlanOffer(plan.id, billing).displayPriceUsd;
  const priceId = annual ? plan.annualPriceId : plan.monthlyPriceId;
  const busy = opening === priceId;

  return (
    <PageSection>
      <View style={styles.cardHead}>
        <Text style={styles.planName}>{plan.name.toUpperCase()}</Text>
        {canBuy && (
          <View style={styles.discount}>
            <Text style={styles.discountText}>{t("pricing.percentOff", { pct: plan.discountPct })}</Text>
          </View>
        )}
        {plan.featured && (
          <View style={styles.featured}>
            <Text style={styles.featuredText}>{t(plan.taglineKey ?? "pricing.featured")}</Text>
          </View>
        )}
      </View>

      <Text style={styles.headline}>{t(plan.headlineKey)}</Text>

      <View style={styles.breakdown}>
        {plan.breakdown.map((line) => (
          <Text key={line.key + JSON.stringify(line.vars ?? {})} style={styles.breakdownText}>
            {t(line.key, aiPlanBreakdownVars(line.key, plan.id, billing, line.vars))}
          </Text>
        ))}
      </View>

      {canBuy && (
        <>
          <View style={styles.priceRow}>
            {annual && <Text style={styles.strike}>{`$${plan.monthly}`}</Text>}
            <Text style={styles.price}>{`$${price}`}</Text>
          </View>
          <Text style={styles.per}>{annual ? t(plan.perLabelKey) : t("premium.perMonth")}</Text>
          {annual && plan.savingsUsd !== undefined && (
            <Text style={styles.meta}>{t("pricing.savings", { amount: plan.savingsUsd })}</Text>
          )}
        </>
      )}
      {plan.seats !== undefined && <Text style={styles.meta}>{t("pricing.seats", { count: plan.seats })}</Text>}

      {canBuy && (
        <Pressable
          style={[styles.cta, plan.featured && styles.ctaFeatured, !!opening && { opacity: 0.6 }]}
          onPress={() => onSelect(priceId)}
          disabled={!!opening}
          accessibilityRole="button"
        >
          {busy ? (
            <ActivityIndicator size="small" color={plan.featured ? "#000000" : "#FFFFFF"} />
          ) : (
            <>
              <Text style={[styles.ctaText, plan.featured && styles.ctaTextFeatured]}>{t(plan.cta.key, plan.cta.vars)}</Text>
              <Icon name="ExternalLink" size={13} color={plan.featured ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.5)"} />
            </>
          )}
        </Pressable>
      )}

      <View style={styles.groups}>
        {plan.groups.map((group) => (
          <View key={group.titleKey}>
            <Text style={styles.groupTitle}>{t(group.titleKey)}</Text>
            <View style={{ gap: 6 }}>
              {group.items.map((item) => (
                <View key={item.key + JSON.stringify(item.vars ?? {})} style={styles.itemRow}>
                  <Icon name="Check" size={13} color="rgba(255,255,255,0.6)" />
                  <Text style={styles.itemText}>{t(item.key, item.vars)}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>
    </PageSection>
  );
}

export default function PricingScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const [billing, setBilling] = useState<Billing>("annual");
  const { canBuy, checking, opening, openCheckout } = useWebCheckout();

  return (
    <View style={styles.root}>
      <ScreenHeader title={t("nav.pricing")} icon="buy" />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 32, paddingTop: 4 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Text style={styles.title}>{t("pricing.plansForEveryWorkflow")}</Text>
          <Text style={styles.subtitle}>{t("pricing.findTheRightFit")}</Text>

          <View style={styles.toggle}>
              <PageTabs
                style={{ flexGrow: 1, justifyContent: "center" }}
                value={billing}
                onChange={setBilling}
                tabs={[
                  { id: "monthly", label: t("pricing.monthly") },
                  { id: "annual", label: `${t("pricing.annual")} · ${t("pricing.upToDiscount", { pct: 30 })}` },
                ]}
              />
          </View>
        </View>

        {checking && (
          <View style={styles.checking}>
            <ActivityIndicator size="small" color="#A1A1AA" />
          </View>
        )}

        {PLANS.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            billing={billing}
            canBuy={canBuy}
            opening={opening}
            onSelect={(priceId) => openCheckout("pricing", priceId)}
          />
        ))}

        {canBuy ? (
          <Text style={styles.notice}>{t("premium.checkoutNotice")}</Text>
        ) : (
          !checking && <Text style={styles.notice}>{t("premium.notAvailableHere")}</Text>
        )}

        <Text style={styles.footerText}>
          {t("pricing.lookingForPremium")}{" "}
          <Text style={styles.link} onPress={() => navigation.navigate(ScreenNames.Premium)}>
            {t("pricing.seePremiumPlans")}
          </Text>
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#010305" },
  hero: { alignItems: "center", paddingTop: 12, paddingBottom: 14, paddingHorizontal: 16 },
  title: { color: "#FFFFFF", fontSize: 28, fontWeight: "900", textAlign: "center", lineHeight: 32 },
  subtitle: { color: "rgba(255,255,255,0.6)", fontSize: 14, textAlign: "center", marginTop: 8 },
  toggle: { marginTop: 14, alignSelf: "stretch", alignItems: "center" },
  checking: { paddingVertical: 8, alignItems: "center" },
  cardHead: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  planName: { color: "#FFFFFF", fontSize: 22, fontWeight: "900", letterSpacing: -0.3 },
  discount: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  discountText: { color: "rgba(255,255,255,0.8)", fontSize: 10, fontWeight: "700" },
  featured: {
    marginLeft: "auto",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    backgroundColor: "rgba(228,228,231,0.92)",
  },
  featuredText: { color: "#000000", fontSize: 10, fontWeight: "900", textTransform: "uppercase", letterSpacing: 1 },
  headline: { color: "rgba(255,255,255,0.6)", fontSize: 13, marginTop: 6 },
  breakdown: { marginTop: 14, gap: 3 },
  breakdownText: { color: "rgba(255,255,255,0.7)", fontSize: 12, lineHeight: 17 },
  priceRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginTop: 14 },
  strike: { color: "rgba(255,255,255,0.4)", fontSize: 17, textDecorationLine: "line-through", marginBottom: 4 },
  price: { color: "#FFFFFF", fontSize: 34, fontWeight: "900" },
  per: { color: "rgba(255,255,255,0.5)", fontSize: 12 },
  meta: { color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 4 },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 46,
    borderRadius: 14,
    marginTop: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  ctaFeatured: { backgroundColor: "rgba(228,228,231,0.92)", borderColor: "rgba(255,255,255,0.9)" },
  ctaText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  ctaTextFeatured: { color: "#000000" },
  groups: { marginTop: 18, gap: 16 },
  groupTitle: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  itemRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  itemText: { flex: 1, color: "rgba(255,255,255,0.75)", fontSize: 12, lineHeight: 17 },
  notice: { color: "#71717A", fontSize: 12, lineHeight: 17, textAlign: "center", marginVertical: 12, paddingHorizontal: 16 },
  footerText: { color: "rgba(255,255,255,0.6)", fontSize: 13, textAlign: "center", lineHeight: 19, marginTop: 8, paddingHorizontal: 16 },
  link: { color: "#FFFFFF", textDecorationLine: "underline" },
});
