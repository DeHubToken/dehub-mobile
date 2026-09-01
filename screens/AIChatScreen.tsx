/**
 * AI Assistant.
 * =============
 * The mobile counterpart of dehubweb's `/app/assistant`. Everything the web
 * page routes, this routes the same way and in the same order, because the
 * classification is what decides whether a sentence costs money:
 *
 *   fal.ai tool  →  video  →  image (poster if DeHub-branded)  →  chat
 *
 * Chat streams token-by-token off `general-ai-chat` and names the tools the
 * agent runs while it works. Paid generations quote and charge server-side
 * in live DHB: the wallet signs one transfer for the quoted price and the
 * generate call verifies it on chain — see `hooks/useAiPayment.ts`.
 *
 * RULE (web's, and it applies here): all assistant text renders through
 * MarkdownText. `AssistantBubble` owns that.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AssistantHeader from '../components/Assistant/AssistantHeader';
import AssistantBubble from '../components/Assistant/AssistantBubble';
import AssistantInputBar from '../components/Assistant/AssistantInputBar';
import QuickActionChips, { type QuickAction } from '../components/Assistant/QuickActionChips';
import ChatHistorySheet from '../components/Assistant/ChatHistorySheet';
import CreditPaywallSheet from '../components/Assistant/CreditPaywallSheet';
import AssistantSettingsSheet, {
  type AssistantSettings,
} from '../components/Assistant/AssistantSettingsSheet';
import AssistantStyleSheet from '../components/Assistant/AssistantStyleSheet';
import MusicConfirmSheet, { type MusicParams } from '../components/Assistant/MusicConfirmSheet';
import PosterConfigSheet, { type PosterConfig } from '../components/Assistant/PosterConfigSheet';
import { ImageGenerationSkeleton } from '../components/Assistant/GenerationSkeleton';
import MentionSuggestions from '../components/common/MentionSuggestions';
import { useUser } from '../context/AuthContext';
import { getAuthToken } from '../libs/auth.utils';
import { useAIConversation, type ConversationEntry } from '../hooks/useAIConversation';
import { useKeyboardLift } from '../hooks/useKeyboardLayout';
import { useMentions } from '../hooks/useMentions';
import {
  streamAIChat,
  generateImage,
  startVideoGeneration,
  pollVideoGeneration,
  startAiTool,
  pollAiTool,
  isImageRequest,
  isVideoRequest,
  requiresLogoAsset,
  isCreativeLogoRequest,
  isDeHubBrandedImageRequest,
  detectAiToolRequest,
  buildDeHubBrandPrompt,
  describeTools,
  AIServiceError,
  type AIChatMessage,
  type AIUserContext,
} from '../services/ai.service';
import {
  AI_TOOL_MODELS,
  CATEGORY_LABELS,
  DEFAULT_CHAT_MODEL,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_TOOL_FOR_CATEGORY,
  DEFAULT_VIDEO_MODEL,
  DEHUB_BRAND_IMAGE_MODEL,
  IMAGE_MODEL_OPTIONS,
  VIDEO_MODELS,
  VIDEO_MODEL_OPTIONS,
  getToolsByCategory,
  imageModelSupportsEdit,
  videoSupportsImage,
  videoSupportsText,
  type AiToolCategory,
} from '../config/ai-models.constants';
import { AI_ASSISTANT_STYLE_OPTIONS } from '../config/ai-styles.constants';
import { openCroppedImagePicker } from '../libs/assets.util';
import {
  bundledLogoDataUrl,
  buildMediaDraft,
  copyImage,
  saveToLibrary,
  shareAudio,
  toImageDataUrl,
} from '../libs/assistantMedia';
import { getDeviceLanguage } from '../services/translation.service';
import { supabase } from '../services/supabase';
import { toastError, toastSuccess } from '../libs/toast';
import { ScreenNames } from '../navigation/ScreenNames';
import { createLogger } from '../libs/logger';
import SignInGate from '../components/auth/SignInGate';

const log = createLogger('AIChatScreen');
const AI_AVATAR = require('../assets/web-icons/ai-assistant-avatar.png');
const DEHUB_LOGO = require('../assets/web-icons/dehub-logo-white.png');

const WELCOME_MESSAGE =
  'Use the text box below or these action buttons to get started.';

const TAB_BAR_HEIGHT = 80;
const POLL_INTERVAL_MS = 5000;
/**
 * Clip length every render asks for. Web's composer exposes a duration slider;
 * this screen does not, so the figure is fixed — and it has to be the same
 * number in the request, the quote and the per-second row prices, or the
 * paywall shows one price and the server charges another.
 */
const VIDEO_DURATION_SECONDS = 5;

/** Keys that let a render survive the app being closed, as web's do a reload. */
const PENDING_VIDEO_KEY = 'dehub-pending-video';
const PENDING_TOOL_KEY = 'dehub-pending-ai-tool';
const SETTINGS_KEY = 'dehub-assistant-settings';

interface PendingVideo {
  predictionId: string;
  provider?: string;
  falAppId?: string;
  /** Id of the placeholder turn this render fills in. */
  messageId: string;
  content: string;
}

interface PendingTool {
  requestId: string;
  appId: string;
  toolKey: string;
  statusUrl?: string;
  responseUrl?: string;
  messageId: string;
  content: string;
}

let turnSeq = 0;
/** Unique enough within a session, and stable once written to a saved thread. */
const newTurnId = (): string => `t-${Date.now()}-${(turnSeq += 1)}`;

const DEFAULT_SETTINGS: AssistantSettings = {
  chatModel: DEFAULT_CHAT_MODEL,
  imageModel: DEFAULT_IMAGE_MODEL,
  videoModel: DEFAULT_VIDEO_MODEL,
  voice: 'female',
  alwaysSpeakReplies: false,
};

/**
 * Which renderer a poster config asks the server for. An explicit cinematic
 * archetype opts into the diffusion "scene" pipeline; anything else gets the
 * on-brand SM Template banner.
 *
 * This also decides whether to show the paywall: template banners are drawn by
 * our own code server-side and are not charged, so quoting for one would ask
 * for money the server will not take — and could send someone through an
 * on-chain top-up for a free render.
 */
