import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  title: string;
  onClose: () => void;
};

const UploadHeader: React.FC<Props> = ({ title, onClose }) => {
  return (
    <View className="flex-row items-center justify-between p-4">
      <Text className="text-white font-semibold text-2xl">{title}</Text>
      <TouchableOpacity
        onPress={onClose}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        className="w-9 h-9 items-center justify-center"
        accessibilityLabel="Close upload"
      >
        <Ionicons name="close" size={30} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );
};

export default UploadHeader;
