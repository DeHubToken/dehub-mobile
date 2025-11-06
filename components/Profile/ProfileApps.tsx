import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { ScreenNames } from "../../navigation/ScreenNames";
import { useAuth } from "../../context/AuthContext";
import { ChainId } from "../../config/constants";
import { toastInfo } from "../../libs";

type AppItem = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap | string;
  active: boolean;
};

const ProfileApps: React.FC = () => {
  const navigation = useNavigation<any>();
  const { chainId } = useAuth() as any;

  const apps: AppItem[] = [
    {
      label: "Fiat Gateway",
      icon: "card-outline",
      active: true,
    },
    {
      label: "Play to Earn",
      icon: "game-controller-outline",
      active: false,
    },
    {
      label: "Global Chat",
      icon: "chatbubble-ellipses-outline",
      active: false,
    },
    {
      label: "More Coming Soon",
      icon: "apps-outline",
      active: false,
    },
  ];

  const handlePress = React.useCallback(
    (item: AppItem) => {
      if (!item.active) return;

      // Global guard: all top app buttons require Base network
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
    <View className="mx-4 my-3 bg-theme-neutrals-800 rounded-2xl p-4 relative">
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
              <Ionicons
                name={app.icon as any}
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
