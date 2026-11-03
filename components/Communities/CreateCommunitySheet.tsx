import { useSurfaceDraft } from '../../hooks/useSurfaceDraft';
import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useTranslation } from "react-i18next";
import GlassModal from "../ui/GlassModal";
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
  /** A group or channel started from the + in Messages; a plain community otherwise. */
  kind?: "group" | "channel";
  visible: boolean;
  walletAddress: string;
  onClose: () => void;
  onCreated: (community: Community) => void;
}

const DEHUB_COIN = require("../../assets/web-icons/dehub-coin.png");
const QUICK_PRICES = [100, 1000, 10000];

const CreateCommunitySheet: React.FC<Props> = ({ kind, visible, walletAddress, onClose, onCreated }) => {
  const { t } = useTranslation();
  const [name, setName] = useSurfaceDraft("components/Communities/CreateCommunitySheet.tsx:name", "");
  const [description, setDescription] = useSurfaceDraft("components/Communities/CreateCommunitySheet.tsx:description", "");
  const [isPrivate, setIsPrivate] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [paid, setPaid] = useState(false);
  const [price, setPrice] = useState("1000");
  const isChannel = kind === "channel";
  const priceNumber = Math.floor(Number(price));
  const priceValid = !paid || (Number.isFinite(priceNumber) && priceNumber >= 1);

  const baseSlug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const reset = () => {
    setName.complete(name, "");
    setDescription.complete(description, "");
    setIsPrivate(false);
    setAvatarUri(null);
    setPaid(false);
    setPrice("1000");
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
    if (!priceValid) return;
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
        kind,
        entry_price: isChannel && paid ? priceNumber : null,
      });
      toastSuccess(kind === "group"
        ? t("communities.newChat.groupCreated", { defaultValue: "Group created" })
        : kind === "channel"
          ? t("communities.newChat.channelCreated", { defaultValue: "Channel created" })
          : t("communities.createCommunity"));
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
    // GlassModal owns the keyboard lift, the height cap with scrolling body,
    // the safe-area inset and a drag that follows the finger.
    <GlassModal visible={visible} onClose={onClose} presentation="bottom" maxHeight="88%" scrollable>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Icon name={isChannel ? "Megaphone" : "Users"} size={20} color="#fff" />
            <Text style={styles.title}>
              {kind === "group"
                ? t("communities.newChat.newGroup", { defaultValue: "New group" })
                : isChannel
                  ? t("communities.newChat.newChannel", { defaultValue: "New channel" })
                  : t("communities.createCommunity")}
            </Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t("common.close")}
            >
              <Icon name="X" size={20} color="#808089" />
            </TouchableOpacity>
          </View>

          <View style={styles.row}>
            <TouchableOpacity
              style={styles.avatarPick}
              onPress={pickAvatar}
              accessibilityRole="button"
              accessibilityLabel={t("communities.chooseAvatar")}
            >
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatarImg} contentFit="cover" />
              ) : (
                <Icon name="Image" size={22} color="#808089" />
              )}
            </TouchableOpacity>
            <TextInput
              style={styles.nameInput}
              placeholder={kind === "group"
                ? t("communities.newChat.groupName", { defaultValue: "Group name" })
                : isChannel
                  ? t("communities.newChat.channelName", { defaultValue: "Channel name" })
                  : t("communities.communityName")}
              placeholderTextColor="#8B8D90"
              value={name}
              onChangeText={setName}
              maxLength={64}
            />
          </View>

          <TextInput
            style={styles.descInput}
            placeholder={kind ? t("communities.newChat.description", { defaultValue: "What is it about? (optional)" }) : t("communities.whatsItAbout")}
            placeholderTextColor="#8B8D90"
            value={description}
            onChangeText={setDescription}
            multiline
            maxLength={500}
          />

          {kind ? (
            <View>
              <Text style={styles.fieldLabel}>{t("communities.newChat.whoCanJoin", { defaultValue: "Who can join" })}</Text>
              <View style={styles.choiceRow}>
                <Choice
                  active={!isPrivate}
                  onPress={() => setIsPrivate(false)}
                  icon="Globe"
                  title={t("communities.newChat.public", { defaultValue: "Public" })}
                  detail={t("communities.newChat.publicDetail", { defaultValue: "Anyone can find it and join" })}
                />
                <Choice
                  active={isPrivate}
                  onPress={() => setIsPrivate(true)}
                  icon="Lock"
                  title={isChannel
                    ? t("communities.newChat.inviteOnly", { defaultValue: "Invite only" })
                    : t("communities.newChat.private", { defaultValue: "Private" })}
                  detail={t("communities.newChat.privateDetail", { defaultValue: "People join with your invite or your approval" })}
                />
              </View>
              {isChannel && (
                <>
                  <Text style={styles.fieldLabel}>{t("communities.newChat.entry", { defaultValue: "Entry" })}</Text>
                  <View style={styles.choiceRow}>
                    <Choice
                      active={!paid}
                      onPress={() => setPaid(false)}
                      title={t("communities.newChat.free", { defaultValue: "Free" })}
                      detail={t("communities.newChat.freeDetail", { defaultValue: "No charge to join" })}
                    />
                    <Choice
                      active={paid}
                      onPress={() => setPaid(true)}
                      coin
                      title={t("communities.newChat.paid", { defaultValue: "Paid" })}
                      detail={t("communities.newChat.paidDetail", { defaultValue: "One payment in tokens, straight to you" })}
                    />
                  </View>
                  {paid && (
                    <View>
                      <View style={styles.priceBox}>
                        <Image source={DEHUB_COIN} style={{ width: 16, height: 16 }} contentFit="contain" />
                        <TextInput
                          style={styles.priceInput}
                          value={price}
                          onChangeText={(v) => setPrice(v.replace(/[^0-9]/g, ""))}
                          keyboardType="number-pad"
                          accessibilityLabel={t("communities.newChat.price", { defaultValue: "Price in tokens" })}
                        />
                        <Text style={styles.priceUnit}>{t("tip.tokensUnit", { defaultValue: "tokens" })}</Text>
                      </View>
                      <View style={styles.quickRow}>
                        {QUICK_PRICES.map((p) => (
                          <TouchableOpacity key={p} onPress={() => setPrice(String(p))} accessibilityRole="button">
                            <View style={[styles.quick, String(p) === price && styles.quickActive]}>
                              <Text style={[styles.quickText, String(p) === price && styles.quickTextActive]}>{p.toLocaleString("en-US")}</Text>
                            </View>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  )}
                  <Text style={styles.note}>
                    {t("communities.newChat.channelNote", { defaultValue: "Only you and your admins can post. Members read and react." })}
                  </Text>
                </>
              )}
            </View>
          ) : (
            <View style={styles.privateRow}>
              <Text style={styles.privateLabel}>{t("communities.privateCommunity")}</Text>
              <CustomSwitch value={isPrivate} onValueChange={setIsPrivate} />
            </View>
          )}

          {!!baseSlug && !kind && (
            <Text style={styles.slugPreview}>dehub.net/app/communities/{baseSlug}</Text>
          )}

          <TouchableOpacity
            style={[styles.submit, kind && { marginTop: 16 }, (submitting || !priceValid) && { opacity: 0.6 }]}
            disabled={submitting || !priceValid}
            onPress={handleSubmit}
          >
            {submitting ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.submitText}>
                {kind === "group"
                  ? t("communities.newChat.createGroup", { defaultValue: "Create group" })
                  : isChannel
                    ? t("communities.newChat.createChannel", { defaultValue: "Create channel" })
                    : t("communities.create")}
              </Text>
            )}
          </TouchableOpacity>
        </View>
    </GlassModal>
  );
};

