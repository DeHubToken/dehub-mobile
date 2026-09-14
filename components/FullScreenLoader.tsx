import React from 'react';
import { View, Text } from 'react-native';
import { DeHubLoader } from './DeHubLoader';

interface FullScreenLoaderProps {
  message?: string;
}

/**
 * Full-screen loading overlay with optional message.
 * Renders centered spinner and optional text below.
 */
export const FullScreenLoader: React.FC<FullScreenLoaderProps> = ({ message }) => {
  return (
    <View className="absolute inset-0 z-20 items-center justify-center dark-surface bg-black/70">
      <DeHubLoader size={56} />
      {message ? <Text className="text-white mt-4">{message}</Text> : null}
    </View>
  );
};

export default FullScreenLoader;
