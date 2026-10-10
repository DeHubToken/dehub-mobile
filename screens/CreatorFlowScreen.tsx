import { useSurfaceDraft } from '../hooks/useSurfaceDraft';
/**
 * CreatorFlowScreen — /creator/flow
 * =================================
 * The flows on your account, from the same creator-flows store web's canvas
 * syncs to. Each one opens as a readable list of its nodes; from here a flow
 * can be shared, made private, renamed or deleted.
 *
 * Building and running flows stays on the web canvas: it is a node editor
 * made for a pointer, and running one is a paid generation, which the App
 * Store build leaves out (config/storefront) — so the canvas link is hidden
 * there too.
 */
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import ScreenHeader from "../components/ScreenHeader";
import Icon, { type IconName } from "../components/ui/Icon";
import ConfirmModal from "../components/common/ConfirmModal";
import { useUser } from "../context/AuthContext";
import { ScreenNames } from "../navigation/ScreenNames";
import type { AppStackParamList } from "../navigation/types";
import { ShareLinks } from "../navigation/linking.config";
import { DIGITAL_PURCHASES_ENABLED } from "../config/storefront";
import env from "../config/env";
import { openInApp } from "../libs/links.utils";
import { appLocale } from "../libs/date.util";
import { toastError, toastSuccess } from "../libs";
import {
  listFlows,
  publishFlow,
  removeFlow,
  renamedFlow,
  saveFlows,
  type RemoteFlow,
} from "../services/creator-flows.service";

type Nav = NativeStackNavigationProp<AppStackParamList>;

function nodeCount(row: RemoteFlow) {
  return (row.data?.nodes ?? []).filter((n) => n.type !== "groupNode").length;
}

function savedDate(row: RemoteFlow) {
  const at = row.data?.updatedAt ?? Date.parse(row.updatedAt);
  return Number.isFinite(at) ? new Date(at).toLocaleDateString(appLocale(), { day: "numeric", month: "short", year: "numeric" }) : "";
}

