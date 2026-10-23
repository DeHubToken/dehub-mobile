/**
 * Live Studio's subathon on a phone. The twin of dehubweb's SubathonPanel:
 * amounts each event adds, start, stop and ±5 minutes. The stream API holds the
 * end time and adds to it once per event.
 */
import React, { useEffect, useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { toastError, toastSuccess } from "../../libs";
import {
  addSubathonTime,
  saveMySubathon,
  startSubathon,
  stopSubathon,
  type MySubathon,
  type SubathonSettings,
} from "../../services/live.service";
import { clockOf } from "../LiveOverlay/subathon";
import { FIELD, Label } from "./WidgetSettingsForm";

const FIELDS: Array<{ key: keyof SubathonSettings; max: number }> = [
  { key: "secondsPerThousand", max: 600 },
  { key: "secondsPerFollow", max: 600 },
  { key: "secondsPerSubscribe", max: 3600 },
  { key: "capHours", max: 72 },
];

function Pill({ label, onPress, disabled, solid }: { label: string; onPress: () => void; disabled?: boolean; solid?: boolean }) {
  return (
    <TouchableOpacity
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      className={`px-3 py-2 rounded-xl ${solid ? "bg-white" : "border border-theme-neutrals-600"} ${disabled ? "opacity-40" : ""}`}
    >
      <Text className={`text-xs font-semibold ${solid ? "text-[#09090B]" : "text-white"}`}>{label}</Text>
    </TouchableOpacity>
  );
}

export function SubathonEditor({ subathon, onChange }: { subathon: MySubathon | null; onChange: (next: MySubathon) => void }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<SubathonSettings | null>(null);
  const [minutes, setMinutes] = useState(60);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (subathon && !draft) setDraft({ ...subathon });
  }, [subathon, draft]);
  const running = !!subathon?.running && !!subathon.endsAt && new Date(subathon.endsAt).getTime() > now;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  const settings = draft ?? subathon;
  const failed = () => toastError(t("liveStudio.subathon.failed"));
  const save = useMutation({
    mutationFn: () => saveMySubathon(settings!),
    onSuccess: (s) => {
      onChange(s);
      toastSuccess(t("liveStudio.subathon.saved"));
    },
    onError: failed,
  });
  const start = useMutation({ mutationFn: () => startSubathon(minutes, settings!), onSuccess: onChange, onError: failed });
  const stop = useMutation({ mutationFn: () => stopSubathon(), onSuccess: onChange, onError: failed });
  const add = useMutation({ mutationFn: (seconds: number) => addSubathonTime(seconds), onSuccess: onChange, onError: failed });
  if (!settings) return null;

  const left = running ? Math.max(0, Math.ceil((new Date(subathon!.endsAt!).getTime() - now) / 1000)) : 0;
  const numberIn = (raw: string, max: number) => Math.min(max, Math.max(0, Number(raw.replace(/[^0-9]/g, "")) || 0));

  return (
    <View className="gap-3">
      <Text className="text-theme-neutrals-500 text-xs">{t("liveStudio.subathon.intro")}</Text>
      {running ? (
        <View className="rounded-xl border border-theme-neutrals-700 p-3 gap-3">
          <Text className="text-white text-2xl font-bold">{clockOf(left)}</Text>
          <View className="flex-row flex-wrap gap-2">
            <Pill label={t("liveStudio.subathon.addFive")} disabled={add.isPending} onPress={() => add.mutate(300)} />
            <Pill label={t("liveStudio.subathon.removeFive")} disabled={add.isPending} onPress={() => add.mutate(-300)} />
            <Pill label={t("liveStudio.subathon.stop")} disabled={stop.isPending} onPress={() => stop.mutate()} />
          </View>
        </View>
      ) : null}
      {FIELDS.map(({ key, max }) => (
        <View key={key}>
          <Label>{t(`liveStudio.subathon.${key}`)}</Label>
          <TextInput
            className={FIELD}
            keyboardType="number-pad"
            value={String(settings[key])}
            onChangeText={(v) => setDraft({ ...settings, [key]: numberIn(v, max) })}
          />
        </View>
      ))}
      <View className="flex-row flex-wrap items-end gap-3">
        <Pill label={t("liveStudio.subathon.save")} disabled={save.isPending} onPress={() => save.mutate()} />
        {!running ? (
          <>
            <View>
              <Label>{t("liveStudio.subathon.startMinutes")}</Label>
              <TextInput
                className={`${FIELD} w-28`}
                keyboardType="number-pad"
                value={String(minutes)}
                onChangeText={(v) => setMinutes(Math.max(1, Number(v.replace(/[^0-9]/g, "")) || 1))}
              />
            </View>
            <Pill solid label={t("liveStudio.subathon.start")} disabled={start.isPending} onPress={() => start.mutate()} />
          </>
        ) : null}
      </View>
    </View>
  );
}
