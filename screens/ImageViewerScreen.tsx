import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Image,
  Text,
  TouchableOpacity,
  Pressable,
  Dimensions,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StatusBar,
  Platform,
  BackHandler,
  StyleSheet,
  ActivityIndicator,
  ToastAndroid,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRoute, useNavigation } from "@react-navigation/native";
import { BlurView } from "expo-blur";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import Icon from "../components/ui/Icon";
import { toastError } from "../libs";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const DISMISS_THRESHOLD = 150;

const normalizeImageUri = (item: any): string => {
  if (!item) return "";
  if (typeof item === "string") return item;
  if (item.uri) return String(item.uri);
  return "";
};

/** Zoomable image — double-tap to zoom, pinch-to-zoom, pan when zoomed. */
const ZoomableImage = memo(
  ({ uri, onZoomChange }: { uri: string; onZoomChange?: (zoomed: boolean) => void }) => {
    const [loaded, setLoaded] = useState(false);
    const scale = useSharedValue(1);
    const savedScale = useSharedValue(1);
    const offsetX = useSharedValue(0);
    const offsetY = useSharedValue(0);
    const savedOffsetX = useSharedValue(0);
    const savedOffsetY = useSharedValue(0);
    const pinchFocalX = useSharedValue(0);
    const pinchFocalY = useSharedValue(0);

    // ── Double-tap: toggle 1x ↔ 2.5x ──
    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .maxDuration(250)
      .onEnd((e) => {
        if (scale.value > 1.05) {
          // Reset
          scale.value = withTiming(1, { duration: 300 });
          offsetX.value = withTiming(0, { duration: 300 });
          offsetY.value = withTiming(0, { duration: 300 });
          savedScale.value = 1;
          savedOffsetX.value = 0;
          savedOffsetY.value = 0;
          if (onZoomChange) runOnJS(onZoomChange)(false);
        } else {
          const target = 2.5;
          const fx = e.x - SCREEN_W / 2;
          const fy = e.y - SCREEN_H / 2;
          const tx = -fx * (target - 1);
          const ty = -fy * (target - 1);
          const maxX = (SCREEN_W * target - SCREEN_W) / 2;
          const maxY = (SCREEN_H * target - SCREEN_H) / 2;
          const cx = Math.max(-maxX, Math.min(maxX, tx));
          const cy = Math.max(-maxY, Math.min(maxY, ty));
          scale.value = withTiming(target, { duration: 300 });
          offsetX.value = withTiming(cx, { duration: 300 });
          offsetY.value = withTiming(cy, { duration: 300 });
          savedScale.value = target;
          savedOffsetX.value = cx;
          savedOffsetY.value = cy;
          if (onZoomChange) runOnJS(onZoomChange)(true);
        }
      });

    // ── Pinch: zoom 1–4x with focal point ──
    const pinch = Gesture.Pinch()
      .onStart((e) => {
        savedScale.value = scale.value;
        savedOffsetX.value = offsetX.value;
        savedOffsetY.value = offsetY.value;
        pinchFocalX.value = e.focalX - SCREEN_W / 2;
        pinchFocalY.value = e.focalY - SCREEN_H / 2;
      })
      .onUpdate((e) => {
        const newScale = Math.max(1, Math.min(4, savedScale.value * e.scale));
        const ratio = newScale / savedScale.value;
        offsetX.value =
          pinchFocalX.value + (savedOffsetX.value - pinchFocalX.value) * ratio;
        offsetY.value =
          pinchFocalY.value + (savedOffsetY.value - pinchFocalY.value) * ratio;
        scale.value = newScale;
      })
      .onEnd(() => {
        if (scale.value <= 1.05) {
          scale.value = withTiming(1, { duration: 200 });
          offsetX.value = withTiming(0, { duration: 200 });
          offsetY.value = withTiming(0, { duration: 200 });
          savedScale.value = 1;
          savedOffsetX.value = 0;
          savedOffsetY.value = 0;
          if (onZoomChange) runOnJS(onZoomChange)(false);
        } else {
          savedScale.value = scale.value;
          savedOffsetX.value = offsetX.value;
          savedOffsetY.value = offsetY.value;
          // Clamp offsets
          const maxX = Math.max(
            0,
            (SCREEN_W * scale.value - SCREEN_W) / 2,
          );
          const maxY = Math.max(
            0,
            (SCREEN_H * scale.value - SCREEN_H) / 2,
          );
          offsetX.value = withSpring(
            Math.max(-maxX, Math.min(maxX, offsetX.value)),
            { damping: 20, stiffness: 200 },
          );
          offsetY.value = withSpring(
            Math.max(-maxY, Math.min(maxY, offsetY.value)),
            { damping: 20, stiffness: 200 },
          );
          if (onZoomChange) runOnJS(onZoomChange)(true);
        }
      });

    // ── Pan: move image when zoomed (manualActivation fails when at 1x) ──
    const pan = Gesture.Pan()
      .minPointers(1)
      .maxPointers(2)
      .manualActivation(true)
      .onTouchesMove((_e, stateManager) => {
        if (scale.value > 1.05) {
          stateManager.activate();
        } else {
          stateManager.fail();
        }
      })
      .onStart(() => {
        savedOffsetX.value = offsetX.value;
        savedOffsetY.value = offsetY.value;
      })
      .onUpdate((e) => {
        offsetX.value = savedOffsetX.value + e.translationX;
        offsetY.value = savedOffsetY.value + e.translationY;
      })
      .onEnd(() => {
        const maxX = Math.max(
          0,
          (SCREEN_W * scale.value - SCREEN_W) / 2,
        );
        const maxY = Math.max(
          0,
          (SCREEN_H * scale.value - SCREEN_H) / 2,
        );
        offsetX.value = withSpring(
          Math.max(-maxX, Math.min(maxX, offsetX.value)),
          { damping: 20, stiffness: 200 },
        );
        offsetY.value = withSpring(
          Math.max(-maxY, Math.min(maxY, offsetY.value)),
          { damping: 20, stiffness: 200 },
        );
      });

    const composed = Gesture.Simultaneous(pinch, doubleTap, pan);

    const animStyle = useAnimatedStyle(() => ({
      transform: [
        { translateX: offsetX.value },
        { translateY: offsetY.value },
        { scale: scale.value },
      ],
    }));

    return (
      <View style={{ width: SCREEN_W, height: SCREEN_H, overflow: "hidden" }}>
        <GestureDetector gesture={composed}>
          <Animated.View
            style={[
              {
                width: SCREEN_W,
                height: SCREEN_H,
                justifyContent: "center",
                alignItems: "center",
              },
              animStyle,
            ]}
          >
            <Image
              source={{ uri }}
              style={{ width: SCREEN_W, height: SCREEN_H }}
              resizeMode="contain"
              onLoad={() => setLoaded(true)}
            />
          </Animated.View>
        </GestureDetector>
        {!loaded && (
          <View
            style={[
              StyleSheet.absoluteFill,
              { alignItems: "center", justifyContent: "center" },
            ]}
            pointerEvents="none"
          >
            <ActivityIndicator size="small" color="#fff" />
          </View>
        )}
      </View>
    );
  },
);

