/**
 * Reading a chat GIF, whichever client posted it.
 *
 * A GIF reaches the live chat in two different shapes, because the two clients
 * write it differently and always have:
 *
 * - mobile posts `messageType: 'gif'` with a `gif` object and an empty body;
 * - web posts `messageType: 'gif'` with the **URL as the message content**,
 *   mirrored into `media` (and, from the sidebar chat, not mirrored anywhere).
 *
 * Reading only the `gif` object therefore drops every web-sent GIF into the
 * text branch, where the URL renders as a tappable link instead of a picture.
 * Both shapes are already in the database and always will be, so read both.
 */

export type ChatGif = {
  url: string;
  /** Only present when the sender recorded it; both clients often do not. */
  width?: number;
  height?: number;
};

type GifBearingMessage = {
  content?: string | null;
  messageType?: string | null;
  gif?: { url?: string | null; previewUrl?: string | null; width?: number | null; height?: number | null } | null;
  media?: Array<{ url?: string | null; type?: string | null }> | null;
};

const HTTP_URL = /^https?:\/\/\S+$/i;

/** True when the whole string is one bare URL and nothing else. */
export const isBareUrl = (text?: string | null): boolean =>
  !!text && HTTP_URL.test(text.trim());

const positive = (n?: number | null): number | undefined =>
  typeof n === "number" && Number.isFinite(n) && n > 0 ? n : undefined;

/**
 * The picture a GIF message should show, or null when the message is not a GIF.
 * Preference order matches how much the sender told us: the `gif` object first,
 * then the mirrored media entry, then the bare URL in the body.
 */
export const resolveChatGif = (message: GifBearingMessage): ChatGif | null => {
  const fromObject = message.gif?.previewUrl || message.gif?.url;
  if (fromObject) {
    return {
      url: fromObject,
      width: positive(message.gif?.width),
      height: positive(message.gif?.height),
    };
  }

  if (message.messageType !== "gif") return null;

  const mirrored = message.media?.find((m) => !!m?.url)?.url;
  if (mirrored) return { url: mirrored };

  const body = message.content?.trim();
  return body && isBareUrl(body) ? { url: body } : null;
};

/**
 * The body text to show under a GIF. Web's GIFs carry the URL as their content,
 * so printing it verbatim is what produced the stray link — drop it when it is
 * only the address of the picture already on screen.
 */
export const gifCaption = (message: GifBearingMessage, gif: ChatGif | null): string => {
  const body = message.content || "";
  if (!gif) return body;
  const trimmed = body.trim();
  if (!trimmed) return "";
  if (trimmed === gif.url) return "";
  if (message.media?.some((m) => m?.url === trimmed)) return "";
  // A bare URL on a message the server already tagged as a GIF is that GIF's
  // address in some other size, not something the sender typed.
  return message.messageType === "gif" && isBareUrl(trimmed) ? "" : body;
};

/**
 * The same idea for the Supabase-backed chats (communities, TV), whose rows are
 * snake_case and carry the picture in `image_url` rather than a `gif` object.
 * Web writes the GIF's URL into `content` there too.
 */
export const chatBodyText = (message: {
  content?: string | null;
  message_type?: string | null;
  image_url?: string | null;
}): string => {
  const body = message.content || "";
  const trimmed = body.trim();
  if (!trimmed) return "";
  if (message.image_url && trimmed === message.image_url.trim()) return "";
  return message.message_type === "gif" && isBareUrl(trimmed) ? "" : body;
};

/** Box a GIF should be drawn in. Sizes are advisory — most senders omit them. */
export const gifBox = (gif: ChatGif, maxWidth = 240, maxHeight = 240) => {
  const width = Math.min(maxWidth, gif.width ?? maxWidth);
  if (!gif.width || !gif.height) return { width, height: Math.min(maxHeight, 180) };
  return { width, height: Math.min(maxHeight, (gif.height / gif.width) * width) };
};
