import React, { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  StyleSheet,
} from "react-native";
import { useSnapshot } from "valtio";
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Icon from "../components/ui/Icon";
import ScreenHeader from "../components/ScreenHeader";
import {
  uploadState,
  uploadActions,
  type UploadJob,
  type UploadJobStatus,
  MAX_RETRIES,
} from "../store/upload.store";
import { cancelJob } from "../services/upload.processor";

const STATUS_CONFIG: Record<
  UploadJobStatus,
  { label: string; color: string; icon: string }
> = {
  queued: { label: "Waiting…", color: "#9ca3af", icon: "Clock" },
  uploading: { label: "Uploading", color: "#fff", icon: "Upload" },
  processing: { label: "Processing…", color: "#fff", icon: "Loader" },
  minting: { label: "Minting…", color: "#fff", icon: "Coins" },
  done: { label: "Posted", color: "#fff", icon: "CircleCheck" },
  failed: { label: "Failed", color: "#f87171", icon: "CircleAlert" },
};

const JobItem = memo<{ job: UploadJob }>(({ job }) => {
  const config = STATUS_CONFIG[job.status];
  const progressPercent = Math.min(Math.round((job.progress ?? 0) * 100), 100);
  const isActive = job.status === "uploading" || job.status === "processing" || job.status === "minting";
  const isMinting = job.status === "minting";
  const canRetry = job.status === "failed" && job.retryCount < MAX_RETRIES;
  const retriesExhausted = job.status === "failed" && job.retryCount >= MAX_RETRIES;

  const handleRetry = useCallback(() => {
    if (!uploadActions.retry(job.id)) {
      // retry returned false — limit reached
    }
  }, [job.id]);

  const handleRemove = useCallback(() => {
    uploadActions.remove(job.id);
  }, [job.id]);

  const handleCancel = useCallback(() => {
    cancelJob(job.id);
  }, [job.id]);

  return (
    <View className="bg-theme-neutrals-800 rounded-xl overflow-hidden border border-theme-neutrals-700 mb-3">
      <View className="flex-row items-center px-4 py-3.5">
        {job.thumbnailUri ? (
          <Image
            source={{ uri: job.thumbnailUri }}
            className="w-11 h-11 rounded-xl mr-3"
            resizeMode="cover"
          />
        ) : (
          <View className="w-11 h-11 rounded-xl bg-theme-neutrals-700/50 items-center justify-center mr-3">
            <Icon name="Film" size={20} color="#6b7280" />
          </View>
        )}

        <View className="flex-1 mr-3">
          <Text className="text-white text-sm font-medium" numberOfLines={1}>
            {job.title || "Untitled"}
          </Text>
          <View className="flex-row items-center mt-0.5">
            <Icon name={config.icon as any} size={12} color={config.color} />
            <Text style={{ color: config.color }} className="text-xs ml-1">
              {(job.status === "uploading" || job.status === "processing" || job.status === "minting")
                ? `${progressPercent}%`
                : config.label}
            </Text>
          </View>
          {job.error && (
            <Text className="text-red-400/80 text-[11px] mt-0.5" numberOfLines={2}>
              {job.error}
              {retriesExhausted ? " (no retries left)" : ""}
            </Text>
          )}
        </View>

        <View className="flex-row items-center">
          {canRetry && (
            <TouchableOpacity
              onPress={handleRetry}
              activeOpacity={0.7}
              className="w-8 h-8 rounded-lg bg-white/10 items-center justify-center mr-1.5"
            >
              <Icon name="RotateCcw" size={15} color="#fff" />
            </TouchableOpacity>
          )}
          {isActive && !isMinting && (
            <TouchableOpacity
              onPress={handleCancel}
              activeOpacity={0.7}
              className="w-8 h-8 rounded-lg bg-theme-neutrals-700/50 items-center justify-center mr-1.5"
            >
              <Icon name="X" size={15} color="#9ca3af" />
            </TouchableOpacity>
          )}
          {isMinting && (
            <View className="w-8 h-8 rounded-lg bg-theme-neutrals-700/30 items-center justify-center mr-1.5 opacity-40">
              <Icon name="Lock" size={13} color="#9ca3af" />
            </View>
          )}
          {(job.status === "failed" || job.status === "done" || job.status === "queued") && (
            <TouchableOpacity
              onPress={handleRemove}
              activeOpacity={0.7}
              className="w-8 h-8 rounded-lg bg-theme-neutrals-700/50 items-center justify-center"
            >
              <Icon name="Trash2" size={14} color="#6b7280" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {(job.status === "uploading" || job.status === "processing" || job.status === "minting") && (
        <View className="h-0.5 bg-theme-neutrals-700">
          <View
            className="h-0.5 bg-white rounded-full"
            style={{ width: `${Math.max(progressPercent, 1)}%` }}
          />
        </View>
      )}
    </View>
  );
});

const EmptyState = memo(() => (
  <View className="flex-1 items-center justify-center py-20">
    <View className="w-14 h-14 rounded-xl bg-theme-neutrals-800 items-center justify-center mb-4">
      <Icon name="Upload" size={24} color="#4b5563" />
    </View>
    <Text className="text-theme-neutrals-500 text-sm font-medium">
      No uploads
    </Text>
    <Text className="text-theme-neutrals-600 text-xs mt-1">
      Your uploads will appear here
    </Text>
  </View>
));

const UploadQueueScreen: React.FC<any> = () => {
  const { t } = useTranslation();
  const snap = useSnapshot(uploadState);
  const jobs = [...snap.jobs].reverse() as UploadJob[];

  const renderItem = useCallback(
    ({ item }: { item: UploadJob }) => <JobItem job={item} />,
    [],
  );

  const keyExtractor = useCallback((item: UploadJob) => item.id, []);

  const hasCompleted = snap.jobs.some((j) => j.status === "done");

  const handleClearCompleted = useCallback(() => {
    uploadActions.clearCompleted();
  }, []);

  return (
    <View className="flex-1 bg-theme-neutrals-900">
      <ScreenHeader
        title={t("screens.uploads")}
        canGoBack
        rightContent={
          hasCompleted ? (
            <TouchableOpacity onPress={handleClearCompleted} activeOpacity={0.7}>
              <Text className="text-blue-400 text-sm font-medium">Clear</Text>
            </TouchableOpacity>
          ) : undefined
        }
      />
      <FlatList
        data={jobs}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 }}
        ListEmptyComponent={EmptyState}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

export default UploadQueueScreen;
