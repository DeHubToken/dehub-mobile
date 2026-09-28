/**
 * AppsScreen
 * ==========
 * The mini app store — the native counterpart of dehubweb's /apps.
 *
 * Lists apps reviewed as `listed` or `verified`. Building one is a desktop
 * job, so "Build an app" opens the web developer page rather than a native
 * copy of it; the app side is where a build gets RUN, via
 * dehub.io/apps/dev/run?url=… links that open MiniAppScreen in developer mode.
 */
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Icon from "../components/ui/Icon";
import ScreenHeader from "../components/ScreenHeader";
import { ScreenNames } from "../navigation/ScreenNames";
import { WEBSITE_LINK } from "../config/links";
import { colors } from "../theme/colors";
import { fetchListedApps, type MiniAppListing } from "../services/miniapps.service";

function AppRow({ app, onPress }: { app: MiniAppListing; onPress: (slug: string) => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={app.name}
      onPress={() => onPress(app.slug)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {app.icon_url ? (
        <Image source={{ uri: app.icon_url }} style={styles.icon} />
      ) : (
        <View style={[styles.icon, styles.iconFallback]}>
          <Icon name="LayoutGrid" size={22} color="#71717A" />
        </View>
      )}
      <View style={styles.rowText}>
        <View style={styles.nameLine}>
          <Text numberOfLines={1} style={styles.name}>{app.name}</Text>
          {app.tier === "verified" ? <Icon name="CircleCheck" size={14} color="#38BDF8" /> : null}
        </View>
        <Text numberOfLines={1} style={styles.subtitle}>{app.subtitle ?? app.domain}</Text>
      </View>
    </Pressable>
  );
}

export default function AppsScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [apps, setApps] = useState<MiniAppListing[] | null>(null);

  useEffect(() => {
    let live = true;
    fetchListedApps().then((rows) => {
      if (live) setApps(rows);
    });
    return () => {
      live = false;
    };
  }, []);

  const open = useCallback(
    (slug: string) => navigation.navigate(ScreenNames.MiniApp, { slug, from: "store" }),
    [navigation],
  );
  const build = () => Linking.openURL(`${WEBSITE_LINK}/apps/dev`);

  return (
    <View style={styles.screen}>
      <ScreenHeader title={t("miniApps.store.title")} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.intro}>{t("miniApps.store.intro")}</Text>

        {apps === null ? (
          <ActivityIndicator color="#71717A" style={{ marginTop: 24 }} />
        ) : apps.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{t("miniApps.store.emptyTitle")}</Text>
            <Text style={styles.emptyBody}>{t("miniApps.store.emptyBody")}</Text>
          </View>
        ) : (
          apps.map((app) => <AppRow key={app.id} app={app} onPress={open} />)
        )}

        <Pressable
          accessibilityRole="button"
          onPress={build}
          style={({ pressed }) => [styles.buildCard, pressed && styles.pressed]}
        >
          <Text style={styles.buildLabel}>{t("miniApps.store.buildCta")}</Text>
          <Icon name="ArrowUpRight" size={14} color="#FFFFFF" />
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.neutrals[900] },
  content: { paddingHorizontal: 12, paddingTop: 8, gap: 8 },
  intro: { color: "#A1A1AA", fontSize: 12, lineHeight: 18, paddingHorizontal: 2, marginBottom: 4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: "#18181B",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  pressed: { opacity: 0.85 },
  icon: { width: 52, height: 52, borderRadius: 12 },
  iconFallback: { backgroundColor: "#27272A", alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  nameLine: { flexDirection: "row", alignItems: "center", gap: 4 },
  name: { color: "#FFFFFF", fontSize: 14, fontWeight: "600", flexShrink: 1 },
  subtitle: { color: "#A1A1AA", fontSize: 12 },
  empty: {
    padding: 20,
    borderRadius: 16,
    backgroundColor: "#18181B",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    gap: 4,
  },
  emptyTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  emptyBody: { color: "#A1A1AA", fontSize: 12, textAlign: "center" },
  buildCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  buildLabel: { color: "#FFFFFF", fontSize: 13, fontWeight: "600" },
});
