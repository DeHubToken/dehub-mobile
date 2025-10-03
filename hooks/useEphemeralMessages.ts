import { useCallback, useRef, useState } from 'react';
import { Animated } from 'react-native';
import { ChatMessage } from '../components/LiveProducer/ChatMessageList';

export interface UseEphemeralMessagesOptions {
  limit?: number;
  ttlMs?: number;
  fadeInDuration?: number;
}

export interface UseEphemeralMessagesResult {
  ephemeral: ChatMessage[];
  addEphemeral: (msg: ChatMessage) => void;
  fadeAnim: Animated.Value;
}

export const useEphemeralMessages = (
  options: UseEphemeralMessagesOptions = {}
): UseEphemeralMessagesResult => {
  const { limit = 3, ttlMs = 6000, fadeInDuration = 220 } = options;
  const [ephemeral, setEphemeral] = useState<ChatMessage[]>([]);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const addEphemeral = useCallback(
    (msg: ChatMessage) => {
      setEphemeral((prev) => [...prev, msg].slice(-limit));
      fadeAnim.setValue(0);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: fadeInDuration,
        useNativeDriver: true,
      }).start();
      setTimeout(() => {
        setEphemeral((curr) => curr.filter((m) => m.id !== msg.id));
      }, ttlMs);
    },
    [fadeAnim, fadeInDuration, limit, ttlMs]
  );

  return { ephemeral, addEphemeral, fadeAnim };
};
