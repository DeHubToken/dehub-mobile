import React, { useCallback, memo } from "react";
import { View, TouchableOpacity, Text } from "react-native";
import SmartImage from "./common/SmartImage";
import Avatar from "./common/Avatar";
import Icon from "./ui/Icon";
import { useNavigation } from "@react-navigation/native";
import { ScreenNames } from "../navigation/ScreenNames";
import { useUser, useAuthState } from "../context/AuthContext";
import { getAvatarUrl } from "../libs/misc";
import { theme } from "../theme";

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
  const hasAvatar = !!user?.avatarImageUrl;
  const initial = (user?.displayName || user?.username || "U").charAt(0).toUpperCase();

  const handleNotificationPress = useCallback(() => {
    navigation.navigate(ScreenNames.Notifications);
  }, [navigation]);

  const handleSignInPress = useCallback(() => {
    navigation.navigate(ScreenNames.SignIn);
  }, [navigation]);

  return (
    <View className="flex-row items-center justify-between px-4 py-3">
      <TouchableOpacity
        onPress={onMenuPress}
        activeOpacity={0.7}
        className="w-9 h-9 items-center justify-center"
      >
        {isSignedIn ? (
          hasAvatar ? (
            <Avatar uri={avatarUrl} size={32} />
          ) : (
            <View className="w-8 h-8 rounded-full bg-theme-accent items-center justify-center">
              <Text className="text-white text-sm font-bold">{initial}</Text>
            </View>
          )
        ) : (
          <Icon name="Menu" size={24} color="#E5E7EB" />
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={onLogoPress} activeOpacity={0.7}>
        <SmartImage
          source={require("../assets/web-icons/dehub-logo-compact.png")}
          style={{ width: 32, height: 32 }}
          contentFit="contain"
          cachePolicy="memory-disk"
          transition={150}
        />
      </TouchableOpacity>

      <TouchableOpacity
        onPress={isSignedIn ? handleNotificationPress : handleSignInPress}
        activeOpacity={0.7}
        className="w-9 h-9 items-center justify-center"
      >
        {isSignedIn ? (
          <View>
            <Icon name="Bell" size={24} color="#E5E7EB" />
            {hasUnread && (
              <View
                className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: theme.colors.accent }}
              />
            )}
          </View>
        ) : (
          <Icon name="LogIn" size={24} color="#E5E7EB" />
        )}
      </TouchableOpacity>
    </View>
  );
};

export default memo(HomeHeader);
