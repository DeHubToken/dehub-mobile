import React, { useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import GlassModal from '../ui/GlassModal';
import { useAuth } from '../../context/AuthContext';
import { ChainId } from '../../config/constants';
import { Ionicons } from '@expo/vector-icons';

const CHAIN_ICONS: Record<number, any> = {
  [ChainId.BASE_MAINNET]: require('../../assets/chains/base-icon.png'),
  [ChainId.BSC_MAINNET]: require('../../assets/chains/bnb-icon.png'),
};

export type ChainSwitchModalProps = {
  visible: boolean;
  onClose: () => void;
};

const ChainSwitchModal: React.FC<ChainSwitchModalProps> = ({ visible, onClose }) => {
  const { chainId } = useAuth();
  const current = useMemo(() => chainId, [chainId]);

  const isBase = current === ChainId.BASE_MAINNET;
  const isBNB = current === ChainId.BSC_MAINNET;

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  return (
    <GlassModal visible={visible} onClose={handleClose} presentation="center" maxHeight="70%" blurIntensity={30}>
      <View className="p-4">
        <Text className="text-white font-semibold text-lg">Active Chain</Text>
        <Text className="text-theme-neutrals-400 text-xs mt-1">Choose the network to use for uploads, balances and transactions.</Text>

        {/* Coming soon notice */}
        <View className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 mt-4 flex-row items-start">
          <Ionicons name="construct-outline" size={16} color="#FBBF24" />
          <Text className="text-yellow-300 text-[12px] ml-2 flex-1">
            Chain switching is temporarily unavailable while we finalize multi-chain support. Stay tuned!
          </Text>
        </View>

        <View className="mt-4 bg-theme-neutrals-900 rounded-xl border border-theme-neutrals-800 overflow-hidden opacity-50">
          {/* Base */}
          <TouchableOpacity disabled className="px-4 py-3 border-b border-theme-neutrals-800 flex-row items-center justify-between">
            <View className="flex-row items-center flex-1 pr-3">
              <Image source={CHAIN_ICONS[ChainId.BASE_MAINNET]} className="w-8 h-8 rounded-full mr-3" />
              <View>
                <Text className="text-white text-sm">Base</Text>
                <Text className="text-theme-neutrals-400 text-[11px] mt-0.5">Chain ID: {ChainId.BASE_MAINNET}</Text>
              </View>
            </View>
            {isBase ? (
              <View className="bg-blue-600/20 px-2 py-1 rounded-full">
                <Text className="text-blue-400 text-[10px] font-semibold">Active</Text>
              </View>
            ) : (
              <View className="bg-gray-700/40 px-2 py-1 rounded-full">
                <Text className="text-gray-400 text-[10px]">Coming soon</Text>
              </View>
            )}
          </TouchableOpacity>
          {/* BNB */}
          <TouchableOpacity disabled className="px-4 py-3 flex-row items-center justify-between">
            <View className="flex-row items-center flex-1 pr-3">
              <Image source={CHAIN_ICONS[ChainId.BSC_MAINNET]} className="w-8 h-8 rounded-full mr-3" />
              <View>
                <Text className="text-white text-sm">BNB</Text>
                <Text className="text-theme-neutrals-400 text-[11px] mt-0.5">Chain ID: {ChainId.BSC_MAINNET}</Text>
              </View>
            </View>
            {isBNB ? (
              <View className="bg-blue-600/20 px-2 py-1 rounded-full">
                <Text className="text-blue-400 text-[10px] font-semibold">Active</Text>
              </View>
            ) : (
              <View className="bg-gray-700/50 px-2 py-1 rounded-full">
                <Text className="text-gray-400 text-[10px]">Coming soon</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <View className="mt-4 flex-row justify-end">
          <TouchableOpacity onPress={handleClose} className="px-4 h-11 rounded-xl items-center justify-center bg-theme-neutrals-700 active:opacity-80">
            <Text className="text-theme-neutrals-100">Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </GlassModal>
  );
};

export default ChainSwitchModal;
