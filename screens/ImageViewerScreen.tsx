import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Image,
  Text,
  TouchableOpacity,
  Modal,
  Animated,
  PanResponder,
  Dimensions,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRoute, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";

const ImageViewerScreen = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const {
    imageUrl,
    images: rawImages,
    index: initialIndex = 0,
    isModal,
  } = (route?.params as any) || {};
  const images: string[] =
    rawImages?.length ? rawImages : imageUrl ? [imageUrl] : [];
  const [currentIndex, setCurrentIndex] = useState<number>(initialIndex);
  const translateY = useRef(new Animated.Value(0)).current;
  const isHandlingRef = useRef(false);
  const screen = Dimensions.get("window");
  const mainListRef = useRef<FlatList<any>>(null);

  const resetPosition = useCallback(() => {
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      speed: 20,
      bounciness: 6,
    }).start(() => {
      isHandlingRef.current = false;
    });
  }, [translateY]);

  const closeViewer = useCallback(() => {
    if (isModal) navigation.goBack();
    else navigation.goBack();
  }, [isModal, navigation]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dy) > 12 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => {
        if (isHandlingRef.current) return;
        translateY.setValue(Math.max(0, g.dy));
      },
      onPanResponderRelease: (_, g) => {
        if (isHandlingRef.current) return;
        const { dy } = g;
        // Swipe down to close
        if (dy > 120) {
          isHandlingRef.current = true;
          Animated.timing(translateY, {
            toValue: screen.height,
            duration: 200,
            useNativeDriver: true,
          }).start(closeViewer);
          return;
        }
        resetPosition();
      },
      onPanResponderTerminate: resetPosition,
    })
  ).current;

  // Normalize image source for RN Image
  const normalizeSource = useCallback((item: any) => {
    if (!item) return undefined as any;
    if (typeof item === "string") return { uri: item };
    if (typeof item === "number") return item; // static resource
    if (item.uri) return { uri: String(item.uri) };
    return item;
  }, []);

  const getItemLayout = useCallback(
    (_: any, index: number) => ({
      length: screen.width,
      offset: screen.width * index,
      index,
    }),
    [screen.width]
  );

  const scrollToIndex = useCallback(
    (idx: number) => {
      const clamped = Math.max(0, Math.min(idx, images.length - 1));
      if (!mainListRef.current) return;
      try {
        mainListRef.current.scrollToIndex({
          index: clamped,
          animated: true,
          viewPosition: 0.5,
        });
      } catch {}
    },
    [images.length]
  );

  const onMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const idx = Math.round(x / screen.width);
      if (idx !== currentIndex) setCurrentIndex(idx);
    },
    [screen.width, currentIndex]
  );

  const renderItem = useCallback(
    ({ item }: { item: any }) => (
      <View
        style={{ width: screen.width, height: screen.height }}
        className="items-center justify-center"
      >
        <Image
          source={normalizeSource(item)}
          style={{ width: "100%", height: "100%" }}
          resizeMode="contain"
        />
      </View>
    ),
    [normalizeSource, screen.width, screen.height]
  );

  const keyExtractor = useCallback((_: any, i: number) => String(i), []);

  const renderThumb = useCallback(
    ({ item, index }: { item: any; index: number }) => {
      const isActive = index === currentIndex;
      return (
        <TouchableOpacity
          onPress={() => scrollToIndex(index)}
          activeOpacity={0.8}
          className={`mr-2 rounded ${isActive ? "ring-2 ring-white" : ""}`}
        >
          <Image
            source={normalizeSource(item)}
            style={{ width: 56, height: 56, borderRadius: 8 }}
            resizeMode="cover"
          />
        </TouchableOpacity>
      );
    },
    [currentIndex, normalizeSource, scrollToIndex]
  );

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
      {/* Close button */}
      <View className="absolute top-2 left-2 z-50">
        <TouchableOpacity
          onPress={closeViewer}
          className="bg-theme-neutral-300 p-2 rounded-full"
          accessibilityLabel="Close image viewer"
          activeOpacity={0.85}
        >
          <Ionicons name="close" size={30} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Main swipable viewer (horizontal) with vertical swipe-to-close */}
      <Animated.View
        style={{ flex: 1, transform: [{ translateY }] }}
        {...panResponder.panHandlers}
      >
        <FlatList
          ref={mainListRef}
          data={images}
          keyExtractor={keyExtractor}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={Math.max(
            0,
            Math.min(initialIndex, images.length - 1)
          )}
          getItemLayout={getItemLayout}
          renderItem={renderItem}
          onMomentumScrollEnd={onMomentumEnd}
          bounces={false}
          windowSize={3}
          maxToRenderPerBatch={3}
          removeClippedSubviews
        />
      </Animated.View>

      {/* Thumbnails strip and counter */}
      <View className="px-3 py-2">
        <FlatList
          data={images}
          keyExtractor={keyExtractor}
          renderItem={renderThumb}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 2 }}
        />
        <Text className="text-white text-sm mt-2 text-center">
          {currentIndex + 1}/{images.length}
        </Text>
      </View>
    </View>
  );

  if (isModal) {
    return (
      <Modal
        animationType="fade"
        transparent={false}
        visible={true}
        onRequestClose={closeViewer}
      >
        <SafeAreaView className="flex-1">{content}</SafeAreaView>
      </Modal>
    );
  }
  return content;
};

export default ImageViewerScreen;
