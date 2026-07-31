import { Share, Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import env from "../config/env";

/**
 * Downloads the backend OG image for a post and shares it as a PNG file.
 * Falls back to URL-only share if download fails.
 */
export async function sharePostAsImage(
  tokenId: number | string,
  postUrl: string,
  caption?: string,
): Promise<void> {
  const ogImageUrl = `${env.API_URL?.replace(/\/api\/?$/, "")}/og-image/${tokenId}`;
  const localPath = `${FileSystem.cacheDirectory}dehub-post-${tokenId}.png`;

  try {
    const { status } = await FileSystem.downloadAsync(ogImageUrl, localPath);

    if (status === 200) {
      // iOS supports file:// URIs directly in Share.share
      // Android needs expo-sharing — fall back to URL share there
      if (Platform.OS === "ios") {
        await Share.share({
          url: localPath,
          message: caption || postUrl,
        });
      } else {
        // Android: share the web URL (OG preview will load from meta tags)
        await Share.share({ message: `${caption || "Check this out on DeHub"}\n${postUrl}` });
      }
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
