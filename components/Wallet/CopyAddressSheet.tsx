/**
 * "Copy address" when the account has two of them.
 *
 * A DeHub wallet is payable on the EVM chains at an `0x…` address and on Solana
 * at a base58 one, and the two address spaces do not overlap: SOL or an SPL
 * token sent to the EVM address is unrecoverable. So every surface that offers
 * to copy "your address" asks which one first, rather than picking for the user
 * and being right most of the time.
 *
 * The Solana address is resolved when the sheet OPENS, never on mount. It is
 * normally already cached (sign-in provisions it — see
 * libs/identity-wallet.ts), but on a cold cache resolving it releases the EVM
 * key and so runs the device-owner check. Behind a deliberate tap that is a
 * fair trade; behind a screen render it would be a fingerprint prompt nobody
 * asked for.
 */
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import GlassModal from "../ui/GlassModal";
import Icon from "../ui/Icon";
import { copyToClipboard, toastSuccess, truncateAddress } from "../../libs";
import { getSolanaAddress } from "../../services/solana.service";

interface CopyAddressSheetProps {
  visible: boolean;
  onClose: () => void;
  /** The `0x…` address this account signs with. */
  evmAddress: string;
}

const CopyAddressSheet: React.FC<CopyAddressSheetProps> = ({
  visible,
  onClose,
  evmAddress,
}) => {
  const { t } = useTranslation();
  const [solanaAddress, setSolanaAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    getSolanaAddress()
      .then((address) => {
        if (!cancelled) setSolanaAddress(address);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const copy = useCallback(
    (address: string, message: string) => {
      copyToClipboard(address);
      toastSuccess(message);
      onClose();
    },
    [onClose]
  );

  return (
    <GlassModal visible={visible} onClose={onClose} presentation="bottom"
      scrollable>
      <View className="px-5 pt-5 pb-2">
        <Text className="text-white text-base font-semibold">
          {t("wallet.copyAddress")}
        </Text>
        <Text className="text-theme-neutrals-400 text-xs mt-1">
          {t("wallet.chooseAddressNetwork")}
        </Text>
      </View>

      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => copy(evmAddress, t("wallet.evmAddressCopied"))}
        className="mx-4 mb-2 px-4 py-3.5 rounded-2xl bg-theme-neutrals-800/60 flex-row items-center"
      >
        <View className="mr-3 w-9 h-9 rounded-xl bg-theme-neutrals-700/50 items-center justify-center">
          <Icon name="Wallet" size={18} color="#9ca3af" />
        </View>
        <View className="flex-1">
          <Text className="text-white text-sm font-medium">
            {t("wallet.evmAddressLabel")}
          </Text>
          <Text className="text-theme-neutrals-400 text-xs mt-0.5" numberOfLines={1}>
            {t("wallet.evmAddressHint")} · {truncateAddress(evmAddress, 6, 4)}
          </Text>
        </View>
        <Icon name="Copy" size={18} color="#6b7280" />
      </TouchableOpacity>

      {loading && !solanaAddress ? (
        <View className="mx-4 mb-4 px-4 py-5 rounded-2xl bg-theme-neutrals-800/60 items-center">
          <ActivityIndicator color="#9ca3af" />
        </View>
      ) : null}

      {solanaAddress ? (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => copy(solanaAddress, t("wallet.solanaAddressCopied"))}
          className="mx-4 mb-4 px-4 py-3.5 rounded-2xl bg-theme-neutrals-800/60 flex-row items-center"
        >
          <View className="mr-3 w-9 h-9 rounded-xl bg-theme-neutrals-700/50 items-center justify-center">
            <Icon name="Coins" size={18} color="#9ca3af" />
          </View>
          <View className="flex-1">
            <Text className="text-white text-sm font-medium">
              {t("wallet.solanaAddressLabel")}
            </Text>
            <Text className="text-theme-neutrals-400 text-xs mt-0.5" numberOfLines={1}>
              {t("wallet.solanaAddressHint")} · {truncateAddress(solanaAddress, 6, 4)}
            </Text>
          </View>
          <Icon name="Copy" size={18} color="#6b7280" />
        </TouchableOpacity>
      ) : null}
    </GlassModal>
  );
};

export default CopyAddressSheet;
