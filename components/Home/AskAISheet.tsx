import { isHoldGated } from "../../libs/content-gate";
import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  Dimensions,
  StyleSheet,
  ActivityIndicator,
  Image,
  InteractionManager,
  FlatList,
  Pressable,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  runOnJS,
  Easing,
  FadeInDown,
} from "react-native-reanimated";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Icon from "../ui/Icon";
import GlassIndicator from "../ui/GlassIndicator";
import { useUser } from "../../context/AuthContext";
import { getAuthToken } from "../../libs/auth.utils";
import {
  sendAIChat,
  generateImage,
  isImageRequest,
  AIServiceError,
  type AIChatMessage,
  type AIPostContext,
  type AIUserContext,
} from "../../services/ai.service";
import { getDeviceLanguage } from "../../services/translation.service";
import { toastError } from "../../libs";
import { ScreenNames } from "../../navigation/ScreenNames";
import { useKeyboard } from "../../hooks/useKeyboard";

const AI_AVATAR = require("../../assets/web-icons/profile-icon.png");
const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.85;

const STORAGE_PREFIX = "ai_chat_";
const storageKey = (userId: string, postId: string) =>
  `${STORAGE_PREFIX}${userId.toLowerCase()}_${postId}`;

interface CachedChat {
  messages: AIChatMessage[];
  postContext: AIPostContext;
}

const memCache = new Map<string, CachedChat>();

async function loadChatFromStorage(userId: string, postId: string): Promise<CachedChat | null> {
  const key = storageKey(userId, postId);
  if (memCache.has(key)) return memCache.get(key)!;
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const migrated: CachedChat = { messages: parsed, postContext: {} };
        memCache.set(key, migrated);
        return migrated;
      }
      memCache.set(key, parsed);
      return parsed as CachedChat;
    }
  } catch {}
  return null;
}

async function saveChatToStorage(
  userId: string,
  postId: string,
  msgs: AIChatMessage[],
  ctx: AIPostContext,
) {
  const key = storageKey(userId, postId);
  const data: CachedChat = { messages: msgs, postContext: ctx };
  memCache.set(key, data);
  try {
    await AsyncStorage.setItem(key, JSON.stringify(data));
  } catch {}
}

export interface AskAISheetProps {
  visible: boolean;
  onClose: () => void;
  postId: string | number;
  postContext: AIPostContext;
}

const MD_IMAGE_RE = /!\[[^\]]*\]\((https?:\/\/[^)]+)\)/g;
const BARE_IMAGE_RE = /(?<!\()(https?:\/\/\S+\.(?:png|jpe?g|gif|webp|svg)(?:\?\S*)?)(?!\))/gi;

function extractImages(text: string): string[] {
  const urls = new Set<string>();
  for (const m of text.matchAll(MD_IMAGE_RE)) urls.add(m[1]);
  for (const m of text.matchAll(BARE_IMAGE_RE)) urls.add(m[0]);
  return [...urls];
}

function stripImageMarkdown(text: string): string {
  let cleaned = text.replace(MD_IMAGE_RE, "").replace(BARE_IMAGE_RE, "");
  return cleaned.replace(/\n{3,}/g, "\n\n").trim();
}

const IMAGE_WIDTH = Dimensions.get("window").width * 0.55;

interface ChatBubbleProps {
  message: AIChatMessage;
  onImagePress: (url: string, allUrls: string[]) => void;
}

