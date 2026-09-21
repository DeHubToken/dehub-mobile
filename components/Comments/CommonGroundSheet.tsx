/**
 * Common Ground sheet
 * ===================
 * Native port of dehubweb's CommonGroundSheet. The creator turned Common
 * Ground mode on for this post, so a reply goes through three short steps
 * before it is sent:
 *
 *   1. the strongest point on the other side, in one sentence
 *   2. what the two sides actually agree on
 *   3. a reminder about all-or-nothing thinking, and that shouting settles
 *      nothing
 *
 * then one last look at the draft with the coach's suggestions inline, and a
 * Post button. The two answers are private reflection: they never leave the
 * device and are not attached to the comment. Completion is remembered per
 * thread for the session by the caller.
 */
import React, { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import GlassModal from "../ui/GlassModal";
import Icon from "../ui/Icon";
import CoachSuggestions from "./CoachSuggestions";
import { useAppPrefs } from "../../hooks/useAppPrefs";
import { useConversationCoach } from "../../hooks/useConversationCoach";

/** Each reflection has to be at least this long to count. */
export const COMMON_GROUND_MIN_CHARS = 10;

interface CommonGroundSheetProps {
  visible: boolean;
  onClose: () => void;
  /** The reply about to be posted; reviewed in the last step, never edited here. */
  draft: string;
  /** The caller posts the reply and closes the sheet. */
  onConfirm: () => void;
}

type Step = 1 | 2 | 3 | 4;

const FIELD = {
  minHeight: 88,
  color: "#F9FBFF",
  fontSize: 14,
  textAlignVertical: "top" as const,
  backgroundColor: "rgba(255,255,255,0.04)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.12)",
  borderRadius: 12,
  paddingHorizontal: 12,
  paddingVertical: 10,
};

const CARD = {
  backgroundColor: "rgba(255,255,255,0.03)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.10)",
  borderRadius: 12,
  padding: 14,
};

const PrimaryButton: React.FC<{ label: string; onPress: () => void; disabled?: boolean; testID?: string }> = ({
  label,
  onPress,
  disabled,
  testID,
}) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    accessibilityRole="button"
    testID={testID}
    style={{
      height: 40,
      borderRadius: 12,
      paddingHorizontal: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: disabled ? "rgba(255,255,255,0.1)" : "#F9FBFF",
    }}
  >
    <Text style={{ color: disabled ? "#6F7174" : "#010305", fontSize: 14, fontWeight: "600" }}>{label}</Text>
  </Pressable>
);

