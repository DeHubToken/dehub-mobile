import React, { useCallback, useEffect, useRef } from "react";
import {
  View,
  Dimensions,
  StyleSheet,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  withTiming,
  runOnJS,
  Easing,
  cancelAnimation,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useNavigation } from "@react-navigation/native";
import type { StackNavigationProp } from "@react-navigation/stack";
import { ScreenNames } from "../../navigation/ScreenNames";
import type { AuthStackParamList } from "../../navigation/types";
import { setHasSeenOnboarding, setHasSeenAuth } from "../../libs/auth.utils";
import {
  ProgressPill,
  SlideText,
  SwipeButton,
  OnboardingBackground,
  type StorySlide,
  type SwipeButtonRef,
} from "../../components/Onboarding";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const SLIDES: StorySlide[] = [
  {
    id: "1",
    title: "The Social Media We",
    subtitle: "All Deserve",
    description: "Instantly monetize, never get deplatformed, keep up to 99% of revenue and create free from censorship or platform manipulation.",
  },
  {
    id: "2",
    title: "The App",
    subtitle: "For Everyone",
    description: "No algorithms that favor one side of the argument. Everyone is amplified equally and fairly with open source code.",
  },
  {
    id: "3",
    title: "You Will Own Everything,",
    subtitle: "And Be Happy",
    description: "The ownership economy means your data, assets and audience are yours forever. Even the DeHub network is owned by its users, you.",
  },
];

const SLIDE_DURATION = 3000; // 3 seconds per slide
const SWIPE_THRESHOLD = 0.8; // 80% progress to trigger completion
const SWIPE_MAX_DISTANCE = 150; // Max swipe distance for 100% progress

type OnboardingNavigationProp = StackNavigationProp<AuthStackParamList, typeof ScreenNames.Onboarding>;

