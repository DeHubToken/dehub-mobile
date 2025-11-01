import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import GlassModal from '../ui/GlassModal';
import { useAuth } from '../../context/AuthContext';

export type BlockedAccountsModalProps = {
  visible: boolean;
  onClose: () => void;
};

const BlockedAccountsModal: React.FC<BlockedAccountsModalProps> = ({ visible, onClose }) => {
  const { user } = useAuth();
  const blocked = useMemo(() => user?.blocklist?.blocked || [], [user]);

  return (
    <GlassModal visible={visible} onClose={onClose} presentation="center" maxHeight="75%" blurIntensity={30}>
      <View className="p-4">
        <Text className="text-white font-semibold text-lg">Blocked Accounts</Text>
        <Text className="text-theme-neutrals-400 text-xs mt-1">Users you have blocked won’t be able to contact you.</Text>

        <View className="mt-4 bg-theme-neutrals-900 rounded-xl border border-theme-neutrals-800 overflow-hidden">
          {blocked.length === 0 ? (
            <View className="px-4 py-6 items-center justify-center">
              <Text className="text-theme-neutrals-400 text-sm">You haven’t blocked anyone.</Text>
            </View>
          ) : (
            blocked.map((b, i) => (
              <View key={`${b.address || b.username || i}`} className="px-4 py-3 border-b border-theme-neutrals-800 flex-row items-center justify-between">
                <View className="flex-1 pr-3">
                  <Text className="text-white text-sm" numberOfLines={1}>{b.username || b.address}</Text>
                  {b.address ? (
                    <Text className="text-theme-neutrals-400 text-[11px] mt-0.5" numberOfLines={1}>{b.address}</Text>
                  ) : null}
                </View>
                <View className="bg-gray-700/50 rounded-full px-2 py-1">
                  <Text className="text-gray-300 text-[10px]">Blocked</Text>
                </View>
              </View>
            ))
          )}
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

export default BlockedAccountsModal;
