import React, { memo, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { VideoView, useVideoPlayer } from 'expo-video';
import { FEED_BUFFER_OPTIONS } from "../../libs/videoBuffering";
import GlassIndicator from '../ui/GlassIndicator';
import MarkdownText from '../ui/MarkdownText';
import Icon from '../ui/Icon';
import GeneratedAudioPlayer from './GeneratedAudioPlayer';
import { AiToolProcessingSkeleton, VideoGenerationSkeleton } from './GenerationSkeleton';
import type { AIChatMessage } from '../../services/ai.service';

const AI_AVATAR = require('../../assets/web-icons/ai-assistant-avatar.png');
const SCREEN_WIDTH = Dimensions.get('window').width;
const MEDIA_WIDTH = SCREEN_WIDTH - 32 - 36; // padding + avatar gutter

const MD_IMAGE_RE = /!\[[^\]]*\]\((https?:\/\/[^)]+)\)/g;
const BARE_IMAGE_RE =
  /(?<!\()(https?:\/\/\S+\.(?:png|jpe?g|gif|webp|svg)(?:\?\S*)?)(?!\))/gi;

function extractImages(text: string): string[] {
  const urls = new Set<string>();
  for (const m of text.matchAll(MD_IMAGE_RE)) urls.add(m[1]);
  for (const m of text.matchAll(BARE_IMAGE_RE)) urls.add(m[0]);
  return [...urls];
}

function stripImageMarkdown(text: string): string {
  return text
    .replace(MD_IMAGE_RE, '')
    .replace(BARE_IMAGE_RE, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

interface AssistantBubbleProps {
  message: AIChatMessage;
  onImagePress?: (url: string, allUrls: string[]) => void;
  /** Attach a generated image back into the composer to edit it. */
  onAttachImage?: (url: string) => void;
  onCopyImage?: (url: string) => void;
  onSaveMedia?: (url: string, kind: 'image' | 'video') => void;
  onPostMedia?: (url: string, kind: 'image' | 'video') => void;
  /** Generated audio goes out through the OS share sheet, not the camera roll. */
  onShareAudio?: (url: string) => void;
  /** Re-send the last user turn after an error. */
  onRetry?: () => void;
}

/** The floating action row web overlays on generated media. */
const MediaActions: React.FC<{
  actions: { icon: string; label: string; onPress: () => void }[];
}> = ({ actions }) => (
  <View style={s.mediaActions}>
    {actions.map((action) => (
      <TouchableOpacity
        key={action.label}
        onPress={action.onPress}
        style={s.mediaActionBtn}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={action.label}
      >
        <Icon name={action.icon as any} size={16} color="#F9FBFF" />
      </TouchableOpacity>
    ))}
  </View>
);

const GeneratedVideo: React.FC<{
  url: string;
  onSave?: () => void;
  onPost?: () => void;
}> = ({ url, onSave, onPost }) => {
  // Muted + looping autoplay, as web's <video> does. Sound would be a surprise
  // in a chat thread; the controls unmute it.
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
    p.muted = true;
    p.bufferOptions = FEED_BUFFER_OPTIONS;
    p.play();
  });

  const actions = [
    ...(onSave ? [{ icon: 'Download', label: 'Save video', onPress: onSave }] : []),
    ...(onPost ? [{ icon: 'Plus', label: 'Post video', onPress: onPost }] : []),
  ];

  return (
    <View style={s.mediaWrap}>
      <VideoView
        player={player}
        style={[s.media, { height: (MEDIA_WIDTH * 9) / 16 }]}
        contentFit="cover"
        nativeControls
        allowsFullscreen
      />
      {actions.length > 0 && <MediaActions actions={actions} />}
    </View>
  );
};

