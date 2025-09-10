import { Linking } from "react-native";

/**
 * Normalize a raw social input (username or partial/full link) into a full https URL for a given host.
 * @param rawLink username or link (may start with @) e.g. @user, user, https://x.com/user
 * @param host domain host e.g. x.com, instagram.com, t.me
 */
export const getSocialLink = (rawLink: string, host: string): string => {
  if (!rawLink) return '#';
  let trimmed = rawLink.trim();
  // If already a full URL containing host, just normalize scheme and encode spaces
  if (trimmed.includes(host)) {
    if (!/^https?:\/\//i.test(trimmed)) trimmed = `https://${trimmed}`;
    // Replace spaces with %20
    return trimmed.replace(/\s/g, '%20');
  }
  // Remove protocol remnants if user pasted partial
  trimmed = trimmed.replace(/^https?:\/\//i, '');
  // For discord usernames like name#1234 keep only name portion since discriminator not resolvable without user id
  if (host === 'discord.com' && /#/.test(trimmed)) {
    trimmed = trimmed.split('#')[0];
  }
  // Strip leading @ (except tiktok where we will add one explicitly)
  if (trimmed.startsWith('@')) trimmed = trimmed.slice(1);
  // Remove internal spaces
  trimmed = trimmed.replace(/\s+/g, '');
  // Build segment; for tiktok prefix @ in URL path
  const segment = host === 'tiktok.com' ? `@${trimmed}` : trimmed;
  if (!segment) return '#';
  return `https://${host}/${encodeURIComponent(segment)}`;
};

/** Open an external URL, adding https scheme if absent. */
export async function openExternalLink(rawUrl?: string) {
  if (!rawUrl) return;
  try {
    let url = rawUrl.trim();
    if (url === '#' || url.length < 2) return;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    // Encode any spaces that slipped through
    url = url.replace(/\s/g, '%20');
    if (/^https?:\/\//i.test(url)) {
      await Linking.openURL(url);
      return;
    }
    const ok = await Linking.canOpenURL(url);
    if (ok) await Linking.openURL(url); else console.warn('[openExternalLink] cannot open', url);
  } catch (e) {
    console.warn('[openExternalLink] failed', e);
  }
}

export default { getSocialLink, openExternalLink };
