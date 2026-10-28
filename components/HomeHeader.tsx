import React, { useCallback, memo } from "react";
import { View, TouchableOpacity, I18nManager } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import ElectricLogo from "./common/ElectricLogo";
import { useFeedPillRefreshing } from "../libs/feed-pill-refresh";
import Avatar from "./common/Avatar";
import NotificationBell from "./common/NotificationBell";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { ScreenNames } from "../navigation/ScreenNames";
import { useUser, useAuthState } from "../context/AuthContext";
import { getAvatarUrl } from "../libs/misc";
import { useAppTheme } from "../context/ThemeContext";
import { NAV_PILL_SIDE_INSET } from "./Home/FeedNavBar";

/** Drawn height of the avatar, bell and mark, so the three read as one row. */
const ICON = 26;
/** How far the avatar and bell sit inside the feed pill's side edges. */
const PILL_INSET = 4;
/** Web's avatar corner (rounded-lg), so the two match. */
const AVATAR_RADIUS = 8;

interface HomeHeaderProps {
  pullDistance?: SharedValue<number>;
  onLogoPress?: () => void;
  onMenuPress?: () => void;
  /** Pushed pages (Profile) pass this to get a back arrow before the avatar. */
  onBackPress?: () => void;
  /** Screen-reader hint for the logo; defaults to scrolling the feed to the top. */
  logoHint?: string;
}

const HomeHeader: React.FC<HomeHeaderProps> = ({ onLogoPress, onMenuPress, onBackPress, logoHint, pullDistance }) => {
  const refreshing = useFeedPillRefreshing();
  const navigation = useNavigation<any>();
  const { isSignedIn } = useAuthState();
  const user = useUser();
  const { colors, isMinimal } = useAppTheme();
  // A hair inside the pill below. Minimal's tab strip runs edge to edge.
  const edge = (isMinimal ? 0 : NAV_PILL_SIDE_INSET) + PILL_INSET;
  const { t } = useTranslation();

  const hasUnread = (user?.notificationCount || 0) > 0;
  const unreadCount = user?.notificationCount || 0;
  const avatarUrl = getAvatarUrl(user?.avatarImageUrl);

  const handleNotificationPress = useCallback(() => {
    navigation.navigate(ScreenNames.Notifications);
  }, [navigation]);

  return (
    <View className="flex-row items-center justify-between h-11" style={{ paddingHorizontal: edge }}>
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
        {isSignedIn && <TouchableOpacity
          onPress={onMenuPress}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.7}
          accessibilityRole="button"
          // Signed in this control is the user's own avatar, which is why the
          // label says what it does rather than what it looks like.
          accessibilityLabel={t("common.openMenu")}
          className="w-11 h-11 items-start justify-center"
        >
          <Avatar uri={avatarUrl} size={ICON} name={user?.displayName || user?.username} radius={AVATAR_RADIUS} />
        </TouchableOpacity>}
      </View>

      {/* dehub mark — centred on the bar itself rather than between the two
          side controls, so it stays put whether or not the bell is rendered
          (it is signed-in only). box-none lets taps through the full-width
          overlay to the profile and bell underneath it.

          The logo opens the drawer for guests. Signed in, it scrolls the
          active feed to the top and refreshes it. */}
      <View
        className="absolute inset-0 items-center justify-center"
        pointerEvents="box-none"
      >
        <ElectricLogo refreshing={refreshing} pullDistance={pullDistance} onPress={isSignedIn ? onLogoPress : onMenuPress}
          label={isSignedIn ? "DeHub" : t("common.openMenu")}
          hint={isSignedIn ? logoHint ?? t("common.scrollsFeedToTop") : undefined}
          source={require("../assets/web-icons/dehub-island-logo.png")}
          style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
          width={42} height={36} tint={colors.foreground} />
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
          className="w-11 h-11 items-end justify-center"
          // The bell's body (not the clapper below it) sits on the mark's
          // bottom edge: at 29.75 it runs y 0.5 to 24.5 and x 2.3 to 27.4 of its
          // box, so the box moves down 3.4 and out 2.4. Same as web.
          style={{ marginRight: -2.4, transform: [{ translateY: 3.4 }] }}
        >
          <NotificationBell unread={unreadCount} size={29.75} color={colors.foreground} />
        </TouchableOpacity>
      ) : (
        // Holds the right edge so the left control cannot drift into the
        // centre under justify-between when there is no bell.
        <View className="w-11 h-11" />
      )}
    </View>
  );
};

export default memo(HomeHeader);
