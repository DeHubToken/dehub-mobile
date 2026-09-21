import React, { memo, useCallback } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import GlassModal from "../ui/GlassModal";
import { AuthButton, AuthTextButton, authText } from "./AuthControls";
import { setWalletSetupIntent } from "../../libs/wallet-setup-intent";

export interface MigrateAccountModalProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * "Migrate account" from the sign-in surfaces.
 *
 * An old account can only be recovered once a Supabase identity exists (the
 * recovered wallet is saved against it), so this sheet cannot run the
 * recovery itself. It explains what to do — sign in with the same login as
 * before — and arms the migrate intent so a sign-in that matches nothing is
 * reported rather than quietly turned into a new account. A matching sign-in
 * lands on LegacyAccountWarningModal exactly as it always has.
 */
const MigrateAccountModal: React.FC<MigrateAccountModalProps> = memo(({ visible, onClose }) => {
  const { t } = useTranslation();

  const handleContinue = useCallback(() => {
    setWalletSetupIntent("migrate");
    onClose();
  }, [onClose]);

  const handleCancel = useCallback(() => {
    setWalletSetupIntent(null);
    onClose();
  }, [onClose]);

  return (
    <GlassModal visible={visible} onClose={handleCancel} presentation="center" blurIntensity={50}>
      <View style={styles.sheet}>
        <Text style={authText.modalTitle}>{t("auth.migrateAccount")}</Text>
        <Text style={[authText.body, { marginTop: 12 }]}>{t("auth.migrateAccountBody")}</Text>
        <Text style={[authText.caption, { marginTop: 12 }]}>{t("auth.migrateAccountNote")}</Text>
        <AuthButton
          variant="primary"
          icon="log-in-outline"
          label={t("auth.migrateAccountContinue")}
          onPress={handleContinue}
          style={{ marginTop: 20 }}
        />
        <AuthTextButton label={t("common.cancel")} onPress={handleCancel} tone="muted" />
      </View>
    </GlassModal>
  );
});

MigrateAccountModal.displayName = "MigrateAccountModal";

const styles = StyleSheet.create({
  sheet: {
    padding: 24,
  },
});

export default MigrateAccountModal;
