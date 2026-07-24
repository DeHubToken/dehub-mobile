import { useState, useEffect, useCallback } from "react";
import { pinDmMessage, unpinDmMessage } from "../services/dm/dm.api";
import type { DmConversation } from "../services/dm/dm.types";

export function useDmPin(
  conversationId: string | undefined,
  address?: string,
  conversation?: DmConversation | null,
) {
  // Seed from server conversation data; update optimistically on pin/unpin
  const serverPinned = conversation?.pinnedMessages?.length
    ? conversation.pinnedMessages[conversation.pinnedMessages.length - 1]
    : null;

  const [pinnedMessageId, setPinnedMessageId] = useState<string | null>(serverPinned);

  // Keep in sync when conversation data arrives / refreshes
  useEffect(() => {
    setPinnedMessageId(serverPinned);
  }, [serverPinned]);

  const pinMessage = useCallback(
    async (messageId: string) => {
      setPinnedMessageId(messageId);
      if (conversationId && address) {
        try {
          await pinDmMessage(conversationId, messageId, address);
        } catch {
          // revert optimistic update on failure
          setPinnedMessageId(serverPinned);
        }
      }
    },
    [conversationId, address, serverPinned],
  );

  const unpinMessage = useCallback(async () => {
    const previous = pinnedMessageId;
    setPinnedMessageId(null);
    if (conversationId && address && previous) {
      try {
        await unpinDmMessage(conversationId, previous, address);
      } catch {
        setPinnedMessageId(previous);
      }
    }
  }, [conversationId, address, pinnedMessageId]);

  return { pinnedMessageId, pinMessage, unpinMessage };
}
