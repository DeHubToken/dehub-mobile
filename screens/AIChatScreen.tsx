import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system/legacy';
import AssistantHeader from '../components/Assistant/AssistantHeader';
import AssistantBubble from '../components/Assistant/AssistantBubble';
import AssistantInputBar from '../components/Assistant/AssistantInputBar';
import QuickActionChips from '../components/Assistant/QuickActionChips';
import ChatHistorySheet from '../components/Assistant/ChatHistorySheet';
import ImagePaywallModal from '../components/Assistant/ImagePaywallModal';
import VideoPaywallModal from '../components/Assistant/VideoPaywallModal';
import { useUser, useAuthState } from '../context/AuthContext';
import { useAIConversation } from '../hooks/useAIConversation';
import { useKeyboard } from '../hooks/useKeyboard';
import {
  sendAIChat,
  generateImage,
  startVideoGeneration,
  pollVideoGeneration,
  isImageRequest,
  isVideoRequest,
  AIServiceError,
  type AIChatMessage,
  type AIUserContext,
  type AIImageModel,
  type AIVideoModel,
} from '../services/ai.service';
import { openCroppedImagePicker } from '../libs/assets.util';
import { getDeviceLanguage } from '../services/translation.service';
import { toastError } from '../libs';
import { ScreenNames } from '../navigation/ScreenNames';
import { createLogger } from '../libs/logger';
import SignInGate from '../components/auth/SignInGate';

const log = createLogger('AIChatScreen');
const AI_AVATAR = require('../assets/web-icons/ai-assistant-avatar.png');

const WELCOME_MESSAGE =
  'Use the text box below or these action buttons to get started.';

const NON_RETRYABLE = new Set(['RATE_LIMIT', 'CREDITS_EXHAUSTED']);
const MAX_RETRIES = 2;
const RETRY_DELAYS = [1000, 2000];
const TAB_BAR_HEIGHT = 80;

