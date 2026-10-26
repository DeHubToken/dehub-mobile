/**
 * Live Studio's multistream destinations: go live once on DeHub and the
 * broadcast is pushed to every platform switched on here. Same backend as the
 * web studio, so a destination added on either shows on both.
 *
 * Keys are sent once and stay on the server; a row only ever shows the last
 * four characters. The list refreshes every few seconds so each light follows
 * what the relay is actually doing.
 */
import React, { useState } from "react";
import { Linking, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Icon from "../ui/Icon";
import { SettingsOptionModal } from "../Settings/SettingsPrimitives";
import { toastError, toastSuccess } from "../../libs";
import {
  DESTINATION_PLATFORMS,
  DESTINATION_PRESETS,
  addDestination,
  listDestinations,
  removeDestination,
  updateDestination,
  type DestinationPlatform,
  type DestinationState,
  type StreamDestination,
} from "../../services/liveDestinations.service";

const QUERY_KEY = ["live-destinations"];
const FIELD = "rounded-xl border border-theme-neutrals-700 bg-theme-neutrals-900 px-3 h-10 text-white text-sm";

const DOT: Record<DestinationState, string> = {
  off: "bg-theme-neutrals-600",
  idle: "bg-theme-neutrals-500",
  connecting: "bg-amber-400",
  live: "bg-emerald-400",
  error: "bg-red-500",
};

function host(server: string): string {
  const m = server.match(/^[a-z]+:\/\/([^/]+)/i);
  return m ? m[1] : server;
}

export function DestinationsSection({ enabled }: { enabled: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: listDestinations,
    enabled,
    refetchInterval: 5_000,
  });

  const replace = (row: StreamDestination) =>
    queryClient.setQueryData<StreamDestination[]>(QUERY_KEY, (prev = []) => prev.map((r) => (r.id === row.id ? row : r)));

  const toggle = useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) => updateDestination(id, { enabled: on }),
    onSuccess: replace,
    onError: (e: Error) => toastError(e?.message || t("liveStudio.destinations.saveFailed")),
  });
  const remove = useMutation({
    mutationFn: removeDestination,
    onSuccess: (_, id) =>
      queryClient.setQueryData<StreamDestination[]>(QUERY_KEY, (prev = []) => prev.filter((r) => r.id !== id)),
    onError: (e: Error) => toastError(e?.message || t("liveStudio.destinations.saveFailed")),
  });

  return (
    <View className="gap-3">
      <Text className="text-theme-neutrals-400 text-xs">{t("liveStudio.destinations.intro")}</Text>

      {adding ? (
        <AddDestination
          onCancel={() => setAdding(false)}
          onAdded={(row) => {
            queryClient.setQueryData<StreamDestination[]>(QUERY_KEY, (prev = []) => [...prev, row]);
            setAdding(false);
          }}
        />
      ) : (
        <TouchableOpacity
          onPress={() => setAdding(true)}
          className="self-start flex-row items-center px-4 py-2.5 rounded-xl bg-theme-neutrals-700/60"
        >
          <Icon name="Plus" size={13} color="#fff" />
          <Text className="text-white text-sm font-medium ml-1.5">{t("liveStudio.destinations.add")}</Text>
        </TouchableOpacity>
      )}

      {isLoading ? null : rows.length === 0 ? (
        adding ? null : <Text className="text-theme-neutrals-500 text-sm">{t("liveStudio.destinations.empty")}</Text>
      ) : (
        rows.map((row) => (
          <View key={row.id} className="flex-row items-center gap-3 rounded-xl border border-theme-neutrals-700 px-3 py-2.5">
            <View className={`w-2.5 h-2.5 rounded-full ${DOT[row.state] ?? DOT.idle}`} />
            <View className="flex-1 min-w-0">
              <Text className="text-white text-sm" numberOfLines={1}>
                {row.label || DESTINATION_PRESETS[row.platform]?.name || row.platform}
                <Text className="text-theme-neutrals-500 text-xs">{"  " + t(`liveStudio.destinations.states.${row.state}`)}</Text>
              </Text>
              <Text className="text-theme-neutrals-500 text-xs" numberOfLines={1}>
                {host(row.server)} · {row.keyHint}
              </Text>
              {row.state === "error" && row.lastError ? (
                <Text className="text-red-400 text-xs">{row.lastError}</Text>
              ) : null}
            </View>
            <Switch
              value={row.enabled}
              onValueChange={(on) => toggle.mutate({ id: row.id, on })}
              accessibilityLabel={t("liveStudio.destinations.toggle")}
            />
            <TouchableOpacity onPress={() => remove.mutate(row.id)} accessibilityLabel={t("liveStudio.remove")} hitSlop={8}>
              <Icon name="Trash2" size={16} color="#a1a1aa" />
            </TouchableOpacity>
          </View>
        ))
      )}
    </View>
  );
}