function Choice({ active, onPress, icon, coin, title, detail }: { active: boolean; onPress: () => void; icon?: string; coin?: boolean; title: string; detail: string }) {
  return (
    <TouchableOpacity onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: active }} style={{ flex: 1 }}>
      <View style={[styles.choice, active && styles.choiceActive]}>
        <View style={styles.choiceHead}>
          {coin ? <Image source={DEHUB_COIN} style={{ width: 15, height: 15 }} contentFit="contain" /> : icon ? <Icon name={icon as any} size={15} color="#fff" /> : null}
          <Text style={styles.choiceTitle} numberOfLines={1}>{title}</Text>
          <View style={[styles.radio, active && styles.radioActive]}>
            {active && <Icon name="Check" size={10} color="#000" />}
          </View>
        </View>
        <Text style={styles.choiceDetail}>{detail}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fieldLabel: { color: "#a1a1aa", fontSize: 12, marginTop: 4, marginBottom: 8 },
  choiceRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  choice: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 72,
  },
  choiceActive: { borderColor: "rgba(255,255,255,0.6)", backgroundColor: "rgba(255,255,255,0.1)" },
  choiceHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  choiceTitle: { flex: 1, color: "#fff", fontSize: 14, fontWeight: "600" },
  choiceDetail: { color: "#a1a1aa", fontSize: 11, marginTop: 3, lineHeight: 15 },
  radio: { width: 16, height: 16, borderRadius: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.3)", alignItems: "center", justifyContent: "center" },
  radioActive: { backgroundColor: "#fff", borderColor: "#fff" },
  priceBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.06)", paddingHorizontal: 12, height: 44,
  },
  priceInput: { flex: 1, color: "#fff", fontSize: 15 },
  priceUnit: { color: "#a1a1aa", fontSize: 12 },
  quickRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  quick: { borderRadius: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", paddingHorizontal: 10, paddingVertical: 5 },
  quickActive: { borderColor: "rgba(255,255,255,0.6)", backgroundColor: "rgba(255,255,255,0.1)" },
  quickText: { color: "#a1a1aa", fontSize: 12 },
  quickTextActive: { color: "#fff" },
  note: { color: "#808089", fontSize: 11, marginTop: 10 },
  sheet: {
    padding: 20,
    paddingBottom: 12,
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
