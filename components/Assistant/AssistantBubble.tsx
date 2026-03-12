import React, { memo, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  Dimensions,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import GlassIndicator from '../ui/GlassIndicator';
import type { AIChatMessage } from '../../services/ai.service';

const AI_AVATAR = require('../../assets/web-icons/ai-assistant-avatar.png');
const IMAGE_WIDTH = Dimensions.get('window').width * 0.55;

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
}

const AssistantBubble: React.FC<AssistantBubbleProps> = ({
  message,
  onImagePress,
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

  return (
    <Animated.View
      entering={FadeInDown.duration(200)}
      style={[s.bubble, isUser ? s.userBubble : s.aiBubble]}
    >
      {!isUser && <Image source={AI_AVATAR} style={s.avatar} />}
      {isUser ? (
        <View style={[s.content, s.userContent]}>
          <GlassIndicator borderRadius={16} />
          <Text style={s.text}>{message.content}</Text>
        </View>
      ) : (
        <View style={[s.content, s.aiContent]}>
          {displayText.length > 0 && <Text style={s.text}>{displayText}</Text>}
          {imageUrls.map((url) => (
            <Pressable
              key={url}
              onPress={() => handlePress(url)}
              style={s.imageWrap}
            >
              <Image
                source={{ uri: url }}
                style={s.image}
                resizeMode="cover"
              />
            </Pressable>
          ))}
        </View>
      )}
    </Animated.View>
  );
};

const s = StyleSheet.create({
  bubble: {
    flexDirection: 'row',
    marginBottom: 12,
    maxWidth: '85%',
  },
  userBubble: {
    alignSelf: 'flex-end',
    flexDirection: 'row-reverse',
  },
  aiBubble: {
    alignSelf: 'flex-start',
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 8,
    marginTop: 2,
  },
  content: {
    borderRadius: 16,
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
  },
  text: {
    color: '#F9FBFF',
    fontSize: 14,
    lineHeight: 20,
  },
  imageWrap: {
    marginTop: 8,
    borderRadius: 12,
    overflow: 'hidden',
  },
  image: {
    width: IMAGE_WIDTH,
    height: IMAGE_WIDTH * 0.75,
    borderRadius: 12,
  },
});

export default memo(AssistantBubble);
