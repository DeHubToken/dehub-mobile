/**
 * Watch time for post stats
 * =========================
 * How long each play of a video post really lasted and how far into it the
 * viewer got, reported for the creator's stats (/api/post-stats/watch-time),
 * signed in or out. Mirrors web's lib/watch-time.
 *
 * Players call `trackPlayerWatchTime(player, tokenId)` from an effect. One
 * player can be on screen twice (feed card under the fullscreen player), so
 * sessions are kept per player and counted once; a player that moves on to
 * another post starts a new session.
 *
 * A one-second poll reads `playing` and `currentTime` — no native events, so
 * nothing here needs a newer app binary. Only steps under two seconds count,
 * so a seek is not "watching". Reports go out every 15 seconds while playing,
 * on pause, and when the last screen using the player lets go of it.
 */
import type { VideoPlayer } from "expo-video";
import { sendWatchTime } from "../services/post-stats.service";

const POLL_MS = 1_000;
const REPORT_EVERY_MS = 15_000;

interface Session {
  tokenId: string;
  sessionId: string;
  refs: number;
  played: number;
  maxPos: number;
  lastTime: number | null;
  duration: number;
  sentPlayed: number;
  sentMaxPos: number;
  lastSentAt: number;
}

const sessions = new Map<VideoPlayer, Session>();
let timer: ReturnType<typeof setInterval> | null = null;

function newSessionId(): string {
  return Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
}

function report(s: Session): void {
  const seconds = Math.floor(s.played);
  const position = Math.floor(s.maxPos);
  if (seconds < 1 || (seconds === s.sentPlayed && position === s.sentMaxPos)) return;
  s.sentPlayed = seconds;
  s.sentMaxPos = position;
  s.lastSentAt = Date.now();
  sendWatchTime({ tokenId: Number(s.tokenId), sessionId: s.sessionId, seconds, position, duration: Math.floor(s.duration) });
}

function tick(): void {
  for (const [player, s] of sessions) {
    let playing = false;
    let t = 0;
    try {
      playing = player.playing;
      t = player.currentTime;
      const d = player.duration;
      if (Number.isFinite(d) && d > 0) s.duration = d;
    } catch {
      // Released natively; the owner's cleanup will drop it.
      continue;
    }
    if (!playing) {
      if (s.lastTime !== null) {
        s.lastTime = null;
        report(s);
      }
      continue;
    }
    if (s.lastTime !== null) {
      const step = t - s.lastTime;
      if (step > 0 && step < 2) s.played += step;
    }
    s.lastTime = t;
    if (t > s.maxPos) s.maxPos = t;
    if (Date.now() - s.lastSentAt >= REPORT_EVERY_MS) report(s);
  }
  if (sessions.size === 0 && timer) {
    clearInterval(timer);
    timer = null;
  }
}

/** Measure plays of `tokenId` on this player. Returns the cleanup. */
export function trackPlayerWatchTime(
  player: VideoPlayer | null | undefined,
  tokenId: string | number | null | undefined,
): () => void {
  if (!player || tokenId == null) return () => {};
  const id = String(tokenId);
  if (!/^\d+$/.test(id)) return () => {};
  let s = sessions.get(player);
  if (s && s.tokenId !== id) {
    report(s);
    s = undefined;
  }
  if (!s) {
    s = {
      tokenId: id, sessionId: newSessionId(), refs: 0, played: 0, maxPos: 0, lastTime: null,
      duration: 0, sentPlayed: 0, sentMaxPos: 0, lastSentAt: Date.now(),
    };
    sessions.set(player, s);
  }
  s.refs += 1;
  if (!timer) timer = setInterval(tick, POLL_MS);
  const mine = s;
  return () => {
    mine.refs -= 1;
    if (mine.refs > 0 || sessions.get(player) !== mine) return;
    report(mine);
    sessions.delete(player);
    if (sessions.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

