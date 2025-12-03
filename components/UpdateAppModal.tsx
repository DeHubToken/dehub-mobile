import React from "react";
import { View, Text, TouchableOpacity, Linking, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import GlassModal from "./ui/GlassModal";
import AccentButtonGradient from "./ui/AccentButtonGradient";
import { theme } from "../theme";
import { APP_STORE_LINK, GOOGLE_PLAY_LINK, WEBSITE_LINK } from "../config";
import { openExternalLink } from "../libs/links.utils";

interface UpdateAppModalProps {
  visible: boolean;
  onClose: () => void;
  isRequired?: boolean;
  version?: string;
  releaseNotes?: string;
  downloadUrl?: string;
}

const UpdateAppModal: React.FC<UpdateAppModalProps> = ({
  visible,
  onClose,
  isRequired = false,
  version,
  releaseNotes,
  downloadUrl,
}) => {
  const handleUpdate = () => {
    const storeUrl = downloadUrl || Platform.select({
      ios: APP_STORE_LINK,
      android: GOOGLE_PLAY_LINK,
      default: WEBSITE_LINK,
    });
    openExternalLink(storeUrl);
  };

  return (
    <GlassModal
      visible={visible}
      onClose={onClose}
      presentation="center"
      blurIntensity={80}
      dismissible={!isRequired}
    >
      <View className="rounded-2xl p-6 mx-6">
        {/* Icon */}
        <View className="items-center mb-4">
          <View className="bg-theme-accent/10 rounded-full p-4">
            <Ionicons
              name="download-outline"
              size={48}
              color={theme.colors.accent}
            />
          </View>
        </View>

        {/* Title */}
        <Text className="text-white text-2xl font-bold text-center mb-2">
          {isRequired ? "Update Required" : "Update Available"}
        </Text>

        {/* Version */}
        {version && (
          <Text className="text-theme-neutrals-400 text-sm text-center mb-4">
            Version {version} is now available
          </Text>
        )}

        {/* Release Notes */}
        {releaseNotes && (
          <View className="bg-theme-neutrals-800 rounded-xl p-4 mb-6">
            <Text className="text-theme-neutrals-400 text-xs uppercase tracking-wide mb-2">
              What's New
            </Text>
            <Text className="text-theme-neutrals-100 text-sm leading-5">
              {releaseNotes}
            </Text>
          </View>
        )}

        {/* Description */}
        <Text className="text-theme-neutrals-300 text-sm text-center mb-6">
          {isRequired
            ? "This update contains critical improvements and is required to continue using the app."
            : "We've made some improvements to enhance your experience."}
        </Text>

        {/* Buttons */}
        <View className="gap-3">
          <AccentButtonGradient>
            <TouchableOpacity
              onPress={handleUpdate}
              className="py-3 px-6 items-center"
              activeOpacity={0.8}
            >
              <Text className="text-white text-base font-semibold">
                Update Now
              </Text>
            </TouchableOpacity>
          </AccentButtonGradient>

          {!isRequired && (
            <TouchableOpacity
              onPress={onClose}
              className="py-3 px-6 items-center"
              activeOpacity={0.7}
            >
              <Text className="text-theme-neutrals-400 text-base">
                Remind Me Later
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </GlassModal>
  );
};

export default UpdateAppModal;
