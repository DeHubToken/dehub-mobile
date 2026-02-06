import React from 'react';
import { View } from 'react-native';

interface NotificationSkeletonProps {
  count?: number;
}

/**
 * NotificationItemSkeleton - matches the actual notification item layout
 */
const NotificationItemSkeleton: React.FC = () => (
  <View 
    className="flex-row items-start p-4 border-b border-theme-neutrals-800"
  >
    {/* Avatar with badge overlay */}
    <View className="relative">
      <View className="w-11 h-11 rounded-full bg-theme-neutrals-800" />
      {/* Type badge */}
      <View 
        className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-theme-neutrals-700 border-2 border-theme-neutrals-900"
      />
    </View>

    {/* Content */}
    <View className="flex-1 ml-3">
      {/* Main text - 2-3 lines */}
      <View className="w-full h-4 bg-theme-neutrals-800 rounded" />
      <View className="w-4/5 h-4 bg-theme-neutrals-800 rounded mt-1.5" />
      <View className="w-2/3 h-4 bg-theme-neutrals-800 rounded mt-1.5" />
      
      {/* Timestamp */}
      <View className="w-16 h-3 bg-theme-neutrals-800 rounded mt-2" />
    </View>
  </View>
);

/**
 * NotificationSkeleton - shows category tabs and notification items
 */
const NotificationSkeleton: React.FC<NotificationSkeletonProps> = ({ count = 6 }) => {
  return (
    <View className="flex-1">
      {/* Category tabs skeleton */}
      <View className="flex-row px-4 py-2 border-b border-theme-neutrals-800">
        {[40, 80, 55, 60, 70, 60].map((width, i) => (
          <View 
            key={i} 
            className="h-8 mr-2 rounded-full bg-theme-neutrals-800"
            style={{ width }}
          />
        ))}
      </View>
      
      {/* Notification items */}
      {Array.from({ length: count }).map((_, idx) => (
        <NotificationItemSkeleton key={idx} />
      ))}
    </View>
  );
};

export { NotificationItemSkeleton };
export default NotificationSkeleton;
