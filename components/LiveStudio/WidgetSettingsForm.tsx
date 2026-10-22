/**
 * The settings for whichever widget is selected in Live Studio, on a phone.
 * The twin of dehubweb's WidgetSettings: the same fields under the same names,
 * which are what the widgets read and the stream API stores.
 */
import React from "react";
import { Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import { setting, type OverlayKind } from "../../libs/live-overlay/registry";
import type { OverlayRect, OverlayWidget } from "../../libs/live-overlay/types";
import { clampRect } from "./StudioStage";

interface Props {
  widget: OverlayWidget;
  portrait: boolean;
  onSettings: (settings: Record<string, unknown>) => void;
  onRect: (rect: OverlayRect) => void;
}

export const FIELD = "rounded-xl border border-theme-neutrals-700 bg-theme-neutrals-800 px-3 h-10 text-white text-sm";

const ACCENTS = ["#ffffff", "#f43f5e", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7"];

export function Label({ children }: { children: string }) {
  return <Text className="text-white text-sm font-medium mb-1.5">{children}</Text>;
}

export function Chips<T extends string>({ value, options, onChange }: { value: string; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {options.map((o) => (
        <TouchableOpacity
          key={o.value}
          onPress={() => onChange(o.value)}
          accessibilityRole="radio"
          accessibilityState={{ checked: value === o.value }}
          className={`px-3 py-2 rounded-xl border ${value === o.value ? "border-white bg-theme-neutrals-700" : "border-theme-neutrals-700"}`}
        >
          <Text className="text-white text-xs font-medium">{o.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
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

export function WidgetSettingsForm({ widget, portrait, onSettings, onRect }: Props) {
  const { t } = useTranslation();
  const s = widget.settings || {};
  const set = (key: string, value: unknown) => onSettings({ ...s, [key]: value });
  const num = (key: string, raw: string, min: number, max: number) => {
    const n = Number(raw.replace(/[^0-9.]/g, ""));
    if (Number.isFinite(n)) set(key, Math.min(max, Math.max(min, n)));
  };
  const text = (key: string, maxLength: number, placeholder?: string) => (
    <TextInput
      className={FIELD}
      value={setting(s, key, "")}
      maxLength={maxLength}
      placeholder={placeholder}
      placeholderTextColor="#71717a"
      onChangeText={(v) => set(key, v)}
    />
  );
  const number = (key: string, fallback: number, min: number, max: number) => (
    <TextInput
      className={FIELD}
      keyboardType="number-pad"
      value={String(setting(s, key, fallback))}
      onChangeText={(v) => num(key, v, min, max)}
    />
  );

  // Grow or shrink around the widget's centre, inside the frame.
  const rect = portrait ? widget.portrait : widget.landscape;
  const resize = (factor: number) => {
    const w = rect.w * factor;
    const h = rect.h * factor;
    onRect(clampRect({ w, h, x: rect.x + (rect.w - w) / 2, y: rect.y + (rect.h - h) / 2 }));
  };
  const sizeRow = (
    <View>
      <Label>{t("liveStudio.fields.size")}</Label>
      <View className="flex-row gap-2">
        <TouchableOpacity onPress={() => resize(0.9)} className="px-4 py-2 rounded-xl bg-theme-neutrals-700/60">
          <Text className="text-white text-sm font-medium">{t("liveStudio.fields.smaller")}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => resize(1.1)} className="px-4 py-2 rounded-xl bg-theme-neutrals-700/60">
          <Text className="text-white text-sm font-medium">{t("liveStudio.fields.larger")}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // A phone has no colour input, so a creator picks from swatches here; any
  // colour set on the web keeps showing until one of these replaces it.
  const accentRow = (
    <View>
      <Label>{t("liveStudio.fields.accent")}</Label>
      <View className="flex-row gap-2">
        {ACCENTS.map((c) => (
          <TouchableOpacity
            key={c}
            onPress={() => set("accent", c)}
            accessibilityRole="radio"
            accessibilityState={{ checked: setting(s, "accent", "#ffffff").toLowerCase() === c }}
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: c,
              borderWidth: 2,
              borderColor: setting(s, "accent", "#ffffff").toLowerCase() === c ? "#fff" : "rgba(255,255,255,0.15)",
            }}
          />
        ))}
      </View>
    </View>
  );

  let body: React.ReactNode = null;
  switch (widget.kind as OverlayKind) {
    case "tip_alert":
      body = (
        <>
          <View>
            <Label>{t("liveStudio.fields.style")}</Label>
            <Chips
              value={setting(s, "style", "celebration")}
              options={[
                { value: "celebration", label: t("liveStudio.fields.celebration") },
                { value: "banner", label: t("liveStudio.fields.banner") },
              ]}
              onChange={(v) => set("style", v)}
            />
          </View>
          <View>
            <Label>{t("liveStudio.fields.minAmount")}</Label>
            {number("minAmount", 0, 0, 1_000_000_000)}
          </View>
          <Toggle label={t("liveStudio.fields.showMessage")} value={setting(s, "showMessage", true)} onChange={(v) => set("showMessage", v)} />
          <Toggle
            label={t("liveStudio.fields.confirmedOnly")}
            hint={t("liveStudio.fields.confirmedOnlyHint")}
            value={setting(s, "confirmedOnly", false)}
            onChange={(v) => set("confirmedOnly", v)}
          />
        </>
      );
      break;
    case "follow_alert":
    case "subscribe_alert":
    case "share_alert":
    case "join_alert":
      body = (
        <View>
          <Label>{t("liveStudio.fields.duration")}</Label>
          <TextInput
            className={FIELD}
            keyboardType="number-pad"
            value={String(Math.round(setting(s, "durationMs", 5000) / 1000))}
            onChangeText={(v) => num("durationMs", String(Number(v.replace(/[^0-9]/g, "")) * 1000), 2000, 20000)}
          />
        </View>
      );
      break;
    case "goal_bar":
      body = (
        <>
          <View>
            <Label>{t("liveStudio.fields.metric")}</Label>
            <Chips
              value={setting(s, "metric", "tips")}
              options={[
                { value: "tips", label: t("liveStudio.fields.metricTips") },
                { value: "followers", label: t("liveStudio.fields.metricFollowers") },
              ]}
              onChange={(v) => set("metric", v)}
            />
          </View>
          <View>
            <Label>{t("liveStudio.fields.target")}</Label>
            {number("target", 1_000_000, 1, 1_000_000_000_000)}
          </View>
          <View>
            <Label>{t("liveStudio.fields.title")}</Label>
            {text("title", 60)}
          </View>
          {accentRow}
        </>
      );
      break;
    case "top_supporters":
      body = (
        <>
          <View>
            <Label>{t("liveStudio.fields.count")}</Label>
            {number("count", 3, 1, 10)}
          </View>
          <View>
            <Label>{t("liveStudio.fields.title")}</Label>
            {text("title", 40, t("liveOverlay.topSupporters"))}
          </View>
        </>
      );
      break;
    case "text":
      body = (
        <>
          <View>
            <Label>{t("liveStudio.fields.style")}</Label>
            <Chips
              value={setting(s, "style", "lower_third")}
              options={[
                { value: "lower_third", label: t("liveStudio.fields.lowerThird") },
                { value: "plain", label: t("liveStudio.fields.plain") },
              ]}
              onChange={(v) => set("style", v)}
            />
          </View>
          <View>
            <Label>{t("liveStudio.fields.text")}</Label>
            {text("text", 80)}
          </View>
          <View>
            <Label>{t("liveStudio.fields.subtext")}</Label>
            {text("subtext", 120)}
          </View>
          {accentRow}
        </>
      );
      break;
    case "frame":
      body = (
        <>
          <View>
            <Label>{t("liveStudio.fields.style")}</Label>
            <Chips
              value={setting(s, "style", "solid")}
              options={[
                { value: "solid", label: t("liveStudio.fields.solid") },
                { value: "glow", label: t("liveStudio.fields.glow") },
              ]}
              onChange={(v) => set("style", v)}
            />
          </View>
          <View>
            <Label>{t("liveStudio.fields.thickness")}</Label>
            {number("thickness", 6, 1, 80)}
          </View>
          {accentRow}
        </>
      );
      break;
    case "stream_timer":
      body = (
        <>
          <View>
            <Label>{t("liveStudio.fields.label")}</Label>
            {text("label", 30)}
          </View>
          {accentRow}
        </>
      );
      break;
    case "reaction_counter":
      body = accentRow;
      break;
    case "subathon_timer":
      body = (
        <>
          <Text className="text-theme-neutrals-500 text-xs">{t("liveStudio.subathon.widgetHint")}</Text>
          <View>
            <Label>{t("liveStudio.fields.label")}</Label>
            {text("label", 30, t("liveOverlay.subathon"))}
          </View>
          {accentRow}
        </>
      );
      break;
    case "streamer_level":
      body = (
        <>
          <Toggle label={t("liveStudio.fields.showStreak")} value={setting(s, "showStreak", true)} onChange={(v) => set("showStreak", v)} />
          {accentRow}
        </>
      );
      break;
    case "tip_jar":
      body = (
        <>
          <View>
            <Label>{t("liveStudio.fields.target")}</Label>
            {number("target", 100000, 1, 1000000000000)}
          </View>
          <View>
            <Label>{t("liveStudio.fields.title")}</Label>
            {text("title", 40, t("liveOverlay.tipJar"))}
          </View>
          {accentRow}
        </>
      );
      break;
    case "points_board":
      body = (
        <>
          <View>
            <Label>{t("liveStudio.fields.count")}</Label>
            {number("count", 5, 1, 10)}
          </View>
          <View>
            <Label>{t("liveStudio.fields.title")}</Label>
            {text("title", 40, t("liveOverlay.pointsTitle"))}
          </View>
        </>
      );
      break;
    case "event_feed":
      body = (
        <>
          <View>
            <Label>{t("liveStudio.fields.lines")}</Label>
            {number("count", 4, 1, 8)}
          </View>
          <View>
            <Label>{t("liveStudio.fields.title")}</Label>
            {text("title", 40)}
          </View>
        </>
      );
      break;
    case "chat_box":
      body = (
        <>
          <View>
            <Label>{t("liveStudio.fields.lines")}</Label>
            {number("count", 6, 1, 12)}
          </View>
          <Toggle label={t("liveStudio.fields.showAvatars")} value={setting(s, "showAvatars", true)} onChange={(v) => set("showAvatars", v)} />
        </>
      );
      break;
    case "ticker":
      body = (
        <>
          <View>
            <Label>{t("liveStudio.fields.text")}</Label>
            {text("text", 200)}
          </View>
          <View>
            <Label>{t("liveStudio.fields.speed")}</Label>
            <Chips
              value={setting(s, "speed", "normal")}
              options={[
                { value: "slow", label: t("liveStudio.fields.slow") },
                { value: "normal", label: t("liveStudio.fields.normal") },
                { value: "fast", label: t("liveStudio.fields.fast") },
              ]}
              onChange={(v) => set("speed", v)}
            />
          </View>
          {accentRow}
        </>
      );
      break;
    case "poll":
      body = (
        <>
          <Text className="text-theme-neutrals-500 text-xs">{t("liveStudio.polls.widgetHint", { command: "!vote" })}</Text>
          {accentRow}
        </>
      );
      break;
    default:
      body = null;
  }

  return (
    <View className="gap-4">
      {body ?? <Text className="text-theme-neutrals-500 text-sm">{t("liveStudio.noSettings")}</Text>}
      {widget.kind !== "frame" ? sizeRow : null}
    </View>
  );
}
