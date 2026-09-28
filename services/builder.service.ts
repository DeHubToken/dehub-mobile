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