const ImageViewerScreen = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const {
    imageUrl,
    images: rawImages,
    index: paramIndex,
    initialIndex: paramInitialIndex,
    isModal,
    allowDownload,
  } = (route?.params as any) || {};

  const startIndex = paramInitialIndex ?? paramIndex ?? 0;

  const images: string[] = React.useMemo(() => {
    const src = rawImages?.length ? rawImages : imageUrl ? [imageUrl] : [];
    return src.map(normalizeImageUri).filter(Boolean);
  }, [rawImages, imageUrl]);

  const safeStartIndex = Math.max(0, Math.min(startIndex, images.length - 1));
  const [currentIndex, setCurrentIndex] = useState(safeStartIndex);
  const indexRef = useRef(safeStartIndex);

  const mainListRef = useRef<FlatList<any>>(null);

  const translateY = useSharedValue(0);
  const opacity = useSharedValue(1);
  const isDismissing = useRef(false);
  const [isZoomed, setIsZoomed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleDownload = useCallback(async () => {
    const uri = images[indexRef.current];
    if (!uri || isSaving) return;

    try {
      setIsSaving(true);
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") {
        toastError("Allow photo library access to save images");
        return;
      }

      const urlPath = uri.split("?")[0];
      const ext = urlPath.match(/\.(png|jpe?g|gif|webp)/i)?.[1] || "jpg";
      const localPath = `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory}dehub_download_${Date.now()}.${ext}`;

      if (uri.startsWith("data:")) {
        const base64 = uri.split(",")[1];
        if (!base64) throw new Error("Invalid data URI");
        await FileSystem.writeAsStringAsync(localPath, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        await MediaLibrary.saveToLibraryAsync(localPath);
      } else {
        const { uri: fileUri } = await FileSystem.downloadAsync(uri, localPath);
        await MediaLibrary.saveToLibraryAsync(fileUri);
      }

      const isVideo = /\.(mp4|mov|webm|avi)/i.test(urlPath);
      if (Platform.OS === "android") {
        ToastAndroid.show(isVideo ? "Video saved" : "Image downloaded", ToastAndroid.SHORT);
      }
    } catch (err) {
      console.error("[ImageViewer] download failed:", err);
      toastError("Failed to save image");
    } finally {
      setIsSaving(false);
    }
  }, [images, isSaving]);

  const closeViewer = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
  }, [navigation]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      closeViewer();
      return true;
    });
    return () => sub.remove();
  }, [closeViewer]);

  const panGesture = Gesture.Pan()
    .activeOffsetY(15)
    .failOffsetX([-10, 10])
    .enabled(!isZoomed)
    .onUpdate((e) => {
      if (isDismissing.current) return;
      const dy = Math.max(0, e.translationY);
      translateY.value = dy;
      opacity.value = interpolate(dy, [0, DISMISS_THRESHOLD * 2], [1, 0.3], Extrapolation.CLAMP);
    })
    .onEnd((e) => {
      if (isDismissing.current) return;
      if (e.translationY > DISMISS_THRESHOLD) {
        isDismissing.current = true;
        translateY.value = withTiming(SCREEN_H, { duration: 200 });
        opacity.value = withTiming(0, { duration: 200 }, () => {
          runOnJS(closeViewer)();
        });
      } else {
        translateY.value = withSpring(0, { damping: 20, stiffness: 200 });
        opacity.value = withSpring(1);
      }
    });

  const animatedContainer = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const animatedBg = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const getItemLayout = useCallback(
    (_: any, index: number) => ({
      length: SCREEN_W,
      offset: SCREEN_W * index,
      index,
    }),
    [],
  );

  const onScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const idx = Math.round(x / SCREEN_W);
      const clamped = Math.max(0, Math.min(idx, images.length - 1));
      indexRef.current = clamped;
      setCurrentIndex(clamped);
      setIsZoomed(false);
    },
    [images.length],
  );

  const scrollToImage = useCallback(
    (idx: number) => {
      const clamped = Math.max(0, Math.min(idx, images.length - 1));
      mainListRef.current?.scrollToIndex({ index: clamped, animated: true });
      indexRef.current = clamped;
      setCurrentIndex(clamped);
    },
    [images.length],
  );

  const handleZoomChange = useCallback((zoomed: boolean) => {
    setIsZoomed(zoomed);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: string }) => (
      <ZoomableImage uri={item} onZoomChange={handleZoomChange} />
    ),
    [handleZoomChange],
  );

  const keyExtractor = useCallback((_: string, i: number) => `img-${i}`, []);

  const showDots = images.length > 1;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: "#000" }, animatedBg]}
      />

      <GestureDetector gesture={panGesture}>
        <Animated.View style={[{ flex: 1 }, animatedContainer]}>
          <FlatList
            ref={mainListRef}
            data={images}
            keyExtractor={keyExtractor}
            horizontal
            pagingEnabled
            scrollEnabled={!isZoomed}
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={safeStartIndex}
            getItemLayout={getItemLayout}
            renderItem={renderItem}
            onMomentumScrollEnd={onScrollEnd}
            bounces={false}
            windowSize={3}
            maxToRenderPerBatch={3}
            removeClippedSubviews={Platform.OS !== "ios"}
          />
        </Animated.View>
      </GestureDetector>

      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <View
        style={[styles.topBar, { top: insets.top + 8 }]}
        pointerEvents="box-none"
      >
        {/* Close — left (matches FullscreenVideoScreen) */}
        <TouchableOpacity
          onPress={closeViewer}
          activeOpacity={0.7}
          style={styles.glassButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <BlurView
            intensity={Platform.OS === "ios" ? 60 : 40}
            tint="dark"
            style={StyleSheet.absoluteFill}
          />
          <View style={[StyleSheet.absoluteFill, styles.glassOverlay]} />
          <Icon name="X" size={20} color="#fff" />
        </TouchableOpacity>

        {/* Counter pill — absolutely centered */}
        {images.length > 1 && (
          <View style={styles.counterWrap} pointerEvents="none">
            <View style={styles.counterPill}>
              <BlurView
                intensity={Platform.OS === "ios" ? 60 : 40}
                tint="dark"
                style={StyleSheet.absoluteFill}
              />
              <View style={[StyleSheet.absoluteFill, styles.glassOverlay]} />
              <Text style={styles.counterText}>
                {currentIndex + 1} / {images.length}
              </Text>
            </View>
          </View>
        )}

        {/* Action buttons — right */}
        <View style={styles.topBarActions}>
          {allowDownload && (
            <TouchableOpacity
              onPress={handleDownload}
              activeOpacity={0.7}
              style={styles.glassButton}
              disabled={isSaving}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Download image"
            >
              <BlurView
                intensity={Platform.OS === "ios" ? 60 : 40}
                tint="dark"
                style={StyleSheet.absoluteFill}
              />
              <View style={[StyleSheet.absoluteFill, styles.glassOverlay]} />
              {isSaving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Icon name="Download" size={20} color="#fff" />
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Dot indicators ──────────────────────────────────────────── */}
      {showDots && (
        <View
          style={[styles.dotsRow, { bottom: insets.bottom + 20 }]}
          pointerEvents="box-none"
        >
          {images.map((_, idx) => (
            <Pressable
              key={idx}
              onPress={() => scrollToImage(idx)}
              hitSlop={{ top: 18, bottom: 18, left: 5, right: 5 }}
              accessibilityRole="button"
              accessibilityLabel={`Go to image ${idx + 1}`}
            >
              <View
                style={[
                  styles.dot,
                  idx === currentIndex ? styles.dotActive : styles.dotInactive,
                ]}
              />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
  },
  topBar: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 50,
  },
  counterWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  topBarActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  counterPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  counterText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  glassButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  glassOverlay: {
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  dotsRow: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    zIndex: 50,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    width: 12,
    backgroundColor: "#fff",
  },
  dotInactive: {
    width: 8,
    backgroundColor: "rgba(255,255,255,0.5)",
  },
});

export default ImageViewerScreen;
