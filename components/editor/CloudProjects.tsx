import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useUser } from "../../context/AuthContext";
import Icon from "../ui/Icon";
import { DeHubLoader } from "../DeHubLoader";
import { nativeCloudProjectSession } from "../../libs/editor/cloudProjectDevice";
import { useCloudProjects } from "../../libs/editor/useCloudProjects";
import type { ProjectSnapshot } from "../../libs/editor/types";
import { appLocale } from "../../libs/date.util";
import { ProjectReviewPanel } from "./ProjectReviewPanel";

export function CloudProjects({ visible, onClose, current, onOpen, preserve, onSeek }: { visible: boolean; onClose(): void; current(): ProjectSnapshot | null; onOpen(snapshot: ProjectSnapshot): Promise<void> | void; preserve(): Promise<void>; onSeek?(seconds: number): void }) {
  const { t } = useTranslation(), user = useUser();
  const address = user?.walletAddress || user?.address;
  const [query, setQuery] = useState("");
  const cloud = useCloudProjects(address, nativeCloudProjectSession, { current, open: onOpen, preserve, seek: onSeek });
  useEffect(() => { if (visible && address) void cloud.refresh(); }, [visible, address]);
  useEffect(() => { setQuery(""); }, [address]);
  const matching = cloud.projects.filter(project => (project.title || t("creator.untitled")).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const matchingShared = cloud.sharedProjects.filter(project => (project.title || t("creator.untitled")).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const date = (value: string) => new Date(value).toLocaleString(appLocale());
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={() => { if (!cloud.busy) onClose(); }}>
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1 justify-end bg-black/60">
      <View className="rounded-t-3xl border border-white/10 bg-theme-neutrals-900 p-4" style={{ maxHeight: "85%", gap: 14 }}>
        <View className="flex-row items-center" style={{ gap: 10 }}>
          <Icon name="CloudUpload" size={22} color="#fff" />
          <Text className="flex-1 text-white font-semibold text-lg">{t("editor.cloud.title")}</Text>
          <Pressable disabled={cloud.busy} onPress={onClose} accessibilityRole="button" accessibilityLabel={t("common.close")} className="p-2"><Icon name="X" size={20} color="#fff" /></Pressable>
        </View>
        {!!current() && <View className="flex-row flex-wrap" style={{ gap: 8 }}>
          <Pressable disabled={cloud.busy || !cloud.available || cloud.linkPending} onPress={() => { void cloud.save(); }} accessibilityRole="button" className="flex-row items-center rounded-xl bg-white px-4 py-3" style={{ gap: 6, opacity: cloud.busy || !cloud.available ? 0.4 : 1 }}>
            <Icon name="CloudUpload" size={17} color="#000" /><Text className="text-black font-semibold">{t("common.save")}</Text>
          </Pressable>
          <Pressable disabled={cloud.busy || !cloud.available || cloud.linkPending} onPress={() => { void cloud.save(true); }} accessibilityRole="button" className="flex-row items-center rounded-xl border border-white/20 px-4 py-3" style={{ gap: 6, opacity: cloud.busy || !cloud.available ? 0.4 : 1 }}>
            <Icon name="Copy" size={17} color="#fff" /><Text className="text-white">{t("common.save")}{" · "}{t("common.copy")}</Text>
          </Pressable>
        </View>}
        {cloud.sharedOwner && <View className="rounded-xl border border-white/15 p-3" style={{gap:4}}><Text className="text-white">{t("editor.review.shared")}{" · "}{t("common.edit")}</Text><Text className="text-theme-neutrals-300 text-xs">{t("common.save")}{" → "}{cloud.sharedOwner}</Text><Text className="text-theme-neutrals-400 text-xs">{t("common.copy")}{" → "}{address?.toLowerCase()}</Text></View>}
        {cloud.mergeCopy && <View className="rounded-xl border border-white/15 p-3" style={{gap:8}}><Text className="text-white">{t("editor.review.title")}{" · "}{t("common.copy")}{" · "}{cloud.mergeCopy.revision}</Text><Pressable accessibilityRole="button" accessibilityLabel={`${t("common.edit")} · ${t("common.copy")}`} disabled={cloud.busy} onPress={()=>{void cloud.openMergeCopy();}} className="rounded-xl border border-white/15 px-3 py-2"><Text className="text-white">{t("common.edit")}{" · "}{t("common.copy")}</Text></Pressable></View>}
        {!cloud.available && <Text className="text-theme-neutrals-400">{t("common.signIn")}</Text>}
        {cloud.busy && <DeHubLoader size={32} />}
        {!!cloud.error && <Text accessibilityRole="alert" className="text-red-300">{cloud.error}</Text>}
        {cloud.saved && <Text className="text-white">{t("settings.streamKey.titleSaved")}</Text>}
        <View className="flex-row flex-wrap" style={{ gap: 8 }}>
          <Pressable disabled={cloud.busy || !cloud.available} onPress={() => { void cloud.switchView(false); }} accessibilityRole="button" accessibilityState={{ selected: !cloud.viewTrash && !cloud.viewShared }} className="rounded-xl px-4 py-2" style={{ backgroundColor: cloud.viewTrash || cloud.viewShared ? "transparent" : "rgba(255,255,255,0.1)", opacity: cloud.busy || !cloud.available ? 0.4 : 1 }}><Text className="text-white">{t("editor.app.yourDesigns")}</Text></Pressable>
          <Pressable disabled={cloud.busy || !cloud.available} onPress={() => { void cloud.switchShared(); }} accessibilityRole="button" accessibilityState={{ selected: cloud.viewShared }} className="rounded-xl px-4 py-2" style={{ backgroundColor: cloud.viewShared ? "rgba(255,255,255,0.1)" : "transparent", opacity: cloud.busy || !cloud.available ? 0.4 : 1 }}><Text className="text-white">{t("editor.review.shared")}</Text></Pressable>
          <Pressable disabled={cloud.busy || !cloud.available} onPress={() => { void cloud.switchView(true); }} accessibilityRole="button" accessibilityState={{ selected: cloud.viewTrash }} className="flex-row items-center rounded-xl px-4 py-2" style={{ gap: 6, backgroundColor: cloud.viewTrash ? "rgba(255,255,255,0.1)" : "transparent", opacity: cloud.busy || !cloud.available ? 0.4 : 1 }}><Icon name="Trash2" size={16} color="#fff" /><Text className="text-white">{t("editor.cloud.trash")}</Text></Pressable>
        </View>
        {!cloud.selected && !cloud.review && <TextInput value={query} onChangeText={setQuery} placeholder={t("common.search")} accessibilityLabel={t("common.search")} editable={cloud.available} autoCorrect={false} autoCapitalize="none" placeholderTextColor="rgba(255,255,255,0.5)" className="rounded-xl border border-white/15 px-3 py-3 text-white" style={{ backgroundColor: "rgba(255,255,255,0.05)", opacity: cloud.available ? 1 : 0.6 }} />}
        {!cloud.review && <View className="flex-row items-center justify-between">
          <Text className="text-white font-semibold">{cloud.selected ? t("accounts.history") : cloud.viewTrash ? t("editor.cloud.trash") : cloud.viewShared ? t("editor.review.shared") : t("editor.app.yourDesigns")}</Text>
          <Pressable disabled={cloud.busy || !cloud.available} onPress={() => { if (cloud.selected) cloud.clearHistory(); else void cloud.refresh(); }} accessibilityRole="button" accessibilityLabel={cloud.selected ? t("common.goBack") : t("dex.refresh")} className="p-2">
            <Icon name={cloud.selected ? "ChevronLeft" : "RefreshCw"} size={20} color="#fff" />
          </Pressable>
        </View>}
        <ScrollView keyboardShouldPersistTaps="handled" style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 10, paddingBottom: 24 }}>
          {cloud.review ? <ProjectReviewPanel cloud={cloud} wallet={address?.toLowerCase() || ""} /> : cloud.viewShared ? matchingShared.map(project => <View key={`${project.ownerWallet}:${project.projectId}`} className="rounded-xl border border-white/10 p-3" style={{ gap: 8 }}><Text className="text-white font-medium">{project.title || t("creator.untitled")}</Text><Text className="text-theme-neutrals-400 text-xs">{project.revision}{" · "}{project.role === "editor" ? t("common.edit") : project.role === "viewer" ? t("depin.viewer") : t("settings.comments")}</Text><View className="flex-row flex-wrap" style={{ gap: 8 }}>
              <Pressable accessibilityRole="button" disabled={cloud.busy} onPress={() => { if (project.accepted) void cloud.showReview(project); else void cloud.acceptReview(project); }} className="rounded-xl bg-white/10 p-3"><Text className="text-white">{project.accepted ? t("editor.review.title") : t("settings.accept")}</Text></Pressable>
              <Pressable accessibilityRole="button" disabled={cloud.busy} onPress={() => { void cloud.leaveReview(project); }} className="rounded-xl border border-white/10 p-3"><Text className="text-white">{project.accepted ? t("communities.leave") : t("settings.decline")}</Text></Pressable>
            </View></View>) : cloud.selected ? cloud.history.map(version => <View key={version.revision} className="rounded-xl border border-white/10 p-3" style={{ gap: 8 }}>
            <Text className="text-white">{version.revision}{" · "}{date(version.savedAt)}</Text>
            <Text className="text-theme-neutrals-400" numberOfLines={1}>{version.title}</Text>
            <View className="flex-row" style={{ gap: 10 }}>
              <Pressable disabled={cloud.busy} onPress={() => { void cloud.open(version.projectId, version.revision); }} accessibilityRole="button" className="flex-row items-center rounded-lg bg-white/10 p-3" style={{ gap: 6 }}><Icon name="Copy" size={16} color="#fff" /><Text className="text-white">{t("common.copy")}</Text></Pressable>
              <Pressable disabled={cloud.busy || version.revision === cloud.selected?.revision} onPress={() => { void cloud.restore(version.revision); }} accessibilityRole="button" className="flex-row items-center rounded-lg bg-white/10 p-3" style={{ gap: 6, opacity: version.revision === cloud.selected?.revision ? 0.4 : 1 }}><Icon name="RotateCcw" size={16} color="#fff" /><Text className="text-white">{t("editor.cloud.restore")}</Text></Pressable>
            </View>
          </View>) : matching.map(project => <View key={project.projectId} className="flex-row items-center rounded-xl border border-white/10 p-3" style={{ gap: 8 }}>
            <Pressable disabled={cloud.busy || cloud.viewTrash} onPress={() => { void cloud.open(project.projectId); }} accessibilityRole="button" className="flex-1">
              <Text className="text-white font-medium" numberOfLines={1}>{project.title || t("creator.untitled")}</Text><Text className="text-theme-neutrals-400 text-xs">{project.revision}{" · "}{date(project.savedAt)}</Text>
            </Pressable>
            {!cloud.viewTrash && <Pressable disabled={cloud.busy} accessibilityRole="button" accessibilityLabel={t("editor.review.title")} onPress={() => { void cloud.showReview({ ...project, ownerWallet: address?.toLowerCase() || "", role: "owner" }); }} className="p-2"><Icon name="MessageSquare" size={20} color="#fff" /></Pressable>}
            {!cloud.viewTrash && <Pressable disabled={cloud.busy} onPress={() => { void cloud.showHistory(project); }} accessibilityRole="button" accessibilityLabel={t("accounts.history")} className="p-2"><Icon name="History" size={20} color="#fff" /></Pressable>}
            <Pressable disabled={cloud.busy} onPress={() => { void cloud.setTrash(project, !cloud.viewTrash); }} accessibilityRole="button" accessibilityLabel={`${t(cloud.viewTrash ? "editor.cloud.restore" : "editor.cloud.trash")}: ${project.title}`} className="flex-row items-center p-2" style={{ gap: 6 }}><Icon name={cloud.viewTrash ? "RotateCcw" : "Trash2"} size={20} color="#fff" />{cloud.viewTrash && <Text className="text-white">{t("editor.cloud.restore")}</Text>}</Pressable>
          </View>)}
          {!cloud.review && !cloud.selected && !(cloud.viewShared ? matchingShared.length : matching.length) && cloud.available && !cloud.busy && !cloud.error && <Text className="text-theme-neutrals-400">{t("common.noResults")}</Text>}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}
