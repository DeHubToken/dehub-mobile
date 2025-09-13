import React from 'react';
import { View } from 'react-native';

export interface VideoPlayerSkeletonProps {
  variant?: 'full' | 'panel' | 'suggestions';
  suggestionCount?: number;
  actionCount?: number;
}

const ActionButtonsSkeleton = ({ count }: { count: number }) => (
  <View className="flex-row mb-5">
    {Array.from({ length: count }).map((_, i) => (
      <View key={i} className="h-8 w-16 bg-theme-neutrals-800 rounded-full mr-2" />
    ))}
    <View className="flex-1" />
    <View className="h-8 w-8 bg-theme-neutrals-800 rounded-full mr-2" />
    <View className="h-8 w-8 bg-theme-neutrals-800 rounded-full" />
  </View>
);

const ChannelRowSkeleton = () => (
  <View className="flex-row items-center mt-1">
    <View className="w-10 h-10 rounded-full bg-theme-neutrals-800 mr-3" />
    <View className="flex-1">
      <View className="h-4 w-32 bg-theme-neutrals-800 rounded mb-2" />
      <View className="h-3 w-20 bg-theme-neutrals-700 rounded" />
    </View>
    <View className="h-8 w-24 bg-theme-neutrals-800 rounded-full" />
  </View>
);

const DescriptionSkeleton = () => (
  <View className="mt-5 space-y-2">
    {Array.from({ length: 3 }).map((_, i) => (
      <View key={i} className="h-3 w-full bg-theme-neutrals-800 rounded" />
    ))}
  </View>
);

const CommentPreviewSkeleton = () => (
  <View className="mt-5 h-16 w-full bg-theme-neutrals-800 rounded" />
);

const SuggestionsSkeleton = ({ count }: { count: number }) => (
  <View className="mt-6">
    {Array.from({ length: count }).map((_, i) => (
      <View key={i} className="flex-row mb-4">
        <View className="w-40 aspect-video bg-theme-neutrals-900 rounded mr-3" />
        <View className="flex-1 justify-center">
          <View className="h-3 w-3/4 bg-theme-neutrals-800 rounded mb-2" />
          <View className="h-3 w-1/2 bg-theme-neutrals-800 rounded" />
        </View>
      </View>
    ))}
  </View>
);

const PanelSkeleton = ({ actionCount }: { actionCount: number }) => (
  <View className="px-4 pt-3">
    <View className="h-4 w-3/4 bg-theme-neutrals-800 rounded mb-2" />
    <View className="h-4 w-1/2 bg-theme-neutrals-800 rounded mb-4" />
    <ActionButtonsSkeleton count={actionCount} />
    <ChannelRowSkeleton />
    <DescriptionSkeleton />
    <CommentPreviewSkeleton />
  </View>
);

const VideoPlayerSkeleton: React.FC<VideoPlayerSkeletonProps> = ({ variant = 'full', suggestionCount = 4, actionCount = 5 }) => {
  if (variant === 'panel') {
    return <PanelSkeleton actionCount={actionCount} />;
  }
  if (variant === 'suggestions') {
    return <SuggestionsSkeleton count={suggestionCount} />;
  }
  return (
    <View className="flex-1">
      <View className="w-full aspect-video bg-theme-neutrals-900" />
      <PanelSkeleton actionCount={actionCount} />
      <SuggestionsSkeleton count={suggestionCount} />
    </View>
  );
};

export default VideoPlayerSkeleton;