import React from 'react';
import { View, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { ScreenNames } from '../navigation/ScreenNames';

const HomeHeader = () => {
  const navigation = useNavigation<any>();

  return (
    <View className="flex-row justify-between items-center p-4 border-b border-theme-neutrals-700">
      <View className="flex-row items-center">
        <Image
          source={require('../assets/banner.png')}
          className="w-32 h-11 mx-2"
          resizeMode="contain"
        />
      </View>
      <View className="flex-row items-center">
        <TouchableOpacity className="p-1" onPress={() => navigation.navigate(ScreenNames.Leaderboard)}>
          <Ionicons name="trophy-outline" size={24} color="white" />
        </TouchableOpacity>
        <TouchableOpacity className="p-1 ml-4" onPress={() => navigation.navigate(ScreenNames.Notifications)}>
          <Ionicons name="notifications-outline" size={24} color="white" />
        </TouchableOpacity>
        <TouchableOpacity className="p-1 ml-4" onPress={() => navigation.navigate(ScreenNames.Search)}>
          <Ionicons name="search" size={24} color="white" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default HomeHeader;
