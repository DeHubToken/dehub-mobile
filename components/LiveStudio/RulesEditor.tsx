/**
 * Live Studio's rules on a phone: "when this happens on my stream, do that".
 * The twin of dehubweb's RulesPanel — same rules, same presets, same fields.
 *
 * Saved separately from the widgets and run by the stream API, once, when it
 * happens. A test plays a saved rule's alerts, sounds and read-aloud on the
 * creator's own screens only.
 */
import React, { useEffect, useRef, useState } from "react";
import { Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Icon from "../ui/Icon";
import { toastError, toastSuccess } from "../../libs";
import { getMyRules, saveMyRules, testRule, type MyRules } from "../../services/live.service";
import {
  blankAction,
  isChatTrigger,
  MAX_ACTIONS,
  MAX_RULES,
  presetRule,
  RULE_ACTION_TYPES,
  RULE_AUDIENCES,
  RULE_PRESETS,
  RULE_SOUNDS,
  RULE_TRIGGERS,
  WHEEL_MAX_SEGMENTS,
  type LiveRule,
  type RuleAction,
  type RulePreset,
  type RuleTriggerType,
} from "../../libs/live-overlay/rules";
import { Chips, FIELD, Label } from "./WidgetSettingsForm";

export const myRulesKey = ["my-overlay-rules"] as const;

const numberIn = (raw: string, min: number, max: number) => Math.min(max, Math.max(min, Number(raw.replace(/[^0-9]/g, "")) || 0));

export function RulesEditor({ hasAlertWidget }: { hasAlertWidget: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery<MyRules>({ queryKey: myRulesKey, queryFn: getMyRules, staleTime: 15_000 });
  const [rules, setRules] = useState<LiveRule[]>([]);
  const [dirty, setDirty] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const loadedVersion = useRef<number | null>(null);

  useEffect(() => {
    if (!data || loadedVersion.current === data.version || (dirty && loadedVersion.current !== null)) return;
    loadedVersion.current = data.version;
    setRules(data.rules);
  }, [data, dirty]);

  const edit = (next: LiveRule[]) => {
    setRules(next);
    setDirty(true);
  };
  const update = (id: string, change: Partial<LiveRule>) => edit(rules.map((r) => (r.id === id ? { ...r, ...change } : r)));

  const add = (preset: RulePreset) => {
    setAdding(false);
    if (rules.length >= MAX_RULES) {
      toastError(t("liveStudio.rules.limit", { count: MAX_RULES }));
      return;
    }
    const rule = presetRule(preset, rules, {
      name: t(`liveStudio.rules.presets.${preset}`),
      say: t("liveStudio.rules.presetText.readChat"),
      alert: t("liveStudio.rules.presetText.bigTip"),
      chat: preset === "command" ? t("liveStudio.rules.presetText.command") : t("liveStudio.rules.presetText.thankFollowers"),
    });
    edit([...rules, rule]);
    setOpenId(rule.id);
  };

  const save = useMutation({
    mutationFn: () => saveMyRules(rules),
    onSuccess: (saved) => {
      loadedVersion.current = saved.version;
      queryClient.setQueryData(myRulesKey, saved);
      setRules(saved.rules);
      setDirty(false);
      toastSuccess(t("liveStudio.rules.saved"));
    },
    onError: () => toastError(t("liveStudio.rules.saveFailed")),
  });

  const test = useMutation({
    mutationFn: (ruleId: string) => testRule(ruleId),
    onError: () => toastError(t("liveStudio.rules.testFailed")),
  });

  if (isLoading) return null;
  if (isError) return <Text className="text-theme-neutrals-400 text-sm">{t("liveStudio.rules.loadFailed")}</Text>;

  const needsAlertWidget = !hasAlertWidget && rules.some((r) => r.enabled && r.actions.some((a) => a.type === "alert"));

  return (
    <View className="gap-3">
      <Text className="text-theme-neutrals-500 text-xs">{t("liveStudio.rules.intro")}</Text>

      {rules.length === 0 ? <Text className="text-theme-neutrals-500 text-sm">{t("liveStudio.rules.empty")}</Text> : null}
      {rules.map((rule) => (
        <View key={rule.id} className="rounded-xl border border-theme-neutrals-700">
          <View className="flex-row items-center gap-2 px-3 py-2">
            <TouchableOpacity className="flex-1" onPress={() => setOpenId(openId === rule.id ? null : rule.id)} accessibilityState={{ expanded: openId === rule.id }}>
              <Text className="text-white text-sm font-medium" numberOfLines={1}>
                {rule.name || t(`liveStudio.rules.triggers.${rule.trigger.type}`)}
              </Text>
              <Text className="text-theme-neutrals-500 text-xs" numberOfLines={1}>
                {rule.actions.map((a) => t(`liveStudio.rules.actionTypes.${a.type}`)).join(", ")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={dirty || test.isPending}
              onPress={() => test.mutate(rule.id)}
              className={`px-2.5 py-1.5 rounded-lg bg-theme-neutrals-700/60 ${dirty ? "opacity-40" : ""}`}
              accessibilityHint={dirty ? t("liveStudio.rules.saveToTest") : undefined}
            >
              <Text className="text-white text-xs font-medium">{t("liveStudio.rules.test")}</Text>
            </TouchableOpacity>
            <Switch value={rule.enabled} onValueChange={(v) => update(rule.id, { enabled: v })} accessibilityLabel={t("liveStudio.rules.enabled")} />
            <TouchableOpacity onPress={() => edit(rules.filter((r) => r.id !== rule.id))} accessibilityLabel={t("liveStudio.rules.remove")} className="p-1">
              <Icon name="Trash2" size={16} color="#a1a1aa" />
            </TouchableOpacity>
          </View>
          {openId === rule.id ? (
            <View className="border-t border-theme-neutrals-700 p-3">
              <RuleForm rule={rule} onChange={(change) => update(rule.id, change)} />
            </View>
          ) : null}
        </View>
      ))}

      {adding ? (
        <View className="gap-2 rounded-xl border border-theme-neutrals-700 p-3">
          {RULE_PRESETS.map((preset) => (
            <TouchableOpacity key={preset} onPress={() => add(preset)} className="py-1.5">
              <Text className="text-white text-sm font-medium">{t(`liveStudio.rules.presets.${preset}`)}</Text>
              <Text className="text-theme-neutrals-500 text-xs">{t(`liveStudio.rules.presetHints.${preset}`)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <TouchableOpacity onPress={() => setAdding(true)} className="self-start flex-row items-center px-3 py-1.5 rounded-xl bg-theme-neutrals-700/60">
          <Icon name="Plus" size={13} color="#fff" />
          <Text className="text-white text-xs font-medium ml-1">{t("liveStudio.rules.add")}</Text>
        </TouchableOpacity>
      )}

      {needsAlertWidget ? <Text className="text-amber-300 text-xs">{t("liveStudio.rules.needsAlertWidget")}</Text> : null}

      <View className="flex-row items-center justify-end gap-3">
        {dirty ? <Text className="text-theme-neutrals-400 text-xs">{t("liveStudio.unsaved")}</Text> : null}
        <TouchableOpacity
          disabled={!dirty || save.isPending}
          onPress={() => save.mutate()}
          className={`px-4 h-9 rounded-xl bg-white items-center justify-center ${!dirty || save.isPending ? "opacity-40" : ""}`}
        >
          <Text className="text-black text-xs font-semibold">{save.isPending ? t("liveStudio.saving") : t("liveStudio.rules.save")}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function RuleForm({ rule, onChange }: { rule: LiveRule; onChange: (change: Partial<LiveRule>) => void }) {
  const { t } = useTranslation();
  const trig = rule.trigger;
  const chatTrigger = isChatTrigger(trig.type);

  const setTrigger = (type: RuleTriggerType) =>
    onChange({
      trigger:
        type === "tip"
          ? { type, minAmount: 0 }
          : type === "command"
            ? { type, command: "!hello" }
            : type === "keyword"
              ? { type, keyword: "" }
              : { type },
    });
  const setAction = (index: number, next: RuleAction) => onChange({ actions: rule.actions.map((a, i) => (i === index ? next : a)) });

  return (
    <View className="gap-4">
      <View>
        <Label>{t("liveStudio.rules.name")}</Label>
        <TextInput className={FIELD} maxLength={60} value={rule.name} onChangeText={(name) => onChange({ name })} />
      </View>

      <View>
        <Label>{t("liveStudio.rules.when")}</Label>
        <Chips
          value={trig.type}
          options={RULE_TRIGGERS.map((type) => ({ value: type, label: t(`liveStudio.rules.triggers.${type}`) }))}
          onChange={setTrigger}
        />
      </View>
      {trig.type === "tip" ? (
        <View>
          <Label>{t("liveStudio.rules.minAmount")}</Label>
          <TextInput
            className={FIELD}
            keyboardType="number-pad"
            value={String(trig.minAmount ?? 0)}
            onChangeText={(v) => onChange({ trigger: { ...trig, minAmount: numberIn(v, 0, 1e12) } })}
          />
        </View>
      ) : null}
      {trig.type === "command" ? (
        <View>
          <Label>{t("liveStudio.rules.command")}</Label>
          <TextInput
            className={FIELD}
            autoCapitalize="none"
            maxLength={31}
            value={trig.command ?? ""}
            onChangeText={(v) => onChange({ trigger: { ...trig, command: v.toLowerCase().replace(/[^!a-z0-9_]/g, "") } })}
          />
        </View>
      ) : null}
      {trig.type === "keyword" ? (
        <View>
          <Label>{t("liveStudio.rules.keyword")}</Label>
          <TextInput className={FIELD} maxLength={40} value={trig.keyword ?? ""} onChangeText={(v) => onChange({ trigger: { ...trig, keyword: v } })} />
        </View>
      ) : null}

      {chatTrigger ? (
        <>
          <View>
            <Label>{t("liveStudio.rules.audience")}</Label>
            <Chips
              value={rule.audience}
              options={RULE_AUDIENCES.map((a) => ({ value: a, label: t(`liveStudio.rules.audiences.${a}`) }))}
              onChange={(audience) => onChange({ audience })}
            />
          </View>
          <View>
            <Label>{t("liveStudio.rules.blockedWords")}</Label>
            <TextInput
              className={FIELD}
              autoCapitalize="none"
              value={rule.blockedWords.join(", ")}
              onChangeText={(v) => onChange({ blockedWords: v.split(",").map((w) => w.trim().toLowerCase()).filter(Boolean).slice(0, 50) })}
            />
            <Text className="text-theme-neutrals-500 text-xs mt-1.5">{t("liveStudio.rules.blockedWordsHint")}</Text>
          </View>
        </>
      ) : null}

      <View>
        <Label>{t("liveStudio.rules.cooldown")}</Label>
        <TextInput className={FIELD} keyboardType="number-pad" value={String(rule.cooldownSec)} onChangeText={(v) => onChange({ cooldownSec: numberIn(v, 0, 3600) })} />
      </View>
      {chatTrigger ? (
        <View>
          <Label>{t("liveStudio.rules.userCooldown")}</Label>
          <TextInput
            className={FIELD}
            keyboardType="number-pad"
            value={String(rule.userCooldownSec)}
            onChangeText={(v) => onChange({ userCooldownSec: numberIn(v, 0, 3600) })}
          />
        </View>
      ) : null}

      <View className="gap-2">
        <Label>{t("liveStudio.rules.then")}</Label>
        {rule.actions.map((action, i) => (
          <View key={i} className="rounded-lg bg-theme-neutrals-800/60 p-3 gap-2">
            <View className="flex-row items-center justify-between">
              <Text className="text-theme-neutrals-400 text-[11px] font-semibold uppercase">{t(`liveStudio.rules.actionTypes.${action.type}`)}</Text>
              <TouchableOpacity
                onPress={() => onChange({ actions: rule.actions.filter((_, j) => j !== i) })}
                accessibilityLabel={t("liveStudio.rules.removeAction")}
                className="p-1"
              >
                <Icon name="Trash2" size={14} color="#a1a1aa" />
              </TouchableOpacity>
            </View>
            <ActionForm action={action} onChange={(next) => setAction(i, next)} />
          </View>
        ))}
        {rule.actions.length < MAX_ACTIONS ? (
          <View>
            <Label>{t("liveStudio.rules.addAction")}</Label>
            <Chips
              value=""
              options={RULE_ACTION_TYPES.map((type) => ({ value: type, label: t(`liveStudio.rules.actionTypes.${type}`) }))}
              onChange={(type) => onChange({ actions: [...rule.actions, blankAction(type)] })}
            />
          </View>
        ) : null}
        <Text className="text-theme-neutrals-500 text-xs">
          {t(rule.trigger.type === "live" ? "liveStudio.rules.placeholdersLive" : "liveStudio.rules.placeholders")}
        </Text>
      </View>
    </View>
  );
}

function ActionForm({ action, onChange }: { action: RuleAction; onChange: (next: RuleAction) => void }) {
  const { t } = useTranslation();
  const text = (label: string, value: string, set: (v: string) => void) => (
    <View>
      <Label>{label}</Label>
      <TextInput className={FIELD} maxLength={200} value={value} onChangeText={set} />
    </View>
  );

  switch (action.type) {
    case "alert":
      return (
        <>
          {text(t("liveStudio.rules.alertText"), action.text, (v) => onChange({ ...action, text: v }))}
          <View>
            <Label>{t("liveStudio.fields.duration")}</Label>
            <TextInput
              className={FIELD}
              keyboardType="number-pad"
              value={String(Math.round(action.durationMs / 1000))}
              onChangeText={(v) => onChange({ ...action, durationMs: numberIn(v, 2, 20) * 1000 })}
            />
          </View>
        </>
      );
    case "sound":
      return (
        <View>
          <Label>{t("liveStudio.rules.sound")}</Label>
          <Chips
            value={action.sound}
            options={RULE_SOUNDS.map((sound) => ({ value: sound, label: t(`liveStudio.rules.sounds.${sound}`) }))}
            onChange={(sound) => onChange({ ...action, sound })}
          />
        </View>
      );
    case "say":
      return text(t("liveStudio.rules.sayText"), action.text, (v) => onChange({ ...action, text: v }));
    case "chat":
      return (
        <>
          {text(t("liveStudio.rules.chatText"), action.text, (v) => onChange({ ...action, text: v }))}
          <Text className="text-theme-neutrals-500 text-xs">{t("liveStudio.rules.chatHint")}</Text>
        </>
      );
    case "webhook":
      return (
        <>
          <View>
            <Label>{t("liveStudio.rules.webhookUrl")}</Label>
            <TextInput
              className={FIELD}
              autoCapitalize="none"
              keyboardType="url"
              maxLength={500}
              placeholder="https://discord.com/api/webhooks/…"
              placeholderTextColor="#71717a"
              value={action.url}
              onChangeText={(v) => onChange({ ...action, url: v.trim() })}
            />
            <Text className="text-theme-neutrals-500 text-xs mt-1.5">{t("liveStudio.rules.webhookHint")}</Text>
          </View>
          {text(t("liveStudio.rules.webhookText"), action.text, (v) => onChange({ ...action, text: v }))}
        </>
      );
    case "wheel":
      return (
        <View>
          <Label>{t("liveStudio.rules.wheelSegments")}</Label>
          <TextInput
            className={`${FIELD} h-auto py-2`}
            multiline
            textAlignVertical="top"
            style={{ minHeight: 96 }}
            placeholderTextColor="#71717a"
            value={action.segments.join("\n")}
            onChangeText={(v) => onChange({ ...action, segments: v.split("\n").slice(0, WHEEL_MAX_SEGMENTS).map((s) => s.slice(0, 30)) })}
          />
          <Text className="text-theme-neutrals-500 text-xs mt-1.5">{t("liveStudio.rules.wheelHint")}</Text>
        </View>
      );
    default:
      return null;
  }
}
