import { Share, Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import env from "../config/env";

/** Keep the production text-card route in step with the web share drawer. */
export function getTextPostShareImageUrl(tokenId: number | string): string {
  if (!/^[1-9]\d{0,14}$/.test(String(tokenId))) throw new Error("Invalid post id");
  return `https://dehub.io/_og/post/v3/${tokenId}.png`;
}

/**
 * Downloads the backend OG image for a post and shares it as a PNG file.
 * Falls back to URL-only share if download fails.
 */
export async function sharePostAsImage(
  tokenId: number | string,
  postUrl: string,
  caption?: string,
  postType?: string,
): Promise<void> {
  const isText = postType === "feed-simple" || postType === "text";
  const ogImageUrl = isText
    ? getTextPostShareImageUrl(tokenId)
    : `${env.API_URL?.replace(/\/api\/?$/, "")}/og-image/${tokenId}`;
  const localPath = `${FileSystem.cacheDirectory}dehub-post-${tokenId}.png`;

  try {
    // Android shares the link and lets its recipient load the same OG card.
    // Avoid downloading an image that this platform's share sheet never uses.
    if (Platform.OS !== "ios") {
      await Share.share({ message: `${caption || "Check this out on DeHub"}\n${postUrl}` });
      return;
    }
    const { status, headers } = await FileSystem.downloadAsync(ogImageUrl, localPath);
    const imageType = Object.entries(headers || {}).find(([name]) => name.toLowerCase() === "content-type")?.[1];

    if (status === 200 && (!isText || imageType?.toLowerCase().startsWith("image/png"))) {
      await Share.share({
        url: localPath,
        message: caption ? `${caption}\n${postUrl}` : postUrl,
      });
    } else {
      throw new Error(`Download failed: ${status}`);
    }
  } catch {
    // Fallback: plain URL share
    await Share.share(
      Platform.select({
        ios: { message: postUrl, url: postUrl },
        default: { message: `${caption || "Check this out on DeHub"}\n${postUrl}` },
      }) as any,
    );
  }
}
