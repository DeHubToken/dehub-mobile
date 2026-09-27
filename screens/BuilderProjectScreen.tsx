/**
 * BuilderProjectScreen — one build's conversation.
 *
 * Native port of the CHAT view in dehubweb's pages/app/BuilderPage.tsx: the
 * build log, a card per shipped version (Files / Preview), follow-up prompts
 * and suggestion chips. Polls while the build is working, like web.
 */
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import ScreenHeader, { SCREEN_HEADER_HEIGHT } from "../components/ScreenHeader";
import Icon from "../components/ui/Icon";
import type { IconName } from "../components/ui/iconRegistry";
import LiquidGlass from "../components/ui/LiquidGlass";
import { Composer, useBuilderModel } from "../components/Builder/BuilderParts";
import { useKeyboardOffset } from "../hooks/useKeyboardLayout";
import { useUser } from "../context/AuthContext";
import { copyToClipboard } from "../libs/clipboard.utils";
import { openInApp } from "../libs/links.utils";
import { toastError, toastSuccess } from "../libs/toast";
import { ScreenNames } from "../navigation/ScreenNames";
import type { AppStackParamList } from "../navigation/types";
import {
  BUSY_STATUSES,
  builderShareUrl,
  getBuilderProject,
  removeBuilderProject,
  sendBuilderMessage,
  type BuilderMessage,
} from "../services/builder.service";

const CHIP_KEYS = ["builder.chipPolish", "builder.chipSearch", "builder.chipFeatures"] as const;

