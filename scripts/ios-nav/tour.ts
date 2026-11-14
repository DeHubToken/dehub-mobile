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
/** The script screenshots the simulator each time this changes. */
const SHOT_KEY = "dehub.perfTour.shot";
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

async function measure(step: string, action: () => void, opts: { watchMs?: number; delayMs?: number; restMs?: number } = {}): Promise<void> {
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
  await sleep(opts.restMs ?? 900);
}

const tab = (name: string) => () =>
  nav.navigate(ScreenNames.App, { screen: ScreenNames.Root, params: { screen: name } });
const feedTab = (feed: string) => () =>
  nav.navigate(ScreenNames.App, { screen: ScreenNames.Root, params: { screen: ScreenNames.Home, params: { feedTab: feed } } });
const push = (name: string, params?: object) => () => nav.navigate(name, params);
// Never from a bottom-bar tab: under those is the welcome flow a fresh install
// started in, and a page that did not open (signed out) must not lead there.
const back = () => () => {
  const route = nav.getCurrentRoute()?.name;
  if (nav.canGoBack() && route && !TAB_ROUTES.includes(route)) nav.goBack();
};
const openProfile = (name: string) => () => emitProfileDeepLink(name);
const closeProfile = () => () => closeProfileSheetForLink();

/**
 * Every page that opens without being handed something (a post, a chat, a
 * file). Signed-in pages are included: signed out they show their sign-in
 * state, which has to open as fast as the page would.
 */
const PAGES = [
  "AccountSettings", "NotificationSettings", "PrivacySettings", "ActiveSessions", "EditProfile",
  "Search", "Notifications", "LiveChat", "FeatureRequests", "Planned", "Feedback",
  "Leaderboard", "Top100", "Stats", "Communities", "Creators", "Events", "Stages", "Cinema", "TV",
  "YourVideos", "LikedVideos", "SavedPosts", "MyLibrary", "Drafts", "UploadQueue", "Earnings", "Affiliate",
  "Premium", "Pricing", "SuperPowers", "Usernames", "Accounts", "Packs", "Fractions", "NftMarket",
  "Governance", "Dao", "Launchpad", "Raffle", "Bridge", "Dex", "Dpay", "DePin", "Converter",
  "Agents", "Builder", "Apps", "Arcade", "Work", "Creator", "CreatorStudio", "CreatorLearning",
  "Connect", "Compare", "Guide", "Glossary", "Careers", "Ads", "CommandCentre", "Migrate",
] as const;

const TAB_ROUTES: string[] = [ScreenNames.Home, ScreenNames.Explore, ScreenNames.DM, ScreenNames.AIChat];

/** The script samples the app's threads for a while once this is set. */
const SAMPLE_KEY = "dehub.perfTour.sample";

/**
 * Signed out, the Messages and Assistant tabs and the account pages do not
 * open: the app shows its sign-in sheet instead, which then covers every
 * later step. Those steps only run with a session.
 */
async function hasSession(): Promise<boolean> {
  try {
    const { getAuthToken } = require("../../libs/auth.utils") as { getAuthToken(): Promise<string | null> };
    return !!(await getAuthToken());
  } catch {
    return false;
  }
}

/** Pages the app only has for a signed-in account. */
const ACCOUNT_PAGES = new Set([
  "AccountSettings", "NotificationSettings", "PrivacySettings", "ActiveSessions", "EditProfile", "Notifications",
  "LiveChat", "YourVideos", "LikedVideos", "SavedPosts", "MyLibrary", "Drafts", "UploadQueue", "Earnings",
  "Affiliate", "Dex", "Dpay", "Ads", "CommandCentre",
]);

const shot = (name: string) => AsyncStorage.setItem(SHOT_KEY, name).catch(() => undefined);

/** Back out of whatever is open until a bottom-bar tab is showing again. */
async function backToTabs(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    const route = nav.getCurrentRoute()?.name;
    if (!route || TAB_ROUTES.includes(route) || !nav.canGoBack()) return;
    nav.goBack();
    await sleep(500);
  }
}

