/**
 * Live Studio's polls on a phone: ask the room a question while live. The twin
 * of dehubweb's PollPanel — same limits, same durations.
 *
 * Runs on the stream API, on the stream the creator is broadcasting right now.
 * Viewers answer with a button in the app or `!vote 2` in chat.
 */
import React, { useEffect, useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import Icon from "../ui/Icon";
import { toastError, toastSuccess } from "../../libs";
import { closePoll, startPoll } from "../../services/live.service";
import {
  isPollOpen,
  POLL_DURATIONS,
  POLL_MAX_OPTIONS,
  POLL_MIN_OPTIONS,
  POLL_OPTION_MAX,
  POLL_QUESTION_MAX,
  pollShares,
  type LivePoll,
} from "../../libs/live-overlay/polls";
import { Chips, FIELD, Label } from "./WidgetSettingsForm";

interface Props {
  poll: LivePoll | null;
  onPoll: (poll: LivePoll | null) => void;
}

export function PollEditor({ poll, onPoll }: Props) {
  const { t } = useTranslation();
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [duration, setDuration] = useState<number>(120);
  const [now, setNow] = useState(() => Date.now());

  const open = !!poll && isPollOpen(poll, now);
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [open]);

  const filled = options.map((o) => o.trim()).filter(Boolean);
  const distinct = new Set(filled.map((o) => o.toLowerCase())).size === filled.length;
  const canStart = !!question.trim() && filled.length >= POLL_MIN_OPTIONS && distinct;

  const start = useMutation({
    mutationFn: () => startPoll({ question: question.trim(), options: filled, durationSec: duration }),
    onSuccess: (started) => {
      onPoll(started);
      setNow(Date.now());
      toastSuccess(t("liveStudio.polls.started"));
    },
    // The draft is checked here first, so the API refusing it means the creator is not on air.
    onError: (err) => toastError((err as { status?: number })?.status === 400 ? t("liveStudio.polls.notLive") : t("liveStudio.polls.startFailed")),
  });
  const end = useMutation({
    mutationFn: () => closePoll(),
    onSuccess: (closed) => onPoll(closed),
    onError: () => toastError(t("liveStudio.polls.closeFailed")),
  });

  const secondsLeft = poll ? Math.max(0, Math.ceil((new Date(poll.endsAt).getTime() - now) / 1000)) : 0;
  // The list never leaves these bounds, so "not at the bound" is the test.
  const canRemove = options.length !== POLL_MIN_OPTIONS;
  const canAdd = options.length !== POLL_MAX_OPTIONS;
  const shares = poll ? pollShares(poll) : [];

  return (
    <View className="gap-3">
      <Text className="text-theme-neutrals-500 text-xs">{t("liveStudio.polls.intro", { command: "!vote" })}</Text>

      {poll ? (
        <View className="rounded-xl border border-theme-neutrals-700 p-3 gap-2">
          <View className="flex-row items-center justify-between gap-3">
            <Text className="text-white text-sm font-medium flex-1" numberOfLines={1}>
              {poll.question}
            </Text>
            <Text className="text-theme-neutrals-400 text-xs">
              {open
                ? t("liveStudio.polls.live", { time: `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}` })
                : t("liveStudio.polls.ended")}
            </Text>
          </View>
          {poll.options.map((option, i) => (
            <View key={i} className="rounded-lg bg-theme-neutrals-800 overflow-hidden">
              <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${shares[i]}%` as `${number}%`, backgroundColor: "rgba(255,255,255,0.15)" }} />
              <View className="flex-row justify-between gap-3 px-2.5 py-1.5">
                <Text className="text-white text-sm flex-1" numberOfLines={1}>
                  {i + 1}. {option.text}
                </Text>
                <Text className="text-theme-neutrals-300 text-xs">
                  {t("liveStudio.polls.votes", { count: option.votes })} · {shares[i]}%
                </Text>
              </View>
            </View>
          ))}
          <View className="flex-row items-center justify-between">
            <Text className="text-theme-neutrals-500 text-xs">{t("liveStudio.polls.votes", { count: poll.total })}</Text>
            {open ? (
              <TouchableOpacity
                disabled={end.isPending}
                onPress={() => end.mutate()}
                className="px-3 py-1.5 rounded-lg border border-theme-neutrals-600"
                accessibilityRole="button"
              >
                <Text className="text-white text-xs font-medium">{t("liveStudio.polls.end")}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ) : null}

      <View>
        <Label>{t("liveStudio.polls.question")}</Label>
        <TextInput
          value={question}
          onChangeText={setQuestion}
          maxLength={POLL_QUESTION_MAX}
          placeholder={t("liveStudio.polls.questionPlaceholder")}
          placeholderTextColor="#71717a"
          className={FIELD}
        />
      </View>
      {options.map((option, i) => (
        <View key={i}>
          <Label>{t("liveStudio.polls.option", { n: i + 1 })}</Label>
          <View className="flex-row items-center gap-2">
            <TextInput
              value={option}
              onChangeText={(v) => setOptions((list) => list.map((o, j) => (j === i ? v : o)))}
              maxLength={POLL_OPTION_MAX}
              className={`${FIELD} flex-1`}
            />
            {canRemove ? (
              <TouchableOpacity
                onPress={() => setOptions((list) => list.filter((_, j) => j !== i))}
                accessibilityLabel={t("liveStudio.polls.removeOption", { n: i + 1 })}
                className="p-1"
              >
                <Icon name="X" size={16} color="#a1a1aa" />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ))}
      {canAdd ? (
        <TouchableOpacity onPress={() => setOptions((list) => [...list, ""])} className="flex-row items-center gap-1 self-start py-1">
          <Icon name="Plus" size={16} color="#ffffff" />
          <Text className="text-white text-sm font-medium">{t("liveStudio.polls.addOption")}</Text>
        </TouchableOpacity>
      ) : null}
      <View>
        <Label>{t("liveStudio.polls.duration")}</Label>
        <Chips
          value={String(duration)}
          options={POLL_DURATIONS.map((s) => ({
            value: String(s),
            label: s < 60 ? t("liveStudio.polls.seconds", { count: s }) : t("liveStudio.polls.minutes", { count: s / 60 }),
          }))}
          onChange={(v) => setDuration(Number(v))}
        />
      </View>
      {open ? <Text className="text-theme-neutrals-500 text-xs">{t("liveStudio.polls.replaceHint")}</Text> : null}
      <TouchableOpacity
        disabled={!canStart || start.isPending}
        onPress={() => start.mutate()}
        accessibilityRole="button"
        className={`self-start px-4 py-2.5 rounded-xl bg-white ${!canStart || start.isPending ? "opacity-40" : ""}`}
      >
        <Text className="text-[#09090B] text-sm font-semibold">{t("liveStudio.polls.start")}</Text>
      </TouchableOpacity>
    </View>
  );
}
