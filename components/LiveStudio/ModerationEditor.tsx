/**
 * Live Studio's chat moderation on a phone. The twin of dehubweb's
 * ModerationPanel: the rules for the chat under every one of the creator's
 * streams, their moderators, who they banned, and what happened. Never the
 * platform's main chat.
 */
import React, { useEffect, useState } from "react";
import { Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Icon from "../ui/Icon";
import { toastError, toastSuccess } from "../../libs";
import { getAccount } from "../../services/user.service";
import {
  addStreamModerator,
  getMyStreamModeration,
  removeStreamModerator,
  saveMyStreamModeration,
  unbanFromStreams,
  type MyStreamModeration,
  type StreamModerationPerson,
  type StreamModerationSettings,
} from "../../services/livechat.service";
import { Chips, FIELD, Label } from "./WidgetSettingsForm";

export const myModerationKey = ["my-stream-moderation"] as const;

const SLOW_MODE_CHOICES = [0, 5, 10, 30, 60, 120, 300];

const nameOf = (p: StreamModerationPerson) => p.displayName || p.username || `${p.address.slice(0, 6)}…${p.address.slice(-4)}`;

function Row({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View className="flex-row items-center justify-between gap-4">
      <View className="flex-1">
        <Text className="text-white text-sm font-medium">{label}</Text>
        {hint ? <Text className="text-theme-neutrals-500 text-xs mt-1">{hint}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

export function ModerationEditor() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery<MyStreamModeration>({
    queryKey: myModerationKey,
    queryFn: getMyStreamModeration,
    staleTime: 15_000,
  });
  const [settings, setSettings] = useState<StreamModerationSettings | null>(null);
  const [words, setWords] = useState("");
  const [dirty, setDirty] = useState(false);
  const [newModerator, setNewModerator] = useState("");

  useEffect(() => {
    if (!data || dirty) return;
    setSettings(data.settings);
    setWords(data.settings.bannedWords.join(", "));
  }, [data, dirty]);

  const apply = (next: MyStreamModeration) => queryClient.setQueryData(myModerationKey, next);
  const change = (patch: Partial<StreamModerationSettings>) => {
    setSettings((s) => (s ? { ...s, ...patch } : s));
    setDirty(true);
  };

  const save = useMutation({
    mutationFn: () =>
      saveMyStreamModeration({
        ...settings!,
        bannedWords: words.split(",").map((w) => w.trim().toLowerCase()).filter(Boolean).slice(0, 200),
      }),
    onSuccess: (saved) => {
      apply(saved);
      setDirty(false);
      toastSuccess(t("liveStudio.moderation.saved"));
    },
    onError: () => toastError(t("liveStudio.moderation.saveFailed")),
  });

  const addMod = useMutation({
    mutationFn: async () => {
      const res: any = await getAccount(newModerator.trim().replace(/^@/, ""));
      const account = res?.result ?? res?.data ?? res;
      const address = account?.address;
      if (!address) throw new Error("not found");
      return addStreamModerator(address);
    },
    onSuccess: (saved) => {
      apply(saved);
      setNewModerator("");
      toastSuccess(t("liveStudio.moderation.moderatorAdded"));
    },
    onError: () => toastError(t("liveStudio.moderation.moderatorNotFound")),
  });

  const removeMod = useMutation({
    mutationFn: (address: string) => removeStreamModerator(address),
    onSuccess: apply,
    onError: () => toastError(t("liveStudio.moderation.saveFailed")),
  });

  const unban = useMutation({
    mutationFn: (address: string) => unbanFromStreams(address),
    onSuccess: apply,
    onError: () => toastError(t("liveStudio.moderation.saveFailed")),
  });

  if (isLoading) return null;
  if (isError || !data || !settings) {
    return <Text className="text-theme-neutrals-400 text-sm">{t("liveStudio.moderation.loadFailed")}</Text>;
  }

  const people = new Map([...data.moderators, ...data.banned].map((p) => [p.address, p]));
  const who = (address: string) => {
    const p = people.get(address);
    return p ? nameOf(p) : `${address.slice(0, 6)}…${address.slice(-4)}`;
  };

  return (
    <View className="gap-4">
      <Text className="text-theme-neutrals-500 text-xs">{t("liveStudio.moderation.intro")}</Text>

      <View>
        <Label>{t("liveStudio.moderation.slowMode")}</Label>
        <Chips
          value={String(settings.slowModeSeconds)}
          options={SLOW_MODE_CHOICES.map((s) => ({
            value: String(s),
            label: s === 0 ? t("liveStudio.moderation.off") : t("liveStudio.moderation.seconds", { count: s }),
          }))}
          onChange={(v) => change({ slowModeSeconds: Number(v) })}
        />
        <Text className="text-theme-neutrals-500 text-xs mt-1.5">{t("liveStudio.moderation.slowModeHint")}</Text>
      </View>
      <Row label={t("liveStudio.moderation.followersOnly")} value={settings.followersOnly} onChange={(v) => change({ followersOnly: v })} />
      <Row
        label={t("liveStudio.moderation.subscribersOnly")}
        hint={t("liveStudio.moderation.subscribersOnlyHint")}
        value={settings.subscribersOnly}
        onChange={(v) => change({ subscribersOnly: v })}
      />
      <View>
        <Label>{t("liveStudio.moderation.bannedWords")}</Label>
        <TextInput
          className="rounded-xl border border-theme-neutrals-700 bg-theme-neutrals-800 px-3 py-2 text-white text-sm"
          multiline
          autoCapitalize="none"
          value={words}
          onChangeText={(v) => {
            setWords(v);
            setDirty(true);
          }}
          style={{ minHeight: 72, textAlignVertical: "top" }}
        />
        <Text className="text-theme-neutrals-500 text-xs mt-1.5">{t("liveStudio.moderation.bannedWordsHint")}</Text>
      </View>
      <View>
        <Label>{t("liveStudio.moderation.wordAction")}</Label>
        <Chips
          value={settings.wordAction}
          options={[
            { value: "block", label: t("liveStudio.moderation.wordBlock") },
            { value: "timeout", label: t("liveStudio.moderation.wordTimeout") },
          ]}
          onChange={(v) => change({ wordAction: v === "timeout" ? "timeout" : "block" })}
        />
      </View>
      <View className="flex-row items-center justify-end gap-3">
        {dirty ? <Text className="text-theme-neutrals-400 text-xs">{t("liveStudio.unsaved")}</Text> : null}
        <TouchableOpacity
          disabled={!dirty || save.isPending}
          onPress={() => save.mutate()}
          className={`px-4 h-9 rounded-xl bg-white items-center justify-center ${!dirty || save.isPending ? "opacity-40" : ""}`}
        >
          <Text className="text-black text-xs font-semibold">{save.isPending ? t("liveStudio.saving") : t("liveStudio.moderation.save")}</Text>
        </TouchableOpacity>
      </View>

      <View className="gap-2">
        <Label>{t("liveStudio.moderation.moderators")}</Label>
        <Text className="text-theme-neutrals-500 text-xs">{t("liveStudio.moderation.moderatorsHint")}</Text>
        <View className="flex-row gap-2">
          <TextInput
            className={`${FIELD} flex-1`}
            autoCapitalize="none"
            placeholder={t("liveStudio.moderation.usernamePlaceholder")}
            placeholderTextColor="#71717a"
            value={newModerator}
            onChangeText={setNewModerator}
            onSubmitEditing={() => newModerator.trim() && addMod.mutate()}
          />
          <TouchableOpacity
            disabled={!newModerator.trim() || addMod.isPending}
            onPress={() => addMod.mutate()}
            className={`px-3 h-10 rounded-xl bg-theme-neutrals-700/60 items-center justify-center ${!newModerator.trim() ? "opacity-40" : ""}`}
          >
            <Text className="text-white text-xs font-medium">{t("liveStudio.moderation.addModerator")}</Text>
          </TouchableOpacity>
        </View>
        <People people={data.moderators} empty={t("liveStudio.moderation.noModerators")} actionLabel={t("liveStudio.moderation.removeModerator")} onAction={(a) => removeMod.mutate(a)} />
      </View>

      <View className="gap-2">
        <Label>{t("liveStudio.moderation.banned")}</Label>
        <People people={data.banned} empty={t("liveStudio.moderation.noBans")} actionLabel={t("liveStudio.moderation.unban")} onAction={(a) => unban.mutate(a)} />
      </View>

      <View className="gap-1">
        <Label>{t("liveStudio.moderation.log")}</Label>
        {data.log.length === 0 ? (
          <Text className="text-theme-neutrals-500 text-sm">{t("liveStudio.moderation.noLog")}</Text>
        ) : (
          data.log.slice(0, 30).map((entry, i) => (
            <Text key={i} className="text-theme-neutrals-300 text-xs">
              <Text className="text-theme-neutrals-500">{new Date(entry.at).toLocaleString()} </Text>
              {t(`liveStudio.moderation.actions.${entry.action}`, {
                target: who(entry.target),
                actor: who(entry.actor),
                count: entry.seconds ?? 0,
                word: entry.word ?? "",
              })}
            </Text>
          ))
        )}
      </View>
    </View>
  );
}

function People({
  people,
  empty,
  actionLabel,
  onAction,
}: {
  people: StreamModerationPerson[];
  empty: string;
  actionLabel: string;
  onAction: (address: string) => void;
}) {
  if (!people.length) return <Text className="text-theme-neutrals-500 text-sm">{empty}</Text>;
  return (
    <View className="gap-1">
      {people.map((p) => (
        <View key={p.address} className="flex-row items-center justify-between gap-2 rounded-lg px-2 py-1">
          <Text className="flex-1 text-white text-sm" numberOfLines={1}>
            {nameOf(p)}
          </Text>
          <TouchableOpacity onPress={() => onAction(p.address)} accessibilityLabel={actionLabel} className="p-1">
            <Icon name="Trash2" size={16} color="#a1a1aa" />
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}
