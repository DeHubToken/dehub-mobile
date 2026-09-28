/**
 * Where to watch one title, grouped by how you pay for it. Mirrors web's
 * cinema OfferPanel, including the JustWatch attribution the partner terms
 * require beside every set of offers.
 *
 * The App Store build shows the stream and free sections only: rent and buy
 * are purchase links, which config/storefront keeps out of that build.
 */
import React, { useMemo } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import SmartImage from "../common/SmartImage";
import Icon from "../ui/Icon";
import { DIGITAL_PURCHASES_ENABLED } from "../../config/storefront";
import {
  formatPrice,
  justwatchUrl,
  type JustWatchOffer,
  type JustWatchProvider,
  type JustWatchTitleDetail,
} from "../../services/justwatch.service";

/** Render order: cheapest to the viewer first. */
const SECTIONS = [
  { key: "flatrate", labelKey: "cinema.stream", hintKey: "cinema.streamHint", paid: false },
  { key: "free", labelKey: "cinema.free", hintKey: "cinema.freeHint", paid: false },
  { key: "rent", labelKey: "cinema.rent", hintKey: "cinema.rentHint", paid: true },
  { key: "buy", labelKey: "cinema.buy", hintKey: "cinema.buyHint", paid: true },
] as const;

/** The partner's brand, shown as-is in every language. */
const PARTNER_NAME = "JustWatch";

const QUALITY_RANK: Record<string, number> = { sd: 0, hd: 1, "4k": 2, uhd: 2 };

function qualityLabel(presentationType: string | null): string | null {
  if (!presentationType) return null;
  const q = presentationType.toLowerCase();
  if (q === "4k" || q === "uhd") return "4K";
  return q.toUpperCase();
}

/**
 * One row per provider per section. JustWatch returns an offer per quality
 * tier; the cheapest wins the row, or where there is no price, the best quality.
 */
function pickBestPerProvider(offers: JustWatchOffer[]): JustWatchOffer[] {
  const byProvider = new Map<number | string, JustWatchOffer>();
  for (const offer of offers) {
    const key = offer.providerId ?? offer.url;
    const current = byProvider.get(key);
    if (!current) {
      byProvider.set(key, offer);
      continue;
    }
    if (offer.retailPrice != null && current.retailPrice != null) {
      if (offer.retailPrice < current.retailPrice) byProvider.set(key, offer);
      continue;
    }
    const a = QUALITY_RANK[offer.presentationType?.toLowerCase() ?? ""] ?? -1;
    const b = QUALITY_RANK[current.presentationType?.toLowerCase() ?? ""] ?? -1;
    if (a > b) byProvider.set(key, offer);
  }
  return [...byProvider.values()].sort((a, b) => {
    if (a.retailPrice != null && b.retailPrice != null) return a.retailPrice - b.retailPrice;
    if (a.retailPrice != null) return -1;
    if (b.retailPrice != null) return 1;
    return 0;
  });
}

