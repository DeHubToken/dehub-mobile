/**
 * CommunityInfoEditor
 * ===================
 * Name and description editing for anyone holding `change_info`. Web edits these
 * inline in the community header; on a phone an expandable block under the About
 * tab is the equivalent affordance without fighting the banner for space.
 *
 * Avatar and banner are deliberately not here — those need the image picker the
 * create sheet uses, and they are the one part of web's header editing mobile
 * still lacks.
 */
import React, { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import Icon from "../ui/Icon";
import { useCommunityModeration } from "../../hooks/useCommunityAdmin";
import type { Community } from "../../types/community";

const NAME_MAX = 60;
const DESCRIPTION_MAX = 500;

interface CommunityInfoEditorProps {
  community: Community;
  /** Re-reads the community after a save; the screen holds it in local state. */
  onSaved: () => void | Promise<void>;
}

export function CommunityInfoEditor({ community, onSaved }: CommunityInfoEditorProps) {
  const { t } = useTranslation();
  const moderation = useCommunityModeration(community.id);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState(community.name);
  const [description, setDescription] = useState(community.description ?? "");

  // Re-seed whenever the community itself changes, so a save elsewhere (or the
  // parent's reload) does not leave stale text in a closed editor.
  useEffect(() => {
    setName(community.name);
    setDescription(community.description ?? "");
  }, [community.name, community.description]);

  const saving = moderation.busy === "__community__";
  const trimmedName = name.trim();
  const trimmedDescription = description.trim();
  const dirty =
    trimmedName !== community.name || trimmedDescription !== (community.description ?? "");
  const canSave = dirty && trimmedName.length >= 3 && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    const ok = await moderation.updateSettings(
      { name: trimmedName, description: trimmedDescription || null },
      t("communities.infoUpdated", { defaultValue: "Community updated" }),
    );
    if (ok) {
      setOpen(false);
      await onSaved();
    }
  };

  if (!open) {
    return (
      <TouchableOpacity style={styles.editTrigger} onPress={() => setOpen(true)}>
        <Icon name="Pencil" size={13} color="#a1a1aa" />
        <Text style={styles.editTriggerText}>
          {t("communities.editInfo", { defaultValue: "Edit name and description" })}
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.card}>
      <Text className="text-zinc-400 text-xs mb-1">{t("communities.communityName")}</Text>
      <TextInput
        value={name}
        onChangeText={(v) => setName(v.slice(0, NAME_MAX))}
        style={styles.input}
        placeholder={t("communities.communityName")}
        placeholderTextColor="#8B8D90"
        editable={!saving}
      />
      {trimmedName.length > 0 && trimmedName.length < 3 && (
        <Text className="text-amber-400 text-xs mt-1">{t("communities.nameMinLength")}</Text>
      )}

      <Text className="text-zinc-400 text-xs mb-1 mt-3">{t("communities.description")}</Text>
      <TextInput
        value={description}
        onChangeText={(v) => setDescription(v.slice(0, DESCRIPTION_MAX))}
        style={[styles.input, styles.textarea]}
        placeholder={t("communities.communityDescription")}
        placeholderTextColor="#8B8D90"
        multiline
        editable={!saving}
      />
      <Text className="text-zinc-400 text-xs mt-1 text-right">
        {description.length}/{DESCRIPTION_MAX}
      </Text>

      <View className="flex-row items-center justify-end gap-2 mt-3">
        <TouchableOpacity
          style={styles.secondaryBtn}
          disabled={saving}
          onPress={() => {
            setName(community.name);
            setDescription(community.description ?? "");
            setOpen(false);
          }}
        >
          <Text style={styles.secondaryBtnText}>{t("common.cancel", { defaultValue: "Cancel" })}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primaryBtn, !canSave && styles.btnDisabled]}
          disabled={!canSave}
          onPress={handleSave}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <Text style={styles.primaryBtnText}>
              {t("communities.saveChanges", { defaultValue: "Save" })}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  editTrigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    alignSelf: "flex-start",
    paddingVertical: 12,
    minHeight: 44,
  },
  editTriggerText: { color: "#a1a1aa", fontSize: 13 },
  card: {
    marginTop: 12,
    borderRadius: 12,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
  },
  input: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#fff",
    fontSize: 14,
  },
  textarea: { minHeight: 88, textAlignVertical: "top" },
  primaryBtn: {
    backgroundColor: "#fff",
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 10,
    minWidth: 76,
    alignItems: "center",
  },
  primaryBtnText: { color: "#000", fontWeight: "700", fontSize: 13 },
  btnDisabled: { opacity: 0.5 },
  secondaryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
  },
  secondaryBtnText: { color: "#fff", fontSize: 13, fontWeight: "600" },
});
