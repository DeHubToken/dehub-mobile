import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AccentButtonGradient from '../components/ui/AccentButtonGradient';
import { colors } from '../theme/colors';

interface NoInternetScreenProps {
  onRetry: () => void;
}

export default function NoInternetScreen({ onRetry }: NoInternetScreenProps) {
  return (
    <View className="flex-1 bg-theme-neutrals-900">
      <View className="flex-1 justify-center items-center px-6">
        <View className="bg-theme-neutrals-800 rounded-full p-6 mb-6 relative">
          <Ionicons
            name="wifi-outline"
            size={64}
            color={colors.neutrals[600]}
          />
          <View className="absolute -top-1 -right-1 bg-theme-red-500 rounded-full p-1">
            <Ionicons 
              name="close" 
              size={16} 
              color="white" 
            />
          </View>
        </View>

        <Text className="text-theme-neutrals-100 text-2xl font-bold text-center mb-3">
          No Internet Connection
        </Text>

        <Text className="text-theme-neutrals-300 text-base text-center mb-8 leading-6 max-w-sm">
          Please check your internet connection and try again. You need to be connected to the internet to use DEHUB.
        </Text>

        <View className="bg-theme-neutrals-800 rounded-lg p-4 mb-8 w-full max-w-sm">
          <View className="flex-row items-center justify-center">
            <View className="w-3 h-3 bg-theme-red-500 rounded-full mr-3" />
            <Text className="text-theme-neutrals-200 text-sm">
              Offline - No network connection
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
                  Try Again
                </Text>
              </View>
            </TouchableOpacity>
          </AccentButtonGradient>
        </View>

        <Text className="text-theme-neutrals-400 text-sm text-center max-w-xs">
          Make sure WiFi or mobile data is turned on, then tap "Try Again"
        </Text>
      </View>
    </View>
  );
}
