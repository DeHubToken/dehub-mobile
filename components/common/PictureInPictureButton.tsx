import React from 'react';
import { Pressable } from 'react-native';
import { isPictureInPictureSupported, VideoView } from 'expo-video';
import { PictureInPicture2 } from '../ui/cut-icons';
import { MediaControlIcon } from './MediaControlGlyph';
import { toastInfo } from '../../libs';
import { useTranslation } from 'react-i18next';
import { ChromeFill } from './ViewerChrome';

export default function PictureInPictureButton({ videoRef, plain = false, size = 36 }: {
  videoRef: React.RefObject<VideoView | null>;
  plain?: boolean;
  /** Square edge; the shorts top row passes its own button size. */
  size?: number;
}) {
  const { t } = useTranslation();
  if (!isPictureInPictureSupported()) return null;

  return (
    <Pressable
      className="dark-surface"
      accessibilityRole="button"
      accessibilityLabel={t('player.pictureInPicture')}
      hitSlop={8}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', borderRadius: plain ? 0 : 12 }}
      onPress={(event) => {
        event.stopPropagation();
        videoRef.current?.startPictureInPicture().catch(() => {
          toastInfo(t('player.pipUnavailable'));
        });
      }}
    >
      {!plain && <ChromeFill top />}
      {plain ? <MediaControlIcon name="PictureInPicture2" plain /> : <PictureInPicture2 size={20} color="#fff" />}
    </Pressable>
  );
}
