/**
 * Mini app registry reads — the app side of dehubweb's src/lib/miniapp/registry.ts.
 *
 * `miniapp_apps` is public for live apps only (RLS), so these use the
 * publishable key. Both degrade to "nothing listed" rather than throwing:
 * an empty store beats an error screen.
 */
import { supabase } from "./supabase";
import { withWalletHeader } from "../libs/supabase-wallet-client";

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
  /** Where payments go: the wallet that signed the domain's dehub.json. */
  owner_wallet: string | null;
}

const COLUMNS =
  "id, slug, domain, home_url, name, subtitle, description, icon_url, splash_background_color, category, tier, owner_wallet";

// The generated Database types predate these tables.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export async function fetchListedApps(): Promise<MiniAppListing[]> {
  const { data, error } = await db
    .from("miniapp_apps")
    .select(COLUMNS)
    .in("tier", ["listed", "verified"])
    .order("name", { ascending: true })
    .limit(200);
  if (error) return [];
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

async function userCall<T>(sessionToken: string, functionsBase: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${functionsBase}/functions/v1/miniapp-user`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-dehub-token": sessionToken },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error || "The request failed."), { code: "failed" });
  return data as T;
}

/** Add an app for the signed-in person; its notifications are on. */
export function addMiniApp(sessionToken: string, functionsBase: string, slug: string) {
  return userCall<{ added: true }>(sessionToken, functionsBase, { action: "add", slug });
}

export function removeMiniApp(sessionToken: string, functionsBase: string, slug: string) {
  return userCall<{ removed: true }>(sessionToken, functionsBase, { action: "remove", slug });
}

/** Record a payment the app just sent, and get the signed receipt for the app's server. */
export function recordMiniAppPayment(
  sessionToken: string,
  functionsBase: string,
  input: { slug: string; txHash: string; chainId: number; amount: number; memo: string | null },
) {
  return userCall<{ txHash: string; chainId: number; amount: number; receipt: string }>(sessionToken, functionsBase, {
    action: "payment",
    ...input,
  });
}

export interface AddedApp {
  app_id: string;
  notifications_on: boolean;
  miniapp_apps: Pick<MiniAppListing, "slug" | "name" | "icon_url" | "subtitle" | "domain"> | null;
}

/** The apps this person has added. RLS scopes the rows to the signed-in wallet. */
export async function fetchAddedApps(wallet: string | null | undefined): Promise<AddedApp[]> {
  if (!wallet) return [];
  const { data, error } = await withWalletHeader(
    db.from("miniapp_installs").select("app_id, notifications_on, miniapp_apps(slug, name, icon_url, subtitle, domain)"),
    wallet.toLowerCase(),
  );
  if (error) return [];
  return (data ?? []) as AddedApp[];
}
