/**
 * Where DeHub Builder apps live, and how to render one.
 *
 * Builds are started from Messages now — @assistant calls dehubweb's
 * `builder-api` function on the user's behalf — so the app no longer talks to it.
 * What is left is the public address a generated app is served from and the
 * renderer the /builder/preview/:id screen uses, which is where the links the
 * bot sends land.
 */
import env from "../config/env";
import { SHARE_ORIGIN } from "../libs/dehub-links";
import { getAuthToken } from "../libs/auth.utils";
import { tokenRefreshManager } from "../libs/token-refresh";

/** Public Storage directory the generated files live in (trailing slash). */
export function builderStorageBase(projectId: string): string {
  return `${env.SUPABASE_URL}/storage/v1/object/public/builder-apps/${projectId}/`;
}

/** The dehub.io link that renders the app for anyone — what share/copy hand out. */
export function builderShareUrl(projectId: string): string {
  return `${SHARE_ORIGIN}/builder/preview/${projectId}`;
}

// Storage serves the uploaded HTML as text/plain, so a WebView pointed at it
// shows source instead of an app. Fetch the text and render it ourselves, with
// a <base> so relative assets (app.js, style.css) still resolve to Storage,
// and an in-memory storage shim for apps that expect localStorage.
const STORAGE_SHIM = `<script>(function(){
  function mk(){var m={};return{getItem:function(k){return Object.prototype.hasOwnProperty.call(m,k)?m[k]:null;},setItem:function(k,v){m[k]=String(v);},removeItem:function(k){delete m[k];},clear:function(){m={};},key:function(i){return Object.keys(m)[i]||null;},get length(){return Object.keys(m).length;}};}
  try{window.localStorage.setItem('__probe','1');window.localStorage.removeItem('__probe');}
  catch(e){try{Object.defineProperty(window,'localStorage',{value:mk(),configurable:true});}catch(_){}}
  try{window.sessionStorage.setItem('__probe','1');window.sessionStorage.removeItem('__probe');}
  catch(e){try{Object.defineProperty(window,'sessionStorage',{value:mk(),configurable:true});}catch(_){}}
})();</script>`;

export function wrapAppHtml(html: string, projectId: string): string {
  const head = `<base href="${builderStorageBase(projectId)}">${STORAGE_SHIM}`;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => `${m}${head}`);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (m) => `${m}<head>${head}</head>`);
  return `<head>${head}</head>${html}`;
}

/** Fetch a generated app's index.html, wrapped for rendering. Throws while it is still building. */
export async function loadBuilderAppHtml(projectId: string, version?: number): Promise<string> {
  const bust = version ? `?v=${version}` : `?t=${Date.now()}`;
  const res = await fetch(`${builderStorageBase(projectId)}index.html${bust}`, { cache: "no-store" } as RequestInit);
  if (!res.ok) throw new Error(`App not ready (${res.status})`);
  return wrapAppHtml(await res.text(), projectId);
}

// ── Own-origin hosting + owner controls ────────────────────────────────────
// Each app lives at https://<slug>.dhb.gg. Owners manage it through
// dehubweb's builder-api function with their DeHub token.

export const BUILDER_APPS_DOMAIN = "dhb.gg";

export function builderAppUrl(slug: string): string {
  return `https://${slug}.${BUILDER_APPS_DOMAIN}/`;
}

export interface PublicBuilderApp {
  slug: string | null;
  name: string;
  emoji: string;
  version: number;
  url: string | null;
}

/** A public app's address, or null when it is private or does not exist. */
export async function resolvePublicApp(projectId: string): Promise<PublicBuilderApp | null> {
  const res = await fetch(`${env.SUPABASE_URL}/functions/v1/builder-serve?app=${encodeURIComponent(projectId)}`);
  if (!res.ok) return null;
  return res.json();
}

/** True once <slug>.dhb.gg answers — false while DNS is still moving. */
export async function appHostReachable(url: string): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch(url, { method: "HEAD", signal: ctrl.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export interface BuilderProject {
  id: string;
  name: string;
  emoji: string;
  status: string;
  version: number;
  is_public: boolean;
  slug: string | null;
  miniapp_app_id: string | null;
}

export interface BuilderListing {
  slug: string;
  status: string;
  tier: "unlisted" | "listed" | "verified";
  published: boolean;
}

export interface BuilderVersion {
  version: number;
  name: string;
  emoji: string;
  summary: string;
  created_at: string;
}

export interface BuilderModel {
  id: string;
  label: string;
  typicalMicros: number;
  maxMicros: number;
}

export interface BuilderPricing {
  model: string;
  markup: number;
  models: BuilderModel[];
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  await tokenRefreshManager.ensureFreshToken();
  const token = await getAuthToken();
  if (!token) throw new Error("Sign in first");
  const res = await fetch(`${env.SUPABASE_URL}/functions/v1/builder-api`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-dehub-token": token },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) throw new Error(data?.error || `Builder request failed (${res.status})`);
  return data as T;
}

export const builderApi = {
  /** The project, if the signed-in wallet owns it. Throws otherwise. */
  get: (projectId: string) =>
    call<{ project: BuilderProject; url: string | null; listing: BuilderListing | null }>({ action: "get", projectId }),
  versions: (projectId: string) => call<{ current: number; versions: BuilderVersion[] }>({ action: "versions", projectId }),
  restore: (projectId: string, version: number) => call<{ version: number }>({ action: "restore", projectId, version }),
  setVisibility: (projectId: string, isPublic: boolean) => call<{ isPublic: boolean }>({ action: "set_visibility", projectId, isPublic }),
  setSlug: (projectId: string, slug: string) => call<{ slug: string; url: string }>({ action: "set_slug", projectId, slug }),
  previewUrl: (projectId: string) => call<{ url: string; publicUrl: string; expiresAt: string | null }>({ action: "preview_url", projectId }),
  publish: (projectId: string) => call<{ appSlug: string; tier: string; storeUrl: string }>({ action: "publish", projectId }),
  unpublish: (projectId: string) => call<{ ok: true }>({ action: "unpublish", projectId }),
  /** Models a build can use, what each typically costs per prompt (micros = millionths of USD), and the user's pick. */
  pricing: () => call<BuilderPricing>({ action: "pricing" }),
  setModel: (model: string) => call<{ model: string }>({ action: "set_model", model }),
};
