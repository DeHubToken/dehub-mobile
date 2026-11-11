import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { shareWithRef } from "./shareRef";
import { translateCopy as _translateCopy } from "../i18n/copy";

/**
 * The site's post share card (text, photo and video posts alike), the same
 * picture link previews and the web share drawer use.
 */
export function getTextPostShareImageUrl(tokenId: number | string): string {
  if (!/^[1-9]\d{0,14}$/.test(String(tokenId))) throw new Error("Invalid post id");
  return `https://riftn.com/_og/post/v6/${tokenId}.png`;
}

/**
 * Downloads the post's share card and shares it as a PNG file.
 * Falls back to URL-only share if download fails, or when the post may only
 * show the generic brand card (mature, restricted, missing).
 */
export async function sharePostAsImage(
  tokenId: number | string,
  postUrl: string,
  caption?: string,
  _postType?: string,
): Promise<void> {
  const ogImageUrl = getTextPostShareImageUrl(tokenId);
  const localPath = `${FileSystem.cacheDirectory}dehub-post-${tokenId}.png`;

  try {
    // Android shares the link and lets its recipient load the same OG card.
    // Avoid downloading an image that this platform's share sheet never uses.
    if (Platform.OS !== "ios") {
      await shareWithRef({ message: `${caption || _translateCopy("copy.bc1ce78b29e6", { defaultValue: "Check this out on Riftn" })}\n${postUrl}` }, undefined, "post");
      return;
    }
    const { status, headers } = await FileSystem.downloadAsync(ogImageUrl, localPath);
    const header = (key: string) => Object.entries(headers || {}).find(([name]) => name.toLowerCase() === key)?.[1];
    const isCard = header("content-type")?.toLowerCase().startsWith("image/png") && header("x-dehub-share-card") !== "brand";

    if (status === 200 && isCard) {
      await shareWithRef({
        url: localPath,
        message: caption ? `${caption}\n${postUrl}` : postUrl,
      }, undefined, "post");
    } else {
      throw new Error(`Download failed: ${status}`);
    }
  } catch {
    // Fallback: plain URL share
    await shareWithRef(
      Platform.select({
        ios: { message: postUrl, url: postUrl },
        default: { message: `${caption || _translateCopy("copy.bc1ce78b29e6", { defaultValue: "Check this out on Riftn" })}\n${postUrl}` },
      }) as any,
      undefined,
      "post",
    );
  }
}
