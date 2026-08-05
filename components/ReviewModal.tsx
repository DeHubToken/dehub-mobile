import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Platform,
  Linking,
} from "react-native";
import Constants from "expo-constants";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  withSpring,
  Easing,
  runOnJS,
} from "react-native-reanimated";
// import * as Device from "expo-device";
import { Ionicons } from "@expo/vector-icons";
import GlassModal from "./ui/GlassModal";
import AccentButtonGradient from "./ui/AccentButtonGradient";
import { theme } from "../theme";
import { APP_STORE_LINK, GOOGLE_PLAY_LINK } from "../config";
import { openExternalLink } from "../libs/links.utils";
import { toastSuccess, toastError } from "../libs/toast";
import env from "../config/env";

interface ReviewModalProps {
  visible: boolean;
  onClose: () => void;
  userAddress?: string;
}

type ReviewStep = "initial" | "rate-store" | "star-rating" | "feedback";

const ReviewModal: React.FC<ReviewModalProps> = ({
  visible,
  onClose,
  userAddress,
}) => {
  const [step, setStep] = useState<ReviewStep>("initial");
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [telegram, setTelegram] = useState("");
  const [discord, setDiscord] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Animation values
  const heartScale = useSharedValue(1);
  const starScale = useSharedValue(0.3);
  const starRotate = useSharedValue(0);
  const contentOpacity = useSharedValue(1);

  // Pulsing heart animation - cancel when step changes
  useEffect(() => {
    if (step === "initial") {
      heartScale.value = 1;
      heartScale.value = withRepeat(
        withSequence(
          withTiming(1.15, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      );
    } else {
      // Cancel animation when leaving initial step
      heartScale.value = withTiming(1, { duration: 200 });
    }
  }, [step]);

  // Star animation when transitioning to rate-store
  useEffect(() => {
    if (step === "rate-store") {
      starScale.value = 0.3;
      starRotate.value = 0;
      starScale.value = withSpring(1, {
        damping: 10,
        stiffness: 140,
      });
      starRotate.value = withTiming(360, {
        duration: 600,
        easing: Easing.out(Easing.ease),
      });
    } else {
      // Reset to default state
      starScale.value = 0.3;
      starRotate.value = 0;
    }
  }, [step]);

  // Content opacity for step transitions
  useEffect(() => {
    contentOpacity.value = 0;
    contentOpacity.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.ease) });
  }, [step]);

  const handleReset = () => {
    setStep("initial");
    setRating(0);
    setFeedback("");
    setTelegram("");
    setDiscord("");
    setIsSubmitting(false);
    // Reset animation states
    contentOpacity.value = 1;
    heartScale.value = 1;
    starScale.value = 0.3;
    starRotate.value = 0;
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const handleEnjoyingApp = (enjoying: boolean) => {
    // Transition handled by step change in JS
    setStep(enjoying ? "rate-store" : "star-rating");
  };

  const handleGoToStore = async () => {
    const storeUrl = Platform.select({
      ios: APP_STORE_LINK,
      android: GOOGLE_PLAY_LINK,
      default: "",
    });

    // Track that user was redirected to store
    try {
      const feedbackData = {
        platform: Platform.OS as "ios" | "android",
        appVersion: Constants.expoConfig?.version || "1.0.0",
        enjoyingApp: true, // User selected "Yes!" path
        redirectedToStore: true,
        userAddress: userAddress || "anonymous",
        deviceInfo: {
          appBuild:
            Constants.expoConfig?.ios?.buildNumber ||
            Constants.expoConfig?.android?.versionCode?.toString() ||
            undefined,
        },
      };

      await fetch(`${env.API_URL}/mobile/app/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(feedbackData),
      });

      console.log("Store redirect tracked:", feedbackData);
    } catch (error) {
      console.error("[ReviewModal] Store tracking error:", error);
      // Don't block the user from going to store if tracking fails
    }

    if (storeUrl) {
      openExternalLink(storeUrl);
    }
    handleClose();
  };

  const handleStarSelect = (stars: number) => {
    setRating(stars);
    // Don't change step, just set rating to show feedback form
  };

  const handleSubmitFeedback = async () => {
    if (!feedback.trim()) {
      toastError("Please provide your feedback");
      return;
    }

    setIsSubmitting(true);
    try {
      const feedbackData = {
        platform: Platform.OS as "ios" | "android",
        appVersion: Constants.expoConfig?.version || "1.0.0",
        enjoyingApp: false, // User selected "Not Really" path
        feedback: feedback.trim(),
        rating: rating > 0 ? rating : undefined,
        redirectedToStore: false,
        telegram: telegram.trim() || undefined,
        discord: discord.trim() || undefined,
        userAddress: userAddress || "anonymous",
        deviceInfo: {
          appBuild:
            Constants.expoConfig?.ios?.buildNumber ||
            Constants.expoConfig?.android?.versionCode?.toString() ||
            undefined,
        },
      };

      const response = await fetch(`${env.API_URL}/mobile/app/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(feedbackData),
      });

      const result = await response.json();

      if (!response.ok || result.error) {
        throw new Error(result.message || "Failed to submit review");
      }

      console.log("Feedback submitted successfully:", result);
      toastSuccess("Thank you for your feedback!");
      handleClose();
    } catch (error: any) {
      console.error("[ReviewModal] Submit error:", error);
      toastError(
        error.message || "Failed to submit feedback. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const heartAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heartScale.value }],
  }));

  const contentAnimatedStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
  }));

  const starAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: starScale.value },
      { rotate: `${starRotate.value}deg` },
    ],
  }));

  const renderInitialStep = () => (
    <Animated.View style={contentAnimatedStyle} className="p-6">
      <View className="items-center mb-4">
        <Animated.View
          className="bg-theme-accent/10 rounded-full p-4"
          style={heartAnimatedStyle}
        >
          <Ionicons
            name="heart-outline"
            size={48}
            color={theme.colors.accent}
          />
        </Animated.View>
      </View>

      <Text className="text-white text-2xl font-bold text-center mb-2">
        Are you enjoying the app?
      </Text>

      <Text className="text-theme-neutrals-300 text-sm text-center mb-6">
        Your feedback helps us improve DeHub
      </Text>

      <View className="gap-3">
        <AccentButtonGradient>
          <TouchableOpacity
            onPress={() => handleEnjoyingApp(true)}
            className="py-3 px-6 items-center"
            activeOpacity={0.8}
          >
            <Text className="text-white text-base font-semibold">Yes! 😊</Text>
          </TouchableOpacity>
        </AccentButtonGradient>

        <TouchableOpacity
          onPress={() => handleEnjoyingApp(false)}
          className="py-3 px-6 items-center bg-theme-neutrals-800 rounded-full"
          activeOpacity={0.7}
        >
          <Text className="text-white text-base">Not Really 😕</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );

  const renderRateStoreStep = () => {
    return (
      <Animated.View style={contentAnimatedStyle} className="p-6">
        <View className="items-center mb-4">
          <Animated.View
            className="bg-theme-accent/10 rounded-full p-4"
            style={starAnimatedStyle}
          >
            <Ionicons name="star" size={48} color={theme.colors.accent} />
          </Animated.View>
        </View>

        <Text className="text-white text-2xl font-bold text-center mb-2">
          That's great!
        </Text>

        <Text className="text-theme-neutrals-300 text-sm text-center mb-6">
          Would you mind rating us on the{" "}
          {Platform.OS === "ios" ? "App Store" : "Play Store"}? It really helps
          us grow!
        </Text>

        <View className="gap-3">
          <AccentButtonGradient>
            <TouchableOpacity
              onPress={handleGoToStore}
              className="py-3 px-6 items-center"
              activeOpacity={0.8}
            >
              <Text className="text-white text-base font-semibold">
                Rate on {Platform.OS === "ios" ? "App Store" : "Play Store"}
              </Text>
            </TouchableOpacity>
          </AccentButtonGradient>

          <TouchableOpacity
            onPress={handleClose}
            className="py-3 px-6 items-center"
            activeOpacity={0.7}
          >
            <Text className="text-theme-neutrals-400 text-base">
              Maybe Later
            </Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    );
  };

  const renderStarRatingStep = () => (
    <View className="p-6">
      <View className="items-center mb-4">
        <View className="bg-theme-accent/10 rounded-full p-4">
          <Ionicons name="star-half" size={48} color={theme.colors.accent} />
        </View>
      </View>

      <Text className="text-white text-2xl font-bold text-center mb-2">
        Help us improve
      </Text>

      <Text className="text-theme-neutrals-300 text-sm text-center mb-6">
        How would you rate your experience?
      </Text>

      <View className="flex-row justify-center gap-3 mb-6">
        {[1, 2, 3, 4, 5].map((star) => (
          <TouchableOpacity
            key={star}
            onPress={() => handleStarSelect(star)}
            activeOpacity={0.7}
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          >
            <Ionicons
              name={star <= rating ? "star" : "star-outline"}
              size={40}
              color={
                star <= rating
                  ? theme.colors.accent
                  : theme.colors.neutrals[600]
              }
            />
          </TouchableOpacity>
        ))}
      </View>

      {rating > 0 && (
        <View className="mt-4">
          <View className="mb-4">
            <Text className="text-theme-neutrals-400 text-xs mb-2">
              Your Feedback <Text className="text-red-500">*</Text>
            </Text>
            <TextInput
              value={feedback}
              onChangeText={setFeedback}
              placeholder="What can we do better?"
              placeholderTextColor={theme.colors.neutrals[500]}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              className="bg-theme-neutrals-800 rounded-xl p-4 text-white text-sm min-h-[100px]"
            />
          </View>

          <View className="mb-4">
            <Text className="text-theme-neutrals-400 text-xs mb-2">
              Telegram (Optional)
            </Text>
            <TextInput
              value={telegram}
              onChangeText={setTelegram}
              placeholder="@username"
              placeholderTextColor={theme.colors.neutrals[500]}
              autoCapitalize="none"
              className="bg-theme-neutrals-800 rounded-xl p-4 text-white text-sm"
            />
          </View>

          <View className="mb-6">
            <Text className="text-theme-neutrals-400 text-xs mb-2">
              Discord (Optional)
            </Text>
            <TextInput
              value={discord}
              onChangeText={setDiscord}
              placeholder="username#0000"
              placeholderTextColor={theme.colors.neutrals[500]}
              autoCapitalize="none"
              className="bg-theme-neutrals-800 rounded-xl p-4 text-white text-sm"
            />
          </View>

          <Text className="text-theme-neutrals-500 text-xs text-center mb-4">
            We may reach out to ask follow-up questions about your feedback
          </Text>

          <View className="gap-3">
            <AccentButtonGradient>
              <TouchableOpacity
                onPress={handleSubmitFeedback}
                className={`py-3 px-6 items-center ${isSubmitting ? "opacity-50" : ""}`}
                activeOpacity={0.8}
                disabled={isSubmitting}
              >
                <Text className="text-white text-base font-semibold">
                  {isSubmitting ? "Submitting..." : "Submit Feedback"}
                </Text>
              </TouchableOpacity>
            </AccentButtonGradient>

            <TouchableOpacity
              onPress={handleClose}
              className={`py-3 px-6 items-center ${isSubmitting ? "opacity-50" : ""}`}
              activeOpacity={0.7}
              disabled={isSubmitting}
            >
              <Text className="text-theme-neutrals-400 text-base">Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {rating === 0 && (
        <TouchableOpacity
          onPress={handleClose}
          className="py-3 px-6 items-center"
          activeOpacity={0.7}
        >
          <Text className="text-theme-neutrals-400 text-base">Cancel</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const renderContent = () => {
    switch (step) {
      case "initial":
        return renderInitialStep();
      case "rate-store":
        return renderRateStoreStep();
      case "star-rating":
        return renderStarRatingStep();
      default:
        return renderInitialStep();
    }
  };

  return (
    <GlassModal
      visible={visible}
      onClose={handleClose}
      presentation="bottom"
      blurIntensity={60}
      dismissible={!isSubmitting}
    >
      <View className="rounded-t-2xl">{renderContent()}</View>
    </GlassModal>
  );
};

export default ReviewModal;
