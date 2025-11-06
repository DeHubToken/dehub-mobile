import React from "react";
import { View, Text } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

type DpayHeaderProps = {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
};

const DpayHeader: React.FC<DpayHeaderProps> = ({ title, subtitle, right }) => {
  const hasRight = !!right;

  return (
    // <LinearGradient
    //   colors={["#0D0D0D", "#1A1A1A"]}
    //   start={{ x: 0, y: 0 }}
    //   end={{ x: 1, y: 1 }}
    //   className="px-5 pt-6 pb-4 rounded-b-3xl shadow-lg shadow-black/30"
    // >
      <View
        className={`flex-row items-center px-5 pt-4 pb-4 ${
          hasRight ? "justify-between" : "justify-center"
        }`}
      >
        <View
          className={`${
            hasRight ? "flex-1 pr-3" : "items-center"
          }`}
        >
          <Text
            className={`text-white font-bold ${
              hasRight ? "text-2xl" : "text-3xl"
            } tracking-tight`}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              className={`${
                hasRight ? "text-gray-400 text-sm mt-1" : "text-gray-400 text-base mt-1 text-center"
              }`}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
        {hasRight && <View className="items-end">{right}</View>}
      </View>
    // </LinearGradient>
  );
};

export default DpayHeader;