function AIChatScreenInner() {
  const navigation = useNavigation<any>();
  const user = useUser();
  const { isSignedIn } = useAuthState();
  const { height: kbHeight, isVisible: kbVisible } = useKeyboard();
  const flatListRef = useRef<FlatList<AIChatMessage>>(null);

  const userId = user?.walletAddress || user?.address || 'anon';
  const {
    conversationId,
    messages,
    conversations,
    startNewConversation,
    loadConversation,
    saveMessage,
    deleteConversation,
    clearAll,
    refreshConversations,
  } = useAIConversation(userId);

  const [input, setInput] = useState('');

  // The Prompt entry screen hands its text over as a route param. Seed the
  // composer with it rather than auto-sending, so the user still gets a look
  // at what will be asked — same as web, which lands on /app?prompt=…
  const route = useRoute<any>();
  const initialPrompt: string | undefined = route.params?.initialPrompt;
  React.useEffect(() => {
    if (initialPrompt) setInput(initialPrompt);
  }, [initialPrompt]);

  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [imagePaywallVisible, setImagePaywallVisible] = useState(false);
  const [videoPaywallVisible, setVideoPaywallVisible] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState('');

  const userContext: AIUserContext | undefined = useMemo(() => {
    if (!user) return undefined;
    return {
      username: user.username,
      displayName: user.displayName,
      walletAddress: user.walletAddress || user.address,
      followers: user.followers,
      following: user.followings,
      badgeBalance: user.badgeBalance,
      tipsReceived: user.receivedTips,
      tipsSent: user.sentTips,
    };
  }, [user]);

  const isEmpty = messages.length === 0;

  const scrollToEnd = useCallback((animated = true) => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated });
    }, 100);
  }, []);

  const readImageAsBase64 = useCallback(async (uri: string): Promise<string | null> => {
    try {
      return await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    } catch {
      log.error('Failed to read image as base64');
      return null;
    }
  }, []);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if ((!text && !attachedImage) || isLoading) return;

    if (isVideoRequest(text)) {
      setPendingPrompt(text);
      setVideoPaywallVisible(true);
      return;
    }

    if (isImageRequest(text) || attachedImage) {
      setPendingPrompt(text);
      setImagePaywallVisible(true);
      return;
    }

    await doSendChat(text);
  }, [input, attachedImage, isLoading]);

  const doSendChat = useCallback(async (text: string) => {
    const userMsg: AIChatMessage = { role: 'user', content: text };
    const updated = [...messages, userMsg];
    await saveMessage(updated);
    setInput('');
    setAttachedImage(null);
    setIsLoading(true);
    scrollToEnd();

    try {
      let response: string | null = null;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          const res = await sendAIChat({
            messages: updated,
            userContext,
            isAuthenticated: !!user,
            userLanguage: getDeviceLanguage(),
          });
          response = res.response;
          break;
        } catch (err) {
          if (
            err instanceof AIServiceError &&
            err.errorCode &&
            NON_RETRYABLE.has(err.errorCode)
          ) {
            throw err;
          }
          if (attempt < MAX_RETRIES) {
            await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
          } else {
            throw err;
          }
        }
      }

      if (response) {
        const aiMsg: AIChatMessage = { role: 'assistant', content: response };
        await saveMessage([...updated, aiMsg]);
      }
      scrollToEnd();
    } catch (err) {
      log.error('Chat error:', err);
      handleAIError(err);
    } finally {
      setIsLoading(false);
    }
  }, [messages, userContext, user, saveMessage, scrollToEnd]);

  const doGenerateImage = useCallback(async (text: string, model: AIImageModel) => {
    const userMsg: AIChatMessage = { role: 'user', content: text || 'Generate image' };
    const updated = [...messages, userMsg];
    await saveMessage(updated);
    setInput('');
    setIsLoading(true);
    setIsGeneratingImage(true);
    scrollToEnd();

    try {
      let sourceImage: string | undefined;
      if (attachedImage) {
        const base64 = await readImageAsBase64(attachedImage);
        if (base64) sourceImage = base64;
      }
      setAttachedImage(null);

      const imgRes = await generateImage({
        prompt: text,
        sourceImage,
        conversationHistory: updated,
        model,
      });

      if (imgRes.imageUrl) {
        const imgMsg: AIChatMessage = {
          role: 'assistant',
          content: imgRes.text || "Here's the image I generated:",
          imageUrl: imgRes.imageUrl,
        };
        await saveMessage([...updated, imgMsg]);
      } else {
        const fallback: AIChatMessage = {
          role: 'assistant',
          content: imgRes.text || "The image couldn't be generated. Try a different prompt.",
        };
        await saveMessage([...updated, fallback]);
      }
      scrollToEnd();
    } catch {
      toastError('Image generation failed — try again');
    } finally {
      setIsLoading(false);
      setIsGeneratingImage(false);
    }
  }, [messages, attachedImage, saveMessage, scrollToEnd, readImageAsBase64]);

  const doGenerateVideo = useCallback(async (text: string, model: AIVideoModel) => {
    const userMsg: AIChatMessage = { role: 'user', content: text };
    const updated = [...messages, userMsg];
    await saveMessage(updated);
    setInput('');
    setAttachedImage(null);
    setIsLoading(true);
    scrollToEnd();

    try {
      let sourceImage: string | undefined;
      if (attachedImage) {
        const base64 = await readImageAsBase64(attachedImage);
        if (base64) sourceImage = base64;
      }

      const startRes = await startVideoGeneration({
        prompt: text,
        model,
        sourceImage,
      });

      if (startRes.videoUrl) {
        const vidMsg: AIChatMessage = {
          role: 'assistant',
          content: `Video generated! ${startRes.videoUrl}`,
        };
        await saveMessage([...updated, vidMsg]);
      } else if (startRes.predictionId) {
        const pendingMsg: AIChatMessage = {
          role: 'assistant',
          content: 'Your video is being generated. This may take a few minutes...',
        };
        await saveMessage([...updated, pendingMsg]);
        pollForVideo(startRes.predictionId, updated);
      }
      scrollToEnd();
    } catch {
      toastError('Video generation failed — try again');
    } finally {
      setIsLoading(false);
    }
  }, [messages, attachedImage, saveMessage, scrollToEnd, readImageAsBase64]);

  const pollForVideo = useCallback(async (predictionId: string, baseMessages: AIChatMessage[]) => {
    const maxPolls = 60;
    for (let i = 0; i < maxPolls; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      try {
        const poll = await pollVideoGeneration(predictionId);
        if (poll.status === 'succeeded' && poll.videoUrl) {
          const vidMsg: AIChatMessage = {
            role: 'assistant',
            content: `Video is ready! ${poll.videoUrl}`,
          };
          await saveMessage([...baseMessages, vidMsg]);
          scrollToEnd();
          return;
        }
        if (poll.status === 'failed') {
          const failMsg: AIChatMessage = {
            role: 'assistant',
            content: 'Video generation failed. Please try again with a different prompt.',
          };
          await saveMessage([...baseMessages, failMsg]);
          scrollToEnd();
          return;
        }
      } catch {
        break;
      }
    }
  }, [saveMessage, scrollToEnd]);

  const handleAIError = useCallback((err: unknown) => {
    if (err instanceof AIServiceError) {
      if (err.errorCode === 'RATE_LIMIT') {
        toastError('Too many requests — try again shortly');
      } else if (err.safetyBlocked) {
        toastError(err.message);
        if (err.clearHistory) startNewConversation();
      } else {
        toastError(err.message || 'AI request failed');
      }
    } else {
      toastError('Something went wrong');
    }
  }, [startNewConversation]);

  const handleImagePaywallConfirm = useCallback((model: AIImageModel) => {
    setImagePaywallVisible(false);
    doGenerateImage(pendingPrompt, model);
  }, [pendingPrompt, doGenerateImage]);

  const handleVideoPaywallConfirm = useCallback((model: AIVideoModel) => {
    setVideoPaywallVisible(false);
    doGenerateVideo(pendingPrompt, model);
  }, [pendingPrompt, doGenerateVideo]);

  const handleAttach = useCallback(async () => {
    try {
      const uri = await openCroppedImagePicker({ free: true });
      if (uri) setAttachedImage(uri);
    } catch {
      // user cancelled
    }
  }, []);

  const handleRemoveImage = useCallback(() => {
    setAttachedImage(null);
  }, []);

  const handleChipPress = useCallback((prompt: string) => {
    setInput(prompt);
  }, []);

  const handleImagePress = useCallback(
    (url: string, allUrls: string[]) => {
      navigation.navigate(ScreenNames.ImageViewer, {
        images: allUrls.map((u) => ({ uri: u })),
        initialIndex: Math.max(allUrls.indexOf(url), 0),
        allowDownload: true,
      });
    },
    [navigation],
  );

  const handleNewChat = useCallback(() => {
    startNewConversation();
    setInput('');
    setAttachedImage(null);
  }, [startNewConversation]);

  const handleHistoryOpen = useCallback(() => {
    refreshConversations();
    setHistoryVisible(true);
  }, [refreshConversations]);

  const handleHistoryClose = useCallback(() => {
    setHistoryVisible(false);
  }, []);

  const handleHistorySelect = useCallback(
    (entry: any) => {
      loadConversation(entry);
      setInput('');
    },
    [loadConversation],
  );

  const renderMessage = useCallback(
    ({ item }: { item: AIChatMessage }) => (
      <AssistantBubble message={item} onImagePress={handleImagePress} />
    ),
    [handleImagePress],
  );

  const keyExtractor = useCallback(
    (_: AIChatMessage, index: number) => `msg-${index}`,
    [],
  );

  return (
    <View
      style={s.root}
    >
      <AssistantHeader
        onNewChat={handleNewChat}
        onHistoryPress={handleHistoryOpen}
        hasMessages={!isEmpty}
      />

      {isEmpty ? (
        <View style={s.welcomeWrap}>
          <View style={s.welcomeCenter}>
            <Text style={s.welcomeText}>{WELCOME_MESSAGE}</Text>
          </View>
          <QuickActionChips onChipPress={handleChipPress} />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={keyExtractor}
          style={s.messageList}
          contentContainerStyle={s.messageListContent}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="interactive"
          onContentSizeChange={() => scrollToEnd(false)}
          ListFooterComponent={
            isLoading ? (
              <View style={s.typingRow}>
                <Image source={AI_AVATAR} style={s.typingAvatar} />
                <View style={s.typingBubble}>
                  <ActivityIndicator size="small" color="#A6A9AC" />
                  <Text style={s.typingText}>
                    {isGeneratingImage ? 'Creating...' : 'Thinking...'}
                  </Text>
                </View>
              </View>
            ) : null
          }
        />
      )}

      <View style={{ marginBottom: kbVisible ? kbHeight : TAB_BAR_HEIGHT }}>
        <AssistantInputBar
          value={input}
          onChangeText={setInput}
          onSend={handleSend}
          onAttach={handleAttach}
          attachedImage={attachedImage}
          onRemoveImage={handleRemoveImage}
          loading={isLoading}
        />
      </View>

      <ChatHistorySheet
        visible={historyVisible}
        onClose={handleHistoryClose}
        conversations={conversations}
        onSelect={handleHistorySelect}
        onDelete={deleteConversation}
        onClearAll={clearAll}
        activeConversationId={conversationId}
      />

      <ImagePaywallModal
        visible={imagePaywallVisible}
        onClose={() => setImagePaywallVisible(false)}
        onConfirm={handleImagePaywallConfirm}
      />

      <VideoPaywallModal
        visible={videoPaywallVisible}
        onClose={() => setVideoPaywallVisible(false)}
        onConfirm={handleVideoPaywallConfirm}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  welcomeWrap: {
    flex: 1,
    justifyContent: 'space-between',
  },
  welcomeCenter: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  welcomeText: {
    color: '#A6A9AC',
    fontSize: 15,
    lineHeight: 22,
  },
  messageList: {
    flex: 1,
  },
  messageListContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    flexGrow: 1,
  },
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  typingAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 8,
  },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  typingText: {
    color: '#A6A9AC',
    fontSize: 13,
  },
});

export default function AIChatScreen() {
  return (
    <SignInGate>
      <AIChatScreenInner />
    </SignInGate>
  );
}