const ChatBubble = memo<ChatBubbleProps>(({ message, onImagePress }) => {
  const isUser = message.role === "user";

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

  const handlePress = useCallback((url: string) => {
    onImagePress(url, imageUrls);
  }, [onImagePress, imageUrls]);

  return (
    <Animated.View
      entering={FadeInDown.duration(200)}
      style={[
        styles.bubble,
        isUser ? styles.userBubble : styles.aiBubble,
      ]}
    >
      {!isUser && (
        <Image source={AI_AVATAR} style={styles.bubbleAvatar} />
      )}
      {isUser ? (
        <View style={[styles.bubbleContent, styles.userBubbleContent]}>
          <GlassIndicator borderRadius={16} />
          <Text style={styles.bubbleText}>{message.content}</Text>
        </View>
      ) : (
        <View style={[styles.bubbleContent, styles.aiBubbleContent]}>
          {displayText.length > 0 && (
            <Text style={styles.bubbleText}>{displayText}</Text>
          )}
          {imageUrls.map((url) => (
            <Pressable
              key={url}
              onPress={() => handlePress(url)}
              style={styles.bubbleImageWrap}
            >
              <Image
                source={{ uri: url }}
                style={styles.bubbleImage}
                resizeMode="cover"
              />
            </Pressable>
          ))}
        </View>
      )}
    </Animated.View>
  );
});

