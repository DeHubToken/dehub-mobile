import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

interface ScreenHeaderProps {
  title: string;
}

const ScreenHeader: React.FC<ScreenHeaderProps> = ({ title }) => {
  const navigation = useNavigation();

  return (
    <View className="flex-row items-center p-4">
      <TouchableOpacity onPress={() => navigation.goBack()} className="mr-2">
        <Ionicons name="arrow-back" size={28} color="white" />
      </TouchableOpacity>
      <Text className="text-theme-neutrals-200 text-3xl font-semibold">{title}</Text>
    </View>
  );
};

export default ScreenHeader;
