import { ScreenNames } from "../navigation/ScreenNames";
import { isStreamLive } from "./live-status";

type Navigate = (screen: any, params?: any) => void;

const isStreamId = (id: unknown): id is string =>
  typeof id === "string" && /^[a-f0-9]{24}$/i.test(id);

/**
 * Open the place a chat mention was made.
 *
 * A tag in a stream's chat opens that stream while it is still on air, and
 * the post (its replay) once it has ended. A tag in the public chat opens the
 * public chat. Returns false for any other mention, which opens its post or
 * comment as before.
 */
export function openChatMention(
  navigate: Navigate,
  target: { mentionContext?: unknown; tokenId?: number | string | null },
): boolean {
  if (target.mentionContext === "public_chat") {
    navigate(ScreenNames.LiveChat);
    return true;
  }
  if (target.mentionContext !== "live_chat" || target.tokenId == null) return false;

  const tokenId = Number(target.tokenId);
  // Required lazily so this module stays light under tests.
  const { getNFT } = require("../services/nft.service");
  getNFT(tokenId)
    .then((res: any) => {
      const nft = res?.result;
      const streamId = [nft?.stream?._id, nft?.stream?.id].find(isStreamId);
      if (streamId && isStreamLive(nft?.stream)) {
        navigate(ScreenNames.LiveViewer, { streamId, tokenId, isLive: true });
      } else {
        navigate(ScreenNames.FeedDetail, { tokenId });
      }
    })
    .catch(() => navigate(ScreenNames.FeedDetail, { tokenId }));
  return true;
}
