import React, { useState } from 'react';
import { View, Image, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';

const ImageViewerScreen = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const { images, index: initialIndex } = route.params;
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  const handleNext = () => {
    if (currentIndex < images.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  return (
    <View className="flex-1 bg-black">
      <View className="flex-1 justify-center items-center">
        <Image source={images[currentIndex]} className="w-full h-3/4" resizeMode="contain" />
        <Text className="text-white text-sm mt-2">
          {currentIndex + 1}/{images.length}
        </Text>
      </View>
      <View className="flex-row justify-between p-4">
        <TouchableOpacity onPress={handlePrevious} disabled={currentIndex === 0}>
          <Text className="text-white text-lg">Previous</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleNext} disabled={currentIndex === images.length - 1}>
          <Text className="text-white text-lg">Next</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default ImageViewerScreen;
