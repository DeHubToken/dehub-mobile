/**
 * Model picker on the Builder lander. Each prompt is paid from the user's
 * credits at the model's cost plus the markup, so this shows the balance, what
 * a typical prompt costs on each model, and a way to add more.
 */
import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import LiquidGlass from "../ui/LiquidGlass";
import { useAuthState } from "../../context/AuthContext";
import { DIGITAL_PURCHASES_ENABLED } from "../../config/storefront";
import { useSubscriptionCredits } from "../../hooks/useSubscriptionCredits";
import SubscriptionCreditsTopUpSheet from "../SubscriptionCreditsTopUpSheet";
import { builderApi, type BuilderPricing } from "../../services/builder.service";

const usd = (value: number) =>
  value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: value > 0 && value < 0.1 ? 3 : 2,
  });

const PRICING_KEY = ["builder-pricing"];

export default function BuilderModelCard() {
  const { t } = useTranslation();
  const { isSignedIn } = useAuthState();
  const queryClient = useQueryClient();
  const [topUpOpen, setTopUpOpen] = useState(false);
  const { data: credits } = useSubscriptionCredits(DIGITAL_PURCHASES_ENABLED);
  const { data: pricing } = useQuery({
    queryKey: PRICING_KEY,
    queryFn: () => builderApi.pricing(),
    enabled: isSignedIn,
    staleTime: 60_000,
    retry: false,
  });

  const select = useMutation({
    mutationFn: (model: string) => builderApi.setModel(model),
    onMutate: async (model) => {
      const prev = queryClient.getQueryData<BuilderPricing>(PRICING_KEY);
      if (prev) queryClient.setQueryData<BuilderPricing>(PRICING_KEY, { ...prev, model });
      return { prev };
    },
    onError: (_e, _m, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(PRICING_KEY, ctx.prev);
    },
    onSuccess: ({ model }) => {
      const prev = queryClient.getQueryData<BuilderPricing>(PRICING_KEY);
      if (prev) queryClient.setQueryData<BuilderPricing>(PRICING_KEY, { ...prev, model });
    },
  });

  if (!isSignedIn || !pricing?.models?.length) return null;

  return (
    <LiquidGlass className="rounded-2xl" style={{ marginTop: 24 }}>
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.title}>{t("builder.modelLabel")}</Text>
          {credits && <Text style={styles.balance}>{t("builder.creditsLeft", { amount: usd(credits.usd) })}</Text>}
        </View>

        <View accessibilityRole="radiogroup" style={{ gap: 8, marginTop: 12 }}>
          {pricing.models.map((m) => {
            const selected = m.id === pricing.model;
            return (
              <Pressable
                key={m.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                disabled={select.isPending}
                onPress={() => !selected && select.mutate(m.id)}
                style={({ pressed }) => [styles.row, selected && styles.rowSelected, pressed && { opacity: 0.7 }]}
              >
                <View style={[styles.radio, selected && styles.radioSelected]}>
                  {selected && <View style={styles.radioDot} />}
                </View>
                <Text style={styles.label} numberOfLines={1}>
                  {m.label}
                </Text>
                {select.isPending && select.variables === m.id ? (
                  <ActivityIndicator size="small" color="#949499" />
                ) : (
                  <Text style={styles.price}>{t("builder.perPrompt", { price: usd(m.typicalMicros / 1_000_000) })}</Text>
                )}
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.note}>{t("builder.pricingNote")}</Text>

        {DIGITAL_PURCHASES_ENABLED && credits && (
          <Pressable
            accessibilityRole="button"
            onPress={() => setTopUpOpen(true)}
            style={({ pressed }) => [styles.topUp, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.topUpText}>{t("builder.topUpCredits")}</Text>
          </Pressable>
        )}
      </View>

      {topUpOpen && credits && (
        <SubscriptionCreditsTopUpSheet
          visible={topUpOpen}
          onClose={() => setTopUpOpen(false)}
          dhbPriceUsd={credits.dhbPriceUsd}
        />
      )}
    </LiquidGlass>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  title: { color: "#fff", fontSize: 15, fontWeight: "700" },
  balance: { color: "#c9c9ce", fontSize: 13 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    backgroundColor: "rgba(20,20,22,0.6)",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  rowSelected: { borderColor: "rgba(255,255,255,0.4)" },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: "#7a7a80",
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: { borderColor: "#fff" },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#fff" },
  label: { flex: 1, color: "#fff", fontSize: 14, fontWeight: "600" },
  price: { color: "#949499", fontSize: 13 },
  note: { color: "#949499", fontSize: 12, lineHeight: 17, marginTop: 12 },
  topUp: {
    marginTop: 12,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  topUpText: { color: "#000", fontSize: 14, fontWeight: "700" },
});
