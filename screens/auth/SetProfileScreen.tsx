import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  BackHandler,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, CommonActions } from "@react-navigation/native";
import { useAuthState, useAuthActions } from "../../context/AuthContext";
import { AuthService } from "../../services/auth.service";
import { useDebounceCallback } from "../../hooks/useDebounceCallback";
import { toastError, toastSuccess, toastInfo } from "../../libs";
import { setAuthUser } from "../../libs/auth.utils";
import { User } from "../../context/AuthContext";
import { ScreenNames } from "../../navigation/ScreenNames";
import AccentButtonGradient from "../../components/ui/AccentButtonGradient";
import { createLogger } from "../../libs/logger";

const log = createLogger("SetProfileScreen");

// 3D user image
const USER_3D_IMAGE = require("../../assets/onboarding/user-3d.png");

interface SetProfileScreenProps {
  navigation: any;
}

const SetProfileScreen: React.FC<SetProfileScreenProps> = ({ navigation }) => {
  const { provisionalUser, needsUsername } = useAuthState();
  const { completeUsername, signOut } = useAuthActions();
  
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  
  const isMountedRef = useRef(true);
  const hasNavigatedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  /**
   * Navigate to the main app
   */
  const navigateToApp = useCallback(() => {
    if (!isMountedRef.current || hasNavigatedRef.current) return;
    
    hasNavigatedRef.current = true;
    log.info("Navigating to App");
    
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: ScreenNames.App }],
      })
    );
  }, [navigation]);

  // Prevent hardware back button
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (needsUsername) {
          toastInfo("Please complete your profile to continue");
          return true; // Block back navigation
        }
        return false;
      };

      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        onBackPress
      );

      return () => subscription.remove();
    }, [needsUsername])
  );

  // Disable swipe/gesture back
  useEffect(() => {
    if (needsUsername) {
      navigation.setOptions({ gestureEnabled: false });
    }
  }, [needsUsername, navigation]);

  // Navigate to App when profile is complete (needsUsername becomes false)
  useEffect(() => {
    if (!needsUsername && !submitting && !hasNavigatedRef.current) {
      log.info("Profile complete, navigating to App");
      navigateToApp();
    }
  }, [needsUsername, submitting, navigateToApp]);

  // Handle edge case: arrived here without provisional user
  useEffect(() => {
    if (!provisionalUser && !needsUsername && !hasNavigatedRef.current) {
      log.warn("No provisional user, redirecting to SignIn");
      hasNavigatedRef.current = true;
      navigation.reset({
        index: 0,
        routes: [{ name: ScreenNames.SignIn }],
      });
    }
  }, [provisionalUser, needsUsername, navigation]);

  const runAvailability = useDebounceCallback(async (name: string) => {
    if (!name || name.length < 3) {
      setAvailable(null);
      return;
    }
    setChecking(true);
    try {
      const res = await AuthService.checkUsernameAvailability(name);
      setAvailable(res.available);
    } catch {
      setAvailable(null);
    }
    setChecking(false);
  }, 450);

  const handleUsernameChange = (text: string) => {
    // Only allow letters, numbers, underscore
    const sanitized = text.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase();
    setUsername(sanitized);
    runAvailability(sanitized.trim());
  };

  const handleDisplayNameChange = (text: string) => {
    setDisplayName(text);
  };

  const isUsernameValid = username.length >= 3 && username.length <= 30;
  const isDisplayNameValid = displayName.trim().length >= 2 && displayName.trim().length <= 50;
  const disabled = !isUsernameValid || available === false || checking || submitting || !isDisplayNameValid;

  const handleSubmit = async () => {
    if (disabled) return;
    setSubmitting(true);
    try {
      await AuthService.updateProfile({
        username: username.trim(),
        displayName: displayName.trim(),
      });
      const finalUser: User = {
        ...provisionalUser,
        username: username.trim(),
        displayName: displayName.trim(),
      };
      await setAuthUser(finalUser);
      toastSuccess("Profile set successfully!");
      
      // completeUsername will set needsUsername to false,
      // which triggers navigation via the useEffect above
      completeUsername(finalUser);
    } catch (e: any) {
      toastError(e, "Failed to set profile");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-black">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          className="px-6"
        >
          {/* User 3D Image */}
          <View className="items-center mt-8">
            <Image
              source={USER_3D_IMAGE}
              style={{ width: 250, height: 250 }}
              resizeMode="contain"
            />
          </View>

          {/* Header - overlaps with image shadow */}
          <View className="items-center mb-6" style={{ marginTop: -55 }}>
            <Text className="text-white text-2xl font-bold mb-2">
              Set your profile
            </Text>
            <Text className="text-gray-400 text-center text-base">
              Choose how you'll be known on DeHub.{"\n"}You can change them later.
            </Text>
          </View>

          {/* Username Input */}
          <View className="mb-4">
            <Text className="text-white text-sm font-medium mb-2">Username</Text>
            <TextInput
              value={username}
              onChangeText={handleUsernameChange}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="@username"
              placeholderTextColor="#8B8D90"
              className="border border-neutral-700 rounded-xl px-4 py-4 text-white text-base bg-neutral-900"
            />
            <View className="mt-2 min-h-[20px]">
              {checking && (
                <View className="flex-row items-center">
                  <ActivityIndicator size="small" color="#F4F4F5" />
                  <Text className="text-xs text-gray-400 ml-2">Checking...</Text>
                </View>
              )}
              {!checking && available === true && username.length >= 3 && (
                <View className="flex-row items-center">
                  <View className="w-2 h-2 rounded-full bg-green-500 mr-2" />
                  <Text className="text-xs text-green-400">Available</Text>
                </View>
              )}
              {!checking && available === false && username.length >= 3 && (
                <View className="flex-row items-center">
                  <View className="w-2 h-2 rounded-full bg-red-500 mr-2" />
                  <Text className="text-xs text-red-400">Username taken</Text>
                </View>
              )}
              {!checking && available === null && (
                <Text className="text-xs text-gray-400">
                  3-30 characters: letters, numbers, underscore.
                </Text>
              )}
            </View>
          </View>

          {/* Display Name Input */}
          <View className="mb-6">
            <Text className="text-white text-sm font-medium mb-2">Display Name</Text>
            <TextInput
              value={displayName}
              onChangeText={handleDisplayNameChange}
              autoCapitalize="words"
              autoCorrect={false}
              placeholder="Display name"
              placeholderTextColor="#8B8D90"
              className="border border-neutral-700 rounded-xl px-4 py-4 text-white text-base bg-neutral-900"
            />
            <View className="mt-2 min-h-[20px]">
              <Text className="text-xs text-gray-400">
                Your public name shown on your profile.
              </Text>
            </View>
          </View>

          {/* Continue Button */}
          <View className="items-center mb-4">
            <TouchableOpacity
              disabled={disabled}
              onPress={handleSubmit}
              style={{
                width: "100%",
                maxWidth: 280,
                opacity: disabled ? 0.5 : 1,
              }}
              accessibilityLabel="Continue to set profile"
            >
              <AccentButtonGradient
                borderRadius={14}
                style={{
                  paddingVertical: 16,
                  alignItems: "center",
                }}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-white font-semibold text-base">
                    Continue
                  </Text>
                )}
              </AccentButtonGradient>
            </TouchableOpacity>
          </View>

          {/* Cancel / Sign Out option */}
          <View className="items-center mb-8">
            <TouchableOpacity
              onPress={async () => {
                try {
                  log.info("User cancelled, signing out");
                  await signOut();
                  // After sign out, navigate back to SignIn
                  if (isMountedRef.current) {
                    navigation.reset({
                      index: 0,
                      routes: [{ name: ScreenNames.SignIn }],
                    });
                  }
                } catch (e) {
                  log.warn("Sign out error", e);
                }
              }}
              disabled={submitting}
              className="py-3"
            >
              <Text className="text-gray-400 text-sm">
                Cancel and sign out
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default SetProfileScreen;
