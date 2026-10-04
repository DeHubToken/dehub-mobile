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
import { t } from "i18next";
import {
  AppState,
  View,
  Text,
  FlatList,
  Image,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsScreenFocused } from '../hooks/useFocusedInterval';
import AssistantHeader from '../components/Assistant/AssistantHeader';
import AssistantBubble from '../components/Assistant/AssistantBubble';
import AssistantInputBar from '../components/Assistant/AssistantInputBar';
import QuickActionChips, { type QuickAction } from '../components/Assistant/QuickActionChips';
import ChatHistorySheet from '../components/Assistant/ChatHistorySheet';
import SupportTicketSheet, { useMySupportTickets } from '../components/Assistant/SupportTicketSheet';
import CreditPaywallSheet from '../components/Assistant/CreditPaywallSheet';
import AssistantSettingsSheet, {
  type AssistantSettings,
} from '../components/Assistant/AssistantSettingsSheet';
import AssistantStyleSheet from '../components/Assistant/AssistantStyleSheet';
import TemplatesSheet from '../components/Assistant/TemplatesSheet';
import Icon from '../components/ui/Icon';
import { applyTemplate, getTemplate, type CreatorTemplate } from '../libs/creatorTemplates';
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
  type VideoModelKey,
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
import { toastError, toastSuccess } from '../libs/toast';
import { ScreenNames } from '../navigation/ScreenNames';
import { createLogger } from '../libs/logger';
import SignInGate from '../components/auth/SignInGate';
import ScreenHeader from '../components/ScreenHeader';
import CreatorStudioControls from '../components/Assistant/CreatorStudioControls';
import SubscriptionCreditsPill from '../components/SubscriptionCreditsPill';
import { CREATOR_DEFAULTS, creatorModels, creatorInputIssue, creatorVideoOptions, normalizeCreatorSettings, prepareCreatorPrompt, type CreatorMode, type CreatorStudioSettings } from '../libs/creatorStudio';
import { MODEL3D_MODELS } from '../config/model3d-models.constants';
import { uploadLocalFileToBucket, fileExtension } from '../libs/storage-upload';
import { runModel3d } from '../services/ai.service';
import { saveCreatorAsset, type CreatorAssetToSave } from '../services/creator.service';
import { useQueryClient } from '@tanstack/react-query';

const log = createLogger('AIChatScreen');
const errorCodeOf = (err: unknown) => (err instanceof AIServiceError ? err.errorCode : undefined);
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
  /** Thread the placeholder lives in, so the result lands even if another thread is open. */
  conversationId?: string;
}

interface PendingTool {
  kind?: 'model3d';
  requestId: string;
  appId: string;
  toolKey: string;
  statusUrl?: string;
  responseUrl?: string;
  messageId: string;
  content: string;
  conversationId?: string;
}

let turnSeq = 0;
/** Unique enough within a session, and stable once written to a saved thread. */
const newTurnId = (): string => `t-${Date.now()}-${(turnSeq += 1)}`;

async function hostCreatorImage(uri: string): Promise<string> {
  if (uri.startsWith('https://')) return uri;
  const extension = fileExtension({ uri }, 'jpg');
  return uploadLocalFileToBucket({ bucket: 'ai-media-uploads',
    path: `creator-sources/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`, uri });
}

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

