import React from "react";
import { View, Text, Image } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

type DpayHeaderProps = {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
};

const DpayHeader: React.FC<DpayHeaderProps> = ({ title, subtitle, right }) => {
  const hasRight = !!right;

  return (
    <View
      className={`flex-row items-center px-5 pt-4 pb-4 ${
        hasRight ? "justify-between" : "justify-center"
      }`}
    >
      <View className={`${hasRight ? "flex-1 pr-3" : "items-center"}`}>
        <Image
          source={require('../../assets/banner.png')}
          className="w-32 h-10 rounded-lg mb-2"
          resizeMode="contain"
          style={{ alignSelf: hasRight ? 'flex-start' : 'center' }}
        />
        {/* <Text
            className={`text-white font-semibold font-sans ${
              hasRight ? "text-2xl" : "text-3xl"
            } tracking-tight`}
            style={{ fontFamily: 'Inter', fontWeight: '600', includeFontPadding: false, lineHeight: hasRight ? 32 : 38 }}
          >
            {title}
          </Text> */}
        {subtitle ? (
          <Text
            className={`text-gray-400 ${hasRight ? "text-sm" : "text-base text-center"} font-sans`}
            style={{ fontFamily: 'Inter', fontWeight: '400', includeFontPadding: false, lineHeight: hasRight ? 20 : 24 }}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {hasRight && <View className="items-end">{right}</View>}
    </View>
  );
};

export default DpayHeader;
