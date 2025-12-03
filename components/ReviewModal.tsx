import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Platform,
  Linking,
  Animated,
} from "react-native";
import Constants from "expo-constants";
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
  const heartScale = useRef(new Animated.Value(1)).current;
  const starScale = useRef(new Animated.Value(0.3)).current;
  const starRotate = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(1)).current;

  // Pulsing heart animation
  useEffect(() => {
    if (step === "initial") {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(heartScale, {
            toValue: 1.15,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(heartScale, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [step, heartScale]);

  // Star animation when transitioning to rate-store
  useEffect(() => {
    if (step === "rate-store") {
      starScale.setValue(0.3);
      starRotate.setValue(0);
      Animated.parallel([
        Animated.spring(starScale, {
          toValue: 1,
          friction: 6,
          tension: 140,
          useNativeDriver: true,
        }),
        Animated.timing(starRotate, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [step, starScale, starRotate]);

  const handleReset = () => {
    setStep("initial");
    setRating(0);
    setFeedback("");
    setTelegram("");
    setDiscord("");
    setIsSubmitting(false);
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const handleEnjoyingApp = (enjoying: boolean) => {
    Animated.timing(contentOpacity, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      if (enjoying) {
        setStep("rate-store");
      } else {
        setStep("star-rating");
      }
      contentOpacity.setValue(1);
    });
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

  const renderInitialStep = () => (
    <Animated.View style={{ opacity: contentOpacity }} className="p-6">
      <View className="items-center mb-4">
        <Animated.View
          className="bg-theme-accent/10 rounded-full p-4"
          style={{ transform: [{ scale: heartScale }] }}
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
    const spin = starRotate.interpolate({
      inputRange: [0, 1],
      outputRange: ["0deg", "360deg"],
    });

    return (
      <Animated.View style={{ opacity: contentOpacity }} className="p-6">
        <View className="items-center mb-4">
          <Animated.View
            className="bg-theme-accent/10 rounded-full p-4"
            style={{
              transform: [{ scale: starScale }, { rotate: spin }],
            }}
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
          >
            <Ionicons
              name={star <= rating ? "star" : "star-outline"}
              size={40}
              color={star <= rating ? "#FBBF24" : "#6B7280"}
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
              placeholderTextColor="#6B7280"
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
              placeholderTextColor="#6B7280"
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
              placeholderTextColor="#6B7280"
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
                className="py-3 px-6 items-center"
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
              className="py-3 px-6 items-center"
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
