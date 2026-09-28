/**
 * BuilderScreen — dehub.io/builder
 *
 * Native port of dehubweb's pages/app/BuilderPage.tsx home + "Your builds"
 * drawer: describe an app, pick a model, and the builder-api function writes
 * and hosts it. Each build opens in BuilderProjectScreen.
 */
import React, { useState } from "react";
import { Alert, KeyboardAvoidingView, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import ScreenHeader, { SCREEN_HEADER_HEIGHT } from "../components/ScreenHeader";
import Icon from "../components/ui/Icon";
import LiquidGlass from "../components/ui/LiquidGlass";
import { SectionLabel } from "../components/Settings/SettingsPrimitives";
import { BuildSphere, Composer, useBuilderModel, useStatusMeta } from "../components/Builder/BuilderParts";
import { useKeyboardOffset } from "../hooks/useKeyboardLayout";
import { useAuthActions, useUser } from "../context/AuthContext";
import { DIGITAL_PURCHASES_ENABLED } from "../config/storefront";
import { toastError, toastSuccess } from "../libs/toast";
import { ASSISTANT_ADDRESS, ASSISTANT_USERNAME } from "../libs/assistant";
import { ScreenNames } from "../navigation/ScreenNames";
import type { AppStackParamList } from "../navigation/types";
import {
  createBuilderProject,
  fetchBuilderAllowance,
  listBuilderProjects,
  removeBuilderProject,
  type BuilderProject,
} from "../services/builder.service";

export default function BuilderScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const keyboardOffset = useKeyboardOffset(SCREEN_HEADER_HEIGHT);
  const nav = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const queryClient = useQueryClient();
  const user = useUser();
  const { requireAuth } = useAuthActions();
  const wallet = user?.walletAddress || user?.address || null;
  const statusMeta = useStatusMeta();
  const [model, setModel] = useBuilderModel();
  const [prompt, setPrompt] = useState("");
  const [creating, setCreating] = useState(false);

  const allowanceQuery = useQuery({
    queryKey: ["builder-allowance", wallet],
    queryFn: async () => (await fetchBuilderAllowance(wallet)).allowance,
    enabled: !!wallet,
    staleTime: 60_000,
  });
  const projectsQuery = useQuery({
    queryKey: ["builder-projects", wallet],
    queryFn: async () => (await listBuilderProjects(wallet)).projects,
    enabled: !!wallet,
    staleTime: 15_000,
  });

  const openProject = (id: string) => nav.navigate(ScreenNames.BuilderProject, { id });

  const handleCreate = async () => {
    const request = prompt.trim();
    if (!request || creating || !wallet) return;
    setCreating(true);
    try {
      const res = await createBuilderProject(wallet, request, model);
      queryClient.setQueryData(["builder-allowance", wallet], res.allowance);
      setPrompt("");
      void queryClient.invalidateQueries({ queryKey: ["builder-projects"] });
      openProject(res.projectId);
    } catch (err) {
      toastError(err instanceof Error && err.message ? err.message : t("builder.createFailed"));
    } finally {
      setCreating(false);
    }
  };

  const confirmDelete = (p: BuilderProject) => {
    Alert.alert(t("builder.deleteBuild"), t("builder.deleteConfirm", { name: p.name }), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: async () => {
          try {
            await removeBuilderProject(wallet, p.id);
            void queryClient.invalidateQueries({ queryKey: ["builder-projects"] });
            toastSuccess(t("builder.deleted"));
          } catch (err) {
            toastError(err instanceof Error && err.message ? err.message : t("builder.deleteFailed"));
          }
        },
      },
    ]);
  };

  if (!wallet) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title={t("creator.toolBuilder")} />
        <View style={styles.center}>
          <Icon name="Sparkles" size={28} color="#f0b3ff" />
          <Text style={styles.signInText}>{t("builder.signIn")}</Text>
          <Pressable accessibilityRole="button" onPress={() => requireAuth(() => {})} style={styles.primary}>
            <Text style={styles.primaryText}>{t("common.signIn")}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const allowance = allowanceQuery.data;
  const buildsLeft = allowance ? Math.max(0, allowance.limit - allowance.used) : null;
  const projects = projectsQuery.data ?? [];

  const allowancePill = (
    <View style={styles.pill}>
      <Icon name="Sparkles" size={15} color="#f0b3ff" />
      <Text style={styles.pillText}>
        {buildsLeft === null ? "…" : t("builder.buildsLeft", { count: buildsLeft })}
        {allowance?.tierName ? <Text style={styles.dim}>{` · ${allowance.tierName}`}</Text> : null}
      </Text>
      {DIGITAL_PURCHASES_ENABLED && <Icon name="ArrowRight" size={15} color="#fff" />}
    </View>
  );

  return (
    <View style={styles.screen}>
      <ScreenHeader title={t("creator.toolBuilder")} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={keyboardOffset}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 32 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={projectsQuery.isRefetching}
              onRefresh={() => {
                void projectsQuery.refetch();
                void allowanceQuery.refetch();
              }}
              tintColor="#fff"
            />
          }
        >
          {/* Staking raises the allowance; the stake screen is a purchase surface, hidden on iOS. */}
          {DIGITAL_PURCHASES_ENABLED ? (
            <Pressable
              accessibilityRole="button"
              accessibilityHint={t("builder.stakeForAllowance")}
              onPress={() => nav.navigate(ScreenNames.Dpay, { initialTab: "stake" })}
              style={{ alignSelf: "center" }}
            >
              {allowancePill}
            </Pressable>
          ) : (
            <View style={{ alignSelf: "center" }}>{allowancePill}</View>
          )}

          <Text style={styles.greeting}>{t("builder.greeting")}</Text>

          <Composer
            value={prompt}
            onChange={setPrompt}
            onSend={handleCreate}
            placeholder={t("builder.composerPlaceholder")}
            sending={creating}
            model={model}
            onModel={setModel}
            big
          />

          {/* The same builds from a DM: @assistant runs them against this
              allowance and messages the link back when the app is live. */}
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              nav.navigate(ScreenNames.Chat, {
                targetAddress: ASSISTANT_ADDRESS,
                title: `@${ASSISTANT_USERNAME}`,
                targetUser: { username: ASSISTANT_USERNAME, address: ASSISTANT_ADDRESS },
              })
            }
            style={({ pressed }) => [styles.chatPill, pressed && { opacity: 0.7 }]}
          >
            <Icon name="MessageCircle" size={15} color="#e8e8ea" />
            <Text style={styles.chatPillText}>{t("builder.buildInChat")}</Text>
          </Pressable>

          <View style={{ marginTop: 28 }}>
            <SectionLabel label={t("builder.yourBuilds")} icon="Sparkles" />
            <LiquidGlass className="rounded-2xl">
              {projectsQuery.isError ? (
                <Text style={[styles.dim, styles.empty]}>{t("builder.loadFailed")}</Text>
              ) : projects.length === 0 ? (
                <Text style={[styles.dim, styles.empty]}>{projectsQuery.isLoading ? "…" : t("builder.noBuilds")}</Text>
              ) : (
                projects.map((p, i) => {
                  const s = statusMeta(p);
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => openProject(p.id)}
                      onLongPress={() => confirmDelete(p)}
                      accessibilityRole="button"
                      style={({ pressed }) => [styles.row, i > 0 && styles.rowBorder, pressed && { opacity: 0.7 }]}
                    >
                      <BuildSphere id={p.id} emoji={p.emoji} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text numberOfLines={1} style={styles.rowTitle}>
                          {p.name}
                        </Text>
                        <View style={styles.statusRow}>
                          <View style={[styles.dot, { backgroundColor: s.dot }]} />
                          <Text style={styles.dim}>{s.label}</Text>
                        </View>
                      </View>
                      <Pressable
                        onPress={() => confirmDelete(p)}
                        hitSlop={10}
                        accessibilityRole="button"
                        accessibilityLabel={t("builder.deleteBuild")}
                        style={{ padding: 6 }}
                      >
                        <Icon name="Trash2" size={16} color="#6b6b70" />
                      </Pressable>
                      <Icon name="ChevronRight" size={16} color="#5a5a5e" />
                    </Pressable>
                  );
                })
              )}
            </LiquidGlass>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24, gap: 14 },
  signInText: { color: "#fff", fontSize: 17, fontWeight: "600", textAlign: "center" },
  primary: { backgroundColor: "#fff", borderRadius: 999, paddingHorizontal: 22, paddingVertical: 12 },
  primaryText: { color: "#000", fontWeight: "700", fontSize: 15 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    backgroundColor: "rgba(20,20,22,0.9)",
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  pillText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  chatPill: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    backgroundColor: "rgba(20,20,22,0.6)",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chatPillText: { color: "#e8e8ea", fontSize: 14, fontWeight: "500" },
  greeting: { color: "#fff", fontSize: 30, fontWeight: "800", textAlign: "center", marginTop: 22, marginBottom: 18 },
  dim: { color: "#949499", fontSize: 13, fontWeight: "400" },
  empty: { padding: 18, textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.09)" },
  rowTitle: { color: "#fff", fontSize: 16, fontWeight: "700" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