/** Opens every page twice: the first visit builds it, the second shows what was kept. */
async function runPages(): Promise<void> {
  extra = { startedAt: Date.now(), mode: "pages" };
  const root = nav.getRootState();
  if (root?.routes[root.index]?.name !== ScreenNames.App) {
    nav.navigate(ScreenNames.App);
    await sleep(1500);
  }
  await sleep(14000);
  const names = ScreenNames as unknown as Record<string, string>;
  const signedIn = await hasSession();
  extra.signedIn = signedIn;
  let index = 0;
  for (const page of PAGES) {
    const name = names[page];
    index += 1;
    if (!name || (!signedIn && ACCOUNT_PAGES.has(page))) continue;
    const label = `${String(index).padStart(2, "0")}-${page}`;
    await measure(`${page} open (first)`, push(name), { watchMs: 2400, restMs: 300 });
    const reached = nav.getCurrentRoute()?.name === name;
    // Pictures: the page once it has settled, and (below) the page half a
    // second into its second visit, when anything it kept should be showing.
    await shot(label);
    await sleep(900);
    await measure(`${page} back`, back(), { watchMs: 900, restMs: 300 });
    await backToTabs();
    if (!reached) continue;
    await measure(`${page} open again`, () => {
      nav.navigate(name);
      setTimeout(() => void shot(`${label}-again`), 450);
    }, { watchMs: 1500, restMs: 300 });
    await measure(`${page} back again`, back(), { watchMs: 900, restMs: 300 });
    await backToTabs();
  }
  extra.finishedAt = Date.now();
  await save(true);
  console.error("[perf-tour] done");
}

type ElementType = string | { displayName?: string; name?: string; render?: ElementType; type?: ElementType } | null;

function typeName(type: ElementType): string {
  if (typeof type === "string") return type;
  if (!type) return "null";
  return type.displayName || type.name || (type.render ? typeName(type.render) : "") || (type.type ? typeName(type.type) : "") || "anonymous";
}

/**
 * What the app does during a switch, for finding where the time goes: which
 * components were drawn again (counted where the app's JSX runtime creates
 * their elements), and, for the script's thread sampler, a run of plain tab
 * switches. Needs a bundle that kept its function names (--minify false).
 */
