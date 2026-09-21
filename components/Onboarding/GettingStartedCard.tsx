/**
 * Getting Started — the home surface
 * ==================================
 * Two things, mounted once at the root of the home screen:
 *
 *  - the one-question offer, for a brand-new account that has not been asked;
 *  - a slim progress card above the tab bar, for somebody mid-walkthrough,
 *    which opens the checklist sheet.
 *
 * A card rather than a block inside the feed: the home screen is a six-page
 * pager of virtualised lists, and a header injected into one of them would be
 * a header in one tab and missing from the other five.
 *
 * Renders nothing at all for everyone else, which is nearly everyone.
 */
import React, { useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useTranslation } from "react-i18next";

import GlassModal from "../ui/GlassModal";
import Icon from "../ui/Icon";
import { useAppTheme } from "../../context/ThemeContext";
import { useOnboarding } from "../../context/OnboardingChecklistContext";
import { TAB_BAR_CONTENT_INSET } from "../../navigation/tabBarLayout";
import GettingStartedSheet from "./GettingStartedSheet";

const GettingStartedCard: React.FC = () => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const onboarding = useOnboarding();
  const [sheetOpen, setSheetOpen] = useState(false);

  if (!onboarding || onboarding.loading) return null;

  // ── The offer ─────────────────────────────────────────────────────────────
  if (onboarding.shouldOffer) {
    return (
      <GlassModal
        visible
        onClose={onboarding.decline}
        presentation="center"
        blurIntensity={80}
      >
        <View className="rounded-xl p-6 mx-6">
          <View className="items-center mb-4">
            <View className="bg-theme-accent/10 rounded-2xl p-4">
              <Icon name="Compass" size={44} color={colors.accent} />
            </View>
          </View>
          <Text className="text-white text-2xl font-bold text-center mb-2">
            {t("onboarding.optIn.title")}
          </Text>
          <Text className="text-theme-neutrals-400 text-sm text-center mb-6">
            {t("onboarding.optIn.body")}
          </Text>
          <View style={{ gap: 12 }}>
            <TouchableOpacity
              onPress={() => {
                onboarding.start();
                setSheetOpen(true);
              }}
              activeOpacity={0.8}
              className="rounded-xl py-3 px-6 items-center"
              style={{ backgroundColor: colors.accent }}
            >
              <Text className="text-theme-accent-foreground text-base font-semibold">
                {t("onboarding.optIn.yes")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onboarding.decline}
              activeOpacity={0.7}
              className="py-3 px-6 items-center"
            >
              <Text className="text-theme-neutrals-400 text-base">
                {t("onboarding.optIn.no")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </GlassModal>
    );
  }

  if (!onboarding.progress || !onboarding.active) return null;

  // ── The card ──────────────────────────────────────────────────────────────
  return (
    <>
      <View
        pointerEvents="box-none"
        style={{ position: "absolute", left: 12, right: 12, bottom: TAB_BAR_CONTENT_INSET + 8 }}
      >
        <TouchableOpacity
          onPress={() => setSheetOpen(true)}
          activeOpacity={0.85}
          className="flex-row items-center rounded-2xl bg-theme-neutrals-800 border border-white/10 px-4 py-3"
          style={{ gap: 12 }}
        >
          <Icon
            name={onboarding.complete ? "Trophy" : "Compass"}
            size={18}
            color={colors.accent}
          />
          <View className="flex-1">
            <Text className="text-white text-sm font-semibold">
              {onboarding.complete
                ? t("onboarding.checklist.finishedTitle")
                : t("onboarding.checklist.title")}
            </Text>
            <Text className="text-theme-neutrals-400 text-xs mt-0.5">
              {t("onboarding.checklist.progress", {
                done: onboarding.settled,
                total: onboarding.total,
              })}
            </Text>
          </View>
          <TouchableOpacity
            onPress={onboarding.dismiss}
            accessibilityLabel={t("onboarding.checklist.dismiss")}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Icon name="X" size={16} color={colors.neutrals[500]} />
          </TouchableOpacity>
        </TouchableOpacity>
      </View>

      <GettingStartedSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  );
};

export default GettingStartedCard;
