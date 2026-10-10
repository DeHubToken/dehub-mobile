import type { TFunction } from "i18next";
import type { AgentOp } from "./agent";
import type { EditorTemplate } from "./templates";

export const VIDEO_TEMPLATE_FORMATS = ["9:16", "16:9", "1:1", "4:5"] as const;
export type VideoTemplateAspect = (typeof VIDEO_TEMPLATE_FORMATS)[number];

export function videoTemplateAspect(value: unknown): VideoTemplateAspect | undefined {
  return VIDEO_TEMPLATE_FORMATS.find((aspect) => aspect === value);
}

interface Beat {
  seconds: number;
  headline: string;
  body: string;
  number?: string;
}

interface Starter {
  id: string;
  aliases: string[];
  beats: Beat[];
}

const STARTERS: Starter[] = [
  { id: "question", aliases: ["question hook", "question"], beats: [
    { seconds: 3, headline: "question", body: "questionHint" },
    { seconds: 4, headline: "answer", body: "answerHint" },
    { seconds: 3, headline: "tryIt", body: "nextHint" },
  ] },
  { id: "beforeAfter", aliases: ["before and after", "before after", "before-after"], beats: [
    { seconds: 2, headline: "smallChange", body: "hookHint" },
    { seconds: 4, headline: "before", body: "beforeHint" },
    { seconds: 4, headline: "after", body: "afterHint" },
    { seconds: 2, headline: "difference", body: "nextHint" },
  ] },
  { id: "tips", aliases: ["three tips", "3 tips"], beats: [
    { seconds: 2, headline: "threeTips", body: "saveHint" },
    { seconds: 3, headline: "tipOne", body: "tipHint", number: "01" },
    { seconds: 3, headline: "tipTwo", body: "tipHint", number: "02" },
    { seconds: 3, headline: "tipThree", body: "tipHint", number: "03" },
    { seconds: 3, headline: "tryOne", body: "nextHint" },
  ] },
  { id: "tutorial", aliases: ["quick tutorial", "three steps", "3 steps"], beats: [
    { seconds: 3, headline: "threeSteps", body: "hookHint" },
    { seconds: 3, headline: "getReady", body: "beforeHint", number: "01" },
    { seconds: 3, headline: "mainStep", body: "tipHint", number: "02" },
    { seconds: 3, headline: "checkResult", body: "afterHint", number: "03" },
    { seconds: 3, headline: "yourTurn", body: "nextHint" },
  ] },
  { id: "countdown", aliases: ["countdown", "top five", "top 5"], beats: [
    { seconds: 2, headline: "topFive", body: "hookHint" },
    { seconds: 2, headline: "fifthPick", body: "pickHint", number: "05" },
    { seconds: 2, headline: "fourthPick", body: "pickHint", number: "04" },
    { seconds: 2, headline: "thirdPick", body: "pickHint", number: "03" },
    { seconds: 2, headline: "secondPick", body: "pickHint", number: "02" },
    { seconds: 3, headline: "bestPick", body: "pickHint", number: "01" },
    { seconds: 2, headline: "favourite", body: "nextHint" },
  ] },
  { id: "mythFact", aliases: ["myth and fact", "myth vs fact", "myth fact"], beats: [
    { seconds: 3, headline: "myth", body: "mythHint" },
    { seconds: 5, headline: "fact", body: "answerHint" },
    { seconds: 4, headline: "tryIt", body: "nextHint" },
  ] },
  { id: "product", aliases: ["product reveal", "product launch"], beats: [
    { seconds: 3, headline: "newFavourite", body: "hookHint" },
    { seconds: 5, headline: "productName", body: "productHint" },
    { seconds: 4, headline: "lookCloser", body: "nextHint" },
  ] },
  { id: "announcement", aliases: ["announcement", "big announcement"], beats: [
    { seconds: 3, headline: "comingSoon", body: "hookHint" },
    { seconds: 4, headline: "announcement", body: "announcementHint" },
    { seconds: 3, headline: "bePart", body: "nextHint" },
  ] },
  { id: "story", aliases: ["story arc", "short story", "three act story"], beats: [
    { seconds: 5, headline: "atFirst", body: "beforeHint" },
    { seconds: 5, headline: "thenChanged", body: "turnHint" },
    { seconds: 5, headline: "whatHappened", body: "afterHint" },
  ] },
  { id: "quote", aliases: ["quote reel", "quote"], beats: [
    { seconds: 7, headline: "yourQuote", body: "authorHint" },
    { seconds: 3, headline: "passItOn", body: "nextHint" },
  ] },
];

