/**
 * Print-on-demand providers a creator can link a store listing to.
 *
 * A POD listing is made and shipped by the provider, and checkout happens on
 * the provider's site, so these listings never go through DHB checkout (the
 * quote function refuses any listing with an external_url). The slugs match
 * the store_listings.pod_provider check constraint.
 */

export const POD_PROVIDERS = [
  { value: "spring", label: "Spring (Teespring)", hosts: ["spri.ng", "creator-spring.com", "teespring.com"] },
  { value: "zazzle", label: "Zazzle", hosts: ["zazzle.com", "zazzle.co.uk", "zazzle.ca", "zazzle.com.au", "zazzle.de", "zazzle.fr", "zazzle.es"] },
  { value: "printful", label: "Printful", hosts: ["printful.com"] },
  { value: "fourthwall", label: "Fourthwall", hosts: ["fourthwall.com", "fourthwall.app"] },
  { value: "printify", label: "Printify", hosts: ["printify.com", "printify.me"] },
  { value: "redbubble", label: "Redbubble", hosts: ["redbubble.com"] },
  { value: "other", label: "Other", hosts: [] as string[] },
] as const;

export type PodProvider = (typeof POD_PROVIDERS)[number]["value"];

/** Parses a pasted shop link; null unless it is a well-formed https URL. */
export function parsePodUrl(raw: string): URL | null {
  try {
    const url = new URL(raw.trim());
    return url.protocol === "https:" && url.hostname.includes(".") && raw.length <= 2048 ? url : null;
  } catch {
    return null;
  }
}

/** Guesses the provider from the link"s host; "other" when it is not one we know. */
export function detectPodProvider(raw: string): PodProvider {
  const url = parsePodUrl(raw);
  if (!url) return "other";
  const host = url.hostname.toLowerCase();
  const hit = POD_PROVIDERS.find(p => p.hosts.some(h => host === h || host.endsWith(`.${h}`)));
  return hit?.value ?? "other";
}

export function podProviderLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const p = POD_PROVIDERS.find(x => x.value === value);
  return p && p.value !== "other" ? p.label : null;
}
