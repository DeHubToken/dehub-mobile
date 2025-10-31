import React from 'react';
import { TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type DMSearchBoxProps = {
  value: string;
  onChangeText: (text: string) => void;
  onClear?: () => void;
  placeholder?: string;
  className?: string;
};

const DMSearchBox: React.FC<DMSearchBoxProps> = ({ value, onChangeText, onClear, placeholder = 'Search', className }) => {
  return (
    <View className={className}>
      <View className="flex-row items-center bg-[#1F2124] rounded-full pl-5 pr-2 py-2 h-14">
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#9CA3AF"
          className="flex-1 text-theme-neutrals-100 pr-3 text-[16px]"
          returnKeyType="search"
        />
        {value ? (
          <TouchableOpacity
            onPress={onClear}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            className="w-11 h-11 rounded-full bg-[#2C2E31] items-center justify-center"
          >
            <Ionicons name="close" size={18} color="#B4B8BE" />
          </TouchableOpacity>
        ) : (
          <View className="w-11 h-11 rounded-full bg-[#2C2E31] items-center justify-center">
            <Ionicons name="search" size={18} color="#B4B8BE" />
          </View>
        )}
      </View>
    </View>
  );
};

export default DMSearchBox;
