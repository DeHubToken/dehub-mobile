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
  const avatarUrl = getAvatarUrl(user?.avatarImageUrl);

  const handleNotificationPress = useCallback(() => {
    navigation.navigate(ScreenNames.Notifications);
  }, [navigation]);

  return (
    <View className="flex-row items-center justify-between px-4 h-11">
      {/* Profile — left */}
      <TouchableOpacity
        onPress={onMenuPress}
        activeOpacity={0.7}
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
          overlay to the profile and bell underneath it. */}
      <View
        className="absolute inset-0 items-center justify-center"
        pointerEvents="box-none"
      >
        <TouchableOpacity onPress={onLogoPress} activeOpacity={0.7}>
          <SmartImage
            source={require("../assets/web-icons/dehub-logo-compact.png")}
            style={{ width: 33, height: 28 }}
            contentFit="contain"
            cachePolicy="memory-disk"
            transition={150}
          />
        </TouchableOpacity>
      </View>

      {/* Notifications — right */}
      <View className="flex-row items-center">
        {isSignedIn && (
          <TouchableOpacity
            onPress={handleNotificationPress}
            activeOpacity={0.7}
            className="w-9 h-9 items-center justify-center"
          >
            <Icon name="Bell" size={24} color="#E5E7EB" />
            {hasUnread && (
              // rounded-md on an 18px box read as a square block. A full pill
              // with a black ring separates it from the bell the way the rest of
              // the app's badges do.
              <View
                className="absolute -top-0.5 -right-1 min-w-[18px] h-[18px] px-[5px] bg-red-500 rounded-full border-[1.5px] border-black items-center justify-center"
                pointerEvents="none"
              >
                <Text className="text-white text-[10px] font-bold leading-[12px]">
                  {(user?.notificationCount || 0) > 99 ? "99+" : user?.notificationCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

export default memo(HomeHeader);