function AIChatScreenInner({ studio = false }: { studio?: boolean }) {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const user = useUser();
  const [supportVisible, setSupportVisible] = useState(false);
  // Read once for the header badge. The sheet runs the same query, so opening
  // it costs no second request.
  const { data: supportTickets } = useMySupportTickets(!!user);
  // Keyboard height minus the bottom inset the root SafeAreaView already spent
  // — see hooks/useKeyboardLayout.ts.
  const { lift: kbLift, isVisible: kbVisible } = useKeyboardLift();
  const flatListRef = useRef<FlatList<AIChatMessage>>(null);

  const walletAddress = user?.walletAddress || user?.address || null;
  const userId = walletAddress || 'anon';
  const {
    conversationId,
    getConversationId,
    patchStoredMessage,
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
  const [pendingTemplateId, setPendingTemplateId] = useState<string | null>(null);
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
  /** The creator template armed on the composer, if any. */
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [templatesVisible, setTemplatesVisible] = useState(false);
  const activeTemplate = getTemplate(templateId);
  const initialMode: CreatorMode = route.params?.mode in CREATOR_DEFAULTS ? route.params.mode : 'image';
  const [studioSettings, setStudioSettings] = useState<CreatorStudioSettings>(CREATOR_DEFAULTS[initialMode]);
  const [pendingStudio, setPendingStudio] = useState<CreatorStudioSettings | null>(null);
  const submitLock = useRef(false);
  const librarySaves = useRef(new Set<string>());
  const failedLibrarySaves = useRef(new Set<string>());
  const librarySaveQueue = useRef(Promise.resolve());
  const queryClient = useQueryClient();
  const [model3dPaywallVisible, setModel3dPaywallVisible] = useState(false);
  const studioDrafts = useRef<Partial<Record<CreatorMode, { settings: CreatorStudioSettings; prompt: string; templateId: string | null; image: string | null }>>>({});
  const changeStudioMode = (mode: CreatorMode) => {
    studioDrafts.current[studioSettings.mode] = { settings: studioSettings, prompt: input, templateId, image: attachedImage };
    const draft = studioDrafts.current[mode];
    setStudioSettings(draft?.settings ?? CREATOR_DEFAULTS[mode]);
    setInput(draft?.prompt ?? '');
    setTemplateId(draft?.templateId ?? null);
    setAttachedImage(draft?.image ?? null);
  };

  /** Timers for in-flight polls, cleared on unmount. */
  const pollTimers = useRef<Record<string, ReturnType<typeof setInterval>>>({});
  // A poll fires only while this tab is the one on screen and the app is in
  // the foreground. The timers keep running — a job's result is wanted the
  // moment the tab is back — but a tick while away is a skipped network call,
  // not one per pending job every five seconds under the home feed.
  const isScreenFocused = useIsScreenFocused();
  const isScreenFocusedRef = useRef(isScreenFocused);
  isScreenFocusedRef.current = isScreenFocused;
  const canPollNow = useCallback(
    () => isScreenFocusedRef.current && AppState.currentState !== 'background',
    [],
  );
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

  const describeError = useCallback((error: unknown): string => {
    if (error instanceof AIServiceError) {
      switch (error.errorCode) {
        case 'RATE_LIMIT':
          return 'Too many requests — try again shortly.';
        case 'CREDITS_EXHAUSTED':
        case 'INSUFFICIENT_CREDITS':
          return t('aiChat.outOfCredit');
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
            log.error('chat error:', err, {
              kind: 'chat',
              model: settings.chatModel,
              errorCode: errorCodeOf(err),
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
        aspectRatio?: string;
        logoImage?: string;
        headline?: string;
        bannerRenderer?: 'template' | 'scene';
        bannerFormat?: 'landscape' | 'square' | 'portrait';
        /** Hash of the DHB transfer that paid for this job. Absent when free. */
        txHash?: string;
        /** Spend a free starter image; only sent when there is no hash. */
        useFree?: boolean;
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
            aspectRatio: extras?.aspectRatio,
            logoImage: extras?.logoImage,
            headline: extras?.headline,
            bannerRenderer: extras?.bannerRenderer,
            bannerFormat: extras?.bannerFormat,
            txHash: extras?.txHash,
            ...(extras?.useFree && !extras?.txHash ? { useFree: true } : {}),
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
          toastSuccess(t('assistant.imageGenerated'));
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
        log.error('image generation failed:', err, { kind: 'image', model, errorCode: errorCodeOf(err) });
        await saveMessage([
          ...history,
          { role: 'assistant', content: describeError(err), isError: true },
        ]);
      } finally {
        setIsLoading(false);
        setIsGeneratingImage(false);
      }
    },
    [walletAddress, saveMessage, scrollToEnd, startNewConversation, describeError],
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
      if (!canPollNow()) return;
      // The thread holding the placeholder was cleared or another one loaded,
      // so there is nothing left to fill in. An empty thread is not proof of
      // that — on a resumed poll the placeholder is still being re-injected —
      // so only a populated thread without the id ends the poll.
      const current = messagesRef.current;
      // A record that knows its thread keeps polling even when another thread
      // is open: the result is written into that stored thread instead of
      // being dropped with the placeholder stuck on "Generating…".
      if (
        !pending.conversationId &&
        current.length > 0 &&
        !current.some((m) => m.id === pending.messageId)
      ) {
        stopPoll(pending.predictionId);
        AsyncStorage.removeItem(PENDING_VIDEO_KEY).catch(() => {});
        return;
      }
      const deliver = (patch: Partial<AIChatMessage>) => {
        if (patchMessage(pending.messageId, patch)) return;
        if (pending.conversationId) {
          patchStoredMessage(pending.conversationId, pending.messageId, patch).catch(() => {});
        }
      };
      try {
        const res = await pollVideoGeneration(pending.predictionId, {
          provider: pending.provider,
          falAppId: pending.falAppId,
          walletAddress,
        });
        if (res.status === 'succeeded' && res.videoUrl) {
          stopPoll(pending.predictionId);
          AsyncStorage.removeItem(PENDING_VIDEO_KEY).catch(() => {});
          deliver({
            content: '',
            videoUrl: res.videoUrl,
            isVideoGenerating: false,
            videoPredictionId: undefined,
          });
          toastSuccess(t('toasts.video_generated'));
        } else if (res.status === 'failed') {
          stopPoll(pending.predictionId);
          AsyncStorage.removeItem(PENDING_VIDEO_KEY).catch(() => {});
          deliver({
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
    [walletAddress, stopPoll, patchMessage, patchStoredMessage, canPollNow],
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
      preset?: CreatorTemplate,
      creator?: CreatorStudioSettings | null,
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
            ...(creator ? creatorVideoOptions(creator) : { duration: `${VIDEO_DURATION_SECONDS}s`, aspectRatio: preset?.aspect ?? '16:9' }),
            negativePrompt: preset?.negative,
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
          toastSuccess(t('toasts.video_generated'));
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
          conversationId: getConversationId() ?? undefined,
        };
        // Persist so a backgrounded app that gets killed still finishes the
        // render it has already been charged for.
        AsyncStorage.setItem(PENDING_VIDEO_KEY, JSON.stringify(pending)).catch(() => {});
        startVideoPoll(pending);
        scrollToEnd();
      } catch (err) {
        log.error('video generation failed:', err, { kind: 'video', model, errorCode: errorCodeOf(err) });
        await saveMessage([
          ...history,
          { role: 'assistant', content: describeError(err), isError: true },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [walletAddress, saveMessage, scrollToEnd, startVideoPoll, describeError],
  );

  /* ── fal.ai tools ────────────────────────────────────────────────────── */

  const pollTool = useCallback(
    async (pending: PendingTool) => {
      if (!canPollNow()) return;
      const current = messagesRef.current;
      // Same as pollVideo: a record that knows its thread outlives a thread
      // switch and lands in the stored thread.
      if (
        !pending.conversationId &&
        current.length > 0 &&
        !current.some((m) => m.id === pending.messageId)
      ) {
        stopPoll(pending.requestId);
        AsyncStorage.removeItem(PENDING_TOOL_KEY).catch(() => {});
        return;
      }
      const deliver = (patch: Partial<AIChatMessage>) => {
        if (patchMessage(pending.messageId, patch)) return;
        if (pending.conversationId) {
          patchStoredMessage(pending.conversationId, pending.messageId, patch).catch(() => {});
        }
      };
      try {
        const res = pending.kind === 'model3d' ? await runModel3d({ predictionId: pending.requestId, falAppId: pending.appId }, walletAddress) : await pollAiTool(
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
          const toolModel = pending.kind === 'model3d' ? MODEL3D_MODELS[pending.toolKey] : AI_TOOL_MODELS[pending.toolKey];
          deliver({
            isToolProcessing: false,
            toolRequestId: undefined,
            content: res.modelUrl ? `[${t('creator.studioOpenModel')}](${res.modelUrl})` : res.text
              ? `📝 **Transcription:**\n\n${res.text}`
              : res.audioUrl || res.imageUrl
                ? ''
                : `${toolModel?.name || 'Tool'} completed successfully.`,
            ...(res.audioUrl ? { audioUrl: res.audioUrl } : {}),
            ...(res.imageUrl ? { imageUrl: res.imageUrl } : {}),
            ...(res.modelUrl ? { modelUrl: res.modelUrl } : {}),
          });
          toastSuccess(t('aiChat.toolCompleted', { name: toolModel?.name || t('aiChat.aiTool') }));
        } else if (res.status === 'failed') {
          stopPoll(pending.requestId);
          AsyncStorage.removeItem(PENDING_TOOL_KEY).catch(() => {});
          deliver({
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
    [walletAddress, stopPoll, patchMessage, patchStoredMessage, canPollNow],
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
          toastSuccess(t('aiChat.toolCompleted', { name: toolModel?.name || t('aiChat.aiTool') }));
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
          conversationId: getConversationId() ?? undefined,
        };
        AsyncStorage.setItem(PENDING_TOOL_KEY, JSON.stringify(pending)).catch(() => {});
        startToolPoll(pending);
        scrollToEnd();
      } catch (err) {
        log.error('tool run failed:', err, { kind: 'tool', tool: toolId, errorCode: errorCodeOf(err) });
        await saveMessage([
          ...history,
          { role: 'assistant', content: describeError(err), isError: true },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [walletAddress, saveMessage, scrollToEnd, startToolPoll, describeError],
  );

  /* ── Resume work that outlived the app ───────────────────────────────── */

  const doGenerateModel3d = useCallback(async (creator: CreatorStudioSettings, txHash: string) => {
    setModel3dPaywallVisible(false);
    setIsLoading(true);
    const history = messagesRef.current;
    try {
      const res = await runModel3d({ model: creator.model, prompt: pendingPrompt,
        sourceImage: pendingSourceImage, textureQuality: creator.textureQuality, txHash }, walletAddress);
      if (res.error || res.status === 'failed') throw new Error(res.error || t('creator.studioGenerationFailed'));
      if (res.modelUrl) {
        await saveMessage([...history, { role: 'assistant', content: `[${t('creator.studioOpenModel')}](${res.modelUrl})`, imageUrl: res.imageUrl, modelUrl: res.modelUrl }]);
        return;
      }
      if (!res.requestId || !res.appId) throw new Error(t('creator.studioMissingJob'));
      const messageId = newTurnId();
      const content = t('creator.studioGeneratingModel');
      await saveMessage([...history, { id: messageId, role: 'assistant', content, isToolProcessing: true,
        toolRequestId: res.requestId, toolAppId: res.appId, toolType: creator.model }]);
      const pending: PendingTool = { kind: 'model3d', requestId: res.requestId, appId: res.appId,
        toolKey: creator.model, messageId, content, conversationId: getConversationId() ?? undefined };
      await AsyncStorage.setItem(PENDING_TOOL_KEY, JSON.stringify(pending));
      startToolPoll(pending);
    } catch (err) {
      await saveMessage([...history, { role: 'assistant', content: describeError(err), isError: true }]);
    } finally {
      setIsLoading(false);
      setPendingStudio(null);
      setPendingSourceImage(undefined);
      scrollToEnd();
    }
  }, [pendingPrompt, pendingSourceImage, walletAddress, saveMessage, getConversationId, startToolPoll, describeError, scrollToEnd]);

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
      turnTemplateId?: string,
      creator?: CreatorStudioSettings,
    ) => {
      /*
       * A template decides the flow itself: its scaffold is written for one
       * model, so it skips the keyword routing below and goes straight to that
       * model's paywall.
       */
      const tpl = getTemplate(turnTemplateId);
      setPendingTemplateId(tpl?.id ?? null);
      setPendingStudio(creator ?? null);
      if (creator) {
        const issue = creatorInputIssue(creator, !!sourceImage, tpl);
        if (issue) { toastError(t(issue)); return; }
        setPendingPrompt(prepareCreatorPrompt(text, tpl));
        setPendingSourceImage(sourceImage);
        setPendingLogoImage(undefined);
        setPendingPosterConfig(null);
        if (creator.mode === 'image') {
          setImageModelOverride(creator.model);
          setImagePaywallVisible(true);
        } else if (creator.mode === 'video') {
          updateSettings({ videoModel: creator.model as VideoModelKey });
          setVideoPaywallVisible(true);
        } else if (creator.mode === 'audio') {
          setToolCategory(AI_TOOL_MODELS[creator.model].category);
          setSelectedToolId(creator.model);
          setPendingToolLyrics(undefined);
          setToolPaywallVisible(true);
        } else {
          setModel3dPaywallVisible(true);
        }
        return;
      }
      if (tpl) {
        if (tpl.requiresImage && !sourceImage) {
          toastError(t('creator.presetNeedsImage', { name: t(tpl.nameKey) }));
          return;
        }
        const prompt = applyTemplate(tpl, text);
        setPendingPrompt(prompt);
        setPendingSourceImage(sourceImage);
        if (tpl.kind === 'video') {
          if (tpl.model && tpl.model in VIDEO_MODELS) {
            updateSettings({ videoModel: tpl.model as VideoModelKey });
          }
          setVideoPaywallVisible(true);
        } else {
          setPendingLogoImage(undefined);
          setPendingPosterConfig(null);
          setImageModelOverride(tpl.model ?? null);
          setImagePaywallVisible(true);
        }
        return;
      }

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
          toastError(t('aiChat.cannotAnimateImage', { model: model.name }));
          return;
        }
        if (model && !videoSupportsText(model) && !sourceImage) {
          toastError(t('aiChat.needsImageToAnimate', { model: model.name }));
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
    [saveMessage, scrollToEnd, settings.videoModel, doSendChat, updateSettings],
  );

  const handleSend = useCallback(async () => {
    const typed = input.trim();
    if ((!typed && !attachedImage && !activeTemplate) || isLoading || submitLock.current) return;
    // An empty send under a template runs its example subject, like web's tile.
    const text = typed || (activeTemplate && !attachedImage ? activeTemplate.sample : typed);

    const creator = studio ? normalizeCreatorSettings(studioSettings) : undefined;
    if (creator) {
      const issue = creatorInputIssue(creator, !!attachedImage, activeTemplate);
      if (issue) { toastError(t(issue)); return; }
    }
    submitLock.current = true;
    setIsLoading(true);
    try {
    mentions.reset();
    const userMessage: AIChatMessage = {
      id: newTurnId(),
      role: 'user',
      content: text,
      ...(attachedImage ? { attachedImage } : {}),
      ...(activeTemplate ? { templateId: activeTemplate.id } : {}),
      ...(creator ? { creatorSettings: creator } : {}),
    };
    const history = [...messages, userMessage];
    const hadAttachment = !!attachedImage;
    // The data URL, not the file URI: generate-image hands this straight to the
    // provider as an image reference.
    let sourceImage: string | undefined;
    if (attachedImage) {
      try {
        sourceImage = creator?.mode === '3d' ? await hostCreatorImage(attachedImage) : await toImageDataUrl(attachedImage);
      } catch (err) {
        log.error('could not read the attached image:', err);
        toastError(t('aiChat.couldNotReadImage'));
        return;
      }
    }
    await saveMessage(history);
    setInput('');
    setAttachedImage(null);

    await routePrompt(text, history, sourceImage, hadAttachment, activeTemplate?.id, creator);
    } finally {
      submitLock.current = false;
      setIsLoading(false);
    }
  }, [input, attachedImage, isLoading, messages, mentions, saveMessage, routePrompt, activeTemplate, studio, studioSettings]);

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
        sourceImage = lastUser.creatorSettings?.mode === '3d' ? await hostCreatorImage(lastUser.attachedImage) : await toImageDataUrl(lastUser.attachedImage);
      } catch {
        toastError(t('aiChat.couldNotReadImage'));
        return;
      }
    }
    await routePrompt(
      lastUser.content,
      trimmed,
      sourceImage,
      !!lastUser.attachedImage,
      lastUser.templateId,
      lastUser.creatorSettings,
    );
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
      opts: { logoImage?: string; sourceImage?: string; txHash?: string; useFree?: boolean; aspectRatio?: string },
    ) => {
      doGenerateImage(
        cfg ? buildDeHubBrandPrompt(cfg.finalPrompt) : pendingPrompt,
        model,
        historyForGeneration(),
        {
          sourceImage: opts.sourceImage,
          aspectRatio: cfg ? undefined : opts.aspectRatio,
          logoImage: opts.logoImage,
          txHash: opts.txHash,
          useFree: opts.useFree,
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
      setPendingTemplateId(null);
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
      aspectRatio: pendingStudio?.aspect ?? getTemplate(pendingTemplateId)?.aspect,
      txHash,
    });
  }, [
    imageModelOverride,
    settings.imageModel,
    pendingPosterConfig,
    pendingSourceImage,
    pendingLogoImage,
    pendingTemplateId,
    pendingStudio,
    startImageGeneration,
  ]);

  const handleImageFree = useCallback(() => {
    setImagePaywallVisible(false);
    startImageGeneration(null, imageModelOverride || settings.imageModel, {
      sourceImage: pendingSourceImage,
      aspectRatio: pendingStudio?.aspect ?? getTemplate(pendingTemplateId)?.aspect,
      useFree: true,
    });
  }, [imageModelOverride, settings.imageModel, pendingSourceImage, pendingTemplateId, pendingStudio, startImageGeneration]);

  const handleVideoConfirm = useCallback((txHash: string) => {
    setVideoPaywallVisible(false);
    doGenerateVideo(
      pendingPrompt,
      settings.videoModel,
      historyForGeneration(),
      pendingSourceImage,
      txHash,
      getTemplate(pendingTemplateId),
      pendingStudio,
    );
    setPendingTemplateId(null);
    setPendingSourceImage(undefined);
  }, [
    pendingPrompt,
    settings.videoModel,
    pendingSourceImage,
    pendingTemplateId,
    pendingStudio,
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
      // Present the paywall only after the music sheet has finished closing:
      // its Modal stays mounted for its 220 ms close animation, and a second
      // native Modal presented while it is still up is refused on iOS.
      setTimeout(() => setToolPaywallVisible(true), 300);
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
        toastError(t('aiChat.logoLoadFailed'));
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
    toastSuccess(t('aiChat.imageAttachedDescribe'));
  }, []);

  const handlePostMedia = useCallback(
    async (url: string, kind: 'image' | 'video') => {
      try {
        const draft = await buildMediaDraft(url, kind);
        navigation.navigate(ScreenNames.Upload, { draft });
      } catch (err) {
        log.error('could not prepare media for posting:', err);
        toastError(t('aiChat.couldNotPreparePost'));
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
        case 'templates':
          setTemplatesVisible(true);
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

  /** Arming a template also adopts the model it was tuned for, as on web. */
  const handlePickTemplate = useCallback(
    (tpl: CreatorTemplate) => {
      setTemplateId(tpl.id);
      if (studio) {
        setStudioSettings(normalizeCreatorSettings({ ...CREATOR_DEFAULTS[tpl.kind], model: tpl.model ?? CREATOR_DEFAULTS[tpl.kind].model,
          aspect: tpl.aspect ?? CREATOR_DEFAULTS[tpl.kind].aspect }));
      }
      if (tpl.kind === 'video' && tpl.model && tpl.model in VIDEO_MODELS) {
        updateSettings({ videoModel: tpl.model as VideoModelKey });
      }
    },
    [updateSettings, studio],
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
      for (const key of failedLibrarySaves.current) librarySaves.current.delete(key);
      failedLibrarySaves.current.clear();
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
    return IMAGE_MODEL_OPTIONS.filter((model) => !pendingStudio || model.id === pendingStudio.model).map((model) => ({
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
  }, [pendingSourceImage, pendingStudio]);

  const videoPaywallModels = useMemo(
    () =>
      VIDEO_MODEL_OPTIONS.filter((model) => !pendingStudio || model.id === pendingStudio.model).map((model) => ({
        id: model.id,
        name: model.name,
        description: model.description,
        emoji: model.emoji,
        // Per-second models are priced for the 5s clip this screen requests, so
        // the row figure matches what the server then quotes.
        baseCostUsd: model.perSecondCostUsd
          ? model.perSecondCostUsd * (pendingStudio?.durationSeconds ?? VIDEO_DURATION_SECONDS)
          : model.baseCostUsd,
        unavailableReason: pendingSourceImage
          ? videoSupportsImage(model)
            ? undefined
            : 'Text-to-video only'
          : videoSupportsText(model)
            ? undefined
            : 'Needs an image to animate',
      })),
    [pendingSourceImage, pendingStudio],
  );

  const toolPaywallModels = useMemo(
    () =>
      getToolsByCategory(toolCategory).filter((tool) => !pendingStudio || tool.id === pendingStudio.model).map((tool) => ({
        id: tool.id,
        name: tool.name,
        description: tool.description,
        emoji: tool.emoji,
        baseCostUsd: tool.baseCostUsd,
      })),
    [toolCategory, pendingStudio],
  );

  useEffect(() => {
    if (!walletAddress || !isScreenFocused) return;
    let request: AIChatMessage | undefined;
    for (const message of messages) {
      if (message.role === 'user') { request = message; continue; }
      if (!request?.id || !request.creatorSettings || message.isError || message.isVideoGenerating || message.isToolProcessing) continue;
      const url = message.modelUrl ?? message.videoUrl ?? message.audioUrl ?? message.imageUrl;
      if (!url) continue;
      const kind = message.modelUrl ? 'model3d' : message.videoUrl ? 'video' : message.audioUrl ? 'audio' : 'image';
      const id = `native-${request.id}-${kind}`;
      const saveKey = `${walletAddress}:${id}`;
      if (librarySaves.current.has(saveKey)) continue;
      librarySaves.current.add(saveKey);
      const creator = request.creatorSettings;
      const asset: CreatorAssetToSave = { id, kind, url, prompt: request.content, model: creator.model,
        modelName: creatorModels(creator.mode).find((model) => model.id === creator.model)?.name ?? creator.model,
        aspect: creator.aspect, presetId: request.templateId, createdAt: Date.now() };
      // Stream one file at a time, keeping large clips out of JS memory.
      librarySaveQueue.current = librarySaveQueue.current.then(async () => {
        try {
          await saveCreatorAsset(asset);
          void queryClient.invalidateQueries({ queryKey: ['creator-library', walletAddress] });
        } catch (error) {
          failedLibrarySaves.current.add(saveKey);
          log.error('Creator library save failed:', error);
          toastError(t('creator.studioCloudSaveFailed'));
        }
      });
    }
  }, [messages, walletAddress, isScreenFocused, queryClient]);

  return (
    <View style={studio ? { flex: 1 } : s.root} className={studio ? 'bg-theme-neutrals-900' : undefined}>
      {studio ? <ScreenHeader title={t('creator.studioTitle')} icon="creator" rightContent={
        <View className="flex-row items-center gap-2">
          <SubscriptionCreditsPill />
          <TouchableOpacity onPress={handleHistoryOpen} accessibilityRole="button" accessibilityLabel={t('assistant.chatHistory')} className="p-2">
            <Icon name="History" size={18} color="#A1A1AA" />
          </TouchableOpacity>
        </View>
      } /> : <AssistantHeader
        onNewChat={handleNewChat}
        onHistoryPress={handleHistoryOpen}
        onSettingsPress={() => setSettingsVisible(true)}
        onStylePress={() => setStyleVisible(true)}
        onSupportPress={() => setSupportVisible(true)}
        openTicketCount={supportTickets?.openCount ?? 0}
        styleEmoji={currentStyle.emoji}
        hasMessages={!isEmpty}
      />}

      {isEmpty ? (
        <View style={s.welcomeWrap}>
          <View style={s.welcomeCenter}>
            <Text style={s.welcomeText}>{studio ? t('creator.studioWelcome') : WELCOME_MESSAGE}</Text>
          </View>
          {!studio && <QuickActionChips onAction={handleQuickAction} />}
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
              studio ? null : <QuickActionChips onAction={handleQuickAction} />
            )
          }
        />
      )}

      <View style={{ marginBottom: kbVisible ? kbLift : studio ? 0 : TAB_BAR_HEIGHT }}>
        {studio && <CreatorStudioControls settings={studioSettings} onChange={setStudioSettings}
          onMode={changeStudioMode} onPresets={() => setTemplatesVisible(true)} disabled={isLoading} />}
        <MentionSuggestions
          visible={mentions.showSuggestions}
          suggestions={mentions.suggestions}
          onSelect={mentions.selectMention}
          loading={mentions.loading}
        />
        {activeTemplate && (
          <View style={s.templatePill}>
            <Text style={s.templatePillText} numberOfLines={2}>
              {t('creator.presetPlaceholder', {
                name: t(activeTemplate.nameKey),
                sample: activeTemplate.sample,
              })}
            </Text>
            <TouchableOpacity
              onPress={() => setTemplateId(null)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('creator.clearPreset')}
            >
              <Icon name="X" size={16} color="#A1A1AA" />
            </TouchableOpacity>
          </View>
        )}
        <AssistantInputBar
          value={input}
          onChangeText={mentions.handleChangeText}
          onSelectionChange={mentions.handleSelectionChange}
          onSend={handleSend}
          onAttach={studio && studioSettings.mode === 'audio' ? undefined : handleAttach}
          attachedImage={attachedImage}
          onRemoveImage={() => setAttachedImage(null)}
          loading={isLoading}
          allowEmpty={!!activeTemplate}
          placeholder={studio ? t('creator.studioPrompt') : undefined}
          sendLabel={studio ? t('creator.studioCreate') : undefined}
        />
      </View>

      <SupportTicketSheet
        visible={supportVisible}
        onClose={() => setSupportVisible(false)}
        enabled={!!user}
      />

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

      <TemplatesSheet
        visible={templatesVisible}
        onClose={() => setTemplatesVisible(false)}
        activeId={templateId}
        onSelect={handlePickTemplate}
        initialKind={studioSettings.mode === 'image' ? 'image' : 'video'}
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
        title={t('aiChat.generateImage')}
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
        // Posters run their own pipeline and are not covered by free images.
        onConfirmFree={pendingPosterConfig ? undefined : handleImageFree}
        footnote={
          pendingPosterConfig
            ? 'The wordmark and headline are composited after generation, crisply.'
            : undefined
        }
      />

      <CreditPaywallSheet
        visible={videoPaywallVisible}
        title={t('aiChat.generateVideo')}
        icon="Video"
        models={videoPaywallModels}
        selectedModelId={pendingStudio?.model ?? settings.videoModel}
        onSelectModel={(id) => updateSettings({ videoModel: id })}
        quoteKind="video"
        quoteExtras={{ durationSeconds: pendingStudio?.durationSeconds ?? VIDEO_DURATION_SECONDS }}
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
        confirmLabel={t('paywall.run')}
        onClose={() => setToolPaywallVisible(false)}
        onConfirm={handleToolConfirm}
      />
      <CreditPaywallSheet
        visible={model3dPaywallVisible}
        title={t('creator.studioGenerateModel')}
        icon="Wand"
        models={pendingStudio ? creatorModels('3d').filter((model) => model.id === pendingStudio.model) : []}
        selectedModelId={pendingStudio?.model ?? CREATOR_DEFAULTS['3d'].model}
        onSelectModel={() => {}}
        quoteKind="model3d"
        quoteExtras={{ quality: pendingStudio?.textureQuality ?? 'none' }}
        onClose={() => setModel3dPaywallVisible(false)}
        onConfirm={(txHash) => { if (pendingStudio) void doGenerateModel3d(pendingStudio, txHash); }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  templatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  templatePillText: { flex: 1, color: '#F4F4F5', fontSize: 13, lineHeight: 18 },
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
    borderRadius: 4,
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

export function CreatorStudioScreen() {
  return <SignInGate><AIChatScreenInner studio /></SignInGate>;
}
