/**
 * Conversation coach cards
 * ========================
 * Native port of dehubweb's CoachSuggestions. Up to three dismissible cards
 * from the coach — the kind of slip, the words that triggered it, and one
 * sentence on how to keep the point without it. Shown above the comment
 * composer and inside the Common Ground sheet's final step.
 *
 * Advice, never a gate: "Post anyway" is offered when there is something to
 * post, and a coach that failed renders nothing at all.
 */
import React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import Icon from "../ui/Icon";
import type { CoachFlag, CoachStatus } from "../../hooks/useConversationCoach";

interface CoachSuggestionsProps {
  status: CoachStatus;
  flags: CoachFlag[];
  onDismiss: (index: number) => void;
  /** Hide the "all clear" line. */
  onClear?: () => void;
  /** When set, a "Post anyway" action sits under the cards. */
  onPostAnyway?: () => void;
}

const HIT = { top: 8, bottom: 8, left: 8, right: 8 };

const CoachSuggestions: React.FC<CoachSuggestionsProps> = ({ status, flags, onDismiss, onClear, onPostAnyway }) => {
  const { t } = useTranslation();

  if (status === "idle" || status === "error") return null;

  if (status === "loading") {
    return (
      <View className="flex-row items-center px-3 py-2" style={{ gap: 8 }}>
        <ActivityIndicator size="small" color="#A6A9AC" />
        <Text className="text-theme-neutrals-400 text-xs">{t("conversation.coach.checking")}</Text>
      </View>
    );
  }

  if (flags.length === 0) {
    return (
      <View
        className="flex-row items-center rounded-xl px-3 py-2"
        style={{ gap: 8, backgroundColor: "rgba(16,185,129,0.08)", borderWidth: 1, borderColor: "rgba(52,211,153,0.25)" }}
      >
        <Icon name="Check" size={14} color="#A7F3D0" />
        <Text style={{ flex: 1, fontSize: 12, color: "#A7F3D0" }}>{t("conversation.coach.allClear")}</Text>
        {onClear && (
          <Pressable onPress={onClear} hitSlop={HIT} accessibilityRole="button" accessibilityLabel={t("conversation.coach.dismiss")}>
            <Icon name="X" size={14} color="#A7F3D0" />
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <View style={{ gap: 6 }}>
      {flags.map((flag, index) => (
        <View
          key={`${flag.kind}-${index}`}
          className="flex-row items-start rounded-xl px-3 py-2.5"
          style={{ gap: 10, backgroundColor: "rgba(245,158,11,0.08)", borderWidth: 1, borderColor: "rgba(251,191,36,0.25)" }}
        >
          <View style={{ marginTop: 2 }}>
            <Icon name="Sparkles" size={14} color="#FDE68A" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", color: "#FDE68A" }}>
              {t(`conversation.coach.kind.${flag.kind}`)}
            </Text>
            {!!flag.quote && (
              <Text numberOfLines={2} style={{ marginTop: 2, fontSize: 12, fontStyle: "italic", color: "#A6A9AC" }}>
                “{flag.quote}”
              </Text>
            )}
            <Text style={{ marginTop: 4, fontSize: 12, color: "#E4E4E7" }}>{flag.suggestion}</Text>
          </View>
          <Pressable
            onPress={() => onDismiss(index)}
            hitSlop={HIT}
            accessibilityRole="button"
            accessibilityLabel={t("conversation.coach.dismiss")}
          >
            <Icon name="X" size={14} color="#A6A9AC" />
          </Pressable>
        </View>
      ))}
      {onPostAnyway && (
        <View className="flex-row justify-end">
          <Pressable onPress={onPostAnyway} hitSlop={HIT} accessibilityRole="button">
            <Text style={{ fontSize: 12, color: "#A6A9AC", textDecorationLine: "underline", paddingVertical: 2, paddingHorizontal: 4 }}>
              {t("conversation.coach.postAnyway")}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
};

export default CoachSuggestions;
