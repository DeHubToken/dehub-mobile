import React, { memo, useCallback, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
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
    const [modalVisible, setModalVisible] = useState(false);
    
    const handlePress = useCallback(() => {
      if (onImport) {
        onImport();
      } else {
        // Show modal when used in contexts without navigation (e.g., SignInGatewayModal)
        setModalVisible(true);
      }
    }, [onImport]);

    const handleCloseModal = useCallback(() => {
      setModalVisible(false);
    }, []);

    return (
      <View className={`mt-2 ${className || ""}`.trim()}>
        {/* OR divider */}
        <View className="flex-row items-center my-4">
          <View className="flex-1 h-[1px] bg-neutral-700 mt-2 " />
          <Text className="mx-4 mt-2 text-gray-500 text-base font-medium uppercase tracking-wider">
            or
          </Text>
          <View className="flex-1 h-[1px] bg-neutral-700 mt-2 " />
        </View>

        {/* Import wallet button */}
        <TouchableOpacity
          onPress={handlePress}
          disabled={isDisabled}
          accessibilityRole="button"
          className="mt-4 flex-row items-center justify-center rounded-xl bg-neutral-800 border border-neutral-700 active:opacity-80"
          style={{ width: "100%", height: 60, opacity: isDisabled ? 0.5 : 1 }}
        >
          <Ionicons name="key" size={20} color="#FFFFFF" style={{ marginRight: 10,}} />
          <Text className="text-xl font-medium text-white">
            Import external wallet
          </Text>
        </TouchableOpacity>

        {/* Import Wallet Modal - shown when used outside navigation context */}
        <ImportWalletModal visible={modalVisible} onClose={handleCloseModal} />
      </View>
    );
  }
);

ImportWallet.displayName = "ImportWallet";
export default ImportWallet;
