/**
 * DeHub Builder client. Same `builder-api` edge function as dehubweb's
 * src/lib/builder/api.ts (wallet-native auth via x-wallet-address +
 * x-dehub-token), plus the public URLs a generated app is served from.
 */
import env from "../config/env";
import { supabase } from "./supabase";
import { dehubAuthHeaders } from "./ai.service";
import { SHARE_ORIGIN } from "../libs/dehub-links";

export type BuilderStatus = "queued" | "generating" | "publishing" | "updating" | "live" | "error";
export type BuilderModel = "best" | "fast";

export interface BuilderProject {
  id: string;
  name: string;
  emoji: string;
  prompt: string;
  status: BuilderStatus;
  status_detail: string | null;
  error: string | null;
  version: number;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface BuilderMessage {
  id: string;
  role: "user" | "agent" | "log";
  content: string;
  created_at: string;
}

export interface BuilderFile {
  path: string;
  content: string;
}

export interface BuilderAllowance {
  used: number;
  limit: number;
  tierName: string;
}

export const BUSY_STATUSES: ReadonlySet<string> = new Set(["queued", "generating", "publishing", "updating"]);

/** Public Storage directory the generated files live in (trailing slash). */
export function builderStorageBase(projectId: string): string {
  return `${env.SUPABASE_URL}/storage/v1/object/public/builder-apps/${projectId}/`;
}

/** The dehub.io link that renders the app for anyone — what share/copy hand out. */
export function builderShareUrl(projectId: string): string {
  return `${SHARE_ORIGIN}/builder/preview/${projectId}`;
}

async function invokeBuilder<T>(wallet: string | null | undefined, body: Record<string, unknown>): Promise<T> {
  const headers = await dehubAuthHeaders(wallet);
  if (!headers["x-dehub-token"] || !headers["x-wallet-address"]) throw new Error("Sign in to use the Builder.");
  const { data, error } = await supabase.functions.invoke("builder-api", { body, headers });
  if (error) {
    // functions.invoke swallows non-2xx bodies; surface the server's message.
    const ctx = (error as { context?: any }).context;
    let payload: { error?: string } | null = null;
    try {
      if (ctx && typeof ctx.json === "function") payload = await ctx.json();
      else if (typeof ctx?.body === "string") payload = JSON.parse(ctx.body);
    } catch {
      /* not JSON */
    }
    throw new Error(payload?.error || error.message || "Builder request failed");
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export const fetchBuilderAllowance = (wallet?: string | null) =>
  invokeBuilder<{ allowance: BuilderAllowance }>(wallet, { action: "allowance" });

export const listBuilderProjects = (wallet?: string | null) =>
  invokeBuilder<{ projects: BuilderProject[] }>(wallet, { action: "list" });

export const createBuilderProject = (wallet: string | null | undefined, prompt: string, model: BuilderModel) =>
  invokeBuilder<{ projectId: string; allowance: BuilderAllowance }>(wallet, { action: "create", prompt, model });

export const sendBuilderMessage = (
  wallet: string | null | undefined,
  projectId: string,
  content: string,
  model: BuilderModel,
) => invokeBuilder<{ ok: boolean; allowance: BuilderAllowance }>(wallet, { action: "send", projectId, content, model });

export const getBuilderProject = (wallet: string | null | undefined, projectId: string) =>
  invokeBuilder<{ project: BuilderProject; messages: BuilderMessage[]; files: BuilderFile[] }>(wallet, {
    action: "get",
    projectId,
  });

export const removeBuilderProject = (wallet: string | null | undefined, projectId: string) =>
  invokeBuilder<{ ok: boolean }>(wallet, { action: "remove", projectId });

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
