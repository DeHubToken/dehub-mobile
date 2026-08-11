/**
 * Share Link Button
 * =================
 * A header action that hands a DeHub link to the OS share sheet.
 *
 * Stores, shop items and events had no share affordance on mobile at all —
 * ShareLinks knew how to build a post or a community URL and nothing else, so
 * the only way to send somebody an item was to describe it. The system sheet is
 * the right primitive here: it already carries Copy, Messages, WhatsApp and
 * everything else the phone knows about, and the link unfurls as a card at the
 * far end now that the worker renders OG tags for these routes.
 */

import React, { useCallback } from 'react';
import { Share } from 'react-native';
import Icon from '../ui/Icon';

interface Props {
  url: string;
  /** Subject line for share targets that have one (mail, some Android apps). */
  title?: string;
  size?: number;
  color?: string;
}

const ShareLinkButton: React.FC<Props> = ({ url, title, size = 20, color = '#E4E4E7' }) => {
  const onPress = useCallback(() => {
    // iOS puts `url` in its own field and ignores it inside `message`; Android
    // only reads `message`. Sending both is how one call covers the two.
    Share.share(
      { message: url, url, ...(title ? { title } : {}) },
      { dialogTitle: title },
    ).catch(() => {
      // Dismissing the sheet rejects on some Android targets; nothing to say.
    });
  }, [url, title]);

  return (
    <Icon
      name="Share2"
      size={size}
      color={color}
      onPress={onPress}
      accessibilityLabel="Share"
    />
  );
};

export default ShareLinkButton;
