import React, { useRef, useState } from 'react';
import { View, Image, Text, TouchableOpacity, Modal, Animated, PanResponder } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

const ImageViewerScreen = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { images = [], index: initialIndex = 0, isModal } = (route?.params as any) || {};
  const [currentIndex, setCurrentIndex] = useState<number>(initialIndex);
  const pan = useRef(new Animated.ValueXY()).current;
  const isHandlingRef = useRef(false);

  const resetPosition = () => {
    Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: true, speed: 20, bounciness: 6 }).start(() => {
      isHandlingRef.current = false;
    });
  };

  const closeViewer = () => {
    if (isModal) navigation.goBack(); else navigation.goBack();
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 5 || Math.abs(g.dy) > 5,
      onPanResponderMove: (_, g) => {
        if (isHandlingRef.current) return;
        pan.setValue({ x: g.dx, y: g.dy });
      },
      onPanResponderRelease: (_, g) => {
        if (isHandlingRef.current) return;
        const { dx, dy } = g;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        // Swipe down to close
        if (dy > 80 && absDy > absDx) {
          isHandlingRef.current = true;
          Animated.timing(pan, { toValue: { x: 0, y: 600 }, duration: 180, useNativeDriver: true }).start(closeViewer);
          return;
        }
        // Horizontal navigation
        if (absDx > 60 && absDx > absDy) {
          isHandlingRef.current = true;
          if (dx < 0 && currentIndex < images.length - 1) {
            // swipe left -> next
            Animated.timing(pan, { toValue: { x: -400, y: 0 }, duration: 160, useNativeDriver: true }).start(() => {
              pan.setValue({ x: 400, y: 0 });
              setCurrentIndex(i => i + 1);
              resetPosition();
            });
            return;
          }
          if (dx > 0 && currentIndex > 0) {
            // swipe right -> previous
            Animated.timing(pan, { toValue: { x: 400, y: 0 }, duration: 160, useNativeDriver: true }).start(() => {
              pan.setValue({ x: -400, y: 0 });
              setCurrentIndex(i => i - 1);
              resetPosition();
            });
            return;
          }
        }
        resetPosition();
      },
      onPanResponderTerminate: resetPosition,
    })
  ).current;

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

  const content = (
    <View className="flex-1 bg-black">
      <SafeAreaView className="flex-1">
        {/* Close button only for modal mode */}
        <View className="absolute top-2 right-2 z-50">
          <TouchableOpacity
            onPress={closeViewer}
            className="bg-black/60 p-2 rounded-full"
            accessibilityLabel="Close image viewer"
          >
            <Ionicons name="close" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
        <View className="flex-1 justify-center items-center px-2">
          {images[currentIndex] && (
            <Animated.View
              style={{ transform: [{ translateX: pan.x }, { translateY: pan.y }] }}
              // @ts-ignore
              {...panResponder.panHandlers}
              className="w-full h-3/4"
            >
              <Image
                source={images[currentIndex]}
                className="w-full h-full"
                resizeMode="contain"
              />
            </Animated.View>
          )}
          <Text className="text-white text-sm mt-2">
            {currentIndex + 1}/{images.length}
          </Text>
        </View>
        {/* Navigation controls */}
        <View className="absolute inset-0 flex-row items-center justify-between px-2">
          <TouchableOpacity
            onPress={handlePrevious}
            disabled={currentIndex === 0}
            className="p-3"
            accessibilityLabel="Previous image"
          >
            <Ionicons
              name="chevron-back-outline"
              size={36}
              color={currentIndex === 0 ? 'rgba(255,255,255,0.3)' : '#fff'}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleNext}
            disabled={currentIndex === images.length - 1}
            className="p-3"
            accessibilityLabel="Next image"
          >
            <Ionicons
              name="chevron-forward-outline"
              size={36}
              color={currentIndex === images.length - 1 ? 'rgba(255,255,255,0.3)' : '#fff'}
            />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );

  if (isModal) {
    return (
      <Modal animationType="fade" transparent={false} visible={true} onRequestClose={closeViewer}>
        {content}
      </Modal>
    );
  }
  return content;
};

export default ImageViewerScreen;
