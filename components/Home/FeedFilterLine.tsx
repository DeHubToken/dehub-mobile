import React, { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import Icon from "../ui/Icon";
import { MAX_PRESET_NAME } from "../../libs/feed-presets";

export interface FeedFilterLineItem {
  key: string;
  /** Small grey word shown before the value when the line is open. */
  group: string;
  label: string;
  onRemove: () => void;
}

// Written dark like the rest of the app: System Light's tone pass turns it to ink on white.
const LINE_COLORS = { bg: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.1)", openBorder: "rgba(255,255,255,0.22)", text: "#FFFFFF", muted: "#8B8D90", btnBg: "#FFFFFF", btnText: "#000000", divider: "rgba(255,255,255,0.1)" };
function useLineColors() {
  return LINE_COLORS;
}

/**
 * Home feed: every active filter in one line, where the hashtag bar sits.
 * Plain words ("Article · #music · 1w · Most liked"), cut off with … when
 * full. Tap opens it in place to drop filters one by one; the bookmark saves
 * the set as a preset; ✕ clears all. Same as web's FeedFilterLine.
 */
export default function FeedFilterLine({
  items,
  presetName,
  onClearAll,
  onSavePreset,
  saveRequest,
}: {
  items: FeedFilterLineItem[];
  presetName?: string | null;
  onClearAll: () => void;
  onSavePreset: (name: string) => void;
  /** Bumped by "+ Save current" in the filter panel to open the line in save mode. */
  saveRequest?: number;
}) {
  const { t } = useTranslation();
  const c = useLineColors();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const lastRequest = useRef(saveRequest);

  useEffect(() => {
    if (saveRequest === lastRequest.current) return;
    lastRequest.current = saveRequest;
    setName(presetName ?? "");
    setOpen(true);
    setSaving(true);
  }, [saveRequest, presetName]);

  if (items.length === 0) return null;

  const startSave = () => {
    setName(presetName ?? "");
    setOpen(true);
    setSaving(true);
  };
  const commit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSavePreset(trimmed);
    setSaving(false);
    setOpen(false);
  };
  const close = () => { setOpen(false); setSaving(false); };

  return (
    <View
      testID="feed-filter-line"
      // The list already pads 8pt each side, so no side margin: the line spans
      // the same width as the tab pill and the cards. 6pt above and below, like
      // a card, keeps an even 12pt gap to the pill and to the post under it.
      style={{ marginVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: open ? c.openBorder : c.border, backgroundColor: c.bg }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", paddingLeft: 12, paddingRight: 6, paddingVertical: 6, gap: 8 }}>
        <Icon name="SlidersHorizontal" size={16} color={c.muted} />
        {open ? (
          <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: c.text }} numberOfLines={1}>
            {presetName ?? t("feedFilters.count", { count: items.length, defaultValue: "{{count}} filters on" })}
          </Text>
        ) : (
          <Pressable
            style={{ flex: 1 }}
            onPress={() => setOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={t("feedFilters.show", "Show filters")}
          >
            <Text style={{ fontSize: 14, fontWeight: "600", color: c.text }} numberOfLines={1}>
              {presetName ? <Text>{presetName}<Text style={{ color: c.muted }}> · </Text></Text> : null}
              {items.map((item, i) => (
                <Text key={item.key}>
                  {i > 0 ? <Text style={{ color: c.muted }}> · </Text> : null}
                  {item.label}
                </Text>
              ))}
            </Text>
          </Pressable>
        )}
        {open ? (
          <TouchableOpacity onPress={close} accessibilityRole="button" accessibilityLabel={t("feedFilters.collapse", "Hide filters")} style={{ width: 30, height: 30, alignItems: "center", justifyContent: "center" }}>
            <Icon name="ChevronUp" size={16} color={c.text} />
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity onPress={startSave} accessibilityRole="button" accessibilityLabel={t("feedFilters.savePreset", "Save as preset")} hitSlop={{ top: 8, bottom: 8 }} style={{ width: 30, height: 30, alignItems: "center", justifyContent: "center" }}>
              <Icon name="Bookmark" size={16} color={c.text} fill={presetName ? c.text : undefined} />
            </TouchableOpacity>
            <TouchableOpacity onPress={onClearAll} accessibilityRole="button" accessibilityLabel={t("feedFilters.clearAll", "Clear all filters")} hitSlop={{ top: 8, bottom: 8, right: 8 }} style={{ width: 30, height: 30, borderRadius: 8, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" }}>
              <Icon name="X" size={14} color={c.text} />
            </TouchableOpacity>
          </>
        )}
      </View>

      {open && (
        <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 16 }}>
            {items.map((item) => (
              <TouchableOpacity
                key={item.key}
                onPress={item.onRemove}
                accessibilityRole="button"
                accessibilityLabel={t("feedFilters.remove", { label: item.label, defaultValue: "Remove {{label}}" })}
                style={{ height: 34, flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                <Text style={{ fontSize: 11, color: c.muted }}>{item.group}</Text>
                <Text style={{ fontSize: 14, fontWeight: "600", color: c.text }}>{item.label}</Text>
                <Icon name="X" size={12} color={c.muted} />
              </TouchableOpacity>
            ))}
          </View>
          <View style={{ height: 1, backgroundColor: c.divider, marginVertical: 8 }} />
          {saving ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <TextInput
                autoFocus
                value={name}
                onChangeText={(v) => setName(v.slice(0, MAX_PRESET_NAME))}
                placeholder={t("feedFilters.presetName", "Preset name")}
                placeholderTextColor={c.muted}
                accessibilityLabel={t("feedFilters.presetName", "Preset name")}
                returnKeyType="done"
                onSubmitEditing={commit}
                style={{ flex: 1, height: 36, borderRadius: 8, borderWidth: 1, borderColor: c.openBorder, paddingHorizontal: 10, color: c.text, fontSize: 15 }}
              />
              <TouchableOpacity onPress={commit} disabled={!name.trim()} accessibilityRole="button" style={{ height: 36, paddingHorizontal: 14, borderRadius: 8, backgroundColor: c.btnBg, justifyContent: "center", opacity: name.trim() ? 1 : 0.5 }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: c.btnText }}>{t("feedFilters.save", "Save")}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <TouchableOpacity onPress={() => { close(); onClearAll(); }} accessibilityRole="button" style={{ height: 36, justifyContent: "center" }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: c.muted }}>{t("feedFilters.clearAllShort", "Clear all")}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={startSave} accessibilityRole="button" style={{ height: 36, paddingHorizontal: 12, borderRadius: 8, backgroundColor: c.btnBg, flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Icon name="Bookmark" size={14} color={c.btnText} />
                <Text style={{ fontSize: 13, fontWeight: "700", color: c.btnText }}>
                  {presetName ? t("feedFilters.updatePreset", "Rename preset") : t("feedFilters.savePreset", "Save as preset")}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

/** "My presets" row on top of the Home filter panel. Tap applies; Edit shows ✕ to delete. */
export function FeedPresetsRow({
  presets,
  activeName,
  onApply,
  onDelete,
  onSaveCurrent,
  canSaveCurrent,
}: {
  presets: { name: string }[];
  activeName?: string | null;
  onApply: (name: string) => void;
  onDelete: (name: string) => void;
  onSaveCurrent: (name: string) => void;
  canSaveCurrent: boolean;
}) {
  const { t } = useTranslation();
  const c = useLineColors();
  const [editing, setEditing] = useState(false);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const commit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSaveCurrent(trimmed);
    setNaming(false);
    setName("");
  };
  if (presets.length === 0 && !canSaveCurrent) return null;

  return (
    <View testID="feed-presets-row" style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <Text style={{ fontSize: 11, letterSpacing: 1, color: c.muted }}>{t("feedFilters.myPresets", "My presets").toUpperCase()}</Text>
        {presets.length > 0 ? (
          <TouchableOpacity onPress={() => setEditing((v) => !v)} accessibilityRole="button" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontSize: 12, fontWeight: "600", color: c.muted }}>{editing ? t("feedFilters.done", "Done") : t("feedFilters.edit", "Edit")}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 6 }}>
        {presets.map((p) => {
          const active = p.name === activeName;
          return (
            <TouchableOpacity
              key={p.name}
              onPress={() => (editing ? onDelete(p.name) : onApply(p.name))}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={editing ? t("feedFilters.deletePreset", { name: p.name, defaultValue: "Delete {{name}}" }) : p.name}
              style={{ height: 34, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: active ? c.openBorder : c.border, backgroundColor: active ? c.bg : "transparent", flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <Text style={{ fontSize: 14, fontWeight: active ? "700" : "500", color: active ? c.text : c.muted }}>{p.name}</Text>
              {editing ? <Icon name="X" size={12} color={c.muted} /> : null}
            </TouchableOpacity>
          );
        })}
        {canSaveCurrent && !editing && naming ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <TextInput
              autoFocus
              value={name}
              onChangeText={(v) => setName(v.slice(0, MAX_PRESET_NAME))}
              onSubmitEditing={commit}
              returnKeyType="done"
              placeholder={t("feedFilters.presetName", "Preset name")}
              placeholderTextColor={c.muted}
              accessibilityLabel={t("feedFilters.presetName", "Preset name")}
              style={{ width: 140, height: 34, borderRadius: 12, borderWidth: 1, borderColor: c.openBorder, paddingHorizontal: 10, color: c.text, fontSize: 14 }}
            />
            <TouchableOpacity onPress={commit} disabled={!name.trim()} accessibilityRole="button" style={{ height: 34, paddingHorizontal: 12, borderRadius: 12, backgroundColor: c.btnBg, justifyContent: "center", opacity: name.trim() ? 1 : 0.5 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: c.text }}>{t("feedFilters.save", "Save")}</Text>
            </TouchableOpacity>
          </View>
        ) : canSaveCurrent && !editing ? (
          <TouchableOpacity onPress={() => setNaming(true)} accessibilityRole="button" style={{ height: 34, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderStyle: "dashed", borderColor: c.openBorder, justifyContent: "center" }}>
            <Text style={{ fontSize: 14, color: c.text }}>{t("feedFilters.saveCurrent", "+ Save current")}</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </View>
  );
}
