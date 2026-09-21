import React, { memo, useCallback, useState } from "react";
import { View } from "react-native";
import ImportWalletModal from "./ImportWalletModal";
import MigrateAccountModal from "./MigrateAccountModal";
import { AuthButton, AuthDivider } from "./AuthControls";
import { useTranslation } from "react-i18next";

export type ImportWalletProps = {
  onImport?: () => void;
  disabled?: boolean;
  busy?: boolean;
  className?: string;
};

const ImportWallet: React.FC<ImportWalletProps> = memo(
  ({ onImport, disabled, busy, className }) => {
    const { t } = useTranslation();
    const isDisabled = !!disabled || !!busy;
    const [modalVisible, setModalVisible] = useState(false);
    const [migrateVisible, setMigrateVisible] = useState(false);
    
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
      <View className={className}>
        <AuthDivider label={t("loginModal.or")} />

        {/* Same slot on web (LoginModalBody): two more ways in, both of which
            still need one of the sign-ins above first. */}
        <AuthButton
          icon="download-outline"
          label={t("auth.migrateAccount")}
          onPress={() => setMigrateVisible(true)}
          disabled={isDisabled}
        />

        <AuthButton
          icon="key"
          label={t("auth.importExternalWallet")}
          onPress={handlePress}
          disabled={isDisabled}
        />

        {/* Import Wallet Modal - shown when used outside navigation context */}
        <ImportWalletModal visible={modalVisible} onClose={handleCloseModal} />
        <MigrateAccountModal visible={migrateVisible} onClose={() => setMigrateVisible(false)} />
      </View>
    );
  }
);

ImportWallet.displayName = "ImportWallet";
export default ImportWallet;