const AssistantBubble: React.FC<AssistantBubbleProps> = ({
  message,
  onImagePress,
  onAttachImage,
  onCopyImage,
  onSaveMedia,
  onPostMedia,
  onShareAudio,
  onRetry,
}) => {
  const isUser = message.role === 'user';

  const imageUrls = useMemo(() => {
    if (isUser) return [];
    const fromField = message.imageUrl ? [message.imageUrl] : [];
    const fromText = extractImages(message.content);
    return [...new Set([...fromField, ...fromText])];
  }, [message.content, message.imageUrl, isUser]);

  const displayText = useMemo(() => {
    if (isUser || imageUrls.length === 0) return message.content;
    return stripImageMarkdown(message.content);
  }, [message.content, imageUrls, isUser]);

  const handlePress = useCallback(
    (url: string) => {
      onImagePress?.(url, imageUrls);
    },
    [onImagePress, imageUrls],
  );

  /* ── User turn ───────────────────────────────────────────────────────── */
  if (isUser) {
    return (
      <Animated.View entering={FadeInDown.duration(200)} style={[s.bubble, s.userBubble]}>
        <View style={s.userColumn}>
          {!!message.attachedImage && (
            <Image source={{ uri: message.attachedImage }} style={s.attachedPreview} />
          )}
          {!!message.content && (
            <View style={[s.content, s.userContent]}>
              <GlassIndicator borderRadius={16} />
              <Text style={s.text}>{message.content}</Text>
            </View>
          )}
        </View>
      </Animated.View>
    );
  }

  /* ── Assistant turn ──────────────────────────────────────────────────── */

  // Async work still running — these replace the text entirely, as on web.
  if (message.isToolProcessing) {
    return (
      <Animated.View entering={FadeInDown.duration(200)} style={[s.bubble, s.aiBubble]}>
        <Image source={AI_AVATAR} style={s.avatar} />
        <View style={s.wideColumn}>
          <AiToolProcessingSkeleton content={message.content} />
        </View>
      </Animated.View>
    );
  }

  if (message.isVideoGenerating && !message.videoUrl) {
    return (
      <Animated.View entering={FadeInDown.duration(200)} style={[s.bubble, s.aiBubble]}>
        <Image source={AI_AVATAR} style={s.avatar} />
        <View style={s.wideColumn}>
          <VideoGenerationSkeleton content={message.content} />
        </View>
      </Animated.View>
    );
  }

  const hasMedia = imageUrls.length > 0 || !!message.videoUrl || !!message.audioUrl;

  return (
    <Animated.View entering={FadeInDown.duration(200)} style={[s.bubble, s.aiBubble]}>
      <Image source={AI_AVATAR} style={s.avatar} />
      <View style={hasMedia ? s.wideColumn : s.column}>
        {displayText.length > 0 && (
          <View style={[s.content, s.aiContent]}>
            <MarkdownText content={displayText} style={{ fontSize: 14 }} />
          </View>
        )}

        {message.videoUrl && (
          <GeneratedVideo
            url={message.videoUrl}
            onSave={onSaveMedia ? () => onSaveMedia(message.videoUrl!, 'video') : undefined}
            onPost={onPostMedia ? () => onPostMedia(message.videoUrl!, 'video') : undefined}
          />
        )}

        {message.audioUrl && (
          <GeneratedAudioPlayer audioUrl={message.audioUrl} onSave={onShareAudio} />
        )}

        {imageUrls.map((url) => (
          <View key={url} style={s.mediaWrap}>
            <Pressable onPress={() => handlePress(url)}>
              <Image
                source={{ uri: url }}
                style={[s.media, { height: MEDIA_WIDTH }]}
                resizeMode="cover"
              />
            </Pressable>
            <MediaActions
              actions={[
                ...(onAttachImage
                  ? [
                      {
                        icon: 'Paperclip',
                        label: 'Edit this image',
                        onPress: () => onAttachImage(url),
                      },
                    ]
                  : []),
                ...(onCopyImage
                  ? [{ icon: 'Copy', label: 'Copy image', onPress: () => onCopyImage(url) }]
                  : []),
                ...(onSaveMedia
                  ? [
                      {
                        icon: 'Download',
                        label: 'Save image',
                        onPress: () => onSaveMedia(url, 'image'),
                      },
                    ]
                  : []),
                ...(onPostMedia
                  ? [
                      {
                        icon: 'Plus',
                        label: 'Post image',
                        onPress: () => onPostMedia(url, 'image'),
                      },
                    ]
                  : []),
              ]}
            />
          </View>
        ))}

        {message.isError && onRetry && (
          <TouchableOpacity onPress={onRetry} activeOpacity={0.7} style={s.retry}>
            <Text style={s.retryText}>Retry</Text>
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
};

const s = StyleSheet.create({
  bubble: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  userBubble: {
    alignSelf: 'flex-end',
    maxWidth: '85%',
  },
  aiBubble: {
    alignSelf: 'stretch',
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 8,
    marginTop: 2,
  },
  column: { flexShrink: 1, alignItems: 'flex-start', gap: 8, maxWidth: '86%' },
  wideColumn: { flex: 1, alignItems: 'flex-start', gap: 8 },
  userColumn: { alignItems: 'flex-end', gap: 6 },
  content: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '100%',
    overflow: 'hidden',
  },
  userContent: {
    borderBottomRightRadius: 4,
  },
  aiContent: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderBottomLeftRadius: 4,
    alignSelf: 'stretch',
  },
  text: {
    color: '#F9FBFF',
    fontSize: 14,
    lineHeight: 20,
  },
  attachedPreview: {
    width: 120,
    height: 120,
    borderRadius: 12,
  },
  mediaWrap: {
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
    alignSelf: 'stretch',
  },
  media: {
    width: '100%',
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  mediaActions: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    flexDirection: 'row',
    gap: 8,
  },
  mediaActionBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  retry: { paddingVertical: 4 },
  retryText: {
    color: '#A6A9AC',
    fontSize: 12,
    textDecorationLine: 'underline',
  },
});

export default memo(AssistantBubble);
