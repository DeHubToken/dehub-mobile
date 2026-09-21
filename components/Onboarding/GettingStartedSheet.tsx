/**
 * Getting Started — the checklist sheet
 * =====================================
 * The app's copy of web's right-rail bento, as the bottom sheet every other
 * multi-step thing in this app uses. Seven steps, one plain sentence each, a
 * "take me there", a tick, a skip, and — once a step is behind you — "Was this
 * easy?".
 *
 * The rating is asked per step rather than once at the end on purpose: "was
 * the app easy" produces a mood, "was setting a username easy" produces a fix.
 */
import React, { useEffect } from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";

import GlassModal from "../ui/GlassModal";
import Icon from "../ui/Icon";
import { useAppTheme } from "../../context/ThemeContext";
import { useOnboarding } from "../../context/OnboardingChecklistContext";
import {
  ONBOARDING_STEPS,
  nextOnboardingStep,
  type OnboardingStepDef,
} from "../../libs/onboarding-steps";

interface GettingStartedSheetProps {
  visible: boolean;
  onClose: () => void;
}

const GettingStartedSheet: React.FC<GettingStartedSheetProps> = ({ visible, onClose }) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const navigation = useNavigation<any>();
  const onboarding = useOnboarding();

  // Only the step somebody is actually looking at counts as viewed. Recording
  // all seven at once would make the drop-off map say every member reached
  // every step, which is the one thing it exists to disprove.
  const nextStepId = onboarding ? nextOnboardingStep(onboarding.steps)?.id ?? null : null;
  const recordView = onboarding?.recordView;
  useEffect(() => {
    if (visible && nextStepId) recordView?.(nextStepId);
  }, [visible, nextStepId, recordView]);

  if (!onboarding) return null;

  const { steps, settled, total, percentage, complete } = onboarding;

  const go = (step: OnboardingStepDef) => {
    onboarding.recordView(step.id);
    onClose();
    navigation.navigate(step.screen as never);
  };

  return (
    <GlassModal visible={visible} onClose={onClose} presentation="bottom" maxHeight="85%">
      <View className="px-5 pb-4 pt-2">
        <Text className="text-white text-xl font-bold">
          {complete
            ? t("onboarding.checklist.finishedTitle")
            : t("onboarding.checklist.title")}
        </Text>
        <Text className="text-theme-neutrals-400 text-sm mt-1">
          {complete
            ? t("onboarding.checklist.finishedBody")
            : t("onboarding.checklist.subtitle")}
        </Text>

        <View className="h-1.5 rounded-full bg-theme-neutrals-800 overflow-hidden mt-4">
          <View
            style={{ width: `${percentage}%`, backgroundColor: colors.accent }}
            className="h-full rounded-full"
          />
        </View>
        <Text className="text-theme-neutrals-500 text-xs mt-1.5">
          {t("onboarding.checklist.progress", { done: settled, total })}
        </Text>

        <ScrollView className="mt-4" showsVerticalScrollIndicator={false}>
          {ONBOARDING_STEPS.map((step) => {
            const state = steps[step.id] || {};
            const settledStep = !!state.done || !!state.skipped;
            return (
              <View
                key={step.id}
                className="rounded-xl bg-theme-neutrals-800 p-4 mb-3"
                style={settledStep ? { opacity: 0.7 } : undefined}
              >
                <View className="flex-row items-start" style={{ gap: 10 }}>
                  <Icon name={step.icon} size={18} color={colors.neutrals[400]} />
                  <View className="flex-1">
                    <Text
                      className="text-white text-sm font-semibold"
                      style={state.done ? { textDecorationLine: "line-through" } : undefined}
                    >
                      {t(`onboarding.steps.${step.id}.title`)}
                    </Text>
                    <Text className="text-theme-neutrals-400 text-xs mt-1 leading-5">
                      {t(`onboarding.steps.${step.id}.body`)}
                    </Text>

                    {!settledStep ? (
                      <View className="flex-row items-center mt-3" style={{ gap: 10 }}>
                        <TouchableOpacity
                          onPress={() => go(step)}
                          activeOpacity={0.8}
                          className="rounded-lg px-3 py-1.5"
                          style={{ backgroundColor: colors.accent }}
                        >
                          <Text className="text-theme-accent-foreground text-xs font-semibold">
                            {t("onboarding.checklist.go")}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => onboarding.markDone(step.id)}
                          activeOpacity={0.8}
                          className="rounded-lg px-3 py-1.5 bg-white/10 border border-white/20"
                        >
                          <Text className="text-white/80 text-xs font-semibold">
                            {t("onboarding.checklist.done")}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => onboarding.skip(step.id)}
                          activeOpacity={0.7}
                        >
                          <Text className="text-theme-neutrals-500 text-xs">
                            {t("onboarding.checklist.skip")}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}

                    {/* A rating only makes sense about something you actually
                        did, so a skipped step is never asked. */}
                    {state.done ? (
                      <View className="flex-row items-center mt-3" style={{ gap: 12 }}>
                        {state.rating ? (
                          <Text className="text-theme-neutrals-500 text-xs">
                            {t("onboarding.rating.thanks")}
                          </Text>
                        ) : (
                          <>
                            <Text className="text-theme-neutrals-400 text-xs">
                              {t("onboarding.rating.question")}
                            </Text>
                            <TouchableOpacity
                              accessibilityLabel={t("onboarding.rating.easy")}
                              onPress={() => onboarding.rate(step.id, "easy")}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Icon name="ThumbsUp" size={16} color={colors.neutrals[400]} />
                            </TouchableOpacity>
                            <TouchableOpacity
                              accessibilityLabel={t("onboarding.rating.hard")}
                              onPress={() => onboarding.rate(step.id, "hard")}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Icon name="ThumbsDown" size={16} color={colors.neutrals[400]} />
                            </TouchableOpacity>
                          </>
                        )}
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>
            );
          })}

          {complete ? (
            <View className="self-start rounded-md bg-white/10 border border-white/20 px-2 py-1 mb-3 flex-row items-center">
              <Icon name="Trophy" size={11} color={colors.neutrals[200]} />
              <Text className="text-white/75 text-[10px] font-semibold ml-1">
                {t("onboarding.checklist.chip")}
              </Text>
            </View>
          ) : null}

          <TouchableOpacity
            onPress={() => {
              onboarding.dismiss();
              onClose();
            }}
            activeOpacity={0.7}
            className="items-center py-3 mb-2"
          >
            <Text className="text-theme-neutrals-500 text-sm">
              {t("onboarding.checklist.dismiss")}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </GlassModal>
  );
};

export default GettingStartedSheet;
