import React, { useMemo, useCallback, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import GlassModal from '../ui/GlassModal';
import { useAuth } from '../../context/AuthContext';
import { ChainId } from '../../config/constants';
import { Ionicons } from '@expo/vector-icons';
import { toastInfo } from '../../libs';
import Updates from "expo-updates"

export type ChainSwitchModalProps = {
  visible: boolean;
  onClose: () => void;
};

const ChainSwitchModal: React.FC<ChainSwitchModalProps> = ({ visible, onClose }) => {
  const { chainId, switchChain, isSwitchingChain } = useAuth();
  const current = useMemo(() => chainId, [chainId]);
  const [pendingTarget, setPendingTarget] = useState<number | null>(null);

  const isBase = current === ChainId.BASE_MAINNET;
  const isBNB = current === ChainId.BSC_MAINNET;

  const onPick = useCallback(async (target: number) => {
    if (target === current) return onClose();
    try {
      setPendingTarget(target);
      // Switch and reconfigure provider/session centrally
      await switchChain(target);
      // Inform user and restart app to fully apply network change
      toastInfo?.('App will restart to apply the network change…');
      try {
        if ((Updates as any)?.reloadAsync) {
          await (Updates as any).reloadAsync();
          return; // reload will take over
        }
      } catch {
        // ignore; fallback below
      }
      // Fallback: if reload isn't available, close modal and inform user
      toastInfo?.('Please relaunch the app to complete the network switch.');
      onClose();
    } catch {
      // Errors surface via toasts/logs upstream if added; keep modal simple
    } finally {
      setPendingTarget(null);
    }
  }, [current, switchChain, onClose]);

  const handleClose = useCallback(() => {
    if (isSwitchingChain) return; // prevent closing while switching
    onClose();
  }, [isSwitchingChain, onClose]);

  return (
    <GlassModal visible={visible} onClose={handleClose} presentation="center" maxHeight="70%" blurIntensity={30}>
      <View className="p-4">
        <Text className="text-white font-semibold text-lg">Active Chain</Text>
        <Text className="text-theme-neutrals-400 text-xs mt-1">Choose the network to use for uploads, balances and transactions.</Text>

        <View className="mt-4 bg-theme-neutrals-900 rounded-xl border border-theme-neutrals-800 overflow-hidden">
          {/* Base */}
          <TouchableOpacity disabled={isBase || isSwitchingChain} onPress={() => onPick(ChainId.BASE_MAINNET)} className={`px-4 py-3 border-b border-theme-neutrals-800 flex-row items-center justify-between ${isBase || isSwitchingChain ? '' : 'active:opacity-80'}`}>
            <View className="flex-1 pr-3">
              <Text className="text-white text-sm">Base</Text>
              <Text className="text-theme-neutrals-400 text-[11px] mt-0.5">Chain ID: {ChainId.BASE_MAINNET}</Text>
            </View>
            {isSwitchingChain ? (
              <View className="bg-gray-700/40 px-2 py-1 rounded-full">
                <Text className="text-gray-300 text-[10px]">Switching…</Text>
              </View>
            ) : isBase ? (
              <View className="bg-blue-600/20 px-2 py-1 rounded-full">
                <Text className="text-blue-400 text-[10px] font-semibold">Active</Text>
              </View>
            ) : (
              <View className="bg-gray-700/40 px-2 py-1 rounded-full">
                <Text className="text-gray-300 text-[10px]">Switch</Text>
              </View>
            )}
          </TouchableOpacity>
          {/* BNB */}
          <TouchableOpacity disabled={isBNB || isSwitchingChain} onPress={() => onPick(ChainId.BSC_MAINNET)} className={`px-4 py-3 flex-row items-center justify-between ${isBNB || isSwitchingChain ? '' : 'active:opacity-80'}`}>
            <View className="flex-1 pr-3">
              <Text className="text-white text-sm">BNB</Text>
              <Text className="text-theme-neutrals-400 text-[11px] mt-0.5">Chain ID: {ChainId.BSC_MAINNET}</Text>
            </View>
            {isSwitchingChain ? (
              <View className="bg-gray-700/50 px-2 py-1 rounded-full">
                <Text className="text-gray-300 text-[10px]">Switching…</Text>
              </View>
            ) : isBNB ? (
              <View className="bg-blue-600/20 px-2 py-1 rounded-full">
                <Text className="text-blue-400 text-[10px] font-semibold">Active</Text>
              </View>
            ) : (
              <View className="bg-gray-700/50 px-2 py-1 rounded-full">
                <Text className="text-gray-300 text-[10px]">Switch</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {isSwitchingChain && (
          <View className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-2 mt-3 flex-row items-start">
            <Ionicons name="information-circle-outline" size={16} color="#60A5FA" />
            <Text className="text-blue-300 text-[12px] ml-2 flex-1">
              Switching network… the app will restart to apply changes.
            </Text>
          </View>
        )}

        <View className="mt-4 flex-row justify-end">
          <TouchableOpacity disabled={isSwitchingChain} onPress={handleClose} className={`px-4 h-11 rounded-xl items-center justify-center ${isSwitchingChain ? 'bg-theme-neutrals-800 opacity-60' : 'bg-theme-neutrals-700 active:opacity-80'}`}>
            <Text className="text-theme-neutrals-100">{isSwitchingChain ? 'Please wait…' : 'Close'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </GlassModal>
  );
};

export default ChainSwitchModal;