export default function OfferPanel({
  detail,
  providers,
  locale,
  isLoading,
}: {
  detail: JustWatchTitleDetail | null | undefined;
  providers: JustWatchProvider[];
  locale: string;
  isLoading: boolean;
}) {
  const { t } = useTranslation();
  const providerById = useMemo(() => {
    const map = new Map<number, JustWatchProvider>();
    for (const p of providers) map.set(p.id, p);
    return map;
  }, [providers]);

  if (isLoading) {
    return (
      <View style={[styles.box, styles.loading]}>
        <ActivityIndicator size="small" color="#A1A1AA" />
        <Text style={styles.muted}>{t("cinema.checking")}</Text>
      </View>
    );
  }
  if (!detail) return null;

  const grouped = SECTIONS.filter((s) => DIGITAL_PURCHASES_ENABLED || !s.paid)
    .map((section) => ({
      ...section,
      offers: pickBestPerProvider(detail.offers.filter((o) => o.monetizationType === section.key)),
    }))
    .filter((section) => section.offers.length > 0);

  return (
    <View style={{ gap: 20 }}>
      <View style={{ gap: 6 }}>
        <Text style={styles.heading} accessibilityRole="header">
          {detail.title}
          {detail.year ? <Text style={styles.headingYear}>  {detail.year}</Text> : null}
        </Text>
        {!!detail.shortDescription && <Text style={styles.description}>{detail.shortDescription}</Text>}
        {(!!detail.director || !!detail.runtime) && (
          <Text style={styles.small}>
            {detail.director ?? ""}
            {detail.director && detail.runtime ? " · " : ""}
            {detail.runtime ? t("cinema.runtime", { minutes: detail.runtime }) : ""}
          </Text>
        )}
      </View>

      {grouped.length === 0 && detail.upcoming.length === 0 && (
        <View style={styles.box}>
          <Text style={styles.muted}>{t("cinema.nothingHere")}</Text>
        </View>
      )}

      {grouped.map((section) => (
        <View key={section.key} style={{ gap: 8 }}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionLabel}>{t(section.labelKey)}</Text>
            <Text style={styles.small}>{t(section.hintKey)}</Text>
          </View>
          <View style={styles.list}>
            {section.offers.map((offer, i) => {
              const provider = offer.providerId != null ? providerById.get(offer.providerId) : undefined;
              const price = formatPrice(offer.retailPrice, offer.currency, locale);
              const quality = qualityLabel(offer.presentationType);
              const name = provider?.name ?? t("cinema.watchNow");
              return (
                <Pressable
                  key={offer.url}
                  accessibilityRole="link"
                  accessibilityLabel={price ? `${name}, ${price}` : name}
                  onPress={() => void Linking.openURL(offer.url).catch(() => {})}
                  style={[styles.row, i > 0 && styles.rowDivider]}
                >
                  {provider?.icon ? (
                    <SmartImage source={{ uri: provider.icon }} recyclingKey={provider.icon} style={styles.providerIcon} contentFit="cover" />
                  ) : (
                    <View style={[styles.providerIcon, styles.providerIconEmpty]} />
                  )}
                  <Text style={styles.providerName} numberOfLines={1}>
                    {name}
                  </Text>
                  {quality && (
                    <View style={styles.quality}>
                      <Text style={styles.qualityText}>{quality}</Text>
                    </View>
                  )}
                  <Text style={styles.price}>
                    {price ?? (section.key === "flatrate" ? t("cinema.subscription") : t("cinema.free"))}
                  </Text>
                  <Icon name="ExternalLink" size={14} color="#52525B" />
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}

      {detail.upcoming.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text style={styles.sectionLabel}>{t("cinema.comingSoon")}</Text>
          <View style={[styles.box, { gap: 6 }]}>
            {detail.upcoming.map((u, i) => {
              const provider = u.providerId != null ? providerById.get(u.providerId) : undefined;
              const name = provider?.name ?? u.releaseType ?? t("cinema.release");
              const from = u.from ? new Date(u.from).toLocaleDateString(locale.replace("_", "-")) : null;
              return (
                <Text key={`${u.providerId}-${u.from}-${i}`} style={styles.muted}>
                  <Text style={{ color: "#FFFFFF" }}>{name}</Text>
                  {from ? ` — ${t("cinema.fromDate", { date: from })}` : ""}
                </Text>
              );
            })}
          </View>
        </View>
      )}

      {/* Required by the JustWatch partner terms, and must link to the title's
          country-specific page. Never conditional. */}
      <Pressable
        accessibilityRole="link"
        onPress={() => void Linking.openURL(justwatchUrl(detail.fullPath)).catch(() => {})}
        hitSlop={8}
        style={{ alignSelf: "flex-start" }}
      >
        <Text style={styles.attribution}>
          {t("cinema.via")} <Text style={styles.attributionBrand}>{PARTNER_NAME}</Text>
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    padding: 16,
  },
  loading: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 32 },
  heading: { color: "#FFFFFF", fontSize: 24, fontWeight: "600", letterSpacing: -0.6 },
  headingYear: { color: "#71717A", fontWeight: "400", fontSize: 20 },
  description: { color: "#A1A1AA", fontSize: 14, lineHeight: 21 },
  small: { color: "#71717A", fontSize: 12 },
  muted: { color: "#A1A1AA", fontSize: 14, lineHeight: 20 },
  sectionHead: { flexDirection: "row", alignItems: "baseline", gap: 8, flexWrap: "wrap" },
  sectionLabel: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  list: { borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.10)", overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.08)" },
  providerIcon: { width: 32, height: 32, borderRadius: 6 },
  providerIconEmpty: { backgroundColor: "rgba(255,255,255,0.10)" },
  providerName: { flex: 1, color: "#FFFFFF", fontSize: 14 },
  quality: {
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  qualityText: { color: "#A1A1AA", fontSize: 11 },
  price: { color: "#FFFFFF", fontSize: 14, fontWeight: "500" },
  attribution: { color: "#52525B", fontSize: 11 },
  attributionBrand: { color: "#71717A", fontWeight: "600" },
});