const OnboardingScreen: React.FC = () => {
  const navigation = useNavigation<OnboardingNavigationProp>();
  const activeIndex = useSharedValue(0);
  const progress = useSharedValue(0);
  const isAnimating = useRef(true);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const swipeButtonRef = useRef<SwipeButtonRef>(null);
  // Track current index in ref to avoid reading .value on JS thread
  const currentIndexRef = useRef(0);

  const handleComplete = useCallback(async () => {
    isAnimating.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
    await Promise.all([
      setHasSeenOnboarding(),
      setHasSeenAuth(),
    ]);
    navigation.replace(ScreenNames.SignIn);
  }, [navigation]);

  // Start/restart the progress animation for current slide
  const startProgress = useCallback(() => {
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: SLIDE_DURATION,
      easing: Easing.linear,
    });
  }, [progress]);

  // Advance to next slide or loop back
  const advanceSlide = useCallback(() => {
    if (!isAnimating.current) return;
    
    const nextIndex = (currentIndexRef.current + 1) % SLIDES.length;
    currentIndexRef.current = nextIndex;
    activeIndex.value = nextIndex;
    startProgress();
  }, [activeIndex, startProgress]);

  // Set up auto-advance timer
  useEffect(() => {
    const scheduleNext = () => {
      timerRef.current = setTimeout(() => {
        if (isAnimating.current) {
          advanceSlide();
          scheduleNext();
        }
      }, SLIDE_DURATION);
    };

    startProgress();
    scheduleNext();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      cancelAnimation(progress);
    };
  }, [advanceSlide, progress, startProgress]);

  // Go to specific slide
  const goToSlide = useCallback((index: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    currentIndexRef.current = index;
    activeIndex.value = index;
    startProgress();
    
    // Reschedule auto-advance
    const scheduleNext = () => {
      timerRef.current = setTimeout(() => {
        if (isAnimating.current) {
          advanceSlide();
          scheduleNext();
        }
      }, SLIDE_DURATION);
    };
    scheduleNext();
  }, [activeIndex, advanceSlide, startProgress]);

  // Tap left/right to navigate slides
  const handleTap = useCallback((x: number) => {
    const currentIdx = currentIndexRef.current;
    if (x < SCREEN_WIDTH / 3) {
      // Tap left - go to previous
      const prevIndex = currentIdx > 0 ? currentIdx - 1 : SLIDES.length - 1;
      goToSlide(prevIndex);
    } else if (x > (SCREEN_WIDTH * 2) / 3) {
      // Tap right - go to next
      const nextIndex = (currentIdx + 1) % SLIDES.length;
      goToSlide(nextIndex);
    }
  }, [goToSlide]);

  // Update Rive swipe progress
  const updateSwipeProgress = useCallback((swipeProgress: number) => {
    swipeButtonRef.current?.setProgress(swipeProgress);
  }, []);

  // Trigger swipe complete animation (navigation is handled via onComplete callback)
  const triggerSwipeComplete = useCallback(() => {
    swipeButtonRef.current?.triggerComplete();
  }, []);

  // Reset swipe button state
  const resetSwipeButton = useCallback(() => {
    swipeButtonRef.current?.reset();
  }, []);

  // Swipe gesture for the bottom button
  const swipeGesture = Gesture.Pan()
    .activeOffsetX(20)
    .onUpdate((event) => {
      const swipeProgress = Math.min(1, Math.max(0, event.translationX / SWIPE_MAX_DISTANCE));
      runOnJS(updateSwipeProgress)(swipeProgress);
    })
    .onEnd((event) => {
      const swipeProgress = event.translationX / SWIPE_MAX_DISTANCE;
      if (swipeProgress >= SWIPE_THRESHOLD) {
        // triggerSwipeComplete will call handleComplete after outro animation
        runOnJS(triggerSwipeComplete)();
      } else {
        runOnJS(resetSwipeButton)();
      }
    });

  const handleAccessibilityAction = useCallback(
    (event: { nativeEvent: { actionName: string } }) => {
      const currentIdx = currentIndexRef.current;
      if (event.nativeEvent.actionName === "increment") {
        goToSlide((currentIdx + 1) % SLIDES.length);
      } else if (event.nativeEvent.actionName === "decrement") {
        goToSlide(currentIdx > 0 ? currentIdx - 1 : SLIDES.length - 1);
      }
    },
    [goToSlide]
  );

  return (
    <View
      style={styles.container}
      accessibilityActions={[
        { name: "increment", label: "Next slide" },
        { name: "decrement", label: "Previous slide" },
      ]}
      onAccessibilityAction={handleAccessibilityAction}
    >
      {/* Rive Background - Full screen, behind everything */}
      <OnboardingBackground activeIndex={activeIndex} totalSlides={SLIDES.length} />

      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        {/* Story Progress Pills */}
        <View style={styles.progressContainer}>
          {SLIDES.map((_, index) => (
            <ProgressPill
              key={index}
              index={index}
              activeIndex={activeIndex}
              progress={progress}
            />
          ))}
        </View>

        {/* Tap zones for navigation (hidden from assistive tech; slides are
            exposed via accessibilityActions on the root container) */}
        <Pressable
          style={styles.tapZone}
          accessible={false}
          importantForAccessibility="no"
          onPress={(e) => handleTap(e.nativeEvent.pageX)}
        />

        {/* Content */}
        <View style={styles.content} pointerEvents="none">
          {/* Text Content */}
          <View style={styles.textContainer}>
            {SLIDES.map((slide, index) => (
              <SlideText
                key={slide.id}
                slide={slide}
                index={index}
                activeIndex={activeIndex}
              />
            ))}
          </View>
        </View>

        {/* Bottom Swipe Button */}
        <SafeAreaView edges={["bottom"]} style={styles.bottomContainer}>
          <GestureDetector gesture={swipeGesture}>
            <Animated.View style={styles.swipeButtonContainer}>
              <SwipeButton ref={swipeButtonRef} onComplete={handleComplete} />
            </Animated.View>
          </GestureDetector>
        </SafeAreaView>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  safeArea: {
    flex: 1,
  },
  progressContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 6,
    gap: 6,
    zIndex: 20,
  },
  tapZone: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
  },
  content: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: 24,
    paddingBottom: 40,
    zIndex: 5,
  },
  textContainer: {
    minHeight: 160,
    position: "relative",
  },
  bottomContainer: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    zIndex: 20,
  },
  swipeButtonContainer: {
    alignItems: "center",
  },
});

export default OnboardingScreen;
