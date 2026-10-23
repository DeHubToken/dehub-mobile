import { uploadActions, uploadState } from "../store/upload.store";
import { onSocketEvent } from "../libs/socket-events";
import { feedEvents } from "../libs/eventBus";
import { getNFT } from "./nft.service";

const POLL_MS = 4_000;
/** How long the pill says "Posted · View" before it goes. */
const READY_SHOWN_MS = 6_000;
/** A transcode that has not finished by now is left to the feed card's own poll. */
const WATCH_LIMIT_MS = 30 * 60_000;

/**
 * Follow a just-posted video through server processing, for the upload pill.
 *
 * Starts as soon as /user_mint returns — the post exists from then on, the
 * on-chain mint is a separate leg — and listens on the token's socket channel
 * with a poll of the post as the fallback. When the video is ready the feeds
 * refresh so the post shows up playable.
 */
export function watchPostVideo(jobId: string, tokenId: number): void {
  uploadActions.setVideoState(jobId, { tokenId, stage: "processing", progress: 0 });

  let stopped = false;
  const current = () => uploadState.jobs.find((j) => j.id === jobId)?.video;

  const stop = () => {
    stopped = true;
    unsubscribe();
    clearInterval(poll);
    clearTimeout(limit);
  };

  const finish = (stage: "ready" | "failed") => {
    if (stopped) return;
    stop();
    const video = current();
    if (!video) return;
    uploadActions.setVideoState(jobId, { ...video, stage, progress: stage === "ready" ? 100 : video.progress });
    if (stage === "ready") {
      feedEvents.requestRefresh();
      setTimeout(() => uploadActions.dismissVideo(jobId), READY_SHOWN_MS);
    }
  };

  const unsubscribe = onSocketEvent(String(tokenId), (data) => {
    const stage = data?.stage;
    if (stage === "done") return finish("ready");
    if (stage === "failed") return finish("failed");
    const video = current();
    const n = Number(data?.progress);
    if (!video || video.stage !== "processing" || !Number.isFinite(n)) return;
    // The token channel reports the transcode, then the upload of the
    // renditions; each runs 0–100, so they share one bar.
    const overall = stage === "uploading" ? 90 + n * 0.09 : n * 0.9;
    const progress = Math.min(Math.round(overall), 99);
    if (progress > video.progress) uploadActions.setVideoState(jobId, { ...video, progress });
  });

  const poll = setInterval(async () => {
    if (!current()) return stop();
    try {
      const { result } = await getNFT(tokenId);
      const status = result?.transcodingStatus;
      if (status === "done") finish("ready");
      else if (status === "failed") finish("failed");
    } catch {
      // The socket may still deliver; the next tick tries again.
    }
  }, POLL_MS);

  const limit = setTimeout(() => {
    stop();
    uploadActions.dismissVideo(jobId);
  }, WATCH_LIMIT_MS);
}
