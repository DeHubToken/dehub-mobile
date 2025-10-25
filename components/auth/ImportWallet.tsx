import React, { memo, useCallback, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
// import { openInApp } from "../../libs/links.utils";
// import { WEBSITE_LINK } from "../../config";
import ImportWalletModal from "./ImportWalletModal";

export type ImportWalletProps = {
  onImport?: () => void;
  disabled?: boolean;
  busy?: boolean;
  className?: string;
};

const ImportWallet: React.FC<ImportWalletProps> = memo(
  ({ onImport, disabled, busy, className }) => {
    const isDisabled = !!disabled || !!busy;
    const [showModal, setShowModal] = useState(false);
    const handlePress = useCallback(() => {
      if (onImport) onImport();
      else setShowModal(true);
    }, [onImport]);

    return (
      <View className={`mt-4 ${className || ""}`.trim()}>
        <View className="flex-row items-center my-3">
          <View className="flex-1 h-[1px] bg-theme-neutrals-800" />
          <Text className="mx-3 text-theme-neutrals-500 text-[11px] uppercase tracking-wider">
            or
          </Text>
          <View className="flex-1 h-[1px] bg-theme-neutrals-800" />
        </View>

        <TouchableOpacity
          onPress={handlePress}
          disabled={isDisabled}
          accessibilityRole="button"
          className="bg-theme-neutrals-800 rounded-xl px-4 py-3 items-center active:opacity-80 disabled:opacity-50"
        >
          <View className="flex-row items-center">
            <Ionicons name="key-outline" size={16} color="#E5E7EB" />
            <Text className="text-white text-sm ml-2">
              Import external wallet
            </Text>
          </View>
        </TouchableOpacity>
        <ImportWalletModal
          visible={showModal}
          onClose={() => setShowModal(false)}
        />
      </View>
    );
  }
);

ImportWallet.displayName = "ImportWallet";
export default ImportWallet;
