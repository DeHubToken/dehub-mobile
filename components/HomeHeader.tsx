import React, { useCallback, memo } from "react";
import { View, TouchableOpacity, Text } from "react-native";
import SmartImage from "./common/SmartImage";
import Avatar from "./common/Avatar";
import Icon from "./ui/Icon";
import { useNavigation } from "@react-navigation/native";
import { ScreenNames } from "../navigation/ScreenNames";
import { useUser, useAuthState } from "../context/AuthContext";
import { getAvatarUrl } from "../libs/misc";

interface HomeHeaderProps {
  onLogoPress?: () => void;
  onMenuPress?: () => void;
}

const HomeHeader: React.FC<HomeHeaderProps> = ({ onLogoPress, onMenuPress }) => {
  const navigation = useNavigation<any>();
  const { isSignedIn } = useAuthState();
  const user = useUser();

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
          right. */}
      <TouchableOpacity
        onPress={onMenuPress}
        activeOpacity={0.7}
        accessibilityRole="button"
        // Signed in this control is the user's own avatar, which is why the
        // label says what it does rather than what it looks like.
        accessibilityLabel="Open menu"
        className="w-8 h-8 items-center justify-center"
      >
        {isSignedIn ? (
          <Avatar uri={avatarUrl} size={27} name={user?.displayName || user?.username} />
        ) : (
          <Icon name="Menu" size={31} color="#FFFFFF" />
        )}
      </TouchableOpacity>

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
        <TouchableOpacity
          onPress={onLogoPress}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="DeHub"
          accessibilityHint="Scrolls to the top of the feed and refreshes it"
        >
          <SmartImage
            source={require("../assets/web-icons/dehub-logo-compact.png")}
            style={{ width: 33, height: 28 }}
            contentFit="contain"
            cachePolicy="memory-disk"
            transition={150}
          />
        </TouchableOpacity>
      </View>

      {/* Notifications — right. Signed-in only; the centred mark does not move
          when this is absent. */}
      {isSignedIn ? (
        <TouchableOpacity
          onPress={handleNotificationPress}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={hasUnread ? `Notifications, ${unreadCount} unread` : "Notifications"}
          className="w-9 h-9 items-center justify-center"
        >
          <Icon name="Bell" size={24} color="#E5E7EB" />
          {hasUnread && (
            // rounded-md on an 18px box read as a square block. A full pill
            // with a black ring separates it from the bell the way the rest of
            // the app's badges do.
            <View
              className="absolute -top-0.5 -right-1 min-w-[18px] h-[18px] px-[5px] bg-white rounded-full border-[1.5px] border-black items-center justify-center"
              pointerEvents="none"
            >
              <Text className="text-zinc-950 text-[10px] font-bold leading-[12px]">
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
