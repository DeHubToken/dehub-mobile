import React from 'react';
import { Pressable } from 'react-native';
import { isPictureInPictureSupported, VideoView } from 'expo-video';
import { MediaControlIcon } from './MediaControlGlyph';
import { toastInfo } from '../../libs';
import { useTranslation } from 'react-i18next';

export default function PictureInPictureButton({ videoRef }: {
  videoRef: React.RefObject<VideoView | null>;
}) {
  const { t } = useTranslation();
  if (!isPictureInPictureSupported()) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('player.pictureInPicture')}
      hitSlop={8}
      style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}
      onPress={(event) => {
        event.stopPropagation();
        videoRef.current?.startPictureInPicture().catch(() => {
          toastInfo(t('player.pipUnavailable'));
        });
      }}
    >
      <MediaControlIcon name="PictureInPicture2" />
    </Pressable>
  );
}
