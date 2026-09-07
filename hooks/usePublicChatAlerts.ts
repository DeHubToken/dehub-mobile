/**
 * Public chat alerts — being told the room is talking, without being buried
 * ========================================================================
 *
 * Mobile half of web's `src/hooks/use-public-chat-alerts.ts`, with the same
 * two rules that make an open room survivable:
 *
 *  · **one card, not one per message** — messages are buffered while the
 *    reader is elsewhere and described as a pile ("14 new messages, @ben and
 *    4 others"), because a conversation is a burst by nature and a card per
 *    line is a tray you clear rather than read;
 *  · **a budget the reader sets** — a public room will be raided, so the
 *    ceiling of cards per hour is theirs to pick. Spending it delays the next
 *    card and nothing else: the buffer keeps growing behind the limit and the
 *    next card carries everything since the last one.
 *
 * A message that names you is promoted to the front of its own digest.
 *
 * ── What "elsewhere" means on a phone ──
 * The socket lives as long as the JS runtime does, so this covers the reader
 * being in the app on another screen, and the minutes after they leave it
 * before the OS suspends us. It is deliberately NOT a background delivery
 * mechanism — that would need the backend to fan a push out per chat message,
 * which is the wrong shape for a firehose and would put the rate limit on the
 * wrong side of the wire. With the chat screen itself open the engine drops
 * its connection entirely: there is nothing to announce, and a second socket
 * into the room LiveChatScreen already holds is pure waste.
 *
 * @module hooks/usePublicChatAlerts
 */

import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useTranslation } from 'react-i18next';
import { io, Socket } from 'socket.io-client';

import env from '../config/env';
import { getAuthToken } from '../libs/auth.utils';
import { createLogger } from '../libs/logger';
import { isAssistantAddress } from '../libs/assistant';
import { useUser, useAuthState } from '../context/AuthContext';
import { sendLocalNotification } from '../services/push/push.service';
import type { LiveChatMessageData } from '../services/livechat.service';
import {
  PUBLIC_CHAT_ALLOWANCE_CHANNEL,
  usePublicChatAlertsEnabled,
  usePublicChatAlertsPerHour,
  usePublicChatOpen,
} from '../libs/public-chat-alerts';
import {
  buildDigest,
  claimAllowance,
  readAllowance,
  type DigestItem,
} from '../libs/notification-digest';

const log = createLogger('PublicChatAlerts');

/** Same event names useLiveChat uses; only these two are needed here. */
const JOIN_EVENT = 'livechat:joinRoom';
const NEW_MESSAGE_EVENT = 'livechat:newMessage';

/**
 * How long to let a burst finish arriving before describing it. Long enough
 * that a back-and-forth between two people is one card rather than six, short
 * enough that a quiet room still reaches you while the message is current.
 */
const FLUSH_DELAY_MS = 8_000;

/**
 * The buffer keeps the newest few for the names and the quoted line; the total
 * is counted separately. A raid must not grow the heap of an app nobody is
 * looking at.
 */
const MAX_BUFFERED = 40;

