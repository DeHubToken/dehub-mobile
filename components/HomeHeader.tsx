import React, { useCallback, memo } from "react";
import { View, TouchableOpacity, Text, I18nManager } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import ElectricLogo from "./common/ElectricLogo";
import { useFeedPillRefreshing } from "../libs/feed-pill-refresh";
import Avatar from "./common/Avatar";
import Icon from "./ui/Icon";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { ScreenNames } from "../navigation/ScreenNames";
import { useUser, useAuthState } from "../context/AuthContext";
import { getAvatarUrl } from "../libs/misc";
import { useAppTheme } from "../context/ThemeContext";

interface HomeHeaderProps {
  onLogoPress?: () => void;
  onMenuPress?: () => void;
  /** Pushed pages (Profile) pass this to get a back arrow before the avatar. */
  onBackPress?: () => void;
  /** Screen-reader hint for the logo; defaults to scrolling the feed to the top. */
  logoHint?: string;
}

const HomeHeader: React.FC<HomeHeaderProps> = ({ onLogoPress, onMenuPress, onBackPress, logoHint }) => {
  const refreshing = useFeedPillRefreshing();
  const navigation = useNavigation<any>();
  const { isSignedIn } = useAuthState();
  const user = useUser();
  const { colors } = useAppTheme();
  const { t } = useTranslation();

  const hasUnread = (user?.notificationCount || 0) > 0;
  const unreadCount = user?.notificationCount || 0;
  const avatarUrl = getAvatarUrl(user?.avatarImageUrl);

  const handleNotificationPress = useCallback(() => {
    navigation.navigate(ScreenNames.Notifications);
  }, [navigation]);

  return (
    <View className="flex-row items-center justify-between px-4 h-11">
      {/* Profile — left. Matches web's MobileHeader, which puts the drawer
          trigger on the left, the mark in the middle and the bell on the
          right. A pushed page adds a back arrow in front of it and keeps the
          menu trigger. */}
      <View className="flex-row items-center">
        {onBackPress ? (
          <TouchableOpacity
            onPress={onBackPress}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t("common.goBack")}
            className="w-10 h-10 mr-1 items-center justify-center"
          >
            {/* Icons are not mirrored by the layout; back points right in RTL. */}
            <Ionicons
              name="arrow-back"
              size={22}
              color={colors.neutrals[100]}
              style={I18nManager.isRTL ? { transform: [{ scaleX: -1 }] } : undefined}
            />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          onPress={onMenuPress}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.7}
          accessibilityRole="button"
          // Signed in this control is the user's own avatar, which is why the
          // label says what it does rather than what it looks like.
          accessibilityLabel={t("common.openMenu")}
          className="w-8 h-8 items-center justify-center"
        >
          {isSignedIn ? (
            <Avatar uri={avatarUrl} size={27} name={user?.displayName || user?.username} />
          ) : (
            <Icon name="Menu" size={31} color={colors.foreground} />
          )}
        </TouchableOpacity>
      </View>

      {/* dehub mark — centred on the bar itself rather than between the two
          side controls, so it stays put whether or not the bell is rendered
          (it is signed-in only). box-none lets taps through the full-width
          overlay to the profile and bell underneath it.

          The logo is a control, not decoration — it scrolls the active feed to
          the top and refreshes it. Unlabelled it announced as "image button". */}
      <View
        className="absolute inset-0 items-center justify-center"
        pointerEvents="box-none"
      >
        <ElectricLogo refreshing={refreshing} onPress={onLogoPress} label="DeHub"
          hint={logoHint ?? t("common.scrollsFeedToTop")}
          source={require("../assets/web-icons/dehub-logo-center.png")}
          width={33} height={28} tint={colors.foreground} />
      </View>

      {/* Notifications — right. Signed-in only; the centred mark does not move
          when this is absent. */}
      {isSignedIn ? (
        <TouchableOpacity
          onPress={handleNotificationPress}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={hasUnread ? t("common.notificationsUnread", { unread: unreadCount }) : t("nav.notifications")}
          className="w-9 h-9 items-center justify-center"
        >
          <Icon name="Bell" size={24} color={colors.neutrals[200]} />
          {hasUnread && (
            <View
              style={{
                position: "absolute",
                top: 0,
                right: -8,
                minWidth: 18,
                height: 18,
                paddingHorizontal: 4,
                backgroundColor: "#ef4444",
                borderRadius: 6,
                alignItems: "center",
                justifyContent: "center",
              }}
              pointerEvents="none"
            >
              <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700", lineHeight: 12, textAlign: "center" }}>
                {unreadCount > 99 ? "99+" : unreadCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      ) : (
        // Holds the right edge so the left control cannot drift into the
        // centre under justify-between when there is no bell.
        <View className="w-9 h-9" />
      )}
    </View>
  );
};

export default memo(HomeHeader);