const AskAISheetComponent: React.FC<AskAISheetProps> = ({
  visible,
  onClose,
  postId,
  postContext,
}) => {
  const insets = useSafeAreaInsets();
  const user = useUser();
  const navigation = useNavigation<any>();
  const flatListRef = useRef<FlatList<AIChatMessage>>(null);
  const { height: kbHeight, isVisible: kbVisible } = useKeyboard();

  const translateY = useSharedValue(SHEET_HEIGHT);
  const backdropOpacity = useSharedValue(0);
  const [isFullyClosed, setIsFullyClosed] = useState(!visible);

  const userAddress = user?.walletAddress || user?.address || "anon";
  const cacheKey = String(postId);
  const [messages, setMessages] = useState<AIChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const hasLoadedRef = useRef(false);
  const [cacheLoaded, setCacheLoaded] = useState(false);

  const userContext: AIUserContext | undefined = user
    ? {
        username: user.username,
        displayName: user.displayName,
        walletAddress: user.walletAddress || user.address,
        followers: user.followers,
        following: user.followings,
        badgeBalance: user.badgeBalance,
        tipsReceived: user.receivedTips,
        tipsSent: user.sentTips,
      }
    : undefined;

  useEffect(() => {
    setCacheLoaded(false);
    loadChatFromStorage(userAddress, cacheKey).then((cached) => {
      if (cached && cached.messages.length > 0) {
        setMessages(cached.messages);
      }
      setCacheLoaded(true);
    });
  }, [userAddress, cacheKey]);

  useEffect(() => {
    if (visible) {
      setIsFullyClosed(false);

      translateY.value = withTiming(0, {
        duration: 200,
        easing: Easing.out(Easing.cubic),
      });
      backdropOpacity.value = withTiming(1, { duration: 150 });
    } else {
      translateY.value = withTiming(
        SHEET_HEIGHT,
        { duration: 220, easing: Easing.in(Easing.cubic) },
        () => runOnJS(setIsFullyClosed)(true),
      );
      backdropOpacity.value = withTiming(0, { duration: 180 });
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || !cacheLoaded) return;

    if (messages.length > 0) {
      requestAnimationFrame(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
      });
    } else if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
      InteractionManager.runAfterInteractions(() => {
        sendInitialGreeting();
      });
    }
  }, [visible, cacheLoaded]);

  useEffect(() => {
    if (messages.length > 0) {
      saveChatToStorage(userAddress, cacheKey, messages, postContext);
    }
  }, [messages, cacheKey]);

  const buildInitialPrompt = useCallback((): string => {
    const parts: string[] = [];
    parts.push("You are the DeHub AI assistant. The user just tapped \"Ask AI\" on a post.");
    parts.push("Give a comprehensive, informative summary of this post covering all key details.");
    parts.push("Include: what the post is about, who made it, engagement stats, any monetization or special features.");
    parts.push("Be concise but thorough — give the user everything they'd want to know at a glance.");
    parts.push("Don't generate videos.");
    parts.push("End by asking what else they'd like to know.");
    parts.push("");
    parts.push("Here are the full post details:");

    if (postContext.title) parts.push(`Title: ${postContext.title}`);
    if (postContext.caption) parts.push(`Caption/Description: ${postContext.caption}`);
    if (postContext.author) parts.push(`Creator: ${postContext.author}${postContext.authorUsername ? ` (@${postContext.authorUsername})` : ""}`);
    if (postContext.type) parts.push(`Content type: ${postContext.type}`);
    if (postContext.categories?.length) parts.push(`Categories: ${postContext.categories.join(", ")}`);
    if (postContext.createdAt) parts.push(`Posted: ${postContext.createdAt}`);
    if (postContext.duration) parts.push(`Duration: ${postContext.duration}`);
    if (postContext.views) parts.push(`Views: ${postContext.views}`);
    if (postContext.likes) parts.push(`Likes: ${postContext.likes}`);
    if (postContext.dislikes) parts.push(`Dislikes: ${postContext.dislikes}`);
    if (postContext.comments) parts.push(`Comments: ${postContext.comments}`);
    if (postContext.tips) parts.push(`Tips received: ${postContext.tips}`);
    if (postContext.reposts) parts.push(`Reposts: ${postContext.reposts}`);
    if (postContext.imageCount) parts.push(`Images: ${postContext.imageCount} photos`);
    if (postContext.isLive) parts.push("Status: Currently LIVE");
    if (postContext.isPayPerView) parts.push(`Pay-per-view: ${postContext.ppvAmount} ${postContext.ppvCurrency}`);
    if (isHoldGated(postContext.isLockContent, postContext.lockAmount)) parts.push(`Lock content: Hold ${postContext.lockAmount} ${postContext.lockCurrency} to unlock`);
    if (postContext.isBounty) parts.push(`Bounty: ${postContext.bountyAmount} ${postContext.bountyCurrency} (Watch2Earn)`);
    if (postContext.imageUrl) parts.push(`Image/Thumbnail URL: ${postContext.imageUrl}`);

    return parts.join("\n");
  }, [postContext]);

  const sendInitialGreeting = useCallback(async () => {
    setIsLoading(true);
    try {
      const systemMsg: AIChatMessage = {
        role: "user",
        content: buildInitialPrompt(),
      };

      const res = await sendAIChat({
        messages: [systemMsg],
        postContext,
        userContext,
        isAuthenticated: !!user,
        userLanguage: getDeviceLanguage(),
        surface: "assistant",
        dehubToken: (await getAuthToken()) || undefined,
      });

      const greeting: AIChatMessage = {
        role: "assistant",
        content: res.response,
      };
      setMessages([greeting]);
    } catch (err) {
      const lines: string[] = [];
      if (postContext.title) lines.push(`"${postContext.title}"`);
      if (postContext.author) lines.push(`by ${postContext.author}`);
      if (postContext.type) lines.push(`(${postContext.type})`);
      const details: string[] = [];
      if (postContext.views) details.push(`${postContext.views} views`);
      if (postContext.likes) details.push(`${postContext.likes} likes`);
      if (postContext.comments) details.push(`${postContext.comments} comments`);
      const fallback = `Here's what I can see about this post ${lines.join(" ")}${details.length ? ` — ${details.join(", ")}` : ""}. What would you like to know?`;
      const greeting: AIChatMessage = { role: "assistant", content: fallback };
      setMessages([greeting]);
    } finally {
      setIsLoading(false);
    }
  }, [postContext, userContext, user]);

  const closeSheet = useCallback(() => {
    translateY.value = withTiming(
      SHEET_HEIGHT,
      { duration: 220, easing: Easing.in(Easing.cubic) },
      () => runOnJS(onClose)(),
    );
    backdropOpacity.value = withTiming(0, { duration: 180 });
  }, [onClose]);

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY > 0) translateY.value = e.translationY;
    })
    .onEnd((e) => {
      if (e.translationY > 80 || e.velocityY > 500) {
        runOnJS(closeSheet)();
      } else {
        translateY.value = withTiming(0, {
          duration: 200,
          easing: Easing.out(Easing.cubic),
        });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isLoading) return;

    const userMsg: AIChatMessage = { role: "user", content: text };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInputText("");
    setIsLoading(true);

    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);

    try {
      if (isImageRequest(text)) {
        setIsGeneratingImage(true);
        try {
          // `generate-image` charges the caller's DHB credit and answers 401
          // without a DeHub token, so the wallet has to travel with the request.
          const imgRes = await generateImage(
            {
              prompt: text,
              conversationHistory: updatedMessages,
            },
            user?.walletAddress || user?.address,
          );
          if (imgRes.imageUrl) {
            const imgMsg: AIChatMessage = {
              role: "assistant",
              content: imgRes.text || "Here's the image I generated:",
              imageUrl: imgRes.imageUrl,
            };
            setMessages((prev) => [...prev, imgMsg]);
          } else {
            const fallbackMsg: AIChatMessage = {
              role: "assistant",
              content: imgRes.text || "The image couldn't be generated. Try a different prompt.",
            };
            setMessages((prev) => [...prev, fallbackMsg]);
          }
        } catch (imgErr) {
          toastError("Image generation failed — try again");
        } finally {
          setIsGeneratingImage(false);
        }
      } else {
        const res = await sendAIChat({
          messages: updatedMessages,
          postContext,
          userContext,
          isAuthenticated: !!user,
          userLanguage: getDeviceLanguage(),
          surface: "assistant",
          dehubToken: (await getAuthToken()) || undefined,
        });

        const aiMsg: AIChatMessage = { role: "assistant", content: res.response };
        setMessages((prev) => [...prev, aiMsg]);
      }

      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (err) {
      if (err instanceof AIServiceError) {
        if (err.errorCode === "RATE_LIMIT") {
          toastError("Too many requests — try again shortly");
        } else if (err.safetyBlocked) {
          toastError(err.message);
          if (err.clearHistory) {
            setMessages([]);
            saveChatToStorage(userAddress, cacheKey, [], postContext);
          }
        } else {
          toastError(err.message || "AI request failed");
        }
      } else {
        toastError("Something went wrong");
      }
    } finally {
      setIsLoading(false);
    }
  }, [inputText, messages, isLoading, postContext, userContext, user, cacheKey]);

  const handleImagePress = useCallback(
    (url: string, allUrls: string[]) => {
      closeSheet();
      setTimeout(() => {
        navigation.navigate(ScreenNames.ImageViewer, {
          images: allUrls.map((u) => ({ uri: u })),
          initialIndex: Math.max(allUrls.indexOf(url), 0),
          allowDownload: true,
        });
      }, 250);
    },
    [navigation, closeSheet],
  );

  const renderMessage = useCallback(
    ({ item }: { item: AIChatMessage }) => (
      <ChatBubble message={item} onImagePress={handleImagePress} />
    ),
    [handleImagePress],
  );

  const keyExtractor = useCallback(
    (_: AIChatMessage, index: number) => `msg-${index}`,
    [],
  );

  const scrollToBottom = useCallback((animated = true) => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated });
    }, 50);
  }, []);

  if (isFullyClosed && !visible) return null;

  return (
    <Modal
      visible={!isFullyClosed}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={closeSheet}
    >
      <GestureHandlerRootView style={StyleSheet.absoluteFill}>
        <Animated.View
          style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.6)" }, backdropStyle]}
        >
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={closeSheet}
          />
        </Animated.View>

        <View
          style={StyleSheet.absoluteFill}
          pointerEvents="box-none"
        >
          <Animated.View
            style={[
              styles.sheet,
              { maxHeight: SHEET_HEIGHT, paddingBottom: insets.bottom },
              sheetStyle,
            ]}
          >
            <View style={[StyleSheet.absoluteFill, styles.overlay]} />

            <GestureDetector gesture={panGesture}>
              <Animated.View>
                <View style={styles.handleWrap}>
                  <View style={styles.handle} />
                </View>

                <View style={styles.header}>
                  <View style={styles.headerLeft}>
                    <Image source={AI_AVATAR} style={styles.headerAvatar} />
                    <Text style={styles.headerTitle}>Assistant</Text>
                  </View>
                  <View style={styles.headerActions}>
                    <TouchableOpacity
                      onPress={closeSheet}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={styles.headerBtn}
                    >
                      <Icon name="X" size={14} color="#A6A9AC" />
                    </TouchableOpacity>
                  </View>
                </View>
              </Animated.View>
            </GestureDetector>

            <FlatList
                ref={flatListRef}
                data={messages}
                renderItem={renderMessage}
                keyExtractor={keyExtractor}
                style={styles.messageList}
                contentContainerStyle={styles.messageListContent}
                showsVerticalScrollIndicator={false}
                keyboardDismissMode="interactive"
                nestedScrollEnabled
                onContentSizeChange={() => scrollToBottom(false)}
                onLayout={() => scrollToBottom(false)}
              />

              {isLoading && (
                <View style={styles.typingRow}>
                  <Image source={AI_AVATAR} style={styles.typingAvatar} />
                  <View style={styles.typingBubble}>
                    <ActivityIndicator size="small" color="#A6A9AC" />
                    <Text style={styles.typingText}>{isGeneratingImage ? "Creating..." : "Thinking..."}</Text>
                  </View>
                </View>
              )}

              <View style={[styles.inputRow, { marginBottom: kbVisible ? kbHeight : Math.max(insets.bottom, 8) }]}>
                <TouchableOpacity style={styles.micBtn} disabled>
                  <Icon name="Mic" size={18} color="#6F7174" />
                </TouchableOpacity>
                <TextInput
                  style={styles.textInput}
                  placeholder="Ask about this post..."
                  placeholderTextColor="#6F7174"
                  value={inputText}
                  onChangeText={setInputText}
                  onSubmitEditing={handleSend}
                  returnKeyType="send"
                  multiline={false}
                  editable={!isLoading}
                />
                <TouchableOpacity
                  onPress={handleSend}
                  disabled={!inputText.trim() || isLoading}
                  style={[
                    styles.sendBtn,
                    (!inputText.trim() || isLoading) && styles.sendBtnDisabled,
                  ]}
                >
                  <Icon
                    name="Send"
                    size={18}
                    color={inputText.trim() && !isLoading ? "#F9FBFF" : "#6F7174"}
                  />
                </TouchableOpacity>
              </View>
          </Animated.View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    minHeight: SCREEN_HEIGHT * 0.7,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
  },
  overlay: {
    backgroundColor: "#0C0C0E",
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  handleWrap: {
    alignItems: "center",
    paddingVertical: 10,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  headerTitle: {
    color: "#F9FBFF",
    fontSize: 16,
    fontWeight: "700",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  headerBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  messageList: {
    flex: 1,
  },
  messageListContent: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    paddingTop: 4,
    flexGrow: 1,
  },
  bubble: {
    flexDirection: "row",
    marginBottom: 12,
    maxWidth: "85%",
  },
  userBubble: {
    alignSelf: "flex-end",
    flexDirection: "row-reverse",
  },
  aiBubble: {
    alignSelf: "flex-start",
  },
  bubbleAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 8,
    marginTop: 2,
  },
  bubbleContent: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: "100%",
    overflow: "hidden",
  },
  userBubbleContent: {
    borderBottomRightRadius: 4,
  },
  aiBubbleContent: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    color: "#F9FBFF",
    fontSize: 14,
    lineHeight: 20,
  },
  bubbleImageWrap: {
    marginTop: 8,
    borderRadius: 12,
    overflow: "hidden",
  },
  bubbleImage: {
    width: IMAGE_WIDTH,
    height: IMAGE_WIDTH * 0.75,
    borderRadius: 12,
  },
  typingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  typingAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 8,
  },
  typingBubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  typingText: {
    color: "#A6A9AC",
    fontSize: 13,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 4,
    height: 48,
  },
  micBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  textInput: {
    flex: 1,
    color: "#F9FBFF",
    fontSize: 14,
    paddingVertical: 0,
    paddingHorizontal: 8,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
});

export default memo(AskAISheetComponent);