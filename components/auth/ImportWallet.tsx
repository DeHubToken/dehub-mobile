import React, { memo, useCallback, useState } from "react";
import { View } from "react-native";
import { isWalletConnectAvailable } from "../../config/reown.config";
import ImportWalletModal from "./ImportWalletModal";
import MigrateAccountModal from "./MigrateAccountModal";
import { AuthButton, AuthDivider, AuthTextButton } from "./AuthControls";
import { useTranslation } from "react-i18next";

export type ImportWalletProps = {
  onImport?: () => void;
  disabled?: boolean;
  busy?: boolean;
  className?: string;
  /**
   * `links` is the email-first sign-in's quiet row: Connect wallet, Import
   * wallet and Migrate account as text links (Connect wallet only when
   * `onConnectWallet` is given and WalletConnect is configured).
   */
  variant?: "buttons" | "links";
  onConnectWallet?: () => void;
};

const ImportWallet: React.FC<ImportWalletProps> = memo(
  ({ onImport, disabled, busy, className, variant = "buttons", onConnectWallet }) => {
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

    if (variant === "links") {
      return (
        <View className={className}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", columnGap: 20, rowGap: 4 }}>
            {onConnectWallet && isWalletConnectAvailable && (
              <AuthTextButton tone="default" label={t("loginModal.connectWallet", "Connect Wallet")} onPress={onConnectWallet} disabled={isDisabled} />
            )}
            <AuthTextButton tone="default" label={t("auth.importWallet")} onPress={handlePress} disabled={isDisabled} />
            <AuthTextButton tone="default" label={t("auth.migrateAccount")} onPress={() => setMigrateVisible(true)} disabled={isDisabled} />
          </View>
          <ImportWalletModal visible={modalVisible} onClose={handleCloseModal} />
          <MigrateAccountModal visible={migrateVisible} onClose={() => setMigrateVisible(false)} />
        </View>
      );
    }

    return (
      <View className={className}>
        <AuthDivider label={t("loginModal.or")} />

        {/* Account migration and direct key/seed import are separate flows. */}
        {/* Same 12pt rhythm as the sign-in stack above (SocialLoginIcons). */}
        <View style={{ gap: 12 }}>
          <AuthButton
            icon="download-outline"
            label={t("auth.migrateAccount")}
            onPress={() => setMigrateVisible(true)}
            disabled={isDisabled}
          />

          <AuthButton
            icon="key"
            label={t("auth.importWallet")}
            onPress={handlePress}
            disabled={isDisabled}
          />
        </View>

        {/* Import Wallet Modal - shown when used outside navigation context */}
        <ImportWalletModal visible={modalVisible} onClose={handleCloseModal} />
        <MigrateAccountModal visible={migrateVisible} onClose={() => setMigrateVisible(false)} />
      </View>
    );
  }
);

ImportWallet.displayName = "ImportWallet";
export default ImportWallet;
