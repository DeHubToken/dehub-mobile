import { Conversation, ID, Message, Attachment, User as StoreUser } from '../../store/messages.types';

// Defensive helpers to get fields regardless of backend shape
const pick = (obj: any, path: string, fallback?: any) => {
  try {
    return path.split('.').reduce((acc: any, key: string) => (acc ? acc[key] : undefined), obj) ?? fallback;
  } catch {
    return fallback;
  }
};

const toId = (v: any): ID => String(v ?? '').trim();

const truncateAddr = (addr?: string) => {
  const a = (addr || '').trim();
  return a && a.length > 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a || 'unknown';
};

function mapBackendUser(u: any): StoreUser | null {
  const rawId = u?._id ?? u?.id ?? u?.address ?? u?.walletAddress;
  const id = toId(rawId);
  if (!id) return null;
  const handle = u?.username || u?.handle || (u?.address ? u.address.toLowerCase() : id);
  const displayName = u?.displayName || u?.username || truncateAddr(u?.address || u?.walletAddress) || handle;
  const avatarUrl = u?.avatarUrl || u?.avatarImageUrl || u?.avatar;
  return {
    id,
    handle,
    displayName,
    avatarUrl,
    isBlocked: false,
  };
}

export function mapContactToStore(dm: any): { conversation: Conversation; users: StoreUser[] } | null {
  const convId = toId(dm?._id ?? dm?.id);
  if (!convId) return null;

  // participants might be: [ObjectId], [{ participant: <user> }], or [{ user: <user> }]
  const participantsRaw = (Array.isArray(dm?.participants) ? dm.participants : dm?.members) || [];
  const users: StoreUser[] = [];
  const participantIds: ID[] = [];

  for (const p of participantsRaw) {
    const userCandidate = p?.participant ?? p?.user ?? p; // try nested first
    const mapped = mapBackendUser(userCandidate);
    if (mapped) {
      users.push(mapped);
      participantIds.push(mapped.id);
    } else if (p?._id || p?.id) {
      participantIds.push(toId(p._id || p.id));
    }
  }

  const createdAt = pick(dm, 'createdAt', new Date().toISOString());
  const updatedAt = pick(dm, 'updatedAt', createdAt);
  const lastMessageId = toId(pick(dm, 'lastMessage._id') || pick(dm, 'lastMessageId')) || undefined;
  const unreadCount = Number(pick(dm, 'unreadCount', 0)) || 0;
  const title = pick(dm, 'title');

  const conversation: Conversation = {
    id: convId,
    type: 'direct',
    title,
    participants: participantIds,
    unreadCount,
    mutedUntil: null,
    createdAt: String(createdAt),
    updatedAt: String(updatedAt),
    ...(lastMessageId ? { lastMessageId } : {}),
  } as Conversation;

  return { conversation, users };
}

// Map backend message to store Message
export function mapMessageToStore(msg: any, currentUserId?: ID): Message | null {
  const id = toId(msg?._id ?? msg?.id);
  const convId = toId(msg?.conversation);
  if (!id || !convId) return null;

  // Sender mapping: backend provides sender as populated object via pipeline
  const senderId = toId(msg?.sender?._id ?? msg?.sender);
  const isMe = (msg?.author === 'me') || (!!currentUserId && senderId === currentUserId);
  const finalSenderId = isMe ? (currentUserId || senderId) : senderId;

  // Determine kind/text
  const hasMedia = Array.isArray(msg?.mediaUrls) && msg.mediaUrls.length > 0;
  const kind: Message['kind'] = hasMedia ? 'media' : 'text';
  const text: string | undefined = msg?.content || msg?.text || undefined;

  const attachments: Attachment[] | undefined = hasMedia
    ? (msg.mediaUrls as any[]).map((u: any, i: number) => ({
        id: toId(u?._id ?? `${id}-att-${i}`),
        type: 'image',
        url: String(u?.url || u),
        mimeType: 'image/*',
        size: 0,
      }))
    : undefined;

  const createdAt = String(msg?.createdAt || new Date().toISOString());

  const m: Message = {
    id,
    conversationId: convId,
    senderId: finalSenderId || 'unknown',
    kind,
    ...(text ? { text } : {}),
    ...(attachments ? { attachments } : {}),
    status: 'sent',
    createdAt,
  };
  return m;
}