const CommonGroundSheet: React.FC<CommonGroundSheetProps> = ({ visible, onClose, draft, onConfirm }) => {
  const { t } = useTranslation();
  const coachEnabled = useAppPrefs().coach;
  const coach = useConversationCoach();

  const [step, setStep] = useState<Step>(1);
  const [otherSide, setOtherSide] = useState("");
  const [sharedGround, setSharedGround] = useState("");
  const firstFieldRef = useRef<TextInput>(null);

  // A fresh set of steps every time the sheet opens — the answers are
  // reflection for this reply, not a form to be resubmitted.
  useEffect(() => {
    if (!visible) return;
    setStep(1);
    setOtherSide("");
    setSharedGround("");
    coach.reset();
    const id = setTimeout(() => firstFieldRef.current?.focus(), 250);
    return () => clearTimeout(id);
    // coach.reset is stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // The last step runs the coach on the draft. With coaching switched off
  // there is nothing to wait for and the Post button is there at once.
  useEffect(() => {
    if (!visible || step !== 4) return;
    if (!coachEnabled || !draft.trim()) return;
    void coach.check(draft, "commonGround");
    // coach.check is stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, step, coachEnabled, draft]);

  const otherSideOk = otherSide.trim().length >= COMMON_GROUND_MIN_CHARS;
  const sharedGroundOk = sharedGround.trim().length >= COMMON_GROUND_MIN_CHARS;

  const stepLabel =
    step <= 3 ? t("conversation.commonGround.stepOf", { step, total: 3 }) : t("conversation.commonGround.reviewTitle");

  return (
    <GlassModal visible={visible} onClose={onClose} presentation="bottom" maxHeight="90%" blurIntensity={40}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: 28, gap: 16 }}>
        <View style={{ gap: 4 }}>
          <View className="flex-row items-center" style={{ gap: 8 }}>
            <Icon name="Handshake" size={18} color="#D4D4D8" />
            <Text className="text-white text-lg font-bold">{t("conversation.commonGround.title")}</Text>
          </View>
          <Text className="text-theme-neutrals-400 text-xs">{t("conversation.commonGround.sheetHint")}</Text>
        </View>

        <Text style={{ fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: "#6F7174" }}>{stepLabel}</Text>

        {step === 1 && (
          <View style={{ gap: 8 }}>
            <Text className="text-white text-sm font-semibold">{t("conversation.commonGround.step1Title")}</Text>
            <TextInput
              ref={firstFieldRef}
              value={otherSide}
              onChangeText={setOtherSide}
              placeholder={t("conversation.commonGround.step1Placeholder")}
              placeholderTextColor="#6F7174"
              multiline
              maxLength={400}
              style={FIELD}
            />
            {otherSide.length > 0 && !otherSideOk && (
              <Text className="text-theme-neutrals-400 text-xs">{t("conversation.commonGround.tooShort")}</Text>
            )}
          </View>
        )}

        {step === 2 && (
          <View style={{ gap: 8 }}>
            <Text className="text-white text-sm font-semibold">{t("conversation.commonGround.step2Title")}</Text>
            <TextInput
              autoFocus
              value={sharedGround}
              onChangeText={setSharedGround}
              placeholder={t("conversation.commonGround.step2Placeholder")}
              placeholderTextColor="#6F7174"
              multiline
              maxLength={400}
              style={FIELD}
            />
            {sharedGround.length > 0 && !sharedGroundOk && (
              <Text className="text-theme-neutrals-400 text-xs">{t("conversation.commonGround.tooShort")}</Text>
            )}
          </View>
        )}

        {step === 3 && (
          <View style={{ gap: 12 }}>
            <View style={CARD}>
              <View className="flex-row items-center" style={{ gap: 8 }}>
                <Icon name="Scale" size={16} color="#D4D4D8" />
                <Text className="text-white text-sm font-semibold">{t("conversation.commonGround.reminderTitle")}</Text>
              </View>
              <Text style={{ marginTop: 8, fontSize: 14, color: "#D4D4D8" }}>{t("conversation.commonGround.reminderBody")}</Text>
              <View style={{ marginTop: 12, gap: 8 }}>
                <View className="flex-row" style={{ gap: 8 }}>
                  <Text style={{ color: "#6F7174", fontSize: 12 }}>•</Text>
                  <Text style={{ flex: 1, fontSize: 12, color: "#A6A9AC" }}>{t("conversation.commonGround.example1")}</Text>
                </View>
                <View className="flex-row" style={{ gap: 8 }}>
                  <Text style={{ color: "#6F7174", fontSize: 12 }}>•</Text>
                  <Text style={{ flex: 1, fontSize: 12, color: "#A6A9AC" }}>{t("conversation.commonGround.example2")}</Text>
                </View>
              </View>
            </View>
            <View style={[CARD, { flexDirection: "row", gap: 8, alignItems: "flex-start" }]}>
              <View style={{ marginTop: 2 }}>
                <Icon name="MessageCircleWarning" size={16} color="#D4D4D8" />
              </View>
              <Text style={{ flex: 1, fontSize: 14, color: "#D4D4D8" }}>{t("conversation.commonGround.noShouting")}</Text>
            </View>
          </View>
        )}

        {step === 4 && (
          <View style={{ gap: 12 }}>
            {!!draft.trim() && (
              <View style={[CARD, { maxHeight: 160 }]}>
                <ScrollView nestedScrollEnabled>
                  <Text style={{ fontSize: 14, color: "#E4E4E7" }}>{draft.trim()}</Text>
                </ScrollView>
              </View>
            )}
            <CoachSuggestions status={coach.status} flags={coach.flags} onDismiss={coach.dismiss} />
          </View>
        )}

        <Text className="text-theme-neutrals-400 text-xs">{t("conversation.commonGround.privateNote")}</Text>

        <View className="flex-row items-center" style={{ justifyContent: step > 1 ? "space-between" : "flex-end", gap: 8 }}>
          {step > 1 && (
            <Pressable
              onPress={() => setStep((s) => (s > 1 ? ((s - 1) as Step) : s))}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              className="flex-row items-center"
              style={{ gap: 4, paddingVertical: 8 }}
            >
              <Icon name="ArrowLeft" size={16} color="#D4D4D8" />
              <Text style={{ color: "#D4D4D8", fontSize: 14 }}>{t("conversation.commonGround.back")}</Text>
            </Pressable>
          )}
          {step === 1 && (
            <PrimaryButton label={t("conversation.commonGround.continueLabel")} disabled={!otherSideOk} onPress={() => setStep(2)} />
          )}
          {step === 2 && (
            <PrimaryButton label={t("conversation.commonGround.continueLabel")} disabled={!sharedGroundOk} onPress={() => setStep(3)} />
          )}
          {step === 3 && <PrimaryButton label={t("conversation.commonGround.continueLabel")} onPress={() => setStep(4)} />}
          {step === 4 && <PrimaryButton testID="common-ground-post" label={t("conversation.commonGround.postReply")} onPress={onConfirm} />}
        </View>
      </ScrollView>
    </GlassModal>
  );
};

export default CommonGroundSheet;
