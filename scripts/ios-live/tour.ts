/**
 * Opens a stream that is live right now, the way the Live now row does, and
 * logs everything that goes wrong on the way. Not part of the app:
 * scripts/ios-live-check.sh adds an import of this file to the entry file
 * while it bundles for the simulator, and removes it again.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { navigationRef } from "../../App";
import { ScreenNames } from "../../navigation/ScreenNames";

const FLAG_KEY = "dehub.liveCheck";
const RUNS_KEY = "dehub.liveCheck.runs";
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const say = (line: string) => console.error(`[live-check] ${line}`);
const nav = navigationRef as unknown as {
  isReady(): boolean;
  navigate(name: string, params?: object): void;
  getCurrentRoute(): { name: string } | undefined;
  getRootState(): { index: number; routes: { name: string }[] } | undefined;
};

// Warnings are dropped from a release build's device log; errors are kept.
const warn = console.warn.bind(console);
console.warn = (...args: unknown[]) => {
  warn(...args);
  try {
    console.error(`[warn] ${args.map((a) => (a instanceof Error ? `${a.message}\n${a.stack}` : typeof a === "string" ? a : JSON.stringify(a))).join(" ").slice(0, 1500)}`);
  } catch {
    // Not worth a second fault.
  }
};

const errorUtils = (globalThis as unknown as { ErrorUtils?: { getGlobalHandler(): (e: unknown, fatal?: boolean) => void; setGlobalHandler(h: (e: unknown, fatal?: boolean) => void): void } }).ErrorUtils;

async function main(): Promise<void> {
  const flag = await AsyncStorage.getItem(FLAG_KEY);
  if (!flag) return;
  const runs = Number(await AsyncStorage.getItem(RUNS_KEY)) || 0;
  await AsyncStorage.setItem(RUNS_KEY, String(runs + 1));
  say(`launch ${runs + 1}`);
  // After the app's own handler is installed, so this one sees the fault first.
  await sleep(1500);
  if (errorUtils) {
    const previous = errorUtils.getGlobalHandler();
    errorUtils.setGlobalHandler((error, fatal) => {
      const e = error as { message?: string; stack?: string };
      say(`uncaught fatal=${String(fatal)} ${String(e?.message)}\n${String(e?.stack).slice(0, 3000)}`);
      previous(error, fatal);
    });
  }
  if (runs >= 2) {
    say("third launch: staying on Home");
    return;
  }
  for (let i = 0; i < 300 && !nav.isReady(); i++) await sleep(200);
  const root = nav.getRootState();
  if (root?.routes[root.index]?.name !== ScreenNames.App) nav.navigate(ScreenNames.App);
  await sleep(9000);
  say(`on ${String(nav.getCurrentRoute()?.name)}`);
  let stream: { _id?: string; tokenId?: number; provider?: string; title?: string } | undefined;
  try {
    const res = await fetch("https://api.dehub.io/api/live?status=LIVE&limit=10");
    const list = (await res.json()) as { _id?: string; tokenId?: number; status?: string; provider?: string; title?: string }[];
    stream = list.find((s) => s.status === "LIVE");
  } catch (error) {
    say(`live list failed ${String(error)}`);
  }
  if (!stream?._id) {
    say("nobody is live");
    return;
  }
  say(`opening ${stream._id} ${String(stream.provider)} ${String(stream.title)}`);
  nav.navigate(ScreenNames.LiveViewer, {
    streamId: stream._id,
    isLive: true,
    ...(stream.tokenId != null ? { tokenId: stream.tokenId } : {}),
  });
  for (let i = 1; i <= 10; i++) {
    await sleep(2000);
    say(`after ${i * 2}s on ${String(nav.getCurrentRoute()?.name)}`);
  }
  say("done");
}

void main().catch((error) => say(`failed ${String(error)}`));
