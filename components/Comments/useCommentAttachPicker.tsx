/**
 * The comment / reply paperclip: one button, then "Photo or video" (the
 * gallery) or "Audio file" (any audio on the phone). Limits match the
 * backend's /comment_image and /comment_media.
 */
import React, { useCallback, useState } from "react";
import { Keyboard } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as VideoThumbnails from "expo-video-thumbnails";
import { useTranslation } from "react-i18next";
import ChatAttachSheet from "../DM/ChatAttachSheet";
import { runWithPermissions } from "../../libs/permissions.util";
import { toastError } from "../../libs/toast";
import type { MediaAttachment } from "./CommentMediaPreview";

export const COMMENT_ATTACH_LIMITS = {
  image: 10 * 1024 * 1024,
  video: 50 * 1024 * 1024,
  audio: 20 * 1024 * 1024,
} as const;

export function useCommentAttachPicker(onPicked: (media: MediaAttachment) => void) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const tooBig = useCallback(
    (bytes: number | null | undefined, cap: number) => {
      if (!bytes || bytes <= cap) return false;
      toastError(t("comments.attachTooLarge", { defaultValue: "That file is over the {{size}} MB limit.", size: cap / 1024 / 1024 }));
      return true;
    },
    [t],
  );

  const pickGallery = useCallback(async () => {
    await runWithPermissions(["photos"], async () => {
      try {
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.All,
          quality: 0.85,
          videoMaxDuration: 600,
          // iPhone photos come back as JPEG rather than HEIC.
          preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
        });
        if (result.canceled || !result.assets?.[0]) return;
        const asset = result.assets[0];
        if (asset.type === "video" || (asset.mimeType || "").startsWith("video/")) {
          if (tooBig(asset.fileSize, COMMENT_ATTACH_LIMITS.video)) return;
          let thumb: string | undefined;
          try {
            thumb = (await VideoThumbnails.getThumbnailAsync(asset.uri, { time: 500 })).uri;
          } catch {
            /* no thumbnail: the preview shows a play tile */
          }
          onPicked({ type: "video", uri: asset.uri, mimeType: asset.mimeType || "video/mp4", thumbnailUri: thumb });
        } else {
          if (tooBig(asset.fileSize, COMMENT_ATTACH_LIMITS.image)) return;
          onPicked({ type: "image", uri: asset.uri });
        }
        Keyboard.dismiss();
      } catch (e: any) {
        if (e?.code !== "E_PICKER_CANCELLED") {
          console.error("[CommentAttach] gallery error", e);
          toastError(t("comments.pickImageFailed"));
        }
      }
    });
  }, [onPicked, tooBig, t]);

  const pickAudio = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: "audio/*", copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      if (tooBig(asset.size, COMMENT_ATTACH_LIMITS.audio)) return;
      onPicked({
        type: "audiofile",
        uri: asset.uri,
        mimeType: asset.mimeType || "audio/mpeg",
        name: asset.name || undefined,
      });
      Keyboard.dismiss();
    } catch (e) {
      console.error("[CommentAttach] audio picker error", e);
      toastError(t("comments.pickImageFailed"));
    }
  }, [onPicked, tooBig, t]);

  const sheet = (
    <ChatAttachSheet
      visible={open}
      onClose={() => setOpen(false)}
      options={[
        {
          key: "gallery",
          icon: "Image",
          label: t("comments.attachPhotoOrVideo", { defaultValue: "Photo or video" }),
          onPress: () => { setOpen(false); void pickGallery(); },
        },
        {
          key: "audio",
          icon: "Music",
          label: t("comments.attachAudioFile", { defaultValue: "Audio file" }),
          onPress: () => { setOpen(false); void pickAudio(); },
        },
      ]}
    />
  );

  return {
    openAttachPicker: useCallback(() => { Keyboard.dismiss(); setOpen(true); }, []),
    attachSheet: sheet,
  };
}
