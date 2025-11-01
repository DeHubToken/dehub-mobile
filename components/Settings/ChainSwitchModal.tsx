import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import GlassModal from '../ui/GlassModal';
import { useAuth } from '../../context/AuthContext';
import { ChainId } from '../../config/constants';
import { Ionicons } from '@expo/vector-icons';

export type ChainSwitchModalProps = {
  visible: boolean;
  onClose: () => void;
};

const ChainSwitchModal: React.FC<ChainSwitchModalProps> = ({ visible, onClose }) => {
  const { chainId } = useAuth();
  const current = useMemo(() => chainId, [chainId]);

  const isBase = current === ChainId.BASE_MAINNET;
  const isBNB = current === ChainId.BSC_MAINNET;

  return (
    <GlassModal visible={visible} onClose={onClose} presentation="center" maxHeight="70%" blurIntensity={30}>
      <View className="p-4">
        <Text className="text-white font-semibold text-lg">Active Chain</Text>
        <Text className="text-theme-neutrals-400 text-xs mt-1">Switching chains is temporarily disabled.</Text>

        <View className="mt-4 bg-theme-neutrals-900 rounded-xl border border-theme-neutrals-800 overflow-hidden">
          {/* Base */}
          <View className="px-4 py-3 border-b border-theme-neutrals-800 flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-white text-sm">Base</Text>
              <Text className="text-theme-neutrals-400 text-[11px] mt-0.5">Chain ID: {ChainId.BASE_MAINNET}</Text>
            </View>
            {isBase ? (
              <View className="bg-blue-600/20 px-2 py-1 rounded-full">
                <Text className="text-blue-400 text-[10px] font-semibold">Active</Text>
              </View>
            ) : (
              <View className="bg-gray-700/40 px-2 py-1 rounded-full">
                <Text className="text-gray-300 text-[10px]">Unavailable</Text>
              </View>
            )}
          </View>
          {/* BNB */}
          <View className="px-4 py-3 flex-row items-center justify-between opacity-70">
            <View className="flex-1 pr-3">
              <Text className="text-white text-sm">BNB</Text>
              <Text className="text-theme-neutrals-400 text-[11px] mt-0.5">Chain ID: {ChainId.BSC_MAINNET}</Text>
            </View>
            <View className="bg-gray-700/50 px-2 py-1 rounded-full">
              <Text className="text-gray-300 text-[10px]">Disabled</Text>
            </View>
          </View>
        </View>

        <View className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-2 mt-3 flex-row items-start">
          <Ionicons name="information-circle-outline" size={16} color="#FBBF24" />
          <Text className="text-amber-300 text-[12px] ml-2 flex-1">
            BNB is temporarily disabled while we review our contracts. Chain switching is not available at this time.
          </Text>
        </View>

        <View className="mt-4 flex-row justify-end">
          <TouchableOpacity onPress={onClose} className="px-4 h-11 rounded-xl bg-theme-neutrals-700 items-center justify-center active:opacity-80">
            <Text className="text-theme-neutrals-100">Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </GlassModal>
  );
};

export default ChainSwitchModal;
