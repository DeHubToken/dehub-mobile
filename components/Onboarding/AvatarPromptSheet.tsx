import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import GlassModal from "../ui/GlassModal";
import Icon from "../ui/Icon";
import Avatar from "../common/Avatar";
import PrimaryButton from "../ui/PrimaryButton";
import { openCroppedImagePicker, resizeAndCompress } from "../../libs/assets.util";
import { runWithPermissions } from "../../libs/permissions.util";
import { toastError } from "../../libs/toast";
import { createLogger } from "../../libs/logger";

const log = createLogger("AvatarPrompt");

export interface AvatarPromptSheetProps {
  visible: boolean;
  onClose: () => void;
  name: string;
  /** Uploads the picked picture (a local file uri). Rejects on failure. */
  onSave: (uri: string) => Promise<void>;
}

/**
 * The "Add a profile photo" drawer: letter tile with a camera chip, Choose a
 * photo, Not now. Picking crops square and shows it in the tile before saving.
 */
export function AvatarPromptSheet({ visible, onClose, name, onSave }: AvatarPromptSheetProps) {
  const { t } = useTranslation();
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!visible) setPicked(null); }, [visible]);

  const pick = useCallback(async () => {
    try {
      setBusy(true);
      await runWithPermissions(["photos"], async () => {
        const raw = await openCroppedImagePicker({ width: 800, height: 800, circle: true, quality: 0.9, forceJpg: true, keepGif: true });
        if (!raw) return;
        setPicked(await resizeAndCompress(raw, { width: 512, height: 512, compress: 0.85, format: "jpeg" }));
      });
    } catch (e) {
      log.warn("pick failed", e);
      toastError(e, t("setProfile.imageFailed"));
    } finally {
      setBusy(false);
    }
  }, [t]);

  const save = useCallback(async () => {
    if (!picked) return;
    setBusy(true);
    try {
      await onSave(picked);
      onClose();
    } catch (e) {
      toastError(e, t("avatarPrompt.failed", "Could not save your photo. Try again."));
    } finally {
      setBusy(false);
    }
  }, [picked, onSave, onClose, t]);

  return (
    <GlassModal visible={visible} onClose={busy ? () => {} : onClose} presentation="bottom" dismissible={!busy}>
      <View style={s.body}>
        <Text style={s.title}>{t("avatarPrompt.title", "Add a profile photo")}</Text>
        <TouchableOpacity onPress={() => void pick()} disabled={busy} accessibilityRole="button" accessibilityLabel={t("avatarPrompt.choose", "Choose a photo")} style={s.tileWrap}>
          <Avatar uri={picked} name={name} size={96} />
          <View style={s.chip}>
            <Icon name="Camera" size={18} color="#FFFFFF" />
          </View>
        </TouchableOpacity>
        <Text style={s.copy}>{t("avatarPrompt.body", "People spot you faster in feeds, comments and chats when you have a face or logo.")}</Text>
        <View style={s.actions}>
          <PrimaryButton
            large
            disabled={busy}
            title={picked ? t("avatarPrompt.save", "Use this photo") : t("avatarPrompt.choose", "Choose a photo")}
            onPress={() => void (picked ? save() : pick())}
          />
          <TouchableOpacity onPress={picked ? () => void pick() : onClose} disabled={busy} accessibilityRole="button" style={s.ghost}>
            {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : (
              <Text style={s.ghostText}>{picked ? t("avatarPrompt.another", "Choose another") : t("avatarPrompt.notNow", "Not now")}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </GlassModal>
  );
}

export default AvatarPromptSheet;

const s = StyleSheet.create({
  body: { alignItems: "center", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, gap: 18 },
  title: { color: "#FFFFFF", fontSize: 18, fontWeight: "700", textAlign: "center" },
  tileWrap: { width: 96, height: 96, marginTop: 4 },
  chip: {
    position: "absolute", right: -6, bottom: -6, width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.72)", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)",
  },
  copy: { color: "#A1A1AA", fontSize: 14, lineHeight: 20, textAlign: "center", maxWidth: 300 },
  actions: { alignSelf: "stretch", gap: 6 },
  ghost: { height: 46, alignItems: "center", justifyContent: "center" },
  ghostText: { color: "#FFFFFF", fontSize: 15, fontWeight: "500" },
});
