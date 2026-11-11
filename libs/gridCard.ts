/**
 * Grid cards
 * ==========
 * In the feed a post can carry a card: a stage, an event, a poll, a quoted
 * post, a link preview, a community, a shop item. In the profile grid the same
 * post used to be a plain text poster with the raw link printed in its words.
 * This works out which card a grid post carries, so its tile can be a small
 * copy of that card (components/Profile/GridCardFace), and a picture or video
 * tile can say what it is (Short, Comic, Earn) with a pill. Same rules as the
 * web profile grid (src/lib/grid-card.ts).
 */

import { findDehubLinks, parseDehubLink, type DehubLinkKind, type DehubLinkMatch } from "./dehub-links";
import { extractUrlsFromText } from "./link-preview";

export type GridCardKind =
  | "stage" | "event" | "poll" | "quote" | "sharedPost" | "link" | "community"
  | "shop" | "profile" | "film" | "bounty" | "app" | "proposal"
  | "short" | "comic" | "earn";

const LINK_KIND: Partial<Record<DehubLinkKind, GridCardKind>> = {
  stage: "stage",
  event: "event",
  community: "community",
  communityInvite: "community",
  store: "shop",
  listing: "shop",
  post: "sharedPost",
  profile: "profile",
  film: "film",
  bounty: "bounty",
  app: "app",
  proposal: "proposal",
};

export interface TextCard {
  kind: GridCardKind;
  link?: DehubLinkMatch;
  url?: string;
}

/** The card a text post's words point at: a quote, the first Riftn link, else the first outside link. */
export function textCardOf(item: { description?: string; name?: string; isQuotePost?: boolean; quotedPost?: unknown; quotedTokenId?: unknown }): TextCard | null {
  if (item.isQuotePost && (item.quotedPost || item.quotedTokenId)) return { kind: "quote" };
  const text = item.description || item.name || "";
  for (const link of findDehubLinks(text)) {
    const kind = LINK_KIND[link.kind];
    if (kind) return { kind, link };
  }
  const url = extractUrlsFromText(text).find((u) => !parseDehubLink(u));
  return url ? { kind: "link", url } : null;
}

/** A picture or video tile that is more than a plain picture or video. */
export function mediaCardOf(item: any, isShort: boolean): GridCardKind | null {
  if (isShort) return "short";
  if (item?.layout === "comic") return "comic";
  if (Number(item?.streamInfo?.addBountyAmount) > 0) return "earn";
  return null;
}

/** Words for a tile that shows a card: the link the card stands for is taken out. */
export function wordsWithoutLinks(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\b(?:www\.)?(?:riftn\.com|dehub\.io)\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Host for a link card's footer: "youtube.com". */
export function linkHost(url: string | undefined): string {
  if (!url) return "";
  const m = /^https?:\/\/([^/?#]+)/i.exec(url);
  return m ? m[1].replace(/^www\./, "") : "";
}
