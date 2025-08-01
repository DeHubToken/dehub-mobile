import React, { useState } from "react";
import { View, Text, TouchableOpacity, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import defaultIcon from "../../assets/icon.png";

const ProfileAssets = () => {
  const [showDHBOptions, setShowDHBOptions] = useState(false);

  const assets = [
    { name: "DHB", balance: "0", icon: defaultIcon, hasActions: true },
    { name: "USDC", balance: "0", icon: defaultIcon },
    { name: "USDT", balance: "0", icon: defaultIcon },
    { name: "ETH", balance: "0", icon: defaultIcon },
  ];

  const dhbActions = [
    { label: "Top up", disabled: false },
    { label: "Bridge", subtitle: "coming soon", disabled: true },
    { label: "Transfer", disabled: false },
  ];

  const toggleDHBOptions = () => {
    setShowDHBOptions((prev) => !prev);
  };

  return (
    <View className="mx-4 my-3 border border-gray-700 rounded-lg p-4">
      <Text className="text-base text-white font-semibold mb-2">Assets</Text>

      {assets.map((asset) => (
        <View key={asset.name} className="mb-1">
          <View className="flex-row items-center justify-between py-2">
            <TouchableOpacity
              className="flex-row items-center flex-1"
              onPress={asset.hasActions ? toggleDHBOptions : undefined}
            >
              <Image
                source={asset.icon}
                className="w-8 h-8 rounded-full mr-3"
              />
              <Text className="text-md text-white">{asset.name}</Text>
              {asset.hasActions && (
                <Ionicons
                  name={showDHBOptions ? "chevron-down" : "chevron-forward"}
                  size={14}
                  color="#9CA3AF"
                  className="ml-1"
                />
              )}
            </TouchableOpacity>
            <Text className="text-sm text-gray-300">{asset.balance}</Text>
          </View>

          {asset.hasActions && showDHBOptions && (
            <View className="ml-9 mt-1 mb-2 flex-row space-x-2">
              {dhbActions.map((action) => (
                <TouchableOpacity
                  key={action.label}
                  className={`py-2 px-3 rounded-md flex-1 mx-1 rounded ${
                    action.disabled ? "bg-gray-800" : "bg-gray-700"
                  }`}
                  disabled={action.disabled}
                >
                  <View className="items-center">
                    <Text
                      className={`text-xs ${
                        action.disabled ? "text-gray-500" : "text-white"
                      }`}
                    >
                      {action.label}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      ))}
    </View>
  );
};

export default ProfileAssets;
