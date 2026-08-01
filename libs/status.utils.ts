import { Ionicons } from '@expo/vector-icons';

type IonIconName = keyof typeof Ionicons.glyphMap;

// Adapted to backend sortMode values
export const statusOptions: { id: string; label: string; icon: IonIconName; color?: string }[] = [
  { id: 'trends', label: 'Most viewed', icon: 'trending-up-outline', color: '#FF6B35' },
  { id: 'live', label: 'Live', icon: 'radio-outline', color: '#FF0000' },
  { id: 'new', label: 'New', icon: 'flash-outline', color: '#00FF88' },
  { id: 'mostLiked', label: 'Most Liked', icon: 'heart-outline', color: '#EF4444' },
  { id: 'ppv', label: 'Pay Per View', icon: 'cash-outline', color: '#10B981' },
  { id: 'bounty', label: 'Bounties', icon: 'gift-outline', color: '#D4D4D8' },
  { id: 'locked', label: 'Locked', icon: 'lock-closed-outline', color: '#D4D4D8' },
];

export const getSelectedStatusLabel = (selectedStatus: string): string => {
  const status = statusOptions.find(option => option.id === selectedStatus);
  return status ? status.label : 'Trending';
};

export const getSelectedStatusIcon = (selectedStatus: string): keyof typeof Ionicons.glyphMap => {
  const status = statusOptions.find(option => option.id === selectedStatus);
  return status ? (status.icon as keyof typeof Ionicons.glyphMap) : 'trending-up-outline';
};
