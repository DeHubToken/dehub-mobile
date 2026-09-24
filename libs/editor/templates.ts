/**
 * Starter templates, identical to the web's (dehubweb src/lib/editor/templates.ts).
 * A template is a list of the same operations the AI agent returns, so there
 * are no template files to ship: shapes and text are drawn by the editor and
 * photos come from the free stock library when a template is picked. Words go
 * through t(), so every template opens in the phone's language.
 */
import type { TFunction } from "i18next";
import type { AspectPreset } from "./types";
import type { AgentOp } from "./agent";

export interface EditorTemplate {
  id: string;
  aspect: AspectPreset;
  /** Preview tile colours and font; the real thing is built from ops. */
  preview: { bg: string; fg: string; font: string };
  titleKey: string;
  ops: (t: TFunction) => AgentOp[];
}

const W = "#ffffff";

export const TEMPLATES: EditorTemplate[] = [
  {
    id: "sale",
    aspect: "1:1",
    preview: { bg: "#f59e0b", fg: W, font: "Anton" },
    titleKey: "editor.templates.sale.title",
    ops: (t) => [
      { op: "set_canvas", aspect: "1:1", background: "#0e7490" },
      { op: "add_stock", query: "palm trees tropical beach", kind: "photo", orientation: "square", fit: "cover" },
      { op: "effects", id: "new:0", preset: "sunny" },
      { op: "add_shape", shape: "rect", x: 0.5, y: 0.5, w: 0.84, h: 0.34, fill: "#000000", opacity: 0.5, radius: 32 },
      { op: "add_text", text: t("editor.templates.sale.title"), x: 0.5, y: 0.45, fontSize: 170, fontWeight: 400, fontFamily: "Anton", color: W, uppercase: true },
      { op: "add_text", text: t("editor.templates.sale.subtitle"), x: 0.5, y: 0.58, fontSize: 50, fontWeight: 600, fontFamily: "Montserrat", color: "#fde68a" },
    ],
  },
  {
    id: "quote",
    aspect: "1:1",
    preview: { bg: "#111827", fg: "#f9fafb", font: "Playfair Display" },
    titleKey: "editor.templates.quote.title",
    ops: (t) => [
      { op: "set_canvas", aspect: "1:1", background: "#111827" },
      { op: "add_text", text: "“", x: 0.5, y: 0.24, fontSize: 320, fontWeight: 700, fontFamily: "Playfair Display", color: "#f59e0b" },
      { op: "add_text", text: t("editor.templates.quote.body"), x: 0.5, y: 0.5, fontSize: 70, fontWeight: 500, fontFamily: "Playfair Display", italic: true, color: "#f9fafb", lineHeight: 1.3 },
      { op: "add_shape", shape: "line", x: 0.5, y: 0.7, w: 0.12, h: 0.01, fill: "#f59e0b", strokeColor: "#f59e0b", strokeWidth: 6 },
      { op: "add_text", text: t("editor.templates.quote.author"), x: 0.5, y: 0.77, fontSize: 40, fontWeight: 600, fontFamily: "Inter", color: "#9ca3af", uppercase: true, letterSpacing: 6 },
    ],
  },
  {
    id: "thumbnail",
    aspect: "16:9",
    preview: { bg: "#7f1d1d", fg: "#facc15", font: "Anton" },
    titleKey: "editor.templates.thumbnail.title",
    ops: (t) => [
      { op: "set_canvas", aspect: "16:9", background: "#111111" },
      { op: "add_stock", query: "dramatic city night", kind: "photo", orientation: "landscape", fit: "cover" },
      { op: "effects", id: "new:0", preset: "moody" },
      { op: "add_text", text: t("editor.templates.thumbnail.title"), x: 0.06, y: 0.42, align: "left", fontSize: 210, fontWeight: 400, fontFamily: "Anton", color: "#facc15", uppercase: true, strokeColor: "#000000", strokeWidth: 10, rotation: -3 },
      { op: "add_shape", shape: "rect", x: 0.2, y: 0.72, w: 0.26, h: 0.12, fill: "#dc2626", radius: 16 },
      { op: "add_text", text: t("editor.templates.thumbnail.badge"), x: 0.2, y: 0.72, fontSize: 64, fontWeight: 900, fontFamily: "Montserrat", color: W, uppercase: true },
    ],
  },
  {
    id: "story",
    aspect: "9:16",
    preview: { bg: "#6d28d9", fg: W, font: "Bebas Neue" },
    titleKey: "editor.templates.story.title",
    ops: (t) => [
      { op: "set_canvas", aspect: "9:16", background: "#6d28d9" },
      { op: "add_stock", query: "neon city lights", kind: "photo", orientation: "portrait", x: 0.5, y: 0.45, scale: 0.9 },
      { op: "style", id: "new:0", radius: 48, shadow: true },
      { op: "add_text", text: t("editor.templates.story.title"), x: 0.5, y: 0.1, fontSize: 190, fontWeight: 400, fontFamily: "Bebas Neue", color: W, uppercase: true, letterSpacing: 4 },
      { op: "add_text", text: t("editor.templates.story.cta"), x: 0.5, y: 0.88, fontSize: 56, fontWeight: 800, fontFamily: "Poppins", color: "#6d28d9", bgColor: W, bgOpacity: 1 },
    ],
  },
  {
    id: "event",
    aspect: "4:5",
    preview: { bg: "#0f172a", fg: "#38bdf8", font: "Bebas Neue" },
    titleKey: "editor.templates.event.title",
    ops: (t) => [
      { op: "set_canvas", aspect: "4:5", background: "#0f172a" },
      { op: "add_shape", shape: "ellipse", x: 0.85, y: 0.12, w: 0.6, h: 0.48, fill: "#38bdf8", opacity: 0.25, blend: "screen" },
      { op: "add_shape", shape: "ellipse", x: 0.1, y: 0.9, w: 0.5, h: 0.4, fill: "#e879f9", opacity: 0.2, blend: "screen" },
      { op: "add_text", text: t("editor.templates.event.title"), x: 0.08, y: 0.36, align: "left", fontSize: 200, fontWeight: 400, fontFamily: "Bebas Neue", color: W, lineHeight: 0.95 },
      { op: "add_shape", shape: "rect", x: 0.2, y: 0.56, w: 0.24, h: 0.008, fill: "#38bdf8" },
      { op: "add_text", text: t("editor.templates.event.date"), x: 0.08, y: 0.64, align: "left", fontSize: 60, fontWeight: 700, fontFamily: "Space Grotesk", color: "#38bdf8" },
      { op: "add_text", text: t("editor.templates.event.place"), x: 0.08, y: 0.71, align: "left", fontSize: 44, fontWeight: 500, fontFamily: "Space Grotesk", color: "#cbd5e1" },
    ],
  },
  {
    id: "podcast",
    aspect: "1:1",
    preview: { bg: "#18181b", fg: "#a3e635", font: "Archivo" },
    titleKey: "editor.templates.podcast.title",
    ops: (t) => [
      { op: "set_canvas", aspect: "1:1", background: "#18181b" },
      { op: "add_stock", query: "podcast microphone studio", kind: "photo", orientation: "square", fit: "cover" },
      { op: "effects", id: "new:0", preset: "bw" },
      { op: "add_shape", shape: "rect", x: 0.5, y: 0.82, w: 1, h: 0.36, fill: "#18181b", opacity: 0.85 },
      { op: "add_text", text: t("editor.templates.podcast.title"), x: 0.07, y: 0.77, align: "left", fontSize: 96, fontWeight: 900, fontFamily: "Archivo", color: W },
      { op: "add_text", text: t("editor.templates.podcast.episode"), x: 0.07, y: 0.88, align: "left", fontSize: 44, fontWeight: 700, fontFamily: "Archivo", color: "#a3e635", uppercase: true, letterSpacing: 4 },
      { op: "add_shape", shape: "ellipse", x: 0.86, y: 0.14, w: 0.16, h: 0.16, fill: "#a3e635" },
    ],
  },
  {
    id: "announcement",
    aspect: "16:9",
    preview: { bg: "#fafafa", fg: "#111111", font: "Inter" },
    titleKey: "editor.templates.announcement.title",
    ops: (t) => [
      { op: "set_canvas", aspect: "16:9", background: "#fafafa" },
      { op: "add_text", text: t("editor.templates.announcement.kicker"), x: 0.08, y: 0.3, align: "left", fontSize: 40, fontWeight: 700, fontFamily: "Inter", color: "#7c3aed", uppercase: true, letterSpacing: 8 },
      { op: "add_text", text: t("editor.templates.announcement.title"), x: 0.08, y: 0.48, align: "left", fontSize: 150, fontWeight: 800, fontFamily: "Inter", color: "#111111", letterSpacing: -4 },
      { op: "add_shape", shape: "arrow", x: 0.2, y: 0.7, w: 0.22, h: 0.04, fill: "#7c3aed", strokeColor: "#7c3aed", strokeWidth: 10 },
    ],
  },
  {
    id: "crypto",
    aspect: "1:1",
    preview: { bg: "#000000", fg: "#22c55e", font: "Space Grotesk" },
    titleKey: "editor.templates.crypto.title",
    ops: (t) => [
      { op: "set_canvas", aspect: "1:1", background: "#000000" },
      { op: "add_shape", shape: "rect", x: 0.5, y: 0.5, w: 0.88, h: 0.88, fill: "none", strokeColor: "#22c55e", strokeWidth: 4, radius: 40 },
      { op: "add_text", text: "DHB", x: 0.5, y: 0.34, fontSize: 280, fontWeight: 700, fontFamily: "Space Grotesk", color: W, letterSpacing: -8 },
      { op: "add_text", text: t("editor.templates.crypto.change"), x: 0.5, y: 0.56, fontSize: 96, fontWeight: 700, fontFamily: "Space Grotesk", color: "#22c55e" },
      { op: "add_shape", shape: "arrow", x: 0.5, y: 0.73, w: 0.3, h: 0.05, rotation: -30, fill: "#22c55e", strokeColor: "#22c55e", strokeWidth: 12 },
      { op: "add_text", text: t("editor.templates.crypto.title"), x: 0.5, y: 0.87, fontSize: 38, fontWeight: 500, fontFamily: "Space Mono", color: "#71717a", uppercase: true },
    ],
  },
  {
    id: "birthday",
    aspect: "4:5",
    preview: { bg: "#fce7f3", fg: "#be185d", font: "Pacifico" },
    titleKey: "editor.templates.birthday.title",
    ops: (t) => [
      { op: "set_canvas", aspect: "4:5", background: "#fce7f3" },
      { op: "add_stock", query: "confetti celebration", kind: "photo", orientation: "portrait", fit: "cover" },
      { op: "place", id: "new:0", opacity: 0.35 },
      { op: "add_text", text: t("editor.templates.birthday.title"), x: 0.5, y: 0.42, fontSize: 150, fontWeight: 400, fontFamily: "Pacifico", color: "#be185d" },
      { op: "add_text", text: t("editor.templates.birthday.name"), x: 0.5, y: 0.58, fontSize: 90, fontWeight: 800, fontFamily: "Poppins", color: "#831843" },
      { op: "add_shape", shape: "heart", x: 0.5, y: 0.75, w: 0.12, h: 0.1, fill: "#ec4899" },
    ],
  },
  {
    id: "meme",
    aspect: "1:1",
    preview: { bg: "#3f3f46", fg: W, font: "Anton" },
    titleKey: "editor.templates.meme.title",
    ops: (t) => [
      { op: "set_canvas", aspect: "1:1", background: "#000000" },
      { op: "add_stock", query: "cat", kind: "photo", orientation: "square", fit: "cover" },
      { op: "add_text", text: t("editor.templates.meme.top"), x: 0.5, y: 0.1, fontSize: 110, fontWeight: 400, fontFamily: "Anton", color: W, uppercase: true, strokeColor: "#000000", strokeWidth: 10 },
      { op: "add_text", text: t("editor.templates.meme.bottom"), x: 0.5, y: 0.9, fontSize: 110, fontWeight: 400, fontFamily: "Anton", color: W, uppercase: true, strokeColor: "#000000", strokeWidth: 10 },
    ],
  },
];

export function templateOps(id: string, t: TFunction): AgentOp[] | null {
  const tpl = TEMPLATES.find((x) => x.id === id);
  return tpl ? tpl.ops(t) : null;
}
