import React from 'react';
import { Pressable } from 'react-native';
import { isPictureInPictureSupported, VideoView } from 'expo-video';
import { PictureInPicture2 } from '../ui/cut-icons';
import { MediaControlIcon } from './MediaControlGlyph';
import { toastInfo } from '../../libs';
import { useTranslation } from 'react-i18next';

export default function PictureInPictureButton({ videoRef, plain = false }: {
  videoRef: React.RefObject<VideoView | null>;
  plain?: boolean;
}) {
  const { t } = useTranslation();
  if (!isPictureInPictureSupported()) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('player.pictureInPicture')}
      hitSlop={8}
      style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: plain ? 0 : 12, backgroundColor: plain ? 'transparent' : 'rgba(0,0,0,0.5)' }}
      onPress={(event) => {
        event.stopPropagation();
        videoRef.current?.startPictureInPicture().catch(() => {
          toastInfo(t('player.pipUnavailable'));
        });
      }}
    >
      {plain ? <MediaControlIcon name="PictureInPicture2" plain /> : <PictureInPicture2 size={20} color="#fff" />}
    </Pressable>
  );
}
