// Referral deep links: the invite link plus a DeHub page to land on.

/**
 * Reduce input to a safe same-origin path, or null — web's
 * lib/affiliateDeepLink. `/r/<code>/<path>` credits the referrer and then
 * sends the visitor to `/<path>`, so only DeHub paths are allowed through.
 * Parsed by hand: React Native's URL does not implement hostname/pathname.
 */
export function sanitizeDeepLinkPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let value = String(raw).trim();
  if (!value) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    const m = /^https?:\/\/([^/?#]+)(.*)$/i.exec(value);
    if (!m) return null;
    const host = m[1].replace(/:\d+$/, "").toLowerCase();
    if (!/(^|\.)dehub\.io$/.test(host)) return null;
    value = m[2] || "/";
  }
  value = value.replace(/\\/g, "/");
  if (!value.startsWith("/")) value = `/${value}`;
  if (/^\/{2,}/.test(value)) return null;
  if (value === "/") return null;
  // A deep link back onto a referral landing would loop.
  if (/^\/r\//i.test(value)) return null;
  return value;
}

/** The shareable `/r/<code><path>` link for a destination page, from the plain invite link. */
export function buildReferralDeepLink(inviteLink: string, rawPath: string): string {
  const base = inviteLink.replace(/\/+$/, "");
  const path = sanitizeDeepLinkPath(rawPath);
  return path ? `${base}${path}` : base;
}
