import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import GlassModal from "./GlassModal";
import AccentButtonGradient from "./AccentButtonGradient";


type PermissionIconName = "images-outline" | "camera-outline" | "mic-outline";

export type PermissionModalConfig = {
  icon: PermissionIconName;
  title: string;
  message: string;
};

/** Resolve callback from the show* promise */
type Resolver<T> = (value: T) => void;


type ShowRationaleFn = (config: PermissionModalConfig) => Promise<boolean>;
type ShowSettingsFn = (config: PermissionModalConfig) => Promise<void>;

let _showRationale: ShowRationaleFn | null = null;
let _showSettings: ShowSettingsFn | null = null;

/**
 * Static imperative API — call from any file, no React needed.
 */
export const PermissionModal = {
  /** Pre-permission rationale. Resolves `true` if user taps "Continue". */
  showRationale: (config: PermissionModalConfig): Promise<boolean> => {
    if (!_showRationale) {
      console.warn("[PermissionModal] Provider not mounted — falling back to auto-continue");
      return Promise.resolve(true);
    }
    return _showRationale(config);
  },

  /** Permanently-denied variant with "Open Settings" CTA. */
  showSettings: (config: PermissionModalConfig): Promise<void> => {
    if (!_showSettings) {
      console.warn("[PermissionModal] Provider not mounted — skipping settings modal");
      return Promise.resolve();
    }
    return _showSettings(config);
  },
};


type ModalState =
  | { mode: "hidden" }
  | { mode: "rationale"; config: PermissionModalConfig; resolve: Resolver<boolean> }
  | { mode: "settings"; config: PermissionModalConfig; resolve: Resolver<void> };

const PermissionModalProvider: React.FC = memo(() => {
  const [state, setState] = useState<ModalState>({ mode: "hidden" });
  /** Guard against stale resolves after unmount */
  const mountedRef = useRef(true);

  // Register the static bridge on mount
  useEffect(() => {
    _showRationale = (config) =>
      new Promise<boolean>((resolve) => {
        setState({ mode: "rationale", config, resolve });
      });

    _showSettings = (config) =>
      new Promise<void>((resolve) => {
        setState({ mode: "settings", config, resolve });
      });

    return () => {
      mountedRef.current = false;
      _showRationale = null;
      _showSettings = null;
    };
  }, []);


  const dismiss = useCallback(() => {
    if (state.mode === "rationale") state.resolve(false);
    if (state.mode === "settings") state.resolve();
    setState({ mode: "hidden" });
  }, [state]);

  const handleContinue = useCallback(() => {
    if (state.mode === "rationale") state.resolve(true);
    setState({ mode: "hidden" });
  }, [state]);

  const handleOpenSettings = useCallback(async () => {
    // Import lazily to avoid circular deps — permissions.util exports openAppSettings
    const { openAppSettings } = require("../../libs/permissions.util");
    await openAppSettings();
    if (state.mode === "settings") state.resolve();
    if (mountedRef.current) setState({ mode: "hidden" });
  }, [state]);


  if (state.mode === "hidden") return null;

  const { config } = state;
  const isSettings = state.mode === "settings";

  return (
    <GlassModal
      visible
      onClose={dismiss}
      presentation="center"
      blurIntensity={80}
      blurTint="dark"
      dismissible
    >
      <View className="items-center px-6 pt-8 pb-6">
        <View className="w-16 h-16 rounded-full bg-white/10 items-center justify-center mb-5">
          <Ionicons name={config.icon} size={30} color="#F4F4F5" />
        </View>

        <Text className="text-white text-lg font-bold text-center mb-2">
          {config.title}
        </Text>

        <Text className="text-neutral-400 text-sm text-center leading-5 mb-7">
          {config.message}
        </Text>

        <AccentButtonGradient style={{ width: "100%", marginBottom: 10 }}>
          <TouchableOpacity
            className="py-3.5 items-center"
            activeOpacity={0.8}
            onPress={isSettings ? handleOpenSettings : handleContinue}
          >
            <Text className="text-white font-semibold text-[15px]">
              {isSettings ? "Open Settings" : "Continue"}
            </Text>
          </TouchableOpacity>
        </AccentButtonGradient>

        <TouchableOpacity
          className="py-3 items-center w-full"
          activeOpacity={0.7}
          onPress={dismiss}
        >
          <Text className="text-neutral-400 text-sm font-medium">
            {isSettings ? "Cancel" : "Not Now"}
          </Text>
        </TouchableOpacity>
      </View>
    </GlassModal>
  );
});

PermissionModalProvider.displayName = "PermissionModalProvider";

export default PermissionModalProvider;