async function runProbe(): Promise<void> {
  extra = { startedAt: Date.now(), mode: "probe" };
  const root = nav.getRootState();
  if (root?.routes[root.index]?.name !== ScreenNames.App) {
    nav.navigate(ScreenNames.App);
    await sleep(1500);
  }
  await sleep(14000);

  let counts: Map<string, number> | null = null;
  const runtime = require("../../libs/jsx/jsx-runtime") as Record<string, (type: ElementType, ...rest: unknown[]) => unknown>;
  for (const key of ["jsx", "jsxs"]) {
    const original = runtime[key];
    runtime[key] = function counted(type: ElementType, ...rest: unknown[]) {
      if (counts) {
        const name = typeName(type);
        counts.set(name, (counts.get(name) ?? 0) + 1);
      }
      return original(type, ...rest);
    };
  }
  const drawn: Record<string, { total: number; top: [string, number][] }> = {};
  const probe = async (step: string, action: () => void, opts: { watchMs?: number; delayMs?: number } = {}) => {
    counts = new Map();
    await measure(step, action, { watchMs: 1800, restMs: 100, ...opts });
    const all = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    counts = null;
    drawn[step] = { total: all.reduce((sum, entry) => sum + entry[1], 0), top: all.slice(0, 40) };
    extra.drawn = drawn;
    await save(false);
    await sleep(500);
  };

  const signedIn = await hasSession();
  extra.signedIn = signedIn;
  const light = signedIn ? [ScreenNames.DM, ScreenNames.AIChat] : [ScreenNames.Explore, ScreenNames.Home];
  // Visit everything once first, so the counts are of switches, not first builds.
  for (const name of [ScreenNames.Explore, ...(signedIn ? light : []), ScreenNames.Home]) {
    tab(name)();
    await sleep(2500);
  }

  await probe("idle", () => undefined);
  if (signedIn) {
    await probe("tab Messages", tab(ScreenNames.DM));
    await probe("tab Assistant", tab(ScreenNames.AIChat));
    await probe("tab Messages again", tab(ScreenNames.DM));
  }
  await probe("tab Home", tab(ScreenNames.Home));
  await probe("tab Explore", tab(ScreenNames.Explore));
  await probe("tab Home again", tab(ScreenNames.Home));
  await probe("idle on Home", () => undefined);
  await probe("feed Shorts", feedTab("short"));
  await probe("feed All", feedTab("all"));
  await probe("profile open", openProfile("riftn"), { delayMs: PROFILE_LINK_DELAY_MS, watchMs: 2200 });
  await probe("profile close", closeProfile());
  await probe("post open", push(ScreenNames.FeedDetail, { tokenId: "742" }), { watchMs: 2200 });
  await probe("post back", back());
  await probe("search open", push(ScreenNames.Search));
  await probe("search back", back());

  // For the sampler: the two lightest tabs, back and forth, then Home and Explore.
  await AsyncStorage.setItem(SAMPLE_KEY, "light");
  await sleep(3000);
  extra.sampleLightAt = Date.now();
  for (let i = 0; i < 8; i++) {
    tab(light[i % 2])();
    await sleep(1100);
  }
  await sleep(2500);
  tab(ScreenNames.Home)();
  await sleep(2500);
  await AsyncStorage.setItem(SAMPLE_KEY, "home");
  await sleep(3000);
  for (let i = 0; i < 6; i++) {
    tab(i % 2 ? ScreenNames.Home : ScreenNames.Explore)();
    await sleep(1600);
  }
  await sleep(2500);

  extra.finishedAt = Date.now();
  await save(true);
  console.error("[perf-tour] done");
}

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
  const signedIn = await hasSession();
  extra.signedIn = signedIn;

  // Bottom bar tabs: first visit builds the page, later visits should only show it.
  await measure("tab Explore (first)", tab(ScreenNames.Explore));
  await measure("tab Home (back)", tab(ScreenNames.Home));
  await measure("tab Explore", tab(ScreenNames.Explore));
  await measure("tab Home", tab(ScreenNames.Home));
  if (signedIn) {
    await measure("tab Messages (first)", tab(ScreenNames.DM));
    await measure("tab Home from Messages", tab(ScreenNames.Home));
    await measure("tab Messages", tab(ScreenNames.DM));
    await measure("tab Assistant (first)", tab(ScreenNames.AIChat));
    await measure("tab Messages from Assistant", tab(ScreenNames.DM));
    await measure("tab Assistant", tab(ScreenNames.AIChat));
    await measure("tab Home from Assistant", tab(ScreenNames.Home));
  } else {
    await measure("tab Explore 3", tab(ScreenNames.Explore));
    await measure("tab Home 3", tab(ScreenNames.Home));
  }

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
  const second = signedIn ? ScreenNames.AccountSettings : ScreenNames.Leaderboard;
  await measure(`${signedIn ? "settings" : "leaderboard"} over post (two deep)`, push(second));
  await measure("back to post", back());
  await measure("back to Home", back());
  if (signedIn) {
    await measure("settings open", push(ScreenNames.AccountSettings));
    await measure("settings back", back());
  }
  await measure("search open (first)", push(ScreenNames.Search));
  await measure("search back", back());
  if (signedIn) {
    await measure("public chat open (first)", push(ScreenNames.LiveChat), { watchMs: 2200 });
    await measure("public chat back", back());
  }
  await measure("leaderboard open (first)", push(ScreenNames.Leaderboard), { watchMs: 2200 });
  await measure("leaderboard back", back());
  await measure("shorts viewer open", push(ScreenNames.ShortsViewer, {}), { watchMs: 2600 });
  if (nav.getCurrentRoute()?.name === ScreenNames.ShortsViewer) await measure("shorts viewer back", back());
  if (signedIn) {
    await measure("notifications open", push(ScreenNames.Notifications), { watchMs: 2200 });
    if (nav.getCurrentRoute()?.name === ScreenNames.Notifications) await measure("notifications back", back());
  }

  // The swipe back from the left edge has to be a real touch, so the script
  // performs it: the Leaderboard stays open until it has gone, or the wait
  // runs out.
  nav.navigate(ScreenNames.Leaderboard);
  await sleep(1500);
  const opened = nav.getCurrentRoute()?.name === ScreenNames.Leaderboard;
  let leftAt = 0;
  if (opened) {
    await AsyncStorage.setItem(SWIPE_KEY, "ready");
    const waitingSince = Date.now();
    while (!leftAt && Date.now() - waitingSince < 20000) {
      await sleep(50);
      if (nav.getCurrentRoute()?.name !== ScreenNames.Leaderboard) leftAt = Date.now();
    }
    await AsyncStorage.removeItem(SWIPE_KEY);
  }
  extra.swipeBack = { opened, went: leftAt > 0, leftAt };
  console.error(`[perf-tour] swipe back ${!opened ? "page did not open" : leftAt ? "went back" : "did nothing"}`);
  if (!leftAt) back()();

  extra.finishedAt = Date.now();
  await save(true);
  console.error("[perf-tour] done");
}

void (async () => {
  try {
    const mode = await AsyncStorage.getItem(FLAG_KEY);
    if (mode !== "1" && mode !== "pages" && mode !== "probe") return;
    // One walk per launch the script asked for.
    await AsyncStorage.removeItem(FLAG_KEY);
    for (let i = 0; i < 300 && !nav.isReady(); i++) await sleep(200);
    if (mode === "pages") await runPages();
    else if (mode === "probe") await runProbe();
    else await run();
  } catch (error) {
    console.error(`[perf-tour] failed ${String(error)}`);
    extra.error = String(error);
    await save(true);
  }
})();