function AddDestination({ onCancel, onAdded }: { onCancel: () => void; onAdded: (row: StreamDestination) => void }) {
  const { t } = useTranslation();
  const [platform, setPlatform] = useState<DestinationPlatform>("twitch");
  const [picking, setPicking] = useState(false);
  const [server, setServer] = useState(DESTINATION_PRESETS.twitch.server);
  const [streamKey, setStreamKey] = useState("");
  const [label, setLabel] = useState("");
  const preset = DESTINATION_PRESETS[platform];

  const save = useMutation({
    mutationFn: () => addDestination({ platform, server: server.trim(), streamKey: streamKey.trim(), label: label.trim() }),
    onSuccess: (row) => {
      toastSuccess(t("liveStudio.destinations.added", { name: preset.name }));
      onAdded(row);
    },
    onError: (e: Error) => toastError(e?.message || t("liveStudio.destinations.saveFailed")),
  });

  const ready = server.trim().length > 0 && streamKey.trim().length > 0;

  return (
    <View className="gap-2.5 rounded-xl border border-theme-neutrals-700 p-3">
      <Text className="text-theme-neutrals-400 text-xs">{t("liveStudio.destinations.platform")}</Text>
      <TouchableOpacity onPress={() => setPicking(true)} className={`${FIELD} flex-row items-center justify-between`}>
        <Text className="text-white text-sm">{preset.name}</Text>
        <Icon name="ChevronDown" size={14} color="#a1a1aa" />
      </TouchableOpacity>

      <Text className="text-theme-neutrals-400 text-xs">{t("liveStudio.destinations.label")}</Text>
      <TextInput className={FIELD} value={label} maxLength={60} placeholder={preset.name} placeholderTextColor="#71717a" onChangeText={setLabel} />

      <Text className="text-theme-neutrals-400 text-xs">{t("liveStudio.destinations.server")}</Text>
      <TextInput
        className={FIELD}
        value={server}
        placeholder="rtmp://…"
        placeholderTextColor="#71717a"
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={setServer}
      />

      <Text className="text-theme-neutrals-400 text-xs">{t("liveStudio.destinations.key")}</Text>
      <TextInput
        className={FIELD}
        value={streamKey}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={setStreamKey}
      />

      {preset.keyUrl ? (
        <TouchableOpacity onPress={() => void Linking.openURL(preset.keyUrl)} className="flex-row items-center">
          <Text className="text-theme-neutrals-400 text-xs mr-1">{t("liveStudio.destinations.findKey", { name: preset.name })}</Text>
          <Icon name="ExternalLink" size={11} color="#a1a1aa" />
        </TouchableOpacity>
      ) : (
        <Text className="text-theme-neutrals-500 text-xs">{t("liveStudio.destinations.customHint")}</Text>
      )}
      <Text className="text-theme-neutrals-500 text-xs">{t("liveStudio.destinations.keyNote")}</Text>

      <View className="flex-row justify-end gap-2">
        <TouchableOpacity onPress={onCancel} className="px-4 py-2 rounded-lg">
          <Text className="text-white text-sm">{t("liveStudio.destinations.cancel")}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          disabled={!ready || save.isPending}
          onPress={() => save.mutate()}
          className={`px-4 py-2 rounded-lg bg-white ${!ready || save.isPending ? "opacity-40" : ""}`}
        >
          <Text className="text-[#09090B] text-sm font-medium">
            {save.isPending ? t("liveStudio.saving") : t("liveStudio.destinations.save")}
          </Text>
        </TouchableOpacity>
      </View>

      <SettingsOptionModal
        visible={picking}
        onClose={() => setPicking(false)}
        title={t("liveStudio.destinations.platform")}
        value={platform}
        options={DESTINATION_PLATFORMS.map((p) => ({ value: p, label: DESTINATION_PRESETS[p].name }))}
        onSelect={(value) => {
          const next = value as DestinationPlatform;
          setPlatform(next);
          setServer(DESTINATION_PRESETS[next].server);
          setPicking(false);
        }}
      />
    </View>
  );
}
