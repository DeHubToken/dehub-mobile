import React from 'react';
import { Pressable } from 'react-native';
import { isPictureInPictureSupported, VideoView } from 'expo-video';
import { MaterialIcons } from '@expo/vector-icons';
import { toastInfo } from '../../libs';

export default function PictureInPictureButton({ videoRef }: {
  videoRef: React.RefObject<VideoView | null>;
}) {
  if (!isPictureInPictureSupported()) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Picture in picture"
      hitSlop={8}
      style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.5)' }}
      onPress={(event) => {
        event.stopPropagation();
        videoRef.current?.startPictureInPicture().catch(() => {
          toastInfo('Picture in picture is unavailable. Check that it is allowed for DeHub in your device settings.');
        });
      }}
    >
      <MaterialIcons name="picture-in-picture-alt" size={20} color="#fff" />
    </Pressable>
  );
}