export default function CreatorFlowScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const qc = useQueryClient();
  const user = useUser();
  const wallet = (user?.walletAddress || user?.address || "").toLowerCase() || null;

  const queryKey = ["creator-flows", wallet] as const;
  const flows = useQuery({
    queryKey,
    queryFn: () => listFlows(wallet!),
    enabled: !!wallet,
  });

  const [menuFor, setMenuFor] = useState<RemoteFlow | null>(null);
  const [renaming, setRenaming] = useState<RemoteFlow | null>(null);
  const [newName, setNewName] = useSurfaceDraft("screens/CreatorFlowScreen.tsx:newName", "");
  const [deleting, setDeleting] = useState<RemoteFlow | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: ["creator-flows"] }), [qc]);

  const run = useCallback(
    async (work: () => Promise<void>, failKey: string) => {
      if (!wallet) return;
      setBusy(true);
      try {
        await work();
        await refresh();
      } catch {
        toastError(t(failKey));
      } finally {
        setBusy(false);
      }
    },
    [wallet, refresh, t],
  );

  const share = useCallback(
    (row: RemoteFlow) =>
      run(async () => {
        if (!row.isPublic) await publishFlow(wallet!, row.id, true);
        const url = ShareLinks.creatorFlow(row.id);
        void Share.share({ message: `${row.name}\n${url}`, url }).catch(() => {});
      }, "creatorFlow.shareFailed"),
    [run, wallet],
  );

  const setPublic = useCallback(
    (row: RemoteFlow, isPublic: boolean) =>
      run(async () => {
        await publishFlow(wallet!, row.id, isPublic);
        toastSuccess(isPublic ? t("creatorFlow.nowPublic") : t("creatorFlow.nowPrivate"));
      }, "creatorFlow.shareFailed"),
    [run, wallet, t],
  );

  const saveName = useCallback(() => {
    const row = renaming;
    const name = newName.trim();
    setRenaming(null);
    if (!row || !name || name === row.name) return;
    void run(async () => {
      await saveFlows(wallet!, [renamedFlow(row, name)]);
    }, "creatorFlow.syncError");
  }, [renaming, newName, run, wallet]);

  const confirmDelete = useCallback(() => {
    const row = deleting;
    setDeleting(null);
    if (!row) return;
    void run(async () => {
      await removeFlow(wallet!, row.id);
    }, "creatorFlow.deleteFailed");
  }, [deleting, run, wallet]);

  const menuItems: Array<{ key: string; icon: IconName; label: string; onPress: (row: RemoteFlow) => void }> = [
    { key: "share", icon: "Share2", label: t("creatorFlow.shareFlow"), onPress: (row) => void share(row) },
    {
      key: "visibility",
      icon: menuFor?.isPublic ? "Lock" : "Globe",
      label: menuFor?.isPublic ? t("creatorFlow.makePrivate") : t("creatorFlow.makePublic"),
      onPress: (row) => void setPublic(row, !row.isPublic),
    },
    {
      key: "rename",
      icon: "Pencil",
      label: t("creatorFlow.rename"),
      onPress: (row) => {
        setNewName(row.name);
        setRenaming(row);
      },
    },
    { key: "delete", icon: "Trash2", label: t("creatorFlow.delete"), onPress: (row) => setDeleting(row) },
  ];

  const canvasButton = DIGITAL_PURCHASES_ENABLED ? (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={t("creatorFlow.openCanvas")}
      onPress={() => void openInApp(`${env.APP_ORIGIN}/creator/flow`)}
      hitSlop={10}
      style={styles.headerBtn}
    >
      <Icon name="ExternalLink" size={20} color="#FFFFFF" />
    </Pressable>
  ) : undefined;

  return (
    <View style={styles.root}>
      <ScreenHeader title={t("creatorFlow.title")} rightContent={canvasButton} />

      {!wallet ? (
        <View style={styles.center}>
          <Text style={styles.body}>{t("creatorFlow.signInToSee")}</Text>
          <Pressable accessibilityRole="button" style={styles.primaryBtn} onPress={() => navigation.navigate(ScreenNames.SignIn)}>
            <Text style={styles.primaryText}>{t("creatorFlow.signIn")}</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={flows.data ?? []}
          keyExtractor={(row) => row.id}
          refreshing={flows.isRefetching}
          onRefresh={() => void flows.refetch()}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: insets.bottom + 32 }}
          ListHeaderComponent={
            <View style={{ marginBottom: 6, gap: 12 }}>
              <Text style={styles.body}>{DIGITAL_PURCHASES_ENABLED ? t("creatorFlow.mobileIntro") : t("creatorFlow.mobileIntroReadOnly")}</Text>
              {DIGITAL_PURCHASES_ENABLED && (
                <Pressable
                  accessibilityRole="link"
                  style={styles.secondaryBtn}
                  onPress={() => void openInApp(`${env.APP_ORIGIN}/creator/flow`)}
                >
                  <Icon name="Plus" size={16} color="#FFFFFF" />
                  <Text style={styles.secondaryText}>{t("creatorFlow.newFlowOnCanvas")}</Text>
                </Pressable>
              )}
            </View>
          }
          ListEmptyComponent={
            flows.isLoading ? (
              <ActivityIndicator color="#A1A1AA" style={{ marginTop: 24 }} />
            ) : flows.isError ? (
              <Text style={styles.muted}>{t("creatorFlow.loadFailed")}</Text>
            ) : (
              <Text style={styles.muted}>{t("creatorFlow.noFlows")}</Text>
            )
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              onPress={() => navigation.navigate(ScreenNames.CreatorFlowView, { id: item.id, flow: item })}
              style={styles.row}
            >
              <View style={styles.rowIcon}>
                <Icon name="Network" size={18} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {item.name || t("creator.untitled")}
                </Text>
                <Text style={styles.rowMeta} numberOfLines={1}>
                  {t("creatorFlow.nodeCount", { count: nodeCount(item) })}
                  {savedDate(item) ? ` · ${savedDate(item)}` : ""}
                </Text>
              </View>
              {item.isPublic && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{t("creatorFlow.public")}</Text>
                </View>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("creatorFlow.flowOptions")}
                onPress={() => setMenuFor(item)}
                hitSlop={10}
                style={styles.menuBtn}
              >
                <Icon name="EllipsisVertical" size={18} color="#A1A1AA" />
              </Pressable>
            </Pressable>
          )}
        />
      )}

      {busy && (
        <View style={styles.busy} pointerEvents="none">
          <ActivityIndicator color="#FFFFFF" />
        </View>
      )}

      {/* Options sheet */}
      <Modal visible={!!menuFor} transparent animationType="slide" onRequestClose={() => setMenuFor(null)}>
        <Pressable style={styles.backdrop} onPress={() => setMenuFor(null)} accessibilityLabel={t("creatorFlow.close")} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <Text style={styles.sheetTitle} numberOfLines={1}>
            {menuFor?.name}
          </Text>
          {menuItems.map((item) => (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              style={styles.sheetRow}
              onPress={() => {
                const row = menuFor;
                setMenuFor(null);
                if (row) item.onPress(row);
              }}
            >
              <Icon name={item.icon} size={18} color="#FFFFFF" />
              <Text style={styles.sheetRowText}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      </Modal>

      {/* Rename */}
      <Modal visible={!!renaming} transparent animationType="fade" onRequestClose={() => setRenaming(null)}>
        <View style={styles.dialogWrap}>
          <View style={styles.dialog}>
            <Text style={styles.sheetTitle}>{t("creatorFlow.rename")}</Text>
            <TextInput
              value={newName}
              onChangeText={setNewName}
              autoFocus
              maxLength={120}
              accessibilityLabel={t("creatorFlow.flowName")}
              placeholder={t("creatorFlow.flowName")}
              placeholderTextColor="#52525B"
              style={styles.input}
              onSubmitEditing={saveName}
              returnKeyType="done"
            />
            <View style={styles.dialogActions}>
              <Pressable accessibilityRole="button" onPress={() => setRenaming(null)} style={styles.ghostBtn}>
                <Text style={styles.secondaryText}>{t("creatorFlow.cancel")}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={saveName} style={styles.primaryBtnSmall}>
                <Text style={styles.primaryText}>{t("creatorFlow.save")}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <ConfirmModal
        visible={!!deleting}
        title={t("creatorFlow.delete")}
        description={deleting ? t("creatorFlow.deleteFlowConfirm", { name: deleting.name }) : undefined}
        confirmText={t("creatorFlow.delete")}
        cancelText={t("creatorFlow.cancel")}
        confirmKind="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#010305" },
  headerBtn: { padding: 6 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 16 },
  body: { color: "#A1A1AA", fontSize: 14, lineHeight: 21 },
  muted: { color: "#71717A", fontSize: 14, textAlign: "center", marginTop: 24 },
  primaryBtn: { borderRadius: 12, backgroundColor: "#FFFFFF", paddingHorizontal: 24, paddingVertical: 12 },
  primaryBtnSmall: { borderRadius: 10, backgroundColor: "#FFFFFF", paddingHorizontal: 18, paddingVertical: 10 },
  primaryText: { color: "#000000", fontSize: 14, fontWeight: "700" },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  secondaryText: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  ghostBtn: { paddingHorizontal: 14, paddingVertical: 10 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 12,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  rowTitle: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
  rowMeta: { color: "#71717A", fontSize: 12, marginTop: 2 },
  badge: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.20)",
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: { color: "#E4E4E7", fontSize: 11, fontWeight: "600" },
  menuBtn: { padding: 4 },
  busy: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.3)" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: {
    backgroundColor: "#0B0C0E",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    paddingTop: 16,
  },
  sheetTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "600", paddingHorizontal: 20, marginBottom: 8 },
  sheetRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 20, paddingVertical: 14 },
  sheetRowText: { color: "#FFFFFF", fontSize: 15 },
  dialogWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: 24 },
  dialog: {
    borderRadius: 18,
    backgroundColor: "#0B0C0E",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    paddingVertical: 16,
    gap: 12,
  },
  input: {
    marginHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#FFFFFF",
    fontSize: 15,
  },
  dialogActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, paddingHorizontal: 16 },
});
