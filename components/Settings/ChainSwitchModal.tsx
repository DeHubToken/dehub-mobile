import React, { useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { useTranslation } from 'react-i18next';
import GlassModal from '../ui/GlassModal';
import { useProvider } from '../../context/AuthContext';
import { ChainId } from '../../config/constants';
import Icon from '../ui/Icon';

const CHAIN_ICONS: Record<number, any> = {
  [ChainId.BASE_MAINNET]: require('../../assets/chains/base-icon.png'),
  [ChainId.BSC_MAINNET]: require('../../assets/chains/bnb-icon.png'),
};

export type ChainSwitchModalProps = {
  visible: boolean;
  onClose: () => void;
};

const ChainSwitchModal: React.FC<ChainSwitchModalProps> = ({ visible, onClose }) => {
  const { chainId } = useProvider();
  const { t } = useTranslation();
  const current = useMemo(() => chainId, [chainId]);

  const isBase = current === ChainId.BASE_MAINNET;
  const isBNB = current === ChainId.BSC_MAINNET;

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  return (
    <GlassModal visible={visible} onClose={handleClose} presentation="center" maxHeight="70%" blurIntensity={30}>
      <View className="p-4">
        <Text className="text-white font-semibold text-lg">{t("settings.activeChain")}</Text>
        <Text className="text-theme-neutrals-400 text-xs mt-1">{t("settings.activeChainDesc")}</Text>

        <View className="bg-white/10 border border-white/20 rounded-xl p-3 mt-4 flex-row items-start">
          <Icon name="Wrench" size={16} color="#D4D4D8" />
          <Text className="text-white/80 text-[12px] ml-2 flex-1">
            {t("settings.chainSwitchUnavailable")}
          </Text>
        </View>

        <View className="mt-4 bg-theme-neutrals-900 rounded-xl border border-theme-neutrals-800 overflow-hidden opacity-50">
          <TouchableOpacity disabled className="px-4 py-3 border-b border-theme-neutrals-800 flex-row items-center justify-between">
            <View className="flex-row items-center flex-1 pr-3">
              <Image source={CHAIN_ICONS[ChainId.BASE_MAINNET]} className="w-8 h-8 rounded-full mr-3" />
              <View>
                <Text className="text-white text-sm">Base</Text>
                <Text className="text-theme-neutrals-400 text-[11px] mt-0.5">Chain ID: {ChainId.BASE_MAINNET}</Text>
              </View>
            </View>
            {isBase ? (
              <View className="bg-white/10 px-2 py-1 rounded-full">
                <Text className="text-theme-neutrals-200 text-[10px] font-semibold">{t("settings.chainActive")}</Text>
              </View>
            ) : (
              <View className="bg-theme-neutrals-700/50 px-2 py-1 rounded-full">
                <Text className="text-theme-neutrals-400 text-[11px]">{t("settings.comingSoon")}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity disabled className="px-4 py-3 flex-row items-center justify-between">
            <View className="flex-row items-center flex-1 pr-3">
              <Image source={CHAIN_ICONS[ChainId.BSC_MAINNET]} className="w-8 h-8 rounded-full mr-3" />
              <View>
                <Text className="text-white text-sm">BNB</Text>
                <Text className="text-theme-neutrals-400 text-[11px] mt-0.5">Chain ID: {ChainId.BSC_MAINNET}</Text>
              </View>
            </View>
            {isBNB ? (
              <View className="bg-white/10 px-2 py-1 rounded-full">
                <Text className="text-theme-neutrals-200 text-[10px] font-semibold">{t("settings.chainActive")}</Text>
              </View>
            ) : (
              <View className="bg-theme-neutrals-700/50 px-2 py-1 rounded-full">
                <Text className="text-theme-neutrals-400 text-[11px]">{t("settings.comingSoon")}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <View className="mt-4 flex-row justify-end">
          <TouchableOpacity onPress={handleClose} className="px-4 h-11 rounded-xl items-center justify-center bg-theme-neutrals-700 active:opacity-80">
            <Text className="text-theme-neutrals-100">{t("common.close")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </GlassModal>
  );
};

export default ChainSwitchModal;
