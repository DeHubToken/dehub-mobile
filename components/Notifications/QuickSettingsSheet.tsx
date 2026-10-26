import React, { useCallback, useEffect, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import GlassModal from "../ui/GlassModal";
import CustomSwitch from "../ui/CustomSwitch";
import Icon, { type IconName } from "../ui/Icon";
import { useAppTheme } from "../../context/ThemeContext";
import { useAuthActions, useUser } from "../../context/AuthContext";
import {
  type NotificationPreferenceKey,
  type NotificationPreferences,
  getDefaultNotificationPreferences,
  mergePreferences,
  updateNotificationPreferences,
} from "../../services/push/push.service";
import { toastError } from "../../libs";

interface QuickSettingsSheetProps {
  visible: boolean;
  onClose: () => void;
  hasUnread: boolean;
  onMarkAllRead: () => void;
  onClearAll: () => void;
  onOpenAllSettings: () => void;
}

const FG = "#F4F4F5";
const MUTED = "#8B8D90";
const LINE = "#52525B";
const HAIRLINE = "#27272A";

/** The six switches web's notifications page carries, in web's order. */
const ROWS: { key: NotificationPreferenceKey; icon: IconName; title: string; desc: string }[] = [
  { key: "likes", icon: "ThumbsUp", title: "notifications.likes", desc: "notifications.likesDesc" },
  { key: "comments", icon: "MessageSquareText", title: "notifications.comments", desc: "notifications.commentsDesc" },
  { key: "newFollowers", icon: "UserPlus", title: "notifications.follows", desc: "notifications.followsDesc" },
  { key: "tips", icon: "Gem", title: "notifications.tips", desc: "notifications.tipsDesc" },
  { key: "subscriptions", icon: "Users", title: "notifications.subscriptions", desc: "notifications.subscriptionsDesc" },
  { key: "livestreamStart", icon: "Zap", title: "notifications.livestreams", desc: "notifications.livestreamsDesc" },
];

function readPrefs(user: unknown): NotificationPreferences {
  const raw = (user as { notificationPreferences?: unknown } | null)?.notificationPreferences;
  if (!raw) return getDefaultNotificationPreferences();
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return mergePreferences(getDefaultNotificationPreferences(), parsed);
  } catch {
    return getDefaultNotificationPreferences();
  }
}

/**
 * The notifications page's settings sheet, matching web's: mark all read,
 * clear all, and the per-type switches, which save to the same account
 * preferences as Settings > Notifications. The full screen is one tap away.
 */
const QuickSettingsSheet: React.FC<QuickSettingsSheetProps> = ({
  visible,
  onClose,
  hasUnread,
  onMarkAllRead,
  onClearAll,
  onOpenAllSettings,
}) => {
  const { t } = useTranslation();
  // Colours are written for the dark theme: the sheet is a Modal, outside the
  // themed root's class variables, and System Light's tone pass inverts these.
  const { skin, accent } = useAppTheme();
  const accentFill = skin ? `rgb(${accent.join(',')})` : FG;
  const accentInk = skin ? '#FFFFFF' : '#09090B';
  const user = useUser();
  const { patchUser } = useAuthActions();
  const [prefs, setPrefs] = useState<NotificationPreferences>(() => readPrefs(user));

  // Re-read the account's saved values each time the sheet opens.
  useEffect(() => {
    if (visible) setPrefs(readPrefs(user));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const toggle = useCallback((key: NotificationPreferenceKey, value: boolean) => {
    setPrefs((prev) => {
      const next = { ...prev, inApp: { ...prev.inApp, [key]: value } };
      updateNotificationPreferences(next)
        .then((ok) => {
          if (ok) patchUser?.({ notificationPreferences: next } as any).catch(() => {});
          else toastError(null, t("toasts.failed_to_save_settings"));
        })
        .catch((e) => toastError(e, t("toasts.failed_to_save_settings")));
      return next;
    });
  }, [patchUser, t]);

  return (
    <GlassModal surface="theme" visible={visible} onClose={onClose} presentation="bottom" scrollable maxHeight="85%">
      <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
          <Text style={{ flex: 1, fontSize: 17, fontWeight: "600", color: FG }}>
            {t("notifications.settings")}
          </Text>
          <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t("common.close", "Close")}>
            <Icon name="X" size={20} color={FG} />
          </TouchableOpacity>
        </View>

        <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
          <TouchableOpacity
            onPress={() => { onMarkAllRead(); onClose(); }}
            disabled={!hasUnread}
            accessibilityRole="button"
            style={{ flexDirection: "row", alignItems: "center", gap: 6, height: 32, paddingHorizontal: 14, borderRadius: 16, backgroundColor: accentFill, opacity: hasUnread ? 1 : 0.45 }}
          >
            <Icon name="CheckCheck" size={15} color={accentInk} />
            <Text style={{ fontSize: 13, fontWeight: "600", color: accentInk }}>
              {t("notifications.markAllRead")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { onClearAll(); onClose(); }}
            accessibilityRole="button"
            style={{ flexDirection: "row", alignItems: "center", gap: 6, height: 32, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1, borderColor: LINE }}
          >
            <Icon name="X" size={15} color={FG} />
            <Text style={{ fontSize: 13, fontWeight: "600", color: FG }}>
              {t("notifications.clearAll")}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={{ fontSize: 12, fontWeight: "600", letterSpacing: 0.7, textTransform: "uppercase", marginBottom: 4, color: MUTED }}>
          {t("notifications.notificationTypes")}
        </Text>
        {ROWS.map((row) => (
          <View key={row.key} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 }}>
            <Icon name={row.icon} size={19} color={FG} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14.5, color: FG }}>{t(row.title)}</Text>
              <Text style={{ fontSize: 12.5, color: MUTED }}>{t(row.desc)}</Text>
            </View>
            <CustomSwitch value={prefs.inApp[row.key] !== false} onValueChange={(v) => toggle(row.key, v)} />
          </View>
        ))}

        <TouchableOpacity
          onPress={() => { onClose(); onOpenAllSettings(); }}
          accessibilityRole="button"
          style={{ flexDirection: "row", alignItems: "center", paddingTop: 12, marginTop: 4, borderTopWidth: 1, borderTopColor: HAIRLINE }}
        >
          <Text style={{ flex: 1, fontSize: 14.5, color: FG }}>
            {t("notifications.allSettings", "All notification settings")}
          </Text>
          <View style={{ opacity: 0.5 }}><Icon name="ChevronRight" size={18} color={FG} /></View>
        </TouchableOpacity>
      </View>
    </GlassModal>
  );
};

export default QuickSettingsSheet;