export function usePublicChatAlerts() {
  const { t } = useTranslation();
  const user = useUser();
  const { isSignedIn } = useAuthState();
  const alertsOn = usePublicChatAlertsEnabled();
  const perHour = usePublicChatAlertsPerHour();
  const chatOpen = usePublicChatOpen();

  const bufferRef = useRef<DigestItem[]>([]);
  /** Everything buffered since the last card, including what the buffer dropped. */
  const totalRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const perHourRef = useRef(perHour);
  perHourRef.current = perHour;
  const tRef = useRef(t);
  tRef.current = t;

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const discard = useCallback(() => {
    bufferRef.current = [];
    totalRef.current = 0;
    clearTimer();
  }, [clearTimer]);

  /**
   * Describe what is buffered and, if the budget allows, say it. Out of
   * budget is the one case that keeps the pile: the card is late, never lost.
   */
  const flush = useCallback(() => {
    timerRef.current = null;
    if (!bufferRef.current.length) return;

    const limit = perHourRef.current;
    if (!claimAllowance(PUBLIC_CHAT_ALLOWANCE_CHANNEL, limit)) {
      const { nextAt } = readAllowance(PUBLIC_CHAT_ALLOWANCE_CHANNEL, limit);
      // nextAt is null only when the limit is 0, which the preference clamps
      // away; guard anyway rather than busy-wait.
      if (nextAt === null) return;
      clearTimer();
      timerRef.current = setTimeout(flush, Math.max(1_000, nextAt - Date.now()));
      return;
    }

    const digest = buildDigest(bufferRef.current);
    const count = Math.max(totalRef.current, digest.count);
    const tr = tRef.current;

    const names = digest.names.join(', ');
    const who = digest.otherNames > 0
      ? tr('digest.andOthers', { names, count: digest.otherNames })
      : names || tr('digest.someone', 'Someone');

    const title = digest.latestIsPersonal
      ? tr('publicChatAlerts.mentionTitle', 'Mentioned in public chat')
      : tr('publicChatAlerts.title', 'Public chat');

    // The single-message form is composed rather than translated: "name:
    // message" is two placeholders and a colon, so every locale's translation
    // comes back identical to English and the fan-out drops it as untranslated.
    const body = count > 1
      ? tr('publicChatAlerts.digest', '{{count}} new messages from {{who}}: {{message}}', {
          count,
          who,
          message: digest.latest,
        })
      : `${who}: ${digest.latest}`;

    discard();
    // 'public_chat' is handled by PushNotificationsProvider's tap router; the
    // backend never sends this type, it only ever comes from here.
    void sendLocalNotification(title, body, { type: 'public_chat' });
  }, [clearTimer, discard]);

  const flushRef = useRef(flush);
  flushRef.current = flush;

  useEffect(() => {
    if (!alertsOn || !isSignedIn || chatOpen) return;

    let cancelled = false;
    let socket: Socket | null = null;

    const me = (user?.walletAddress || user?.address || '').toLowerCase();
    const handle = (user?.username || '').toLowerCase();

    const connect = async () => {
      const token = await getAuthToken();
      if (!token || cancelled) return;

      const wsUrl = env.WEBSOCKET_URL || env.API_URL?.replace(/\/api$/, '');
      socket = io(`${wsUrl}/livechat`, {
        auth: { token },
        transports: ['polling', 'websocket'],
        reconnection: true,
        reconnectionAttempts: 15,
        reconnectionDelay: 2000,
        reconnectionDelayMax: 10000,
        forceNew: true,
      });

      socket.on('connect', () => {
        // No room id: the gateway puts a plain join in the platform room.
        socket?.emit(JOIN_EVENT);
      });

      socket.on('connect_error', (err) => {
        log.debug('Connect error:', err.message);
      });

      socket.on(NEW_MESSAGE_EVENT, (raw: LiveChatMessageData) => {
        if (!raw) return;

        const from = (raw.sender?.address || raw.senderAddress || '').toLowerCase();
        if (from && from === me) return;
        // The buy bot and the assistant have their own surfaces and their own
        // switches; they are not somebody talking to the room.
        if (isAssistantAddress(from)) return;

        const tr = tRef.current;
        const text = raw.content?.trim()
          || (raw.messageType === 'audio' || raw.messageType === 'voice'
            ? tr('publicChatAlerts.voiceMessage', 'Voice message')
            : raw.media?.length || raw.gif
              ? tr('publicChatAlerts.image', 'Sent an image')
              : '');
        if (!text) return;

        const name = raw.sender?.displayName
          || (raw.sender?.username ? `@${raw.sender.username}` : '')
          || (from ? `${from.slice(0, 6)}…` : '')
          || tr('digest.someone', 'Someone');

        totalRef.current += 1;
        bufferRef.current.push({
          from: name,
          text,
          // A handle match is deliberately loose — mentions are typed by hand
          // and the room writes them plenty of ways.
          personal: Boolean(
            (handle && raw.content?.toLowerCase().includes(`@${handle}`))
            || (me && raw.mentions?.some((m) => m.address?.toLowerCase() === me)),
          ),
        });
        if (bufferRef.current.length > MAX_BUFFERED) {
          bufferRef.current = bufferRef.current.slice(-MAX_BUFFERED);
        }

        // First message of a pile starts the clock; the rest join the card it
        // is going to produce. Never re-armed on arrival, or a room that never
        // stops talking would never fire.
        if (timerRef.current === null) {
          timerRef.current = setTimeout(() => flushRef.current(), FLUSH_DELAY_MS);
        }
      });
    };

    void connect();

    // Coming back to the app is the reader catching up for themselves — a card
    // fired seconds after they returned is noise, and the room is one tap away.
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') discard();
    });

    return () => {
      cancelled = true;
      appStateSub.remove();
      socket?.removeAllListeners();
      socket?.disconnect();
      discard();
    };
  }, [alertsOn, isSignedIn, chatOpen, user?.walletAddress, user?.address, user?.username, discard]);
}
