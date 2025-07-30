import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, Image, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import ScreenHeader from '../components/ScreenHeader';

const NotificationScreen = () => {
  const [notifications, setNotifications] = useState([
    { id: 1, type: 'subscribe', content: 'Natasha Anderson subscribed to you.', updatedAt: '15 mins ago' },
    { id: 2, type: 'follow', content: 'Marc Von III followed you.', updatedAt: '1 hr ago' },
    { id: 3, type: 'tip', content: 'Tricia Ledner II tipped you 23 Dehub on your Post.', updatedAt: '1 hr ago', image: require('../assets/banner.png') },
    { id: 4, type: 'like', content: 'Clyde Bednar liked your Video.', updatedAt: '7 hrs ago', image: require('../assets/icon.png') },
    { id: 5, type: 'warning', content: 'You have not verified your email.', updatedAt: 'Yesterday' },
  ]);

  const renderItem = ({ item }) => (
    <View className="flex-row items-center p-4 border-b border-theme-neutrals-700">
      <View className="flex-row items-center flex-1">
        <Ionicons
          name={
            item.type === 'subscribe' ? 'checkmark-circle' :
            item.type === 'follow' ? 'person-add' :
            item.type === 'tip' ? 'cash' :
            item.type === 'like' ? 'thumbs-up' :
            'alert-circle'
          }
          size={24}
          color="white"
          className="mr-4"
        />
        <View className="flex-1">
          <Text className="text-theme-neutrals-200 text-sm font-medium truncate">{item.content}</Text>
          <Text className="text-theme-neutrals-400 text-xs mt-1">{item.updatedAt}</Text>
        </View>
      </View>
      {item.image && <Image source={item.image} className="w-12 h-12 rounded-md ml-4" />}
    </View>
  );

  return (
    <View className="flex-1 bg-theme-neutrals-900">
      <ScreenHeader title="Notifications" />
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderItem}
      />
    </View>
  );
};

export default NotificationScreen;
