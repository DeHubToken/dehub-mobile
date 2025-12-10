import { useState, useEffect, useCallback } from "react";
import { Platform } from "react-native";
import * as Application from "expo-application";
import AsyncStorage from "@react-native-async-storage/async-storage";
import env from "../config/env";

interface UpdateInfo {
  hasUpdate: boolean;
  isRequired: boolean;
  latestVersion?: string;
  releaseNotes?: string;
  downloadUrl?: string;
}

const UPDATE_CHECK_KEY = "@app/last_update_check";
const UPDATE_DISMISSED_KEY = "@app/update_dismissed_version";
const CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Hook to check for app updates from a remote API
 * You should implement your own backend endpoint to serve update information
 */
export function useAppUpdate() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo>({
    hasUpdate: false,
    isRequired: false,
  });
  const [showModal, setShowModal] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  const currentVersion = Application.nativeApplicationVersion || "1.0.0";

  const compareVersions = (v1: string, v2: string): number => {
    const parts1 = v1.split(".").map(Number);
    const parts2 = v2.split(".").map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const part1 = parts1[i] || 0;
      const part2 = parts2[i] || 0;

      if (part1 > part2) return 1;
      if (part1 < part2) return -1;
    }
    return 0;
  };

  const checkForUpdates = useCallback(async (force = false) => {
    try {
      setIsChecking(true);

      // Check backend API for update information
      const platform = Platform.OS === "ios" ? "ios" : "android";
      const apiUrl = `${env.API_URL}/mobile/app/version?platform=${platform}&current_version=${currentVersion}`;
      
      const response = await fetch(apiUrl);
      const result = await response.json();

      if (!result.status || !result.data) {
        console.warn("[useAppUpdate] Invalid response from server");
        setIsChecking(false);
        return;
      }

      const data = result.data;

      const hasUpdate = data.update_available === true;
      const isRequired = data.update_required === true || data.force_update === true;

      setUpdateInfo({
        hasUpdate,
        isRequired,
        latestVersion: data.latest_version,
        releaseNotes: data.release_notes,
        downloadUrl: data.download_url,
      });

      // Always show modal for forced updates, regardless of dismissal
      if (hasUpdate && isRequired) {
        setShowModal(true);
        await AsyncStorage.setItem(UPDATE_CHECK_KEY, Date.now().toString());
        setIsChecking(false);
        return;
      }

      // For optional updates, check if we should skip
      if (hasUpdate && !isRequired && !force) {
        const lastCheck = await AsyncStorage.getItem(UPDATE_CHECK_KEY);
        if (lastCheck) {
          const timeSinceCheck = Date.now() - parseInt(lastCheck, 10);
          if (timeSinceCheck < CHECK_INTERVAL) {
            setIsChecking(false);
            return;
          }
        }

        const dismissedVersion = await AsyncStorage.getItem(UPDATE_DISMISSED_KEY);
        if (dismissedVersion === data.latest_version) {
          setIsChecking(false);
          return;
        }
      }

      if (hasUpdate) {
        setShowModal(true);
      }

      // Save last check time
      await AsyncStorage.setItem(UPDATE_CHECK_KEY, Date.now().toString());
    } catch (error) {
      console.warn("[useAppUpdate] Failed to check for updates:", error);
    } finally {
      setIsChecking(false);
    }
  }, [currentVersion]);

  const dismissUpdate = useCallback(async () => {
    // Never dismiss forced updates
    if (updateInfo.isRequired) {
      return;
    }
    
    if (updateInfo.latestVersion) {
      await AsyncStorage.setItem(UPDATE_DISMISSED_KEY, updateInfo.latestVersion);
    }
    setShowModal(false);
  }, [updateInfo]);

  const closeModal = useCallback(() => {
    // Don't allow closing forced updates
    if (updateInfo.isRequired) {
      return;
    }
    dismissUpdate();
  }, [updateInfo.isRequired, dismissUpdate]);

  useEffect(() => {
    // Always check for updates on mount to catch forced updates
    checkForUpdates(false);
  }, [checkForUpdates]);

  return {
    updateInfo,
    showModal,
    isChecking,
    checkForUpdates,
    closeModal,
  };
}
