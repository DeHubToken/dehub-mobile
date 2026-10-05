/** The /dm server confirms persistence with a sender-only sendMessage echo. */
export interface DmSendTransport {
  on(event: string, handler: (data: any) => void): () => void;
  emit(payload: DmSendPayload): void;
}

export interface DmSendPayload {
  dmId: string;
  content?: string;
  type: string;
  gif?: string;
}

export interface DmSendEcho {
  _id: string;
  conversation?: unknown;
  dmId?: string;
  author?: string;
  content?: string;
  msgType?: string;
  mediaUrls?: Array<{ url: string }>;
}

/** Subscribe before emitting, and never treat transport delivery as a saved message. */
export function confirmDmSend<T extends DmSendEcho>(
  transport: DmSendTransport,
  payload: DmSendPayload,
  timeoutMs = 15_000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const unsubscribers: Array<() => void> = [];
    const finish = (message?: T, error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribers.forEach(unsubscribe => unsubscribe());
      if (error) reject(error);
      else resolve(message!);
    };
    const timer = setTimeout(() => finish(undefined, new Error(
      'The server did not confirm this message. Refresh the conversation before trying again.',
    )), timeoutMs);

    try {
      unsubscribers.push(transport.on('sendMessage', (message: T) => {
        const conversation = message?.conversation;
        const dmId = typeof conversation === 'string'
          ? conversation : (conversation as { _id?: string })?._id || message?.dmId;
        if (dmId !== payload.dmId || message?.author !== 'me' || !message?._id) return;
        if ((message.msgType || 'msg') !== payload.type) return;
        // Compare the wire content, including encrypted envelopes, before decryption.
        if ((message.content || '') !== (payload.content || '')) return;
        if (payload.gif && !message.mediaUrls?.some(media => media.url === payload.gif)) return;
        finish(message);
      }));
      unsubscribers.push(transport.on('error', (error: any) => {
        if (error?.dmId && error.dmId !== payload.dmId) return;
        finish(undefined, new Error(error?.msg || error?.message || 'Failed to send message.'));
      }));
      const disconnected = () => finish(undefined, new Error(
        'Chat disconnected before confirming this message. Refresh the conversation before trying again.',
      ));
      unsubscribers.push(transport.on('disconnect', disconnected));
      unsubscribers.push(transport.on('disconnected', disconnected));
      transport.emit(payload);
    } catch (error) {
      finish(undefined, error instanceof Error ? error : new Error('Failed to send message.'));
    }
  });
}
