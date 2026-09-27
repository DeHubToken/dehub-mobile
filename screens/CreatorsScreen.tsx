/**
 * CreatorsScreen
 * ==============
 * Native port of the web creator application (/creators). Same fields, same
 * `creator_applications` table, same wording (the creators.* strings web
 * already translates).
 *
 * The table has no TikTok column, so — as on web — a TikTok handle is folded
 * into `other_socials` rather than silently dropped.
 */
import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Icon from "../components/ui/Icon";
import ScreenHeader, { SCREEN_HEADER_HEIGHT } from "../components/ScreenHeader";
import { useKeyboardOffset } from "../hooks/useKeyboardLayout";
import { supabase } from "../services/supabase";
import { toastError, toastSuccess } from "../libs";

interface CreatorForm {
  x_username: string;
  youtube_username: string;
  twitch_username: string;
  instagram_username: string;
  tiktok_username: string;
  other_socials: string;
  total_follower_reach: string;
  email: string;
  expected_compensation: string;
}

const EMPTY_FORM: CreatorForm = {
  x_username: "",
  youtube_username: "",
  twitch_username: "",
  instagram_username: "",
  tiktok_username: "",
  other_socials: "",
  total_follower_reach: "",
  email: "",
  expected_compensation: "",
};

const Field = ({
  label,
  required,
  value,
  onChangeText,
  placeholder,
  multiline,
  email,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  multiline?: boolean;
  email?: boolean;
}) => (
  <View style={{ gap: 6 }}>
    <Text style={styles.fieldLabel}>
      {label}
      {required && <Text style={styles.required}> *</Text>}
    </Text>
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#8B8D90"
      accessibilityLabel={label}
      style={[styles.input, multiline && styles.inputMultiline]}
      multiline={multiline}
      autoCapitalize="none"
      autoCorrect={false}
      keyboardType={email ? "email-address" : "default"}
    />
  </View>
);

export default function CreatorsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const keyboardOffset = useKeyboardOffset(SCREEN_HEADER_HEIGHT);
  const [form, setForm] = useState<CreatorForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const set = useCallback(
    (key: keyof CreatorForm) => (value: string) => setForm((prev) => ({ ...prev, [key]: value })),
    [],
  );

  const submit = useCallback(async () => {
    if (!form.email.trim() || !form.total_follower_reach.trim() || !form.expected_compensation.trim()) {
      toastError(t("creators.fillRequired"));
      return;
    }
    setSubmitting(true);
    try {
      const tiktok = form.tiktok_username.trim();
      const otherSocials = [tiktok ? `TikTok: ${tiktok}` : null, form.other_socials.trim() || null]
        .filter(Boolean)
        .join(" | ");
      const { error } = await supabase.from("creator_applications").insert({
        x_username: form.x_username.trim() || null,
        youtube_username: form.youtube_username.trim() || null,
        twitch_username: form.twitch_username.trim() || null,
        instagram_username: form.instagram_username.trim() || null,
        total_follower_reach: form.total_follower_reach.trim(),
        other_socials: otherSocials || null,
        email: form.email.trim(),
        expected_compensation: form.expected_compensation.trim(),
      });
      if (error) throw error;
      toastSuccess(t("creators.submitted"));
      setForm(EMPTY_FORM);
    } catch {
      toastError(t("creators.failedSubmit"));
    } finally {
      setSubmitting(false);
    }
  }, [form, t]);

  return (
    <View style={styles.root}>
      <ScreenHeader title={t("creators.title")} subtitle={t("creators.subtitle")} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={keyboardOffset}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 4, paddingBottom: insets.bottom + 32 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            <Field label={t("creators.xUsername")} value={form.x_username} onChangeText={set("x_username")} placeholder="@username" />
            <Field label={t("creators.youtubeUsername")} value={form.youtube_username} onChangeText={set("youtube_username")} placeholder="@channel" />
            <Field label={t("creators.twitchUsername")} value={form.twitch_username} onChangeText={set("twitch_username")} placeholder="@username" />
            <Field label={t("creators.instagramUsername")} value={form.instagram_username} onChangeText={set("instagram_username")} placeholder="@username" />
            <Field label={t("creators.tiktokUsername")} value={form.tiktok_username} onChangeText={set("tiktok_username")} placeholder="@username" />
            <Field label={t("creators.otherSocials")} value={form.other_socials} onChangeText={set("other_socials")} multiline />
            <Field
              label={t("creators.totalFollowerReach")}
              required
              value={form.total_follower_reach}
              onChangeText={set("total_follower_reach")}
              placeholder={t("creators.followerReachPlaceholder")}
            />
            <Field
              label={t("creators.emailOrTelegram")}
              required
              email
              value={form.email}
              onChangeText={set("email")}
              placeholder={t("creators.emailPlaceholder")}
            />
            <Field
              label={t("creators.expectedCompensation")}
              required
              value={form.expected_compensation}
              onChangeText={set("expected_compensation")}
              placeholder={t("creators.compensationPlaceholder")}
            />
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("creators.submitApplication")}
            style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
            onPress={submit}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <ActivityIndicator size="small" color="#000000" />
                <Text style={styles.submitText}>{t("creators.submitting")}</Text>
              </>
            ) : (
              <>
                <Icon name="Send" size={15} color="#000000" />
                <Text style={styles.submitText}>{t("creators.submitApplication")}</Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#010305" },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 14,
    gap: 14,
    marginBottom: 16,
  },
  fieldLabel: { color: "#D4D4D8", fontSize: 13 },
  required: { color: "#F87171" },
  input: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#FFFFFF",
    fontSize: 14,
  },
  inputMultiline: { minHeight: 80, textAlignVertical: "top" },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
  },
  submitText: { color: "#000000", fontSize: 14, fontWeight: "700" },
});