function starterOps(starter: Starter, t: TFunction, aspect: VideoTemplateAspect): AgentOp[] {
  const ops: AgentOp[] = [{ op: "set_canvas", aspect, background: "#000000" }];
  const duration = starter.beats.reduce((end, beat) => end + beat.seconds, 0);
  let created = 0;
  const layer = (op: AgentOp, start: number, seconds: number, entrance = "fade") => {
    const id = `new:${created++}`;
    ops.push(op, { op: "timing", id, start, duration: seconds });
    if (op.op === "add_text") ops.push({ op: "animate", id, in: entrance, out: "fade" });
  };
  layer({ op: "add_shape", shape: "rect", x: 0.5, y: 0.76, w: 0.08, h: 0.003, fill: "#ffffff" }, 0, duration);
  const wide = aspect === "16:9";
  const base = { op: "add_text", fontFamily: "Inter", color: "#ffffff", x: 0.5, align: "centre", maxWidth: 0.78, lineHeight: 1.1 };
  let start = 0;
  starter.beats.forEach((beat, index) => {
    layer({ ...base, text: beat.number ?? String(index + 1).padStart(2, "0"), y: 0.32, fontSize: 36, fontWeight: 500, letterSpacing: 4, maxHeight: 0.06, color: "#b6b6b6" }, start, beat.seconds);
    layer({ ...base, text: t(`editor.videoTemplates.copy.${beat.headline}`), y: 0.47, fontSize: wide ? 136 : 100, fontWeight: 700, maxHeight: 0.24 }, start, beat.seconds, "rise");
    layer({ ...base, text: t(`editor.videoTemplates.copy.${beat.body}`), y: 0.65, fontSize: wide ? 46 : 36, fontWeight: 400, maxHeight: 0.13, color: "#b6b6b6" }, start, beat.seconds);
    start += beat.seconds;
  });
  return ops;
}

export const VIDEO_TEMPLATES: EditorTemplate[] = STARTERS.map((starter) => ({
  id: `video-${starter.id}`,
  kind: "video",
  aspect: "9:16",
  duration: starter.beats.reduce((end, beat) => end + beat.seconds, 0),
  preview: { bg: "#000000", fg: "#ffffff", font: "Inter" },
  titleKey: `editor.videoTemplates.names.${starter.id}`,
  ops: (t, aspect) => starterOps(starter, t, videoTemplateAspect(aspect) ?? "9:16"),
}));

/** Named starter requests use local operations and never request generated media. */
export function videoTemplateCommand(prompt: string, scene?: unknown): AgentOp | null {
  const text = prompt.trim().toLowerCase().replace(/[.!]$/, "").replace(/\s+/g, " ");
  const match = /^(?:please )?(?:use|apply|create|make) (?:(?:the|a|an) )?(.+?) (?:template|starter|video)(?:(?: in| as)? (9:16|16:9|1:1|4:5)(?: format)?)?$/.exec(text);
  if (!match) return null;
  const starter = STARTERS.find((candidate) => candidate.aliases.includes(match[1].replace(/ video$/, "")));
  if (!starter) return null;
  const page = scene && typeof scene === "object" ? (scene as { page?: { aspect?: unknown } }).page : undefined;
  return { op: "use_template", template: `video-${starter.id}`, aspect: videoTemplateAspect(match[2]) ?? videoTemplateAspect(page?.aspect) ?? "9:16" };
}
