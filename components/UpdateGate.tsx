/**
 * UpdateGate
 * ==========
 * Asks people on an old native build to update from the store.
 *
 * An over-the-air update only reaches binaries built at the same
 * runtimeVersion, so a build that has stopped receiving updates can only be
 * reached by code it already runs. Signed wallet sessions are the case in
 * point: once row-level security stops trusting a bare wallet header, a build
 * without the signing code sees its own chats and notifications come back
 * empty. This is how those builds hear about it.
 *
 * The policy is a row in public.app_min_versions, so it moves without a
 * release:
 *   - below recommended_version: a prompt that can be put off for a day;
 *   - below min_version: a prompt that cannot be dismissed.
 */
import React, { useEffect, useState } from "react";
import { Linking, Platform, Text, TouchableOpacity, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Application from "expo-application";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import GlassModal from "./ui/GlassModal";
import { theme } from "../theme";
import { supabase } from "../services/supabase";
import { GOOGLE_PLAY_LINK } from "../config/links";
import { updateMode, type UpdateMode } from "../libs/app-version";

const PUT_OFF_KEY = "update_gate_put_off_at";
const PUT_OFF_MS = 24 * 60 * 60 * 1000;

export default function UpdateGate() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<UpdateMode | null>(null);
  const [storeUrl, setStoreUrl] = useState(GOOGLE_PLAY_LINK);

  useEffect(() => {
    const current = Application.nativeApplicationVersion;
    if (!current) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("app_min_versions")
        .select("min_version, recommended_version, store_url")
        .eq("platform", Platform.OS)
        .maybeSingle();
      if (!data || cancelled) return;
      const next = updateMode(current, data);
      if (next === "recommended") {
        const putOffAt = Number(await AsyncStorage.getItem(PUT_OFF_KEY));
        if (putOffAt && Date.now() - putOffAt < PUT_OFF_MS) return;
      }
      if (cancelled) return;
      if (data.store_url) setStoreUrl(data.store_url);
      setMode(next);
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const putOff = () => {
    if (mode !== "recommended") return;
    AsyncStorage.setItem(PUT_OFF_KEY, String(Date.now())).catch(() => undefined);
    setMode(null);
  };

  return (
    <GlassModal
      visible={!!mode}
      onClose={putOff}
      presentation="center"
      blurIntensity={80}
      dismissible={mode !== "required"}
    >
      <View className="rounded-xl p-6 mx-6">
        <View className="items-center mb-4">
          <View className="bg-theme-accent/10 rounded-2xl p-4">
            <Ionicons name="arrow-up-circle-outline" size={48} color={theme.colors.accent} />
          </View>
        </View>

        <Text className="text-white text-2xl font-bold text-center mb-2">{t("updateGate.title")}</Text>

        <Text className="text-theme-neutrals-400 text-sm text-center mb-6">
          {mode === "required" ? t("updateGate.requiredBody") : t("updateGate.recommendedBody")}
        </Text>

        <View className="gap-3">
          <TouchableOpacity
            onPress={() => Linking.openURL(storeUrl).catch(() => undefined)}
            className="bg-theme-accent rounded-xl py-3 px-6 items-center"
            activeOpacity={0.8}
            accessibilityRole="button"
          >
            <Text className="text-theme-accent-foreground text-base font-semibold">{t("updateGate.update")}</Text>
          </TouchableOpacity>

          {mode === "recommended" ? (
            <TouchableOpacity
              onPress={putOff}
              className="py-3 px-6 items-center"
              activeOpacity={0.7}
              accessibilityRole="button"
            >
              <Text className="text-theme-neutrals-400 text-base">{t("ppv.notNow")}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </GlassModal>
  );
}
