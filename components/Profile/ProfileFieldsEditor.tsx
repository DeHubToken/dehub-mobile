import React, { useEffect, useRef, useState } from "react";
import { Pressable, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import Icon, { type IconName } from "../ui/Icon";
import GlassModal from "../ui/GlassModal";
import {
  PROFILE_FIELD_PRESETS,
  fieldLink,
  isLinkPreset,
  normalizeFieldValue,
  presetById,
  presetOf,
  type ProfileFieldPresetId,
} from "../../libs/profile-field-presets";
import type { ProfileField } from "./ProfileFieldsList";

export const MAX_PROFILE_FIELDS = 4;

/** One icon per field kind, from the theme's set. Same kinds as web. */
export const PROFILE_FIELD_ICONS: Record<ProfileFieldPresetId, IconName> = {
  website: "Globe",
  blog: "Blog",
  portfolio: "Images",
  shop: "Store",
  podcast: "Mic",
  newsletter: "MessageEnvelope",
  pronouns: "User",
  location: "MapPin",
  custom: "Link",
};

export type FieldRow = { key: number; preset: ProfileFieldPresetId; name: string; value: string; verifiedAt?: string | null };

let nextKey = 1;

export function rowsOf(fields: ProfileField[] | null | undefined): FieldRow[] {
  return (fields || []).slice(0, MAX_PROFILE_FIELDS).map((field) => {
    const preset = presetOf(field.name);
    return {
      key: nextKey++,
      preset,
      name: preset === "custom" ? field.name || "" : presetById(preset)!.name,
      // Shown without https://, which is put back on save.
    value: isLinkPreset(preset) ? (field.value || "").replace(/^https:\/\//i, "") : field.value || "",
      verifiedAt: field.verifiedAt ?? null,
    };
  });
}

/** What a row saves as, or null when the row is empty and so removed. */
export function rowToField(row: FieldRow): { name: string; value: string } | null {
  const value = normalizeFieldValue(row.preset, row.value);
  if (!value) return null;
  return { name: row.preset === "custom" ? row.name.trim() : presetById(row.preset)!.name, value };
}

export const fieldsKey = (fields: Array<{ name: string; value: string } | null>) =>
  JSON.stringify(fields.filter(Boolean).map((f) => [f!.name.trim(), f!.value.trim()]));

const ICON = "#A1A1AA";
const MUTED = "#71717A";

/**
 * Edit profile → Profile fields. Each line is picked from a list (Website,
 * Pronouns, …) or given a custom label, and every line has its own delete
 * button. Website and the other link kinds show with the profile's social
 * links. Same as web's ProfileFieldsEditor.
 */
export default function ProfileFieldsEditor({
  rows,
  onChange,
  onFocusRow,
}: {
  rows: FieldRow[];
  onChange: (next: (prev: FieldRow[]) => FieldRow[]) => void;
  onFocusRow?: (node: View | null) => void;
}) {
  const { t } = useTranslation();
  // The sheet picks a kind for a new row (key null) or for an existing one.
  const [picking, setPicking] = useState<{ key: number | null } | null>(null);
  const inputs = useRef(new Map<number, TextInput>());
  const rowViews = useRef(new Map<number, View>());
  const focusKey = useRef<number | null>(null);

  useEffect(() => {
    if (focusKey.current == null) return;
    const key = focusKey.current;
    focusKey.current = null;
    // After the sheet has gone, so the keyboard does not open under it.
    const timer = setTimeout(() => inputs.current.get(key)?.focus(), 350);
    return () => clearTimeout(timer);
  });

  const label = (id: ProfileFieldPresetId) =>
    t(`profileFields.presets.${id}`, { defaultValue: presetById(id)?.name ?? "Custom" });

  const pick = (preset: ProfileFieldPresetId) => {
    const target = picking?.key ?? null;
    setPicking(null);
    const name = preset === "custom" ? "" : presetById(preset)!.name;
    if (target == null) {
      onChange((prev) => {
        if (prev.length >= MAX_PROFILE_FIELDS) return prev;
        const key = nextKey++;
        focusKey.current = key;
        return [...prev, { key, preset, name, value: "", verifiedAt: null }];
      });
    } else {
      onChange((prev) => prev.map((r) => (r.key === target ? { ...r, preset, name, verifiedAt: null } : r)));
    }
  };

  const patch = (key: number, next: Partial<FieldRow>) =>
    onChange((prev) => prev.map((r) => (r.key === key ? { ...r, ...next, verifiedAt: null } : r)));

  const placeholder = (preset: ProfileFieldPresetId) => {
    if (isLinkPreset(preset)) return t("profileFields.placeholderLink", { defaultValue: "yoursite.com" });
    if (preset === "pronouns") return t("profileFields.placeholderPronouns", { defaultValue: "they/them" });
    if (preset === "location") return t("profileFields.placeholderLocation", { defaultValue: "City, country" });
    return t("profileFields.content");
  };

  const selected = picking?.key != null ? rows.find((r) => r.key === picking.key)?.preset : undefined;

  return (
    <View>
      {rows.length > 0 && (
        <View className="gap-2">
          {rows.map((row, index) => (
            <View
              key={row.key}
              ref={(node) => {
                if (node) rowViews.current.set(row.key, node);
                else rowViews.current.delete(row.key);
              }}
              className="flex-row items-center"
              style={{ gap: 8 }}
            >
              <View className="flex-1 flex-row items-center h-12 bg-theme-neutrals-900 rounded-xl border border-theme-neutrals-700 overflow-hidden">
                <Pressable
                  onPress={() => setPicking({ key: row.key })}
                  accessibilityRole="button"
                  accessibilityLabel={`${t("profileFields.type", { defaultValue: "Field type" })} ${index + 1}: ${label(row.preset)}`}
                  className="h-full flex-row items-center pl-3 pr-2"
                  style={{ gap: 6, flexShrink: 0 }}
                >
                  <Icon name={PROFILE_FIELD_ICONS[row.preset]} size={16} color={ICON} />
                  {row.preset !== "custom" && (
                    <Text className="text-white text-sm font-medium" numberOfLines={1} style={{ maxWidth: 96 }}>
                      {label(row.preset)}
                    </Text>
                  )}
                  <Icon name="ChevronDown" size={14} color={MUTED} />
                </Pressable>
                {row.preset === "custom" && (
                  <TextInput
                    className="h-full text-white text-sm font-medium"
                    style={{ width: 92, flexShrink: 0 }}
                    placeholderTextColor="#6b7280"
                    placeholder={t("profileFields.label")}
                    accessibilityLabel={`${t("profileFields.label")} ${index + 1}`}
                    value={row.name}
                    maxLength={30}
                    onChangeText={(val) => patch(row.key, { name: val.slice(0, 30) })}
                    onFocus={() => onFocusRow?.(rowViews.current.get(row.key) ?? null)}
                  />
                )}
                <View className="w-px h-5 bg-white/10" />
                <TextInput
                  ref={(node) => {
                    if (node) inputs.current.set(row.key, node);
                    else inputs.current.delete(row.key);
                  }}
                  className="flex-1 h-full text-white text-sm px-3"
                  style={{ minWidth: 0 }}
                  placeholderTextColor="#6b7280"
                  placeholder={placeholder(row.preset)}
                  accessibilityLabel={`${t("profileFields.content")} ${index + 1}`}
                  value={row.value}
                  maxLength={200}
                  autoCapitalize={isLinkPreset(row.preset) ? "none" : "sentences"}
                  autoCorrect={!isLinkPreset(row.preset)}
                  keyboardType={isLinkPreset(row.preset) ? "url" : "default"}
                  onChangeText={(val) => patch(row.key, { value: val.slice(0, 200) })}
                  onFocus={() => onFocusRow?.(rowViews.current.get(row.key) ?? null)}
                />
                {!!row.verifiedAt && (
                  <View className="mr-3" accessibilityLabel={t("profileFields.verified")}>
                    <Icon name="CircleCheck" size={16} color="#34D399" />
                  </View>
                )}
              </View>
              <TouchableOpacity
                onPress={() => onChange((prev) => prev.filter((r) => r.key !== row.key))}
                accessibilityRole="button"
                accessibilityLabel={`${t("profileFields.remove", { defaultValue: "Remove field" })} ${index + 1}`}
                activeOpacity={0.6}
                className="w-11 h-12 items-center justify-center rounded-xl"
                style={{ flexShrink: 0 }}
              >
                <Icon name="Trash" size={18} color={MUTED} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
      {rows.length < MAX_PROFILE_FIELDS && (
        <TouchableOpacity
          onPress={() => setPicking({ key: null })}
          accessibilityRole="button"
          activeOpacity={0.7}
          className={`self-start flex-row items-center h-10 pl-3 pr-4 rounded-full border border-white/10 ${rows.length > 0 ? "mt-3" : ""}`}
          style={{ gap: 6 }}
        >
          <Icon name="Plus" size={16} color="#E4E4E7" />
          <Text className="text-white text-sm font-medium">{t("profileFields.add", { defaultValue: "Add field" })}</Text>
        </TouchableOpacity>
      )}

      <GlassModal visible={!!picking} onClose={() => setPicking(null)} presentation="bottom" scrollable>
        <View className="px-5 pt-5 pb-3">
          <Text className="text-white text-base font-semibold">{t("profileFields.type", { defaultValue: "Field type" })}</Text>
        </View>
        <View className="mx-4 mb-5 rounded-2xl bg-theme-neutrals-800/60 px-4">
          {[...PROFILE_FIELD_PRESETS.map((p) => p.id), "custom" as const].map((id, i) => (
            <TouchableOpacity
              key={id}
              onPress={() => pick(id)}
              activeOpacity={0.7}
              accessibilityRole="button"
              className={`flex-row items-center py-3${i > 0 ? " border-t border-white/10" : ""}`}
              style={{ gap: 12 }}
            >
              <Icon name={PROFILE_FIELD_ICONS[id]} size={18} color={ICON} />
              <Text className="flex-1 text-white text-sm font-medium">
                {id === "custom" ? t("profileFields.presets.customOption", { defaultValue: "Custom label" }) : label(id)}
              </Text>
              {selected === id ? <Icon name="Check" size={16} color={ICON} /> : null}
            </TouchableOpacity>
          ))}
        </View>
      </GlassModal>
    </View>
  );
}

/** Whether any row holds a link that has not been proven yet: only then is the rel="me" tip worth showing. */
export function hasUnverifiedLink(rows: FieldRow[]): boolean {
  return rows.some((r) => !r.verifiedAt && !!fieldLink(normalizeFieldValue(r.preset, r.value)));
}
