import React from 'react';
import { View, ActivityIndicator, Text } from 'react-native';

interface FullScreenLoaderProps {
  message?: string;
}

/**
 * Full-screen loading overlay with optional message.
 * Renders centered spinner and optional text below.
 */
export const FullScreenLoader: React.FC<FullScreenLoaderProps> = ({ message }) => {
  return (
    <View className="absolute inset-0 z-20 items-center justify-center bg-black/70">
      <ActivityIndicator size="large" color="#fff" />
      {message ? <Text className="text-white mt-4">{message}</Text> : null}
    </View>
  );
};

export default FullScreenLoader;