const posterRenderer = (cfg: PosterConfig): 'template' | 'scene' =>
  cfg.style === 'dehub-template' || cfg.style === 'auto' ? 'template' : 'scene';

function AIChatScreenInner() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const user = useUser();
  // Keyboard height minus the bottom inset the root SafeAreaView already spent
  // — see hooks/useKeyboardLayout.ts.
  const { lift: kbLift, isVisible: kbVisible } = useKeyboardLift();
  const flatListRef = useRef<FlatList<AIChatMessage>>(null);

  const walletAddress = user?.walletAddress || user?.address || null;
  const userId = walletAddress || 'anon';
  const {
    conversationId,
    messages,
    conversations,
    startNewConversation,
    appendLocalMessage,
    loadConversation,
    saveMessage,
    deleteConversation,
    clearAll,
    refreshConversations,
  } = useAIConversation(userId);

  const [input, setInput] = useState('');
  const mentions = useMentions(input, setInput);

  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [activeTools, setActiveTools] = useState<string[]>([]);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  /** The in-flight assistant answer: rendered as a bubble, saved only on done. */
  const [streamingContent, setStreamingContent] = useState<string | null>(null);

  const [settings, setSettings] = useState<AssistantSettings>(DEFAULT_SETTINGS);
  const [selectedStyle, setSelectedStyle] = useState<string>('normal');

  const [historyVisible, setHistoryVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [styleVisible, setStyleVisible] = useState(false);
  const [posterVisible, setPosterVisible] = useState(false);
  const [musicVisible, setMusicVisible] = useState(false);

  const [pendingPrompt, setPendingPrompt] = useState('');
  const [pendingSourceImage, setPendingSourceImage] = useState<string | undefined>();
  const [pendingLogoImage, setPendingLogoImage] = useState<string | undefined>();
  const [pendingPosterConfig, setPendingPosterConfig] = useState<PosterConfig | null>(null);
  const [pendingToolLyrics, setPendingToolLyrics] = useState<string | undefined>();

  const [imagePaywallVisible, setImagePaywallVisible] = useState(false);
  const [videoPaywallVisible, setVideoPaywallVisible] = useState(false);
  const [toolPaywallVisible, setToolPaywallVisible] = useState(false);
  const [toolCategory, setToolCategory] = useState<AiToolCategory>('music');
  const [selectedToolId, setSelectedToolId] = useState<string>('minimax-music');
  const [imageModelOverride, setImageModelOverride] = useState<string | null>(null);

  /** Timers for in-flight polls, cleared on unmount. */
  const pollTimers = useRef<Record<string, ReturnType<typeof setInterval>>>({});
  const streamRef = useRef<{ abort: () => void } | null>(null);
  /** Latest messages, for callbacks that must not close over a stale array. */
  const messagesRef = useRef<AIChatMessage[]>(messages);
  messagesRef.current = messages;

  const currentStyle =
    AI_ASSISTANT_STYLE_OPTIONS.find((s) => s.id === selectedStyle) ||
    AI_ASSISTANT_STYLE_OPTIONS[0];

  /* ── Settings persistence ────────────────────────────────────────────── */

  useEffect(() => {
    AsyncStorage.getItem(SETTINGS_KEY)
      .then((raw) => {
        if (!raw) return;
        const parsed = JSON.parse(raw);
        setSettings({ ...DEFAULT_SETTINGS, ...parsed.settings });
        if (parsed.style) setSelectedStyle(parsed.style);
      })
      .catch(() => {
        // Defaults are fine.
      });
  }, []);

  const persistSettings = useCallback(
    (next: AssistantSettings, style: string) => {
      AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ settings: next, style })).catch(
        () => {},
      );
    },
    [],
  );

  const updateSettings = useCallback(
    (patch: Partial<AssistantSettings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        persistSettings(next, selectedStyle);
        return next;
      });
    },
    [persistSettings, selectedStyle],
  );

  const handleStyleSelect = useCallback(
    (styleId: string) => {
      setSelectedStyle(styleId);
      persistSettings(settings, styleId);
    },
    [persistSettings, settings],
  );

  /* ── Entry points ────────────────────────────────────────────────────── */

  // The Prompt entry screen hands its text over as a route param. Seed the
  // composer with it rather than auto-sending, so the user still gets a look
  // at what will be asked — same as web, which lands on /app?prompt=…
  const initialPrompt: string | undefined = route.params?.initialPrompt;
  useEffect(() => {
    if (initialPrompt) setInput(initialPrompt);
  }, [initialPrompt]);

  const userContext: AIUserContext | undefined = useMemo(() => {
    if (!user) return undefined;
    return {
      username: user.username,
      displayName: user.displayName,
      walletAddress: walletAddress || undefined,
      followers: user.followers,
      following: user.followings,
      badgeBalance: user.badgeBalance,
      tipsReceived: user.receivedTips,
      tipsSent: user.sentTips,
    };
  }, [user, walletAddress]);

  const isEmpty = messages.length === 0;

  const scrollToEnd = useCallback((animated = true) => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated });
    }, 100);
  }, []);

  /* ── Diagnostics ─────────────────────────────────────────────────────── */

  /**
   * Mirror of web's failure logging. Both clients write to the same table, so a
   * report that only reproduces on a phone is diagnosable from the same place.
   */
  const logAssistantError = useCallback(
    (error: unknown, context: Record<string, unknown>) => {
      const err = error instanceof Error ? error : new Error(String(error));
      const code = error instanceof AIServiceError ? error.errorCode : undefined;
      supabase
        .from('client_error_logs')
        .insert({
          level: 'error',
          message: `Assistant error [${code || 'UNKNOWN'}]: ${err.message}`,
          component: 'AIChatScreen',
          stack_trace: err.stack?.substring(0, 500) || null,
          metadata: { ...context, errorCode: code },
          user_address: walletAddress,
        })
        .then(undefined, (logErr) => log.error('failed to log assistant error:', logErr));
    },
    [walletAddress],
  );

  const describeError = useCallback((error: unknown): string => {
    if (error instanceof AIServiceError) {
      switch (error.errorCode) {
        case 'RATE_LIMIT':
          return 'Too many requests — try again shortly.';
        case 'CREDITS_EXHAUSTED':
        case 'INSUFFICIENT_CREDITS':
          return 'Out of DHB credit for AI. Top up to keep going.';
        case 'TIMEOUT':
          return 'That request timed out. Try again.';
        case 'UNAUTHENTICATED':
          return 'Sign in again to use the assistant.';
        default:
          return error.message || 'Something went wrong.';
      }
    }
    return error instanceof Error ? error.message : 'Something went wrong.';
  }, []);

  /* ── Chat ────────────────────────────────────────────────────────────── */

  const doSendChat = useCallback(
    async (text: string, history: AIChatMessage[]) => {
      setIsLoading(true);
      setActiveTools([]);
      scrollToEnd();

      const token = (await getAuthToken()) || undefined;
      let streamed = '';

      const commit = (content: string, isError = false) => {
        const reply: AIChatMessage = { role: 'assistant', content, ...(isError && { isError: true }) };
        saveMessage([...history, reply]);
      };

      streamRef.current = streamAIChat(
        {
          messages: history,
          style: selectedStyle as any,
          model: settings.chatModel as any,
          userContext,
          isAuthenticated: !!user,
          userLanguage: getDeviceLanguage(),
          // Full assistant surface — the agent gets the personal-data tools
          // alongside the public ones. The token is what proves who is asking;
          // the API verifies it and scopes those tools to that account, so an
          // address alone would not be enough.
          surface: 'assistant',
          dehubToken: token,
          callerAddress: walletAddress || undefined,
        },
        {
          onTool: ({ status, tools }) => setActiveTools(status === 'running' ? tools : []),
          onDelta: (delta) => {
            streamed += delta;
            // Render the partial answer as it arrives, but only persist the
            // finished turn — writing on every token would hammer AsyncStorage
            // and the remote mirror.
            //
            // `isLoading` deliberately stays true for the whole stream, as it
            // does on web: it is what stops a second prompt being sent into a
            // half-finished answer, with two streams then writing to the same
            // thread. The spinner is hidden by `streamingContent` instead.
            setActiveTools([]);
            setStreamingContent(streamed);
          },
          onDone: () => {
            streamRef.current = null;
            setStreamingContent(null);
            setIsLoading(false);
            setActiveTools([]);
            commit(streamed || 'No response');
            scrollToEnd();
          },
          onError: (err) => {
            streamRef.current = null;
            setStreamingContent(null);
            setIsLoading(false);
            setActiveTools([]);
            log.error('chat error:', err);
            logAssistantError(err, {
              userMessage: text.substring(0, 100),
              model: settings.chatModel,
            });
            commit(describeError(err), true);
            scrollToEnd();
          },
        },
      );
    },
    [
      selectedStyle,
      settings.chatModel,
      userContext,
      user,
      walletAddress,
      saveMessage,
      scrollToEnd,
      logAssistantError,
      describeError,
    ],
  );

  /* ── Image ───────────────────────────────────────────────────────────── */

  const doGenerateImage = useCallback(
    async (
      prompt: string,
      model: string,
      history: AIChatMessage[],
      extras?: {
        sourceImage?: string;
        logoImage?: string;
        headline?: string;
        bannerRenderer?: 'template' | 'scene';
        bannerFormat?: 'landscape' | 'square' | 'portrait';
        /** Hash of the DHB transfer that paid for this job. Absent when free. */
        txHash?: string;
      },
    ) => {
      setIsLoading(true);
      setIsGeneratingImage(true);
      scrollToEnd();

      try {
        const res = await generateImage(
          {
            prompt,
            model,
            conversationHistory: history,
            sourceImage: extras?.sourceImage,
            logoImage: extras?.logoImage,
            headline: extras?.headline,
            bannerRenderer: extras?.bannerRenderer,
            bannerFormat: extras?.bannerFormat,
            txHash: extras?.txHash,
          },
          walletAddress,
        );

        if (res.error) {
          const message = res.safetyBlocked
            ? "That prompt was blocked by the model's safety filter. Try describing it differently."
            : res.error;
          // `clearHistory` means the conversation itself is what tripped the
          // filter, so carrying it forward would fail every following turn.
          if (res.clearHistory) {
            startNewConversation();
            await saveMessage([{ role: 'assistant', content: message, isError: true }]);
          } else {
            await saveMessage([...history, { role: 'assistant', content: message, isError: true }]);
          }
          return;
        }

        if (res.imageUrl) {
          await saveMessage([
            ...history,
            { role: 'assistant', content: res.text || '', imageUrl: res.imageUrl },
          ]);
          toastSuccess('Image generated');
        } else {
          await saveMessage([
            ...history,
            {
              role: 'assistant',
              content: res.text || "The image couldn't be generated. Try a different prompt.",
              isError: true,
            },
          ]);
        }
        scrollToEnd();
      } catch (err) {
        log.error('image generation failed:', err);
        logAssistantError(err, { kind: 'image', model });
        await saveMessage([
          ...history,
          { role: 'assistant', content: describeError(err), isError: true },
        ]);
      } finally {
        setIsLoading(false);
        setIsGeneratingImage(false);
      }
    },
    [walletAddress, saveMessage, scrollToEnd, startNewConversation, logAssistantError, describeError],
  );

  /* ── Video ───────────────────────────────────────────────────────────── */

  const stopPoll = useCallback((key: string) => {
    const timer = pollTimers.current[key];
    if (timer) {
      clearInterval(timer);
      delete pollTimers.current[key];
    }
  }, []);

  /**
   * Patch the turn a long-running job belongs to.
   *
   * Keyed on the placeholder's id, not on "the last assistant message" — a
   * render takes minutes, and by the time it lands the user may well have had
   * another exchange, so position is not a safe handle.
   */
  const patchMessage = useCallback(
    (id: string, patch: Partial<AIChatMessage>): boolean => {
      const current = messagesRef.current;
      const index = current.findIndex((m) => m.id === id);
      if (index === -1) return false;
      const next = [...current];
      next[index] = { ...next[index], ...patch };
      saveMessage(next);
      return true;
    },
    [saveMessage],
  );

  const pollVideo = useCallback(
    async (pending: PendingVideo) => {
      // The thread holding the placeholder was cleared or another one loaded,
      // so there is nothing left to fill in. An empty thread is not proof of
      // that — on a resumed poll the placeholder is still being re-injected —
      // so only a populated thread without the id ends the poll.
      const current = messagesRef.current;
      if (current.length > 0 && !current.some((m) => m.id === pending.messageId)) {
        stopPoll(pending.predictionId);
        AsyncStorage.removeItem(PENDING_VIDEO_KEY).catch(() => {});
        return;
      }
      try {
        const res = await pollVideoGeneration(pending.predictionId, {
          provider: pending.provider,
          falAppId: pending.falAppId,
          walletAddress,
        });
        if (res.status === 'succeeded' && res.videoUrl) {
          stopPoll(pending.predictionId);
          AsyncStorage.removeItem(PENDING_VIDEO_KEY).catch(() => {});
          patchMessage(pending.messageId, {
            content: '',
            videoUrl: res.videoUrl,
            isVideoGenerating: false,
            videoPredictionId: undefined,
          });
          toastSuccess('Video generated');
        } else if (res.status === 'failed') {
          stopPoll(pending.predictionId);
          AsyncStorage.removeItem(PENDING_VIDEO_KEY).catch(() => {});
          patchMessage(pending.messageId, {
            content: `Video generation failed: ${res.error || 'unknown error'}`,
            isVideoGenerating: false,
            isError: true,
          });
        }
      } catch (err) {
        // A single failed poll is normal (a cold provider, a dropped request);
        // the interval will try again.
        log.error('video poll failed:', err);
      }
    },
    [walletAddress, stopPoll, patchMessage],
  );

  const startVideoPoll = useCallback(
    (pending: PendingVideo) => {
      if (pollTimers.current[pending.predictionId]) return;
      pollTimers.current[pending.predictionId] = setInterval(
        () => pollVideo(pending),
        POLL_INTERVAL_MS,
      );
      pollVideo(pending);
    },
    [pollVideo],
  );

  const doGenerateVideo = useCallback(
    async (
      prompt: string,
      model: string,
      history: AIChatMessage[],
      sourceImage: string | undefined,
      txHash: string,
    ) => {
      const videoModel = VIDEO_MODELS[model];
      setIsLoading(true);
      scrollToEnd();

      try {
        const res = await startVideoGeneration(
          {
            prompt,
            model,
            sourceImage,
            duration: `${VIDEO_DURATION_SECONDS}s` as '5s',
            aspectRatio: '16:9',
            txHash,
          },
          walletAddress,
        );

        if (res.error) {
          await saveMessage([
            ...history,
            { role: 'assistant', content: `Video generation failed: ${res.error}`, isError: true },
          ]);
          return;
        }

        // Some providers answer immediately; most hand back a prediction id.
        if (res.videoUrl) {
          await saveMessage([...history, { role: 'assistant', content: '', videoUrl: res.videoUrl }]);
          toastSuccess('Video generated');
          return;
        }

        if (!res.predictionId) {
          await saveMessage([
            ...history,
            {
              role: 'assistant',
              content: 'The video job started but returned no id, so it cannot be tracked.',
              isError: true,
            },
          ]);
          return;
        }

        const content = `🎬 Generating video with **${videoModel?.name || model}**…\n\n_This may take 1-3 minutes_`;
        const messageId = newTurnId();
        await saveMessage([
          ...history,
          {
            id: messageId,
            role: 'assistant',
            content,
            isVideoGenerating: true,
            videoPredictionId: res.predictionId,
            videoProvider: res.provider,
            videoFalAppId: res.falAppId,
          },
        ]);

        const pending: PendingVideo = {
          predictionId: res.predictionId,
          provider: res.provider,
          falAppId: res.falAppId,
          messageId,
          content,
        };
        // Persist so a backgrounded app that gets killed still finishes the
        // render it has already been charged for.
        AsyncStorage.setItem(PENDING_VIDEO_KEY, JSON.stringify(pending)).catch(() => {});
        startVideoPoll(pending);
        scrollToEnd();
      } catch (err) {
        log.error('video generation failed:', err);
        logAssistantError(err, { kind: 'video', model });
        await saveMessage([
          ...history,
          { role: 'assistant', content: describeError(err), isError: true },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [walletAddress, saveMessage, scrollToEnd, startVideoPoll, logAssistantError, describeError],
  );

  /* ── fal.ai tools ────────────────────────────────────────────────────── */

  const pollTool = useCallback(
    async (pending: PendingTool) => {
      const current = messagesRef.current;
      if (current.length > 0 && !current.some((m) => m.id === pending.messageId)) {
        stopPoll(pending.requestId);
        AsyncStorage.removeItem(PENDING_TOOL_KEY).catch(() => {});
        return;
      }
      try {
        const res = await pollAiTool(
          {
            requestId: pending.requestId,
            appId: pending.appId,
            statusUrl: pending.statusUrl,
            responseUrl: pending.responseUrl,
          },
          walletAddress,
        );
        if (res.status === 'succeeded') {
          stopPoll(pending.requestId);
          AsyncStorage.removeItem(PENDING_TOOL_KEY).catch(() => {});
          const toolModel = AI_TOOL_MODELS[pending.toolKey];
          patchMessage(pending.messageId, {
            isToolProcessing: false,
            toolRequestId: undefined,
            content: res.text
              ? `📝 **Transcription:**\n\n${res.text}`
              : res.audioUrl || res.imageUrl
                ? ''
                : `${toolModel?.name || 'Tool'} completed successfully.`,
            ...(res.audioUrl ? { audioUrl: res.audioUrl } : {}),
            ...(res.imageUrl ? { imageUrl: res.imageUrl } : {}),
          });
          toastSuccess(`${toolModel?.name || 'AI tool'} completed`);
        } else if (res.status === 'failed') {
          stopPoll(pending.requestId);
          AsyncStorage.removeItem(PENDING_TOOL_KEY).catch(() => {});
          patchMessage(pending.messageId, {
            isToolProcessing: false,
            toolRequestId: undefined,
            content: `Processing failed: ${res.error || 'unknown error'}`,
            isError: true,
          });
        }
      } catch (err) {
        log.error('tool poll failed:', err);
      }
    },
    [walletAddress, stopPoll, patchMessage],
  );

  const startToolPoll = useCallback(
    (pending: PendingTool) => {
      if (pollTimers.current[pending.requestId]) return;
      pollTimers.current[pending.requestId] = setInterval(
        () => pollTool(pending),
        POLL_INTERVAL_MS,
      );
      pollTool(pending);
    },
    [pollTool],
  );

  const doRunTool = useCallback(
    async (
      toolId: string,
      category: AiToolCategory,
      prompt: string,
      history: AIChatMessage[],
      extras?: { sourceImage?: string; lyrics?: string; txHash?: string },
    ) => {
      const toolModel = AI_TOOL_MODELS[toolId];
      setIsLoading(true);
      scrollToEnd();

      try {
        const res = await startAiTool(
          {
            tool: toolId,
            prompt,
            ...(category === 'tts' ? { text: prompt } : {}),
            ...(extras?.lyrics ? { lyrics: extras.lyrics } : {}),
            ...(extras?.sourceImage ? { image_url: extras.sourceImage } : {}),
            ...(extras?.txHash ? { txHash: extras.txHash } : {}),
          },
          walletAddress,
        );

        if (res.error) {
          await saveMessage([
            ...history,
            { role: 'assistant', content: res.error, isError: true },
          ]);
          return;
        }

        if (res.status === 'succeeded') {
          await saveMessage([
            ...history,
            {
              role: 'assistant',
              content: res.text
                ? `📝 **Transcription:**\n\n${res.text}`
                : res.audioUrl || res.imageUrl
                  ? ''
                  : `${toolModel?.name || 'Tool'} completed.`,
              ...(res.audioUrl ? { audioUrl: res.audioUrl } : {}),
              ...(res.imageUrl ? { imageUrl: res.imageUrl } : {}),
            },
          ]);
          toastSuccess(`${toolModel?.name || 'AI tool'} completed`);
          return;
        }

        if (!res.requestId || !res.appId) {
          await saveMessage([
            ...history,
            {
              role: 'assistant',
              content: 'That tool started but returned no request id, so it cannot be tracked.',
              isError: true,
            },
          ]);
          return;
        }

        const content = `${toolModel?.emoji || '⏳'} Processing with **${toolModel?.name || toolId}**…\n\n_This may take a minute_`;
        const messageId = newTurnId();
        await saveMessage([
          ...history,
          {
            id: messageId,
            role: 'assistant',
            content,
            isToolProcessing: true,
            toolRequestId: res.requestId,
            toolAppId: res.appId,
            toolType: toolId,
          },
        ]);

        const pending: PendingTool = {
          requestId: res.requestId,
          appId: res.appId,
          toolKey: toolId,
          statusUrl: res.statusUrl,
          responseUrl: res.responseUrl,
          messageId,
          content,
        };
        AsyncStorage.setItem(PENDING_TOOL_KEY, JSON.stringify(pending)).catch(() => {});
        startToolPoll(pending);
        scrollToEnd();
      } catch (err) {
        log.error('tool run failed:', err);
        logAssistantError(err, { kind: 'tool', tool: toolId });
        await saveMessage([
          ...history,
          { role: 'assistant', content: describeError(err), isError: true },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [walletAddress, saveMessage, scrollToEnd, startToolPoll, logAssistantError, describeError],
  );

  /* ── Resume work that outlived the app ───────────────────────────────── */

  useEffect(() => {
    // A render or a tool run that outlived the app. It is already paid for, so
    // the placeholder goes back on screen and the poll picks up where it left
    // off, the same way web restores one across a reload.
    AsyncStorage.getItem(PENDING_VIDEO_KEY)
      .then((raw) => {
        if (!raw) return;
        const pending = JSON.parse(raw) as PendingVideo;
        if (!pending?.predictionId || !pending?.messageId) return;
        appendLocalMessage({
          id: pending.messageId,
          role: 'assistant',
          content: pending.content || '🎬 Resuming video generation…',
          isVideoGenerating: true,
          videoPredictionId: pending.predictionId,
        });
        startVideoPoll(pending);
      })
      .catch(() => {});

    AsyncStorage.getItem(PENDING_TOOL_KEY)
      .then((raw) => {
        if (!raw) return;
        const pending = JSON.parse(raw) as PendingTool;
        if (!pending?.requestId || !pending?.appId || !pending?.messageId) return;
        appendLocalMessage({
          id: pending.messageId,
          role: 'assistant',
          content: pending.content || '⏳ Resuming processing…',
          isToolProcessing: true,
          toolRequestId: pending.requestId,
          toolAppId: pending.appId,
          toolType: pending.toolKey,
        });
        startToolPoll(pending);
      })
      .catch(() => {});
    // Once, on mount — a resumed poll re-registers itself by key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () => () => {
      Object.values(pollTimers.current).forEach(clearInterval);
      pollTimers.current = {};
      streamRef.current?.abort();
    },
    [],
  );

  /* ── Send ────────────────────────────────────────────────────────────── */

  /**
   * Decide what a prompt is asking for and hand it to the right flow.
   *
   * Shared by send and retry so a failed image request retries as an image
   * request. `history` already ends with the user's turn.
   */
  const routePrompt = useCallback(
    async (
      text: string,
      history: AIChatMessage[],
      sourceImage: string | undefined,
      hadAttachment: boolean,
    ) => {
      /* Logo requests: show the bundled asset rather than paying to redraw it. */
      const wantsBrand = isDeHubBrandedImageRequest(text);
      const wantsLogo = wantsBrand || requiresLogoAsset(text);
      if (wantsLogo && !isCreativeLogoRequest(text)) {
        await saveMessage([
          ...history,
          {
            role: 'assistant',
            content: "Here's the official DeHub logo!",
            imageUrl: Image.resolveAssetSource(DEHUB_LOGO).uri,
          },
        ]);
        scrollToEnd();
        return;
      }

      /* Classification order is web's: tools, then video, then image, then chat. */
      const category = detectAiToolRequest(text, hadAttachment);
      if (category) {
        setPendingPrompt(text);
        setPendingSourceImage(sourceImage);
        setToolCategory(category);
        if (category === 'music') {
          setMusicVisible(true);
        } else {
          setSelectedToolId(DEFAULT_TOOL_FOR_CATEGORY[category]);
          setToolPaywallVisible(true);
        }
        return;
      }

      if (isVideoRequest(text)) {
        // Checked before the paywall, not after payment: these models have no
        // endpoint for the other direction at all.
        const model = VIDEO_MODELS[settings.videoModel];
        if (model && !videoSupportsImage(model) && sourceImage) {
          toastError(`${model.name} cannot animate an attached image. Pick another video model.`);
          return;
        }
        if (model && !videoSupportsText(model) && !sourceImage) {
          toastError(`${model.name} needs an image to animate. Attach one or pick another model.`);
          return;
        }
        setPendingPrompt(text);
        setPendingSourceImage(sourceImage);
        setVideoPaywallVisible(true);
        return;
      }

      if (isImageRequest(text, hadAttachment)) {
        // A DeHub-branded piece of content goes through the poster studio first.
        if (wantsBrand) {
          setPendingPrompt(text);
          setPosterVisible(true);
          return;
        }
        setPendingPrompt(text);
        setPendingSourceImage(sourceImage);
        setPendingLogoImage(undefined);
        setPendingPosterConfig(null);
        setImageModelOverride(null);
        setImagePaywallVisible(true);
        return;
      }

      await doSendChat(text, history);
    },
    [saveMessage, scrollToEnd, settings.videoModel, doSendChat],
  );

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if ((!text && !attachedImage) || isLoading) return;

    mentions.reset();
    const userMessage: AIChatMessage = {
      role: 'user',
      content: text,
      ...(attachedImage ? { attachedImage } : {}),
    };
    const history = [...messages, userMessage];
    await saveMessage(history);
    setInput('');

    const hadAttachment = !!attachedImage;
    // The data URL, not the file URI: generate-image hands this straight to the
    // provider as an image reference.
    let sourceImage: string | undefined;
    if (attachedImage) {
      try {
        sourceImage = await toImageDataUrl(attachedImage);
      } catch (err) {
        log.error('could not read the attached image:', err);
        toastError('Could not read that image');
      }
    }
    setAttachedImage(null);

    await routePrompt(text, history, sourceImage, hadAttachment);
  }, [input, attachedImage, isLoading, messages, mentions, saveMessage, routePrompt]);

  /** Drop the failed turn and re-run the last thing the user asked for. */
  const handleRetry = useCallback(async () => {
    const current = messagesRef.current;
    const lastUser = [...current].reverse().find((m) => m.role === 'user');
    if (!lastUser) return;
    const trimmed = current.filter((m) => !m.isError);
    await saveMessage(trimmed);

    let sourceImage: string | undefined;
    if (lastUser.attachedImage) {
      try {
        sourceImage = await toImageDataUrl(lastUser.attachedImage);
      } catch {
        // Retry without it rather than refusing outright.
      }
    }
    await routePrompt(lastUser.content, trimmed, sourceImage, !!lastUser.attachedImage);
  }, [saveMessage, routePrompt]);

  /* ── Paywall confirmations ───────────────────────────────────────────── */

  const historyForGeneration = useCallback(() => messagesRef.current, []);

  /**
   * Fire the generation. Takes everything explicitly rather than reading the
   * pending-* state, so the free poster path can call it in the same tick it
   * receives the config — React would not have committed the state yet.
   */
  const startImageGeneration = useCallback(
    (
      cfg: PosterConfig | null,
      model: string,
      opts: { logoImage?: string; sourceImage?: string; txHash?: string },
    ) => {
      doGenerateImage(
        cfg ? buildDeHubBrandPrompt(cfg.finalPrompt) : pendingPrompt,
        model,
        historyForGeneration(),
        {
          sourceImage: opts.sourceImage,
          logoImage: opts.logoImage,
          txHash: opts.txHash,
          ...(cfg
            ? {
                headline: cfg.tagline.trim(),
                bannerRenderer: posterRenderer(cfg),
                bannerFormat:
                  cfg.dimension === 'landscape'
                    ? ('landscape' as const)
                    : cfg.dimension === 'square'
                      ? ('square' as const)
                      : ('portrait' as const),
              }
            : {}),
        },
      );
      setPendingPosterConfig(null);
      setPendingLogoImage(undefined);
      setPendingSourceImage(undefined);
    },
    [pendingPrompt, doGenerateImage, historyForGeneration],
  );

  const handleImageConfirm = useCallback((txHash: string) => {
    setImagePaywallVisible(false);
    startImageGeneration(pendingPosterConfig, imageModelOverride || settings.imageModel, {
      logoImage: pendingLogoImage,
      sourceImage: pendingSourceImage,
      txHash,
    });
  }, [
    imageModelOverride,
    settings.imageModel,
    pendingPosterConfig,
    pendingSourceImage,
    pendingLogoImage,
    startImageGeneration,
  ]);

  const handleVideoConfirm = useCallback((txHash: string) => {
    setVideoPaywallVisible(false);
    doGenerateVideo(
      pendingPrompt,
      settings.videoModel,
      historyForGeneration(),
      pendingSourceImage,
      txHash,
    );
    setPendingSourceImage(undefined);
  }, [
    pendingPrompt,
    settings.videoModel,
    pendingSourceImage,
    doGenerateVideo,
    historyForGeneration,
  ]);

  const handleToolConfirm = useCallback((txHash: string) => {
    setToolPaywallVisible(false);
    doRunTool(selectedToolId, toolCategory, pendingPrompt, historyForGeneration(), {
      sourceImage: pendingSourceImage,
      lyrics: pendingToolLyrics,
      txHash,
    });
    setPendingSourceImage(undefined);
    setPendingToolLyrics(undefined);
  }, [
    selectedToolId,
    toolCategory,
    pendingPrompt,
    pendingSourceImage,
    pendingToolLyrics,
    doRunTool,
    historyForGeneration,
  ]);

  const handleMusicConfirm = useCallback(
    (params: MusicParams) => {
      setMusicVisible(false);
      // Same structured prompt web builds; lyrics travel separately so the
      // model does not treat them as style instructions.
      const parts: string[] = [];
      if (params.title) parts.push(`Title: ${params.title}`);
      if (params.style) parts.push(`Style: ${params.style}`);
      if (params.voiceGender !== 'auto') parts.push(`Voice: ${params.voiceGender}`);
      setPendingPrompt(parts.join('. ') || pendingPrompt);
      setPendingToolLyrics(params.lyrics || undefined);
      setToolCategory('music');
      setSelectedToolId(DEFAULT_TOOL_FOR_CATEGORY.music);
      setToolPaywallVisible(true);
    },
    [pendingPrompt],
  );

  const handlePosterConfirm = useCallback(
    async (config: PosterConfig) => {
      setPosterVisible(false);
      let logo: string | undefined;
      try {
        logo = await bundledLogoDataUrl(config.logoVariant);
        setPendingLogoImage(logo);
      } catch (err) {
        log.error('logo asset unavailable:', err);
        // Without the wordmark this is not a brand poster, so say so rather
        // than quietly generating something off-brand.
        toastError('Could not load the DeHub logo — generating without it');
      }

      // A template banner is free, so there is nothing to quote and no reason
      // to make anyone tap through a price. Go straight to the render, the way
      // web does. Only the cinematic archetypes reach a metered model.
      if (posterRenderer(config) === 'template') {
        setPendingSourceImage(undefined);
        startImageGeneration(config, DEHUB_BRAND_IMAGE_MODEL, { logoImage: logo });
        return;
      }

      setPendingPosterConfig(config);
      setPendingSourceImage(undefined);
      setImageModelOverride(DEHUB_BRAND_IMAGE_MODEL);
      setImagePaywallVisible(true);
    },
    [startImageGeneration],
  );

  /* ── Media actions ───────────────────────────────────────────────────── */

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

  const handleAttachGenerated = useCallback((url: string) => {
    setAttachedImage(url);
    toastSuccess('Image attached — describe your edits');
  }, []);

  const handlePostMedia = useCallback(
    async (url: string, kind: 'image' | 'video') => {
      try {
        const draft = await buildMediaDraft(url, kind);
        navigation.navigate(ScreenNames.Upload, { draft });
      } catch (err) {
        log.error('could not prepare media for posting:', err);
        toastError('Could not prepare that for posting');
      }
    },
    [navigation],
  );

  /* ── Composer helpers ────────────────────────────────────────────────── */

  const handleAttach = useCallback(async () => {
    try {
      const uri = await openCroppedImagePicker({ free: true });
      if (uri) setAttachedImage(uri);
    } catch {
      // user cancelled
    }
  }, []);

  const handleQuickAction = useCallback(
    (action: QuickAction) => {
      switch (action.kind) {
        case 'prompt':
          setInput(action.text);
          break;
        case 'poster':
          setPendingPrompt('');
          setPosterVisible(true);
          break;
        case 'song':
          setPendingPrompt('');
          setMusicVisible(true);
          break;
        case 'edit-image':
          handleAttach();
          break;
        case 'builder':
          // Web links to dehub.io/builder. There is no builder screen in this app
          // yet, so the composer seeds the request instead of dead-ending.
          setInput('Build me a mini app that ');
          break;
      }
    },
    [handleAttach],
  );

  const handleNewChat = useCallback(() => {
    streamRef.current?.abort();
    streamRef.current = null;
    setStreamingContent(null);
    startNewConversation();
    setInput('');
    setAttachedImage(null);
    setIsLoading(false);
  }, [startNewConversation]);

  const handleHistoryOpen = useCallback(() => {
    refreshConversations();
    setHistoryVisible(true);
  }, [refreshConversations]);

  const handleHistorySelect = useCallback(
    (entry: ConversationEntry) => {
      loadConversation(entry);
      setInput('');
    },
    [loadConversation],
  );

  /* ── Render ──────────────────────────────────────────────────────────── */

  const renderedMessages = useMemo(() => {
    if (streamingContent === null) return messages;
    return [...messages, { role: 'assistant' as const, content: streamingContent }];
  }, [messages, streamingContent]);

  const renderMessage = useCallback(
    ({ item }: { item: AIChatMessage }) => (
      <AssistantBubble
        message={item}
        onImagePress={handleImagePress}
        onAttachImage={handleAttachGenerated}
        onCopyImage={copyImage}
        onSaveMedia={saveToLibrary}
        onPostMedia={handlePostMedia}
        onShareAudio={shareAudio}
        onRetry={item.isError ? handleRetry : undefined}
      />
    ),
    [handleImagePress, handleAttachGenerated, handlePostMedia, handleRetry],
  );

  const keyExtractor = useCallback(
    (item: AIChatMessage, index: number) => item.id || `msg-${index}`,
    [],
  );

  const imagePaywallModels = useMemo(() => {
    const editing = !!pendingSourceImage;
    return IMAGE_MODEL_OPTIONS.map((model) => ({
      id: model.id,
      name: model.name,
      description: model.description,
      emoji: model.emoji,
      baseCostUsd: model.baseCostUsd,
      // Flagged here rather than after payment: these models have no edit
      // endpoint at all, so generate-image rejects the request.
      unavailableReason:
        editing && !imageModelSupportsEdit(model) ? 'Cannot edit an attached image' : undefined,
    }));
  }, [pendingSourceImage]);

  const videoPaywallModels = useMemo(
    () =>
      VIDEO_MODEL_OPTIONS.map((model) => ({
        id: model.id,
        name: model.name,
        description: model.description,
        emoji: model.emoji,
        // Per-second models are priced for the 5s clip this screen requests, so
        // the row figure matches what the server then quotes.
        baseCostUsd: model.perSecondCostUsd
          ? model.perSecondCostUsd * VIDEO_DURATION_SECONDS
          : model.baseCostUsd,
        unavailableReason: pendingSourceImage
          ? videoSupportsImage(model)
            ? undefined
            : 'Text-to-video only'
          : videoSupportsText(model)
            ? undefined
            : 'Needs an image to animate',
      })),
    [pendingSourceImage],
  );

  const toolPaywallModels = useMemo(
    () =>
      getToolsByCategory(toolCategory).map((tool) => ({
        id: tool.id,
        name: tool.name,
        description: tool.description,
        emoji: tool.emoji,
        baseCostUsd: tool.baseCostUsd,
      })),
    [toolCategory],
  );

  return (
    <View style={s.root}>
      <AssistantHeader
        onNewChat={handleNewChat}
        onHistoryPress={handleHistoryOpen}
        onSettingsPress={() => setSettingsVisible(true)}
        onStylePress={() => setStyleVisible(true)}
        styleEmoji={currentStyle.emoji}
        hasMessages={!isEmpty}
      />

      {isEmpty ? (
        <View style={s.welcomeWrap}>
          <View style={s.welcomeCenter}>
            <Text style={s.welcomeText}>{WELCOME_MESSAGE}</Text>
          </View>
          <QuickActionChips onAction={handleQuickAction} />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={renderedMessages}
          renderItem={renderMessage}
          keyExtractor={keyExtractor}
          style={s.messageList}
          contentContainerStyle={s.messageListContent}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="interactive"
          onContentSizeChange={() => scrollToEnd(false)}
          ListFooterComponent={
            isGeneratingImage ? (
              <View style={s.footerRow}>
                <Image source={AI_AVATAR} style={s.typingAvatar} />
                <ImageGenerationSkeleton />
              </View>
            ) : isLoading && streamingContent === null ? (
              <View style={s.typingRow}>
                <Image source={AI_AVATAR} style={s.typingAvatar} />
                <View style={s.typingBubble}>
                  <ActivityIndicator size="small" color="#F4F4F5" />
                  <Text style={s.typingText}>
                    {activeTools.length > 0 ? describeTools(activeTools) : 'Thinking...'}
                  </Text>
                </View>
              </View>
            ) : isLoading ? null : (
              // Web keeps the quick actions visible after every answer.
              <QuickActionChips onAction={handleQuickAction} />
            )
          }
        />
      )}

      <View style={{ marginBottom: kbVisible ? kbLift : TAB_BAR_HEIGHT }}>
        <MentionSuggestions
          visible={mentions.showSuggestions}
          suggestions={mentions.suggestions}
          onSelect={mentions.selectMention}
          loading={mentions.loading}
        />
        <AssistantInputBar
          value={input}
          onChangeText={mentions.handleChangeText}
          onSelectionChange={mentions.handleSelectionChange}
          onSend={handleSend}
          onAttach={handleAttach}
          attachedImage={attachedImage}
          onRemoveImage={() => setAttachedImage(null)}
          loading={isLoading}
        />
      </View>

      <ChatHistorySheet
        visible={historyVisible}
        onClose={() => setHistoryVisible(false)}
        conversations={conversations}
        onSelect={handleHistorySelect}
        onDelete={deleteConversation}
        onClearAll={clearAll}
        activeConversationId={conversationId}
        walletAddress={walletAddress}
        onMediaPress={handleImagePress}
      />

      <AssistantSettingsSheet
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
        settings={settings}
        onChange={updateSettings}
      />

      <AssistantStyleSheet
        visible={styleVisible}
        onClose={() => setStyleVisible(false)}
        selectedStyle={selectedStyle}
        onSelect={handleStyleSelect}
      />

      <PosterConfigSheet
        visible={posterVisible}
        onClose={() => setPosterVisible(false)}
        userPrompt={pendingPrompt}
        onConfirm={handlePosterConfirm}
      />

      <MusicConfirmSheet
        visible={musicVisible}
        onClose={() => setMusicVisible(false)}
        userPrompt={pendingPrompt}
        onConfirm={handleMusicConfirm}
      />

      <CreditPaywallSheet
        visible={imagePaywallVisible}
        title="Generate Image"
        icon="Image"
        models={imagePaywallModels}
        selectedModelId={imageModelOverride || settings.imageModel}
        onSelectModel={(id) => {
          setImageModelOverride(id);
          if (!pendingPosterConfig) updateSettings({ imageModel: id });
        }}
        quoteKind="image"
        isBusy={isGeneratingImage}
        onClose={() => setImagePaywallVisible(false)}
        onConfirm={handleImageConfirm}
        footnote={
          pendingPosterConfig
            ? 'The wordmark and headline are composited after generation, crisply.'
            : undefined
        }
      />

      <CreditPaywallSheet
        visible={videoPaywallVisible}
        title="Generate Video"
        icon="Video"
        models={videoPaywallModels}
        selectedModelId={settings.videoModel}
        onSelectModel={(id) => updateSettings({ videoModel: id })}
        quoteKind="video"
        quoteExtras={{ durationSeconds: VIDEO_DURATION_SECONDS }}
        onClose={() => setVideoPaywallVisible(false)}
        onConfirm={handleVideoConfirm}
        footnote="Renders take 1-3 minutes and keep going if you leave this screen."
      />

      <CreditPaywallSheet
        visible={toolPaywallVisible}
        title={CATEGORY_LABELS[toolCategory].label}
        icon={toolCategory === 'music' ? 'Music' : toolCategory === 'tts' ? 'Volume2' : 'Wand'}
        models={toolPaywallModels}
        selectedModelId={selectedToolId}
        onSelectModel={setSelectedToolId}
        quoteKind="tool"
        confirmLabel="Run"
        onClose={() => setToolPaywallVisible(false)}
        onConfirm={handleToolConfirm}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#010305',
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
  footerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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
    borderRadius: 12,
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
