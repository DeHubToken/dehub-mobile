/** A connected socket is not proof that the server accepted a message. */
export function confirmChatDelivery(options: {
  listen: (event: string, handler: (value: any) => void) => () => void;
  emit: () => void;
  messageEvent: string;
  errorEvent: string;
  matches: (message: any) => boolean;
  timeoutMs?: number;
}): Promise<boolean> {
  return new Promise(resolve => {
    let done = false;
    const off: Array<() => void> = [];
    const finish = (sent: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      off.forEach(remove => remove());
      resolve(sent);
    };
    const timer = setTimeout(() => finish(false), options.timeoutMs ?? 15_000);
    try {
      off.push(options.listen(options.messageEvent, message => { if (options.matches(message)) finish(true); }));
      off.push(options.listen(options.errorEvent, () => finish(false)));
      off.push(options.listen('disconnect', () => finish(false)));
      options.emit();
    } catch { finish(false); }
  });
}

export function roomMessageMatches(message: any, expected: {
  account: string; content: string; room?: string; attachment?: string; messageId?: string;
}): boolean {
  const value = message?.message ?? message;
  const sender = value?.senderAddress ?? value?.sender_address ?? value?.sender?.address ?? value?.user?.address;
  const room = value?.roomId ?? value?.room_id;
  if (!value?._id && !value?.id) return false;
  if (String(sender ?? '').toLowerCase() !== expected.account.toLowerCase()) return false;
  if (expected.room && room && String(room) !== expected.room) return false;
  if (expected.messageId && String(value._id ?? value.id) !== expected.messageId) return false;
  if ((value.content ?? '') !== expected.content) return false;
  if (expected.attachment && value.audioUrl !== expected.attachment && value.gif?.url !== expected.attachment &&
      !value.media?.some((item: { url?: string }) => item.url === expected.attachment)) return false;
  return true;
}
