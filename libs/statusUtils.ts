import { Ionicons } from '@expo/vector-icons';

type IonIconName = keyof typeof Ionicons.glyphMap;

export const statusOptions: { id: string; label: string; icon: IonIconName; color?: string }[] = [
  { id: 'all', label: 'All', icon: 'grid-outline' },
  { id: 'live', label: 'Live', icon: 'radio-outline', color: '#FF0000' },
  { id: 'new', label: 'New', icon: 'flash-outline', color: '#00FF88' },
  { id: 'trending', label: 'Trending', icon: 'trending-up-outline', color: '#FF6B35' },
  { id: 'exclusive', label: 'Exclusive', icon: 'star-outline', color: '#8B5CF6' },
  { id: 'featured', label: 'Featured', icon: 'bookmark-outline', color: '#F59E0B' },
  { id: 'popular', label: 'Popular', icon: 'heart-outline', color: '#EF4444' },
  { id: 'recent', label: 'Recent', icon: 'time-outline', color: '#06B6D4' },
];

export const getSelectedStatusLabel = (selectedStatus: string): string => {
  const status = statusOptions.find(option => option.id === selectedStatus);
  return status ? status.label : 'All';
};

export const getSelectedStatusIcon = (selectedStatus: string): keyof typeof Ionicons.glyphMap => {
  const status = statusOptions.find(option => option.id === selectedStatus);
  return status ? (status.icon as keyof typeof Ionicons.glyphMap) : 'grid-outline';
};