export default function BuilderProjectScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const keyboardOffset = useKeyboardOffset(SCREEN_HEADER_HEIGHT);
  const nav = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { params } = useRoute<RouteProp<AppStackParamList, ScreenNames.BuilderProject>>();
  const id = params.id;
  const queryClient = useQueryClient();
  const user = useUser();
  const wallet = user?.walletAddress || user?.address || null;
  const [model, setModel] = useBuilderModel();
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);
  const [openFile, setOpenFile] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const query = useQuery({
    queryKey: ["builder-project", id, wallet],
    queryFn: () => getBuilderProject(wallet, id),
    enabled: !!wallet,
    refetchInterval: (q) => {
      const status = q.state.data?.project?.status;
      return status && BUSY_STATUSES.has(status) ? 2500 : false;
    },
  });

  const project = query.data?.project;
  const messages = query.data?.messages ?? [];
  const files = query.data?.files ?? [];
  const busy = !!project && BUSY_STATUSES.has(project.status);
  const live = project?.status === "live";
  const liveVersion = live ? project!.version : 0;
  const shareUrl = builderShareUrl(id);

  useEffect(() => {
    if (liveVersion > 0) void queryClient.invalidateQueries({ queryKey: ["builder-projects"] });
  }, [liveVersion, queryClient]);

  useEffect(() => {
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(timer);
  }, [messages.length, busy]);

  const sendToProject = async (content: string) => {
    if (!content.trim() || sending || busy) return;
    setSending(true);
    try {
      const res = await sendBuilderMessage(wallet, id, content.trim(), model);
      queryClient.setQueryData(["builder-allowance", wallet], res.allowance);
      setInput("");
      await query.refetch();
    } catch (err) {
      toastError(err instanceof Error && err.message ? err.message : t("builder.sendFailed"));
    } finally {
      setSending(false);
    }
  };

  const copyLink = () => {
    copyToClipboard(shareUrl);
    toastSuccess(t("builder.linkCopied"));
  };
  const shareLink = () => {
    void Share.share({ message: project ? `${project.name}\n${shareUrl}` : shareUrl, url: shareUrl }).catch(() => {});
  };
  const openPreview = () => nav.navigate(ScreenNames.BuilderPreview, { id });

  const confirmDelete = () => {
    if (!project) return;
    Alert.alert(t("builder.deleteBuild"), t("builder.deleteConfirm", { name: project.name }), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: async () => {
          try {
            await removeBuilderProject(wallet, id);
            void queryClient.invalidateQueries({ queryKey: ["builder-projects"] });
            toastSuccess(t("builder.deleted"));
            nav.goBack();
          } catch (err) {
            toastError(err instanceof Error && err.message ? err.message : t("builder.deleteFailed"));
          }
        },
      },
    ]);
  };

  const actions: Array<{ key: string; icon: IconName; label: string; run: () => void; danger?: boolean }> = [
    { key: "copy", icon: "Link", label: t("creatorPacks.copyLink"), run: copyLink },
    { key: "share", icon: "Share2", label: t("postOptions.share"), run: shareLink },
    { key: "open", icon: "Compass", label: t("builder.openInBrowser"), run: () => void openInApp(shareUrl) },
    { key: "rebuild", icon: "RefreshCw", label: t("builder.rebuild"), run: () => void sendToProject(t("builder.rebuildPrompt")) },
    { key: "delete", icon: "Trash2", label: t("builder.deleteBuild"), run: confirmDelete, danger: true },
  ];

  const renderAgent = (m: BuilderMessage) => {
    if (m.content.startsWith("✅") && project) {
      const updated = /^✅ Updated/.test(m.content);
      const summary = m.content.replace(/^✅ [^!]*!\s*/, "");
      return (
        <View key={m.id} style={{ marginVertical: 12 }}>
          <View style={styles.builtCard}>
            <Text style={styles.builtTitle}>
              {updated ? t("builder.updated", { name: project.name }) : t("builder.built", { name: project.name })}
            </Text>
            <View style={styles.builtButtons}>
              <Pressable accessibilityRole="button" onPress={() => { setOpenFile(null); setFilesOpen(true); }} style={styles.cardButton}>
                <Text style={styles.cardButtonText}>{t("builder.files")}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={openPreview} style={styles.cardButton}>
                <Text style={styles.cardButtonText}>{t("builder.preview")}</Text>
              </Pressable>
            </View>
          </View>
          {!!summary && <Text style={styles.agentText}>{summary}</Text>}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("common.copy")}
            onPress={() => { copyToClipboard(summary || m.content); toastSuccess(t("toasts.copied")); }}
            hitSlop={10}
            style={{ marginTop: 8, alignSelf: "flex-start" }}
          >
            <Icon name="Copy" size={16} color="#949499" />
          </Pressable>
        </View>
      );
    }
    if (m.content.startsWith("❌")) {
      return (
        <View key={m.id} style={styles.errorCard}>
          <Text style={styles.errorTitle}>{t("builder.buildFailed")}</Text>
          <Text style={styles.dimText}>{m.content.replace(/^❌\s*/, "")}</Text>
          <Pressable
            accessibilityRole="button"
            disabled={busy || sending}
            onPress={() => void sendToProject(t("common.tryAgain"))}
            style={[styles.cardButton, { alignSelf: "flex-start", marginTop: 12, paddingHorizontal: 20 }, (busy || sending) && { opacity: 0.4 }]}
          >
            <Text style={styles.cardButtonText}>{t("common.tryAgain")}</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <Text key={m.id} selectable style={styles.agentText}>
        {m.content}
      </Text>
    );
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={project?.name ?? t("creator.toolBuilder")}
        rightContent={
          <Pressable
            onPress={openPreview}
            disabled={!live && files.length === 0}
            accessibilityRole="button"
            accessibilityLabel={t("builder.preview")}
            hitSlop={10}
            style={{ padding: 6, opacity: !live && files.length === 0 ? 0.35 : 1 }}
          >
            <Icon name="Play" size={20} color="#fff" />
          </Pressable>
        }
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={keyboardOffset}>
        <ScrollView ref={scrollRef} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12 }} keyboardShouldPersistTaps="handled">
          {query.isLoading && <ActivityIndicator color="#949499" style={{ marginTop: 40 }} />}
          {query.isError && <Text style={[styles.dimText, { marginTop: 40, textAlign: "center" }]}>{t("builder.loadFailed")}</Text>}
          {messages.map((m) => {
            if (m.role === "user") {
              return (
                <View key={m.id} style={styles.userBubble}>
                  <Text selectable style={styles.userText}>{m.content}</Text>
                </View>
              );
            }
            if (m.role === "agent") return renderAgent(m);
            return <Text key={m.id} style={[styles.dimText, { marginVertical: 6 }]}>{m.content}</Text>;
          })}
          {busy && (
            <View style={styles.busyRow}>
              <ActivityIndicator size="small" color="#3f7aff" />
              <Text style={styles.busyText}>{project?.status_detail || t("builder.working")}</Text>
            </View>
          )}
          {live && !busy && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginTop: 10 }}>
              {actions.map((a) => (
                <Pressable key={a.key} accessibilityRole="button" onPress={a.run} style={styles.actionChip}>
                  <Icon name={a.icon} size={15} color={a.danger ? "#f56161" : "#e8e8ea"} />
                  <Text style={[styles.actionText, a.danger && { color: "#f56161" }]}>{a.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </ScrollView>

        {live && !busy && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }} style={{ flexGrow: 0, marginBottom: 8 }}>
            {CHIP_KEYS.map((key) => (
              <Pressable key={key} accessibilityRole="button" onPress={() => void sendToProject(t(key))} style={styles.chip}>
                <Text style={styles.chipText}>{t(key)}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
        <View style={{ paddingHorizontal: 12, paddingBottom: insets.bottom + 8 }}>
          <Composer
            value={input}
            onChange={setInput}
            onSend={() => void sendToProject(input)}
            placeholder={busy ? t("builder.working") : t("builder.chatPlaceholder")}
            disabled={busy}
            sending={sending}
            model={model}
            onModel={setModel}
          />
        </View>
      </KeyboardAvoidingView>

      <Modal visible={filesOpen} animationType="slide" transparent onRequestClose={() => setFilesOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setFilesOpen(false)} accessibilityLabel={t("common.close")} />
        <LiquidGlass className="rounded-t-3xl" style={{ ...styles.sheet, paddingBottom: insets.bottom + 16 }}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle} numberOfLines={1}>
              {project ? `${project.name} · ${t("builder.files")}` : t("builder.files")}
            </Text>
            <Pressable onPress={() => setFilesOpen(false)} accessibilityRole="button" accessibilityLabel={t("common.close")} hitSlop={10}>
              <Icon name="X" size={20} color="#fff" />
            </Pressable>
          </View>
          <ScrollView style={{ maxHeight: 520 }}>
            <Pressable accessibilityRole="button" onPress={copyLink} style={styles.linkRow}>
              <Icon name="Link" size={16} color="#3f7aff" />
              <Text numberOfLines={1} style={[styles.dimText, { flex: 1 }]}>{shareUrl}</Text>
              <Text style={styles.cardButtonText}>{t("common.copy")}</Text>
            </Pressable>
            {files.length === 0 && <Text style={[styles.dimText, { textAlign: "center", padding: 16 }]}>{t("builder.noFiles")}</Text>}
            {files.map((f) => {
              const open = openFile === f.path;
              return (
                <View key={f.path}>
                  <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpenFile(open ? null : f.path)} style={styles.fileRow}>
                    <Icon name="FileText" size={18} color="#949499" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fileName}>{f.path}</Text>
                      <Text style={styles.dimText}>{t("builder.lineCount", { count: f.content.split("\n").length })}</Text>
                    </View>
                    <View style={{ transform: [{ rotate: open ? "90deg" : "0deg" }] }}>
                      <Icon name="ChevronRight" size={16} color="#5a5a5e" />
                    </View>
                  </Pressable>
                  {open && (
                    <ScrollView horizontal style={styles.code}>
                      <Text selectable style={styles.codeText}>{f.content}</Text>
                    </ScrollView>
                  )}
                </View>
              );
            })}
          </ScrollView>
        </LiquidGlass>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000" },
  userBubble: { alignSelf: "flex-end", maxWidth: "85%", backgroundColor: "#2c2c2e", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12, marginVertical: 8 },
  userText: { color: "#fff", fontSize: 16 },
  agentText: { color: "#e8e8ea", fontSize: 15, lineHeight: 22, marginVertical: 8 },
  dimText: { color: "#949499", fontSize: 13 },
  builtCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#3f7aff",
    backgroundColor: "rgba(10,12,20,0.9)",
    padding: 16,
    shadowColor: "#3f7aff",
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 6,
  },
  builtTitle: { color: "#fff", fontSize: 19, fontWeight: "700" },
  builtButtons: { flexDirection: "row", gap: 10, marginTop: 14 },
  cardButton: { flex: 1, backgroundColor: "#1c1c1e", borderRadius: 16, paddingVertical: 12, alignItems: "center" },
  cardButtonText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  errorCard: { borderRadius: 22, borderWidth: 1, borderColor: "rgba(245,97,97,0.5)", backgroundColor: "rgba(24,10,12,0.85)", padding: 16, marginVertical: 12 },
  errorTitle: { color: "#f56161", fontSize: 16, fontWeight: "700", marginBottom: 4 },
  busyRow: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 12 },
  busyText: { color: "#c9c9ce", fontSize: 15 },
  actionChip: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#1c1c1e", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  actionText: { color: "#e8e8ea", fontSize: 14, fontWeight: "500" },
  chip: { backgroundColor: "#1c1c1e", borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10 },
  chipText: { color: "#fff", fontSize: 14, fontWeight: "500" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: { paddingHorizontal: 16, paddingTop: 16 },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 12 },
  sheetTitle: { color: "#fff", fontSize: 18, fontWeight: "700", flex: 1 },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#1c1c1e", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8 },
  fileRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  fileName: { color: "#fff", fontSize: 15, fontWeight: "600", fontFamily: "monospace" },
  code: { backgroundColor: "#0a0a0c", borderRadius: 14, padding: 12, maxHeight: 320, marginBottom: 8 },
  codeText: { color: "#c9c9ce", fontSize: 11, fontFamily: "monospace" },
});
