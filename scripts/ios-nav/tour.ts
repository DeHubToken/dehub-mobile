/**
 * A scripted walk through the app's main page switches, timed frame by frame.
 *
 * Not part of the app: scripts/ios-nav-timing.sh adds an import of this file
 * to the entry file while it bundles for the simulator, and removes it again.
 * It only runs when that script has also written `dehub.perfTour` into the
 * app's storage before launch.
 *
 * Every step performs one navigation the way the app does (same navigators,
 * same profile sheet) and then watches requestAnimationFrame for a while. A
 * frame callback arrives late when either the JavaScript thread or the main
 * thread is busy, so the gaps between callbacks are the time the screen could
 * not update: building a page, or rebuilding one that had been torn down.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { navigationRef } from "../../App";
import { ScreenNames } from "../../navigation/ScreenNames";
import { closeProfileSheetForLink, emitProfileDeepLink } from "../../libs/deeplink.events";

const FLAG_KEY = "dehub.perfTour";
const RESULT_KEY = "dehub.perfTour.result";
/** Set while Settings is open and waiting for the script's edge swipe. */
const SWIPE_KEY = "dehub.perfTour.swipe";
/** emitProfileDeepLink waits this long before it opens the profile. */
const PROFILE_LINK_DELAY_MS = 350;
const FRAME_MS = 1000 / 60;

type StepResult = {
  step: string;
  /** Wall clock at the action, to line the step up with the screen recording. */
  wall: number;
  /** The action call itself: the synchronous part of the navigation. */
  actionMs: number;
  /** Longest time between two frames after the action. */
  worstMs: number;
  /** Frames that took over two frame slots. */
  slowFrames: number;
  /** Time lost to late frames, in total. */
  blockedMs: number;
  /** When the last late frame ended: the screen was free to update from here on. */
  settledMs: number;
  frames: number;
  route: string | undefined;
};

const now = (): number => globalThis.performance.now();
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const nav = navigationRef as unknown as {
  isReady(): boolean;
  navigate(name: string, params?: object): void;
  goBack(): void;
  canGoBack(): boolean;
  getCurrentRoute(): { name: string } | undefined;
  getRootState(): { index: number; routes: { name: string }[] } | undefined;
};

const results: StepResult[] = [];
let extra: Record<string, unknown> = {};

async function save(done: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(RESULT_KEY, JSON.stringify({ done, ...extra, steps: results }));
  } catch {
    // The run still logs every step below.
  }
}

