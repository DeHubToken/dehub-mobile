import React, { useCallback } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useNavigation } from "@react-navigation/native";
import Icon from "../ui/Icon";
import type { IconName } from "../ui/Icon";
import { ScreenNames } from "../../navigation/ScreenNames";
import { useProvider } from "../../context/AuthContext";
import { ChainId } from "../../config/constants";
import { toastInfo } from "../../libs";

type AppItem = {
  label: string;
  icon: IconName;
  active: boolean;
};

const ProfileApps: React.FC = () => {
  const navigation = useNavigation<any>();
  const { chainId } = useProvider();

  const apps: AppItem[] = [
    {
      label: "Fiat Gateway",
      icon: "CreditCard",
      active: true,
    },
    {
      label: "Public Chat",
      icon: "MessagesSquare",
      active: true,
    },
    {
      label: "Play to Earn",
      icon: "Gamepad2",
      active: false,
    },
    {
      label: "More Coming Soon",
      icon: "LayoutGrid",
      active: false,
    },
  ];

  const handlePress = React.useCallback(
    (item: AppItem) => {
      if (!item.active) return;

      if (item.label === "Public Chat") {
        navigation.navigate(ScreenNames.LiveChat);
        return;
      }

      if (chainId !== ChainId.BASE_MAINNET) {
        toastInfo("Dpay is only available on Base.");
        return;
      }

      if (item.label === "Fiat Gateway") {
        navigation.navigate(ScreenNames.Dpay);
      }
    },
    [navigation, chainId]
  );

  return (
    <View className="mx-3 my-3 bg-theme-neutrals-800 rounded-xl p-4 relative">
      {/* Header */}
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-base text-white font-semibold">Apps</Text>
      </View>

      {/* Apps Grid */}
      <View className="flex-row flex-wrap justify-between">
        {apps.map((app) => (
          <TouchableOpacity
            key={app.label}
            onPress={app.active ? () => handlePress(app) : undefined}
            disabled={!app.active}
            className={`w-[30%] mb-5 items-center ${
              app.active ? "opacity-100" : "opacity-40"
            }`}
          >
            <View
              className={`w-14 h-14 rounded-full items-center justify-center ${
                app.active ? "bg-gray-700" : "bg-gray-800"
              }`}
            >
              <Icon
                name={app.icon}
                size={26}
                color={app.active ? "#fff" : "#888"}
              />
            </View>
            <Text className="text-xs text-gray-300 mt-2 text-center">
              {app.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

export default ProfileApps;
