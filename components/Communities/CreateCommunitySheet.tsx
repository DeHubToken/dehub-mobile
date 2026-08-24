import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  Pressable,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
} from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useTranslation } from "react-i18next";
import Icon from "../ui/Icon";
import CustomSwitch from "../ui/CustomSwitch";
import {
  createCommunity,
  resolveUniqueSlug,
  uploadCommunityMedia,
} from "../../services/communities.service";
import { runWithPermissions } from "../../libs/permissions.util";
import { toastError, toastSuccess } from "../../libs/toast";
import type { Community } from "../../types/community";

interface Props {
  visible: boolean;
  walletAddress: string;
  onClose: () => void;
  onCreated: (community: Community) => void;
}

const CreateCommunitySheet: React.FC<Props> = ({ visible, walletAddress, onClose, onCreated }) => {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const baseSlug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const reset = () => {
    setName("");
    setDescription("");
    setIsPrivate(false);
    setAvatarUri(null);
  };

  const pickAvatar = async () => {
    await runWithPermissions(["photos"], async () => {
      const mediaTypesCompat: any = (ImagePicker as any).MediaType
        ? [(ImagePicker as any).MediaType.image]
        : ImagePicker.MediaTypeOptions.Images;
      const pick = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: mediaTypesCompat,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });
      if (!pick.canceled && pick.assets?.[0]?.uri) {
        setAvatarUri(pick.assets[0].uri);
      }
    });
  };

  const handleSubmit = async () => {
    if (!walletAddress) return;
    if (!name.trim() || name.trim().length < 3) {
      toastError(t("communities.nameMinLength"));
      return;
    }
    if (!baseSlug) {
      toastError(t("communities.invalidName"));
      return;
    }
    setSubmitting(true);
    try {
      const slug = await resolveUniqueSlug(baseSlug);
      let avatar_url: string | undefined;
      if (avatarUri) {
        avatar_url = await uploadCommunityMedia(avatarUri, slug, "avatar");
      }
      const community = await createCommunity(walletAddress, {
        name: name.trim(),
        slug,
        description: description.trim() || undefined,
        avatar_url,
        is_private: isPrivate,
      });
      toastSuccess(t("communities.createCommunity"));
      reset();
      onClose();
      onCreated(community);
    } catch (e: any) {
      if (e?.message?.includes("duplicate")) {
        toastError(t("communities.slugTaken"));
      } else {
        toastError(t("communities.createFailed"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Edge-to-edge Android never resizes the window for the keyboard, so
          the sheet must lift itself or its inputs get covered. */}
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Icon name="Users" size={20} color="#fff" />
            <Text style={styles.title}>{t("communities.createCommunity")}</Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Icon name="X" size={20} color="#71717a" />
            </TouchableOpacity>
          </View>

          {/* Scrolls so the sheet can be capped. Without the cap a tall form —
              and it is tallest exactly when the keyboard has shrunk the space
              it sits in — grew straight out of the top of the screen, taking
              the title with it. */}
          <ScrollView
            bounces={false}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
          <View style={styles.row}>
            <TouchableOpacity
              style={styles.avatarPick}
              onPress={pickAvatar}
              accessibilityRole="button"
              accessibilityLabel="Choose avatar"
            >
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatarImg} contentFit="cover" />
              ) : (
                <Icon name="Image" size={22} color="#71717a" />
              )}
            </TouchableOpacity>
            <TextInput
              style={styles.nameInput}
              placeholder={t("communities.communityName")}
              placeholderTextColor="#8B8D90"
              value={name}
              onChangeText={setName}
              maxLength={64}
            />
          </View>

          <TextInput
            style={styles.descInput}
            placeholder={t("communities.whatsItAbout")}
            placeholderTextColor="#8B8D90"
            value={description}
            onChangeText={setDescription}
            multiline
            maxLength={500}
          />

          <View style={styles.privateRow}>
            <Text style={styles.privateLabel}>{t("communities.privateCommunity")}</Text>
            <CustomSwitch value={isPrivate} onValueChange={setIsPrivate} />
          </View>

          {!!baseSlug && (
            <Text style={styles.slugPreview}>dehub.net/app/communities/{baseSlug}</Text>
          )}

          <TouchableOpacity
            style={[styles.submit, submitting && { opacity: 0.6 }]}
            disabled={submitting}
            onPress={handleSubmit}
          >
            {submitting ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.submitText}>{t("communities.create")}</Text>
            )}
          </TouchableOpacity>
          </ScrollView>
        </Pressable>
      </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "rgba(12,12,14,0.96)",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
    padding: 20,
    paddingBottom: 32,
    // A `justifyContent: "flex-end"` overlay pins the sheet's BOTTOM, so any
    // height it gains grows upward and off the top of the screen — there is no
    // notch to stop at. Cap it and let the body scroll instead.
    maxHeight: "88%",
  },
  header: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 },
  title: { flex: 1, color: "#fff", fontSize: 16, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  avatarPick: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImg: { width: "100%", height: "100%" },
  nameInput: {
    flex: 1,
    color: "#fff",
    fontSize: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  descInput: {
    color: "#fff",
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: "top",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
    padding: 12,
    marginBottom: 12,
  },
  privateRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  privateLabel: { color: "#e4e4e7", fontSize: 14 },
  slugPreview: { color: "#A1A1AA", fontSize: 12, marginBottom: 16 },
  submit: {
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  submitText: { color: "#000", fontSize: 15, fontWeight: "700" },
});

export default CreateCommunitySheet;