async function measure(step: string, action: () => void, opts: { watchMs?: number; delayMs?: number } = {}): Promise<void> {
  const watchMs = opts.watchMs ?? 1600;
  const stamps: number[] = [];
  let alive = true;
  const loop = () => {
    if (!alive) return;
    stamps.push(now());
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  await sleep(200);
  const wall = Date.now();
  const start = now();
  try {
    action();
  } catch (error) {
    console.error(`[perf-tour] ${step} threw ${String(error)}`);
  }
  const actionMs = now() - start;
  // Some actions only take effect after a fixed wait of their own.
  const origin = start + (opts.delayMs ?? 0);
  await sleep(watchMs + (opts.delayMs ?? 0));
  alive = false;

  const after = stamps.filter((t) => t >= origin);
  let previous = origin;
  let worstMs = 0;
  let slowFrames = 0;
  let blockedMs = 0;
  let settledMs = 0;
  for (const t of after) {
    const gap = t - previous;
    if (gap > worstMs) worstMs = gap;
    if (gap > FRAME_MS * 2) {
      slowFrames += 1;
      blockedMs += gap - FRAME_MS;
      settledMs = t - origin;
    }
    previous = t;
  }
  const result: StepResult = {
    step,
    wall: wall + (opts.delayMs ?? 0),
    actionMs: Math.round(actionMs),
    worstMs: Math.round(worstMs),
    slowFrames,
    blockedMs: Math.round(blockedMs),
    settledMs: Math.round(settledMs),
    frames: after.length,
    route: nav.getCurrentRoute()?.name,
  };
  results.push(result);
  console.error(`[perf-tour] ${JSON.stringify(result)}`);
  await save(false);
  await sleep(900);
}

const tab = (name: string) => () =>
  nav.navigate(ScreenNames.App, { screen: ScreenNames.Root, params: { screen: name } });
const feedTab = (feed: string) => () =>
  nav.navigate(ScreenNames.App, { screen: ScreenNames.Root, params: { screen: ScreenNames.Home, params: { feedTab: feed } } });
const push = (name: string, params?: object) => () => nav.navigate(name, params);
const back = () => () => {
  if (nav.canGoBack()) nav.goBack();
};
const openProfile = (name: string) => () => emitProfileDeepLink(name);
const closeProfile = () => () => closeProfileSheetForLink();

async function run(): Promise<void> {
  const profiles = (await AsyncStorage.getItem(`${FLAG_KEY}.profiles`))?.split(",").filter(Boolean) ?? ["riftn", "araf"];
  const post = (await AsyncStorage.getItem(`${FLAG_KEY}.post`)) || "742";
  extra = { startedAt: Date.now() };

  // A first launch starts in the welcome flow; the walk is of the app itself.
  const root = nav.getRootState();
  if (root?.routes[root.index]?.name !== ScreenNames.App) {
    nav.navigate(ScreenNames.App);
    await sleep(1500);
  }
  // Let the first feed load and its warm-up work finish.
  await sleep(14000);
  extra.firstRoute = nav.getCurrentRoute()?.name;

  // Bottom bar tabs: first visit builds the page, later visits should only show it.
  await measure("tab Explore (first)", tab(ScreenNames.Explore));
  await measure("tab Home (back)", tab(ScreenNames.Home));
  await measure("tab Explore", tab(ScreenNames.Explore));
  await measure("tab Home", tab(ScreenNames.Home));
  await measure("tab Messages (first)", tab(ScreenNames.DM));
  await measure("tab Home from Messages", tab(ScreenNames.Home));
  await measure("tab Messages", tab(ScreenNames.DM));
  await measure("tab Assistant (first)", tab(ScreenNames.AIChat));
  await measure("tab Messages from Assistant", tab(ScreenNames.DM));
  await measure("tab Assistant", tab(ScreenNames.AIChat));
  await measure("tab Home from Assistant", tab(ScreenNames.Home));

  // Home's own feed tabs.
  await measure("feed Shorts", feedTab("short"));
  await measure("feed Images", feedTab("feed-images"));
  await measure("feed Videos", feedTab("video"));
  await measure("feed All", feedTab("all"));

  // Profiles: open, back, the same one again, then a different one.
  const profileStep = { delayMs: PROFILE_LINK_DELAY_MS, watchMs: 2200 };
  await measure(`profile ${profiles[0]} open (first)`, openProfile(profiles[0]), profileStep);
  await measure("profile close", closeProfile());
  await measure(`profile ${profiles[0]} open`, openProfile(profiles[0]), profileStep);
  await measure("profile close 2", closeProfile());
  await measure(`profile ${profiles[1]} open`, openProfile(profiles[1]), profileStep);
  await measure("profile close 3", closeProfile());

  // Pages pushed on the stack, and Back.
  await measure("post open (first)", push(ScreenNames.FeedDetail, { tokenId: post }), { watchMs: 2200 });
  await measure("post back", back());
  await measure("post open", push(ScreenNames.FeedDetail, { tokenId: post }), { watchMs: 2200 });
  await measure("settings over post (two deep)", push(ScreenNames.AccountSettings));
  await measure("back to post", back());
  await measure("back to Home", back());
  await measure("settings open", push(ScreenNames.AccountSettings));
  await measure("settings back", back());
  await measure("search open (first)", push(ScreenNames.Search));
  await measure("search back", back());
  await measure("public chat open (first)", push(ScreenNames.LiveChat), { watchMs: 2200 });
  await measure("public chat back", back());
  await measure("leaderboard open (first)", push(ScreenNames.Leaderboard), { watchMs: 2200 });
  await measure("leaderboard back", back());
  await measure("shorts viewer open", push(ScreenNames.ShortsViewer, {}), { watchMs: 2600 });
  if (nav.getCurrentRoute()?.name === ScreenNames.ShortsViewer) await measure("shorts viewer back", back());
  await measure("notifications open", push(ScreenNames.Notifications), { watchMs: 2200 });
  if (nav.getCurrentRoute()?.name === ScreenNames.Notifications) await measure("notifications back", back());

  // The swipe back from the left edge has to be a real touch, so the script
  // performs it: Settings stays open until it has gone, or the wait runs out.
  nav.navigate(ScreenNames.AccountSettings);
  await sleep(1500);
  await AsyncStorage.setItem(SWIPE_KEY, "ready");
  const waitingSince = Date.now();
  let leftAt = 0;
  while (!leftAt && Date.now() - waitingSince < 20000) {
    await sleep(50);
    if (nav.getCurrentRoute()?.name !== ScreenNames.AccountSettings) leftAt = Date.now();
  }
  await AsyncStorage.removeItem(SWIPE_KEY);
  extra.swipeBack = { went: leftAt > 0, leftAt };
  console.error(`[perf-tour] swipe back ${leftAt ? "left Settings" : "did nothing"}`);
  if (!leftAt && nav.canGoBack()) nav.goBack();

  extra.finishedAt = Date.now();
  await save(true);
  console.error("[perf-tour] done");
}

void (async () => {
  try {
    if ((await AsyncStorage.getItem(FLAG_KEY)) !== "1") return;
    // One walk per launch the script asked for.
    await AsyncStorage.removeItem(FLAG_KEY);
    for (let i = 0; i < 300 && !nav.isReady(); i++) await sleep(200);
    await run();
  } catch (error) {
    console.error(`[perf-tour] failed ${String(error)}`);
    extra.error = String(error);
    await save(true);
  }
})();
