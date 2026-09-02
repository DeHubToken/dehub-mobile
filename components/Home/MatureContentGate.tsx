/**
 * Mature content gate — mirrors web's `MatureContentGate`
 * (dehubweb src/components/app/cards/MatureContentGate.tsx).
 *
 * The public feeds never carry mature posts unless the viewer opted in
 * server-side, so this covers the surfaces where one is served on purpose — a
 * creator's profile, the Following feed, a link somebody opened. Tapping
 * through is per-card and per-mount: it is a warning, not a lock.
 *
 * Unlike web this shows no preview of the media at all rather than a blurred
 * one. A blurred thumbnail is still often recognisable, and a BlurView over a
 * remote image costs a frame on Android for something nobody is meant to see.
 */
import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Icon from '../ui/Icon';
import { useMatureContent } from '../../hooks/useMatureContent';
import { MATURE_CONTENT_ENABLED } from '../../config/storefront';

/**
 * Whether this post needs a warning, and the one-way switch that removes it.
 *
 * Safe to call on every card — the setting comes from the auth context that is
 * already mounted, so this costs one boolean read per post.
 */
export function useMatureGate(contentRating?: string) {
  const { showMatureContent } = useMatureContent();
  const [revealed, setRevealed] = useState(false);

  const reveal = useCallback(() => setRevealed(true), []);

  // The App Store build has no way through: the API withholds mature posts
  // from it, and should one arrive anyway (a stale cache, an older server)
  // the warning stays up and the tap-through is not offered.
  if (!MATURE_CONTENT_ENABLED) {
    return { isGated: contentRating === 'mature', reveal, canReveal: false };
  }

  return {
    isGated: contentRating === 'mature' && !showMatureContent && !revealed,
    reveal,
    canReveal: true,
  };
}

const MatureContentGate: React.FC<{
  onReveal: () => void;
  /** False hides the tap-through — the App Store build. */
  canReveal?: boolean;
  /** Short copy under the heading. */
  description?: string;
}> = ({
  onReveal,
  canReveal = MATURE_CONTENT_ENABLED,
  description = 'The creator marked this post as adult or graphic.',
}) => (
  <View
    className="items-center justify-center rounded-xl mt-2"
    style={{
      backgroundColor: 'rgba(255,255,255,0.04)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.10)',
      paddingVertical: 32,
      paddingHorizontal: 24,
    }}
  >
    <View
      className="items-center justify-center rounded-2xl mb-3"
      style={{
        width: 56,
        height: 56,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.10)',
      }}
    >
      <Icon name="EyeOff" size={24} color="#fff" />
    </View>
    <Text className="text-white text-sm font-semibold mb-1">Mature content</Text>
    <Text className="text-theme-neutrals-400 text-xs text-center mb-3">{description}</Text>
    {canReveal && (
    <TouchableOpacity
      onPress={onReveal}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      className="rounded-full"
      style={{
        paddingHorizontal: 16,
        paddingVertical: 7,
        backgroundColor: 'rgba(255,255,255,0.10)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.20)',
      }}
    >
      <Text className="text-white text-xs font-medium">View anyway</Text>
    </TouchableOpacity>
    )}
  </View>
);

export default MatureContentGate;
