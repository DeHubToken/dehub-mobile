import React, { useCallback, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';

export default function VideoUploadScreen() {
  const route = useRoute<any>();
  const asset = route.params?.asset;
  const { requireAuth } = useAuth();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const onUpload = useCallback(() => {
    requireAuth(async () => {
      // TODO: actual upload call
      console.log('Uploading', { asset, title, description });
    });
  }, [requireAuth, asset, title, description]);

  return (
    <View className="flex-1 bg-black p-4">
      <Text className="text-white text-lg font-bold mb-3">Video Details</Text>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="Title"
        placeholderTextColor="#666"
        className="h-12 rounded-xl bg-gray-900 text-white px-3 mb-3"
      />
      <TextInput
        value={description}
        onChangeText={setDescription}
        placeholder="Description"
        placeholderTextColor="#666"
        multiline
        className="h-30 rounded-xl bg-gray-900 text-white px-3 pt-3"
      />
      <TouchableOpacity onPress={onUpload} className="mt-4 h-12 rounded-xl bg-violet-600 items-center justify-center">
        <Text className="text-white font-bold">Upload</Text>
      </TouchableOpacity>
    </View>
  );
}
