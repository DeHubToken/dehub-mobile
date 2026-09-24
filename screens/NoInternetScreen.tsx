import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import AccentButtonGradient from '../components/ui/AccentButtonGradient';
import { colors } from '../theme/colors';

interface NoInternetScreenProps {
  onRetry: () => void;
}

export default function NoInternetScreen({ onRetry }: NoInternetScreenProps) {
  const { t } = useTranslation();
  return (
    <View className="flex-1 bg-theme-neutrals-900">
      <View className="flex-1 justify-center items-center px-6">
        <View className="bg-theme-neutrals-800 rounded-2xl p-6 mb-6 relative">
          <Ionicons
            name="wifi-outline"
            size={64}
            color={colors.neutrals[600]}
          />
          <View className="absolute -top-1 -right-1 bg-white rounded-full p-1">
            <Ionicons 
              name="close" 
              size={16} 
              color="#09090B" 
            />
          </View>
        </View>

        <Text className="text-theme-neutrals-100 text-2xl font-bold text-center mb-3">
          {t('common.noInternetTitle')}
        </Text>

        <Text className="text-theme-neutrals-300 text-base text-center mb-8 leading-6 max-w-sm">
          {t('common.noInternetBody')}
        </Text>

        <View className="bg-theme-neutrals-800 rounded-lg p-4 mb-8 w-full max-w-sm">
          <View className="flex-row items-center justify-center">
            <View className="w-3 h-3 bg-white rounded-full mr-3" />
            <Text className="text-theme-neutrals-200 text-sm">
              {t('common.noInternetStatus')}
            </Text>
          </View>
        </View>

        <View className="w-full max-w-sm mb-4">
          <AccentButtonGradient>
            <TouchableOpacity
              onPress={onRetry}
              className="py-4 px-8"
              activeOpacity={0.8}
            >
              <View className="flex-row items-center justify-center">
                <Ionicons
                  name="refresh"
                  size={20}
                  color="white"
                />
                <Text className="text-white text-base font-semibold ml-2">
                  {t('common.tryAgain')}
                </Text>
              </View>
            </TouchableOpacity>
          </AccentButtonGradient>
        </View>

        <Text className="text-theme-neutrals-400 text-sm text-center max-w-xs">
          {t('common.noInternetHint', { action: t('common.tryAgain') })}
        </Text>
      </View>
    </View>
  );
}
