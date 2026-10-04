/**
 * AppsScreen
 * ==========
 * The mini app store — the native counterpart of dehubweb's /apps.
 *
 * Lists apps reviewed as `listed` or `verified`. Building one is a desktop
 * job, so "Build an app" opens the web developer page rather than a native
 * copy of it; the app side is where a build gets RUN, via
 * dehub.io/apps/dev/run?url=… links that open MiniAppScreen in developer mode.
 * That page opens in a browser tab, not through Linking.openURL: the app
 * claims dehub.io/apps/ links, so openURL would route it straight back here
 * as an app called "dev".
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Icon from "../components/ui/Icon";
import ScreenHeader from "../components/ScreenHeader";
import { KitButton, PageEmpty, PageSection, PageTabs } from "../components/page/PageKit";
import { DeHubRefreshControl, DeHubRefreshMark } from "../components/Feed/DeHubRefreshControl";
import { ScreenNames } from "../navigation/ScreenNames";
import { WEBSITE_LINK } from "../config/links";
import { openInApp } from "../libs/links.utils";
import { colors } from "../theme/colors";
import {
  fetchAddedApps,
  fetchLatestScores,
  fetchListedApps,
  removeMiniApp,
  type AddedApp,
  type AppScore,
  type MiniAppListing,
} from "../services/miniapps.service";
import { useAuth } from "../context/AuthContext";
import { getAuthToken } from "../libs/auth.utils";
import { toastError, toastSuccess } from "../libs";
import env from "../config/env";
import { ARCADE_GAMES } from "../config/arcade-games";

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
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);
  const [query, setQuery] = useState("");
  const { user } = useAuth();
  const [added, setAdded] = useState<AddedApp[]>([]);
  useEffect(() => {
    let live = true;
    fetchAddedApps(user?.walletAddress).then((rows) => {
      if (live) setAdded(rows);
    });
    return () => {
      live = false;
    };
  }, [user?.walletAddress]);
  const remove = useCallback(
    async (slug: string) => {
      try {
        const session = await getAuthToken();
        if (!session) return;
        await removeMiniApp(session, env.SUPABASE_URL, slug);
        setAdded((rows) => rows.filter((r) => r.miniapp_apps?.slug !== slug));
        toastSuccess(t("miniApps.store.removed"));
      } catch (error) {
        toastError((error as Error).message);
      }
    },
    [t],
  );
  const [category, setCategory] = useState("all");
  const categories = useMemo(
    () => [...new Set((apps ?? []).map((a) => a.category).filter((c): c is string => Boolean(c)))].sort(),
    [apps],
  );
  const [scores, setScores] = useState<Map<string, AppScore>>(new Map());
  useEffect(() => {
    let live = true;
    fetchLatestScores().then((map) => {
      if (live) setScores(map);
    });
    return () => {
      live = false;
    };
  }, []);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Ranked by the published nightly score; unscored (new) apps follow by name.
    const rankOf = (id: string) => scores.get(id)?.rank ?? Number.MAX_SAFE_INTEGER;
    return (apps ?? [])
      .filter(
        (a) =>
          (category === "all" || a.category === category) &&
          (!q || [a.name, a.subtitle, a.description, a.domain].some((v) => v?.toLowerCase().includes(q))),
      )
      .sort((a, b) => rankOf(a.id) - rankOf(b.id) || a.name.localeCompare(b.name));
  }, [apps, query, category, scores]);
  const rising = useMemo(() => (apps ?? []).filter((a) => scores.get(a.id)?.is_new), [apps, scores]);

  // A failed read keeps whatever is already listed; only an empty store turns
  // into the failed state, so a bad refresh never blanks the list.
  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    const rows = await fetchListedApps().catch(() => null);
    if (!mounted.current) return;
    if (rows) {
      setApps(rows);
      setFailed(false);
    } else {
      setFailed(true);
      setApps((prev) => prev ?? []);
    }
    setRefreshing(false);
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  const retry = () => {
    setApps(null);
    void load();
  };

  const open = useCallback(
    (slug: string) => navigation.navigate(ScreenNames.MiniApp, { slug, from: "store" }),
    [navigation],
  );
  const build = () => openInApp(`${WEBSITE_LINK}/apps/dev`);

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={t("miniApps.store.title")}
        rightContent={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("miniApps.store.buildCta")}
            onPress={build}
            hitSlop={6}
            style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
          >
            <Icon name="Hammer" size={18} color="#FFFFFF" />
          </Pressable>
        }
      />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<DeHubRefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#ffffff" />}
      >
        <Text style={styles.intro}>{t("miniApps.store.intro")}</Text>

        <View style={[styles.search, styles.gutter]}>
          <Icon name="Search" size={16} color="#71717A" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t("miniApps.store.search")}
            placeholderTextColor="#71717A"
            accessibilityLabel={t("miniApps.store.search")}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.searchInput}
          />
        </View>

        {categories.length > 0 ? (
          <PageTabs
            size="sm"
            tabs={["all", ...categories].map((c) => ({
              id: c,
              label: c === "all" ? t("miniApps.store.all") : t(`miniApps.category.${c}`),
            }))}
            value={category}
            onChange={setCategory}
          />
        ) : null}

        {!query && category === "all" && added.length > 0 ? (
          <PageSection eyebrow={t("miniApps.store.yourApps")}>
            <View style={styles.list}>
            {added.map((row) =>
              row.miniapp_apps ? (
                <View key={row.app_id} style={styles.row}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={row.miniapp_apps.name}
                    onPress={() => open(row.miniapp_apps!.slug)}
                    style={styles.addedMain}
                  >
                    {row.miniapp_apps.icon_url ? (
                      <Image source={{ uri: row.miniapp_apps.icon_url }} style={styles.icon} />
                    ) : (
                      <View style={[styles.icon, styles.iconFallback]} />
                    )}
                    <View style={styles.rowText}>
                      <Text numberOfLines={1} style={styles.name}>{row.miniapp_apps.name}</Text>
                      <Text numberOfLines={1} style={styles.subtitle}>
                        {row.notifications_on ? t("miniApps.store.notificationsOn") : row.miniapp_apps.domain}
                      </Text>
                    </View>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void remove(row.miniapp_apps!.slug)}
                    style={styles.removeButton}
                  >
                    <Text style={styles.removeLabel}>{t("miniApps.store.remove")}</Text>
                  </Pressable>
                </View>
              ) : null,
            )}
            </View>
          </PageSection>
        ) : null}

        {!query && category === "all" ? (
          <PageSection eyebrow={t("miniApps.store.fromDehub")}>
            <View style={styles.list}>
            {ARCADE_GAMES.map((game) => (
              <Pressable
                key={game.slug}
                accessibilityRole="button"
                accessibilityLabel={game.title}
                onPress={() => navigation.navigate(ScreenNames.ArcadeGame, { slug: game.slug })}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              >
                <Image source={{ uri: game.art }} style={styles.icon} />
                <View style={styles.rowText}>
                  <Text numberOfLines={1} style={styles.name}>{game.title}</Text>
                  <Text numberOfLines={1} style={styles.subtitle}>{game.tagline}</Text>
                </View>
              </Pressable>
            ))}
            </View>
          </PageSection>
        ) : null}

        {!query && category === "all" && rising.length > 0 ? (
          <PageSection eyebrow={t("miniApps.store.rising")}>
            <View style={styles.list}>
              {rising.map((app) => (
                <AppRow key={`rising-${app.id}`} app={app} onPress={open} />
              ))}
            </View>
          </PageSection>
        ) : null}

        {apps !== null && apps.length > 0 && visible.length === 0 ? (
          <Text style={[styles.intro, styles.gutter]}>{t("miniApps.store.noMatch")}</Text>
        ) : null}

        {apps === null ? (
          <ActivityIndicator color="#71717A" style={{ marginTop: 24 }} />
        ) : apps.length === 0 && failed ? (
          <PageSection>
            <PageEmpty
              title={t("common.failedToLoad")}
              action={<KitButton label={t("common.retry")} onPress={retry} />}
            />
          </PageSection>
        ) : apps.length === 0 ? (
          <PageSection>
            <PageEmpty
              icon={<View style={{ marginBottom: 12 }}><Icon name="LayoutGrid" size={36} color="#71717A" /></View>}
              title={t("miniApps.store.emptyTitle")}
              body={t("miniApps.store.emptyBody")}
              action={<KitButton label={t("miniApps.store.buildCta")} onPress={build} />}
            />
          </PageSection>
        ) : visible.length > 0 ? (
          <PageSection>
            <View style={styles.list}>
              {visible.map((app) => <AppRow key={app.id} app={app} onPress={open} />)}
            </View>
          </PageSection>
        ) : null}
      </ScrollView>
      <DeHubRefreshMark refreshing={refreshing} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.neutrals[900] },
  content: { paddingTop: 4, gap: 8 },
  gutter: { marginHorizontal: 16 },
  intro: { color: "#A1A1AA", fontSize: 12, lineHeight: 18, paddingHorizontal: 16 },
  list: { gap: 14 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  pressed: { opacity: 0.85 },
  icon: { width: 52, height: 52, borderRadius: 12 },
  iconFallback: { backgroundColor: "#27272A", alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  nameLine: { flexDirection: "row", alignItems: "center", gap: 4 },
  name: { color: "#FFFFFF", fontSize: 14, fontWeight: "600", flexShrink: 1 },
  subtitle: { color: "#A1A1AA", fontSize: 12 },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#18181B",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  addedMain: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 12 },
  removeButton: { borderRadius: 8, backgroundColor: "#27272A", paddingHorizontal: 12, paddingVertical: 6 },
  removeLabel: { color: "#E4E4E7", fontSize: 12, fontWeight: "600" },
  searchInput: { flex: 1, height: 40, color: "#FFFFFF", fontSize: 14 },
});
