import React, { useEffect } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useUser } from "../../context/AuthContext";
import Icon from "../ui/Icon";
import { DeHubLoader } from "../DeHubLoader";
import { nativeCloudProjectSession } from "../../libs/editor/cloudProjectDevice";
import { useCloudProjects } from "../../libs/editor/useCloudProjects";
import type { ProjectSnapshot } from "../../libs/editor/types";
import { appLocale } from "../../libs/date.util";

export function CloudProjects({ visible, onClose, current, onOpen, preserve }: { visible: boolean; onClose(): void; current(): ProjectSnapshot | null; onOpen(snapshot: ProjectSnapshot): Promise<void> | void; preserve(): Promise<void> }) {
  const { t } = useTranslation(), user = useUser();
  const address = user?.walletAddress || user?.address;
  const cloud = useCloudProjects(address, nativeCloudProjectSession, { current, open: onOpen, preserve });
  useEffect(() => { if (visible && address) void cloud.refresh(); }, [visible, address]);
  const date = (value: string) => new Date(value).toLocaleString(appLocale());
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={() => { if (!cloud.busy) onClose(); }}>
    <View className="flex-1 justify-end bg-black/60">
      <View className="rounded-t-3xl border border-white/10 bg-theme-neutrals-900 p-4" style={{ maxHeight: "85%", gap: 14 }}>
        <View className="flex-row items-center" style={{ gap: 10 }}>
          <Icon name="CloudUpload" size={22} color="#fff" />
          <Text className="flex-1 text-white font-semibold text-lg">{t("editor.cloud.title")}</Text>
          <Pressable disabled={cloud.busy} onPress={onClose} accessibilityRole="button" accessibilityLabel={t("common.close")} className="p-2"><Icon name="X" size={20} color="#fff" /></Pressable>
        </View>
        {!!current() && <View className="flex-row flex-wrap" style={{ gap: 8 }}>
          <Pressable disabled={cloud.busy || !cloud.available} onPress={() => { void cloud.save(); }} accessibilityRole="button" className="flex-row items-center rounded-xl bg-white px-4 py-3" style={{ gap: 6, opacity: cloud.busy || !cloud.available ? 0.4 : 1 }}>
            <Icon name="CloudUpload" size={17} color="#000" /><Text className="text-black font-semibold">{t("common.save")}</Text>
          </Pressable>
          <Pressable disabled={cloud.busy || !cloud.available} onPress={() => { void cloud.save(true); }} accessibilityRole="button" className="flex-row items-center rounded-xl border border-white/20 px-4 py-3" style={{ gap: 6, opacity: cloud.busy || !cloud.available ? 0.4 : 1 }}>
            <Icon name="Copy" size={17} color="#fff" /><Text className="text-white">{t("common.save")}{" · "}{t("common.copy")}</Text>
          </Pressable>
        </View>}
        {!cloud.available && <Text className="text-theme-neutrals-400">{t("common.signIn")}</Text>}
        {cloud.busy && <DeHubLoader size={32} />}
        {!!cloud.error && <Text accessibilityRole="alert" className="text-red-300">{cloud.error}</Text>}
        {cloud.saved && <Text className="text-white">{t("settings.streamKey.titleSaved")}</Text>}
        <View className="flex-row items-center justify-between">
          <Text className="text-white font-semibold">{cloud.selected ? t("accounts.history") : t("editor.app.yourDesigns")}</Text>
          <Pressable disabled={cloud.busy || !cloud.available} onPress={() => { if (cloud.selected) cloud.clearHistory(); else void cloud.refresh(); }} accessibilityRole="button" accessibilityLabel={cloud.selected ? t("common.goBack") : t("dex.refresh")} className="p-2">
            <Icon name={cloud.selected ? "ChevronLeft" : "RefreshCw"} size={20} color="#fff" />
          </Pressable>
        </View>
        <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 10, paddingBottom: 24 }}>
          {cloud.selected ? cloud.history.map(version => <View key={version.revision} className="rounded-xl border border-white/10 p-3" style={{ gap: 8 }}>
            <Text className="text-white">{version.revision}{" · "}{date(version.savedAt)}</Text>
            <Text className="text-theme-neutrals-400" numberOfLines={1}>{version.title}</Text>
            <View className="flex-row" style={{ gap: 10 }}>
              <Pressable disabled={cloud.busy} onPress={() => { void cloud.open(version.projectId, version.revision); }} accessibilityRole="button" className="flex-row items-center rounded-lg bg-white/10 p-3" style={{ gap: 6 }}><Icon name="Copy" size={16} color="#fff" /><Text className="text-white">{t("common.copy")}</Text></Pressable>
              <Pressable disabled={cloud.busy || version.revision === cloud.selected?.revision} onPress={() => { void cloud.restore(version.revision); }} accessibilityRole="button" className="flex-row items-center rounded-lg bg-white/10 p-3" style={{ gap: 6, opacity: version.revision === cloud.selected?.revision ? 0.4 : 1 }}><Icon name="RotateCcw" size={16} color="#fff" /><Text className="text-white">{t("editor.cloud.restore")}</Text></Pressable>
            </View>
          </View>) : cloud.projects.map(project => <View key={project.projectId} className="flex-row items-center rounded-xl border border-white/10 p-3" style={{ gap: 8 }}>
            <Pressable disabled={cloud.busy} onPress={() => { void cloud.open(project.projectId); }} accessibilityRole="button" className="flex-1">
              <Text className="text-white font-medium" numberOfLines={1}>{project.title || t("creator.untitled")}</Text><Text className="text-theme-neutrals-400 text-xs">{project.revision}{" · "}{date(project.savedAt)}</Text>
            </Pressable>
            <Pressable disabled={cloud.busy} onPress={() => { void cloud.showHistory(project); }} accessibilityRole="button" accessibilityLabel={t("accounts.history")} className="p-2"><Icon name="History" size={20} color="#fff" /></Pressable>
          </View>)}
        </ScrollView>
      </View>
    </View>
  </Modal>;
}
