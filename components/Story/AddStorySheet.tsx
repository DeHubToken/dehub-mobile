import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import Icon from "../ui/Icon";
import { theme } from "../../theme";
import { ensureMediaLibraryPermission } from "../../libs/permissions.util";
import {
  STORY_MAX_DURATION_SEC,
  uploadStory,
} from "../../services/stories.service";
import { toastError, toastSuccess } from "../../libs/toast";

interface AddStorySheetProps {
  visible: boolean;
  onClose: () => void;
  walletAddress: string;
  username?: string | null;
  avatar?: string | null;
  onUploaded?: () => void;
}

const AddStorySheet: React.FC<AddStorySheetProps> = ({
  visible,
  onClose,
  walletAddress,
  username,
  avatar,
  onUploaded,
}) => {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handlePickVideo = useCallback(async () => {
    const perm = await ensureMediaLibraryPermission();
    if (!perm.granted) {
      toastError("Media library permission is required");
      return;
    }

    const mediaTypes: any = (ImagePicker as any).MediaType
      ? [(ImagePicker as any).MediaType.video]
      : ImagePicker.MediaTypeOptions.Videos;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes,
      allowsEditing: true,
      videoMaxDuration: STORY_MAX_DURATION_SEC,
      quality: 0.85,
    });

    if (result.canceled || !result.assets?.[0]?.uri) return;

    const asset = result.assets[0];
    if (asset.duration && asset.duration > STORY_MAX_DURATION_SEC + 1) {
      toastError(`Stories must be ${STORY_MAX_DURATION_SEC} seconds or less`);
      return;
    }

    setUploading(true);
    setProgress(0);
    try {
      await uploadStory({
        localVideoUri: asset.uri,
        walletAddress,
        username,
        avatar,
        onProgress: setProgress,
      });
      toastSuccess("Story posted!");
      onUploaded?.();
      onClose();
    } catch (e: unknown) {
      toastError(e, "Failed to upload story");
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }, [walletAddress, username, avatar, onUploaded, onClose]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={uploading ? undefined : onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <Text style={styles.title}>Add Story</Text>
          <Text style={styles.subtitle}>
            Pick a video up to {STORY_MAX_DURATION_SEC} seconds. It disappears after 24 hours.
          </Text>

          {uploading ? (
            <View style={styles.uploading}>
              <ActivityIndicator color={theme.colors.accent} size="large" />
              <Text style={styles.progressText}>Uploading… {Math.round(progress)}%</Text>
            </View>
          ) : (
            <Pressable style={styles.action} onPress={handlePickVideo}>
              <View style={styles.actionIcon}>
                <Icon name="Video" size={20} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionTitle}>Choose from library</Text>
                <Text style={styles.actionSub}>Short vertical video works best</Text>
              </View>
            </Pressable>
          )}

          {!uploading && (
            <Pressable style={styles.cancel} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

export default AddStorySheet;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#111214",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 28,
    paddingTop: 10,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
    marginBottom: 16,
  },
  title: { color: "#fff", fontSize: 18, fontWeight: "700", marginBottom: 6 },
  subtitle: { color: "#9CA3AF", fontSize: 13, lineHeight: 18, marginBottom: 20 },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  actionTitle: { color: "#fff", fontSize: 15, fontWeight: "600" },
  actionSub: { color: "#9CA3AF", fontSize: 12, marginTop: 2 },
  uploading: { alignItems: "center", paddingVertical: 28, gap: 12 },
  progressText: { color: "#D1D5DB", fontSize: 13 },
  cancel: { marginTop: 16, alignItems: "center", paddingVertical: 10 },
  cancelText: { color: "#9CA3AF", fontSize: 15 },
});
