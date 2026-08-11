/**
 * Download list for the documents on a `feed-file` post.
 *
 * Tapping an attachment hands the CDN URL to the OS rather than fetching it
 * in-app: every object is stored with `Content-Disposition: attachment`, so the
 * browser/download manager saves it, and nothing an uploader supplied is ever
 * parsed or rendered by us.
 */
import React, { useCallback } from "react";
import { View, Text, TouchableOpacity, Linking } from "react-native";
import Icon, { type IconName } from "../ui/Icon";
import env from "../../config/env";
import { toastError } from "../../libs/toast";
import {
  formatAttachmentSize,
  getAttachmentKind,
  getAttachmentLabel,
  type AttachmentKind,
  type PostAttachment,
} from "../../libs/attachments";

const KIND_ICON: Record<AttachmentKind, IconName> = {
  pdf: "FileText",
  document: "FileText",
  spreadsheet: "Sheet",
  presentation: "Presentation",
  archive: "FileArchive",
  code: "FileCode",
  ebook: "BookOpen",
  file: "File",
};

function resolveUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `${env.CDN_BASE_URL}/${url.replace(/^\/+/, "")}`;
}

interface PostAttachmentsProps {
  attachments?: PostAttachment[];
  className?: string;
}

export function PostAttachments({ attachments, className }: PostAttachmentsProps) {
  const handleOpen = useCallback(async (url: string) => {
    const href = resolveUrl(url);
    try {
      const supported = await Linking.canOpenURL(href);
      if (!supported) {
        toastError("Can't open this file on this device.");
        return;
      }
      await Linking.openURL(href);
    } catch {
      toastError("Couldn't open that file.");
    }
  }, []);

  if (!attachments?.length) return null;

  return (
    <View className={className ?? "mt-2"}>
      {attachments.map((attachment, index) => (
        <TouchableOpacity
          key={`${attachment.url}-${index}`}
          onPress={() => handleOpen(attachment.url)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Download ${attachment.name}`}
          className="flex-row items-center rounded-xl bg-theme-neutrals-800 border border-theme-neutrals-700 p-3 mb-2"
        >
          <View className="w-10 h-10 rounded-lg bg-theme-neutrals-700 items-center justify-center mr-3">
            <Icon name={KIND_ICON[getAttachmentKind(attachment.name)]} size={20} color="#fff" />
          </View>
          <View className="flex-1">
            <Text className="text-white text-sm font-medium" numberOfLines={1}>
              {attachment.name}
            </Text>
            <Text className="text-theme-neutrals-400 text-xs mt-0.5">
              {getAttachmentLabel(attachment.name)} · {formatAttachmentSize(attachment.size)}
            </Text>
          </View>
          <Icon name="Download" size={18} color="#8B8D90" />
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default PostAttachments;
