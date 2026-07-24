import React from 'react';
import { View, Text } from 'react-native';

interface DisabledRouteProps {
  message: string;
}

const DisabledRoute: React.FC<DisabledRouteProps> = ({ message }) => (
  <View className="flex-1 justify-center items-center bg-theme-background px-5">
    <Text className="text-white text-base text-center">
      {message}
    </Text>
  </View>
);

export default DisabledRoute;
