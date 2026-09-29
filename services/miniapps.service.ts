/**
 * Mini app registry reads — the app side of dehubweb's src/lib/miniapp/registry.ts.
 *
 * `miniapp_apps` is public for live apps only (RLS), so these use the
 * publishable key. The reads never throw. The store list comes back `null` on a
 * failed read so the store can say so and offer a retry, instead of telling
 * an offline user that no apps exist.
 */
import { supabase } from "./supabase";

export interface MiniAppListing {
  id: string;
  slug: string;
  domain: string;
  home_url: string;
  name: string;
  subtitle: string | null;
  description: string | null;
  icon_url: string | null;
  splash_background_color: string | null;
  category: string | null;
  tier: "unlisted" | "listed" | "verified";
}

const COLUMNS =
  "id, slug, domain, home_url, name, subtitle, description, icon_url, splash_background_color, category, tier";

// The generated Database types predate these tables.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** Listed and verified apps, or `null` when the read failed (offline, server error). */
export async function fetchListedApps(): Promise<MiniAppListing[] | null> {
  const { data, error } = await db
    .from("miniapp_apps")
    .select(COLUMNS)
    .in("tier", ["listed", "verified"])
    .order("name", { ascending: true })
    .limit(200);
  if (error) return null;
  return (data ?? []) as MiniAppListing[];
}

export async function fetchAppBySlug(slug: string): Promise<MiniAppListing | null> {
  if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(slug)) return null;
  const { data, error } = await db.from("miniapp_apps").select(COLUMNS).eq("slug", slug).maybeSingle();
  if (error) return null;
  return (data as MiniAppListing | null) ?? null;
}

/** Ask miniapp-auth for a token addressed to `domain`, as the signed-in user. */
export async function mintMiniAppToken(
  sessionToken: string,
  domain: string,
  functionsBase: string,
): Promise<{ token: string; expiresAt: number }> {
  const res = await fetch(`${functionsBase}/functions/v1/miniapp-auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-dehub-token": sessionToken },
    body: JSON.stringify({ domain }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || typeof body?.token !== "string") {
    throw Object.assign(new Error(body?.error || "Sign-in failed."), { code: res.status === 401 ? "signin" : "failed" });
  }
  return { token: body.token, expiresAt: Number(body.expiresAt) };
}

/** A live app registered for this domain, if any — how a plain link to an app's site opens the app. */
export async function fetchAppByDomain(domain: string): Promise<MiniAppListing | null> {
  const host = domain.toLowerCase();
  if (!/^[a-z0-9.-]{3,253}$/.test(host)) return null;
  const { data, error } = await db.from("miniapp_apps").select(COLUMNS).eq("domain", host).maybeSingle();
  if (error) return null;
  return (data as MiniAppListing | null) ?? null;
}
