/**
 * RulesTab
 * ========
 * The community's rule list, edited in place.
 *
 * `communities.rules` is a loose JSON array: older rows hold plain strings,
 * newer ones hold `{ title }` or `{ text }` objects. Everything is normalised to
 * string[] on read and written back as string[], which is what the settings
 * patch accepts.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  StyleSheet,
} from "react-native";
import { useTranslation } from "react-i18next";
import Icon from "../../ui/Icon";
import { useCommunityModeration } from "../../../hooks/useCommunityAdmin";
import { getCommunityAbilities } from "../../../libs/community-permissions";
import type { Community, CommunityMember } from "../../../types/community";

const MAX_RULES = 20;
const MAX_RULE_LENGTH = 200;

function normaliseRules(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const entry of raw) {
    if (typeof entry === "string") {
      out.push(entry);
      continue;
    }
    if (entry && typeof entry === "object") {
      const record = entry as { text?: unknown; title?: unknown };
      if (typeof record.text === "string") {
        out.push(record.text);
      } else if (typeof record.title === "string") {
        out.push(record.title);
      }
    }
  }
  return out;
}

/** Comparable form of a rule list — trimmed, blanks dropped, order preserved. */
function keyOf(rules: string[]): string {
  return JSON.stringify(rules.map((rule) => rule.trim()).filter(Boolean));
}

export interface RulesTabProps {
  community: Community;
  membership: CommunityMember | null | undefined;
}

export function RulesTab({ community, membership }: RulesTabProps) {
  const { t } = useTranslation();
  const abilities = useMemo(
    () => getCommunityAbilities(community, membership),
    [community, membership],
  );
  const moderation = useCommunityModeration(community.id);
  const saving = moderation.busy === "__community__";
  const canEdit = abilities.can("change_info");

  const savedRules = useMemo(() => normaliseRules(community.rules), [community.rules]);
  const savedKey = keyOf(savedRules);

  const [rules, setRules] = useState<string[]>(savedRules);
  const [persistedKey, setPersistedKey] = useState<string>(savedKey);
  // Reconcile only when the prop itself changes, so a successful save is not
  // undone by the stale community object the parent is still holding.
  const propKeyRef = useRef<string>(savedKey);

  useEffect(() => {
    if (propKeyRef.current === savedKey) return;
    propKeyRef.current = savedKey;
    setRules(savedRules);
    setPersistedKey(savedKey);
  }, [savedKey, savedRules]);

  const dirty = keyOf(rules) !== persistedKey;

  const updateRule = useCallback((index: number, value: string) => {
    setRules((current) => current.map((rule, i) => (i === index ? value : rule)));
  }, []);

  const removeRule = useCallback((index: number) => {
    setRules((current) => current.filter((_, i) => i !== index));
  }, []);

  const moveRule = useCallback((index: number, direction: -1 | 1) => {
    setRules((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
  }, []);

  const addRule = useCallback(() => {
    setRules((current) => (current.length >= MAX_RULES ? current : [...current, ""]));
  }, []);

  const handleSave = useCallback(() => {
    const next = rules.map((rule) => rule.trim()).filter(Boolean);
    void (async () => {
      const ok = await moderation.updateSettings(
        { rules: next },
        t("communities.manage.rulesUpdated", { defaultValue: "Rules updated" }),
      );
      if (ok) {
        setRules(next);
        setPersistedKey(keyOf(next));
      }
    })();
  }, [rules, moderation, t]);

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-white text-sm font-medium">
            {t("communities.manage.rulesTitle", { defaultValue: "Community rules" })}
          </Text>
          <Text className="text-zinc-400 text-xs">
            {t("communities.manage.rulesCount", {
              used: rules.length,
              max: MAX_RULES,
              defaultValue: "{{used}} of {{max}}",
            })}
          </Text>
        </View>

        {rules.length === 0 ? (
          <Text className="text-zinc-400 text-xs text-center py-8">
            {t("communities.manage.rulesEmpty", {
              defaultValue: "No rules yet — add the first one below.",
            })}
          </Text>
        ) : (
          rules.map((rule, index) => (
            <View key={`rule-${index}`} style={styles.card}>
              <View className="flex-row items-start gap-2">
                <Text className="text-zinc-400 text-xs mt-3">{index + 1}.</Text>
                <TextInput
                  style={styles.input}
                  value={rule}
                  onChangeText={(value) => updateRule(index, value)}
                  editable={canEdit && !saving}
                  placeholder={t("communities.manage.rulePlaceholder", {
                    defaultValue: "Describe the rule",
                  })}
                  placeholderTextColor="#8B8D90"
                  multiline
                  maxLength={MAX_RULE_LENGTH}
                />
              </View>
              <View className="flex-row items-center justify-between mt-2">
                <Text className="text-zinc-400 text-xs">
                  {rule.length}/{MAX_RULE_LENGTH}
                </Text>
                <View className="flex-row items-center gap-1">
                  <TouchableOpacity
                    style={styles.iconBtn}
                    onPress={() => moveRule(index, -1)}
                    disabled={!canEdit || saving || index === 0}
                    accessibilityRole="button"
                    accessibilityLabel="Move rule up"
                  >
                    <Icon
                      name="ChevronUp"
                      size={16}
                      color={!canEdit || index === 0 ? "#3f3f46" : "#a1a1aa"}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.iconBtn}
                    onPress={() => moveRule(index, 1)}
                    disabled={!canEdit || saving || index === rules.length - 1}
                    accessibilityRole="button"
                    accessibilityLabel="Move rule down"
                  >
                    <Icon
                      name="ChevronDown"
                      size={16}
                      color={!canEdit || index === rules.length - 1 ? "#3f3f46" : "#a1a1aa"}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.iconBtn}
                    onPress={() => removeRule(index)}
                    disabled={!canEdit || saving}
                    accessibilityRole="button"
                    accessibilityLabel="Delete rule"
                  >
                    <Icon name="Trash2" size={16} color={canEdit ? "#EF4444" : "#3f3f46"} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))
        )}

        {canEdit && (
          <>
            <TouchableOpacity
              style={[
                styles.secondaryBtn,
                (rules.length >= MAX_RULES || saving) && { opacity: 0.5 },
              ]}
              onPress={addRule}
              disabled={rules.length >= MAX_RULES || saving}
            >
              <Icon name="Plus" size={16} color="#fff" />
              <Text style={styles.secondaryBtnText}>
                {t("communities.manage.addRule", { defaultValue: "Add rule" })}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, (!dirty || saving) && { opacity: 0.5 }]}
              onPress={handleSave}
              disabled={!dirty || saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <Text style={styles.actionBtnText}>
                  {t("communities.manage.saveRules", { defaultValue: "Save rules" })}
                </Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 14,
    marginBottom: 10,
  },
  input: {
    flex: 1,
    color: "#ffffff",
    fontSize: 14,
    minHeight: 40,
    paddingVertical: 8,
    textAlignVertical: "top",
  },
  iconBtn: { padding: 14 },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
  },
  secondaryBtnText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  actionBtn: {
    backgroundColor: "#fff",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 10,
  },
  actionBtnText: { color: "#000", fontWeight: "700", fontSize: 14 },
});
