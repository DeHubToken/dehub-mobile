/**
 * What each streamer card asks for, in numbers, so a card can show how far
 * along its owner is. The backend decides when a card is earned; these only
 * mirror the `live.progress.card.<id>.hint` copy for the progress bar, and a
 * card the backend has marked earned always reads as complete.
 */
import type { StreamerBadgeId } from "./streamer-badge-art";
import type { StreamerProgress } from "../services/live.service";

/**
 * streams: qualifying streams. hours: qualifying hours. session: minutes in
 * one stream. streak: weeks in a row. level: streamer level. viewers and
 * night have no running total in the progress payload.
 */
export type StreamerCardMetric = "streams" | "hours" | "session" | "streak" | "level" | "viewers" | "night";

export const STREAMER_CARD_GOALS: Record<StreamerBadgeId, { metric: StreamerCardMetric; target: number }> = {
  "first-light": { metric: "streams", target: 1 },
  ignition: { metric: "hours", target: 1 },
  "on-air": { metric: "streams", target: 10 },
  marathon: { metric: "session", target: 120 },
  "night-owl": { metric: "night", target: 1 },
  crowd: { metric: "viewers", target: 10 },
  regular: { metric: "streak", target: 4 },
  storyteller: { metric: "streams", target: 25 },
  circle: { metric: "viewers", target: 25 },
  enduring: { metric: "session", target: 240 },
  broadcaster: { metric: "streams", target: 50 },
  arena: { metric: "viewers", target: 50 },
  "iron-streak": { metric: "streak", target: 12 },
  legend: { metric: "level", target: 10 },
  headliner: { metric: "viewers", target: 100 },
  centurion: { metric: "streams", target: 100 },
  century: { metric: "hours", target: 100 },
  cornerstone: { metric: "streak", target: 26 },
  icon: { metric: "level", target: 20 },
  veteran: { metric: "hours", target: 250 },
};

/** Where the owner stands on a card, or null when there is no running total to show. */
export function streamerCardProgress(
  id: StreamerBadgeId,
  progress: StreamerProgress | undefined,
): { metric: StreamerCardMetric; current: number; target: number } | null {
  const goal = STREAMER_CARD_GOALS[id];
  if (!goal || !progress) return null;
  const current = (() => {
    switch (goal.metric) {
      case "streams":
        return progress.qualifyingStreams;
      case "hours":
        return progress.qualifyingMinutes / 60;
      case "session":
        return progress.longestStreamMinutes;
      case "streak":
        return progress.bestStreakWeeks;
      case "level":
        return progress.level;
      default:
        return null;
    }
  })();
  if (current === null || !Number.isFinite(current)) return null;
  return { metric: goal.metric, current, target: goal.target };
}
