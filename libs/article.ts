/**
 * Article helpers, the same rules as web's src/lib/article.ts so the writer's
 * numbers match what readers see on both platforms.
 */
import { Platform } from 'react-native';
import type { AppThemeName } from '../theme/colors';

/** Characters of writing. Picture markup does not count toward it. */
export const ARTICLE_BODY_MAX = 20000;
export const ARTICLE_BODY_MIN = 100;
export const ARTICLE_SUMMARY_MAX = 500;
/** Pictures inside one article (the cover is separate). Same as web and the backend. */
export const ARTICLE_IMAGE_MAX = 40;
/** Raw body cap: the writing plus room for every picture with a long caption. */
export const ARTICLE_RAW_MAX = ARTICLE_BODY_MAX + ARTICLE_IMAGE_MAX * 450;
export const ARTICLE_CAPTION_MAX = 200;

const IMAGE_MARKUP = /!\[([^\]\n]*)\]\(([^)\s]*)(?:\s+"([^"\n]*)")?\)/g;
/** A line that is only a picture. */
export const ARTICLE_IMAGE_LINE = /^\s*!\[([^\]\n]*)\]\(([^)\s]+)(?:\s+"([^"\n]*)")?\)\s*$/;

export interface ArticleImage { index: number; start: number; end: number; url: string; caption: string }

/** Every picture in the body, in order, with where its markup sits. */
export function articleImages(markdown: string): ArticleImage[] {
  const out: ArticleImage[] = [];
  for (const m of markdown.matchAll(IMAGE_MARKUP)) {
    out.push({ index: out.length, start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, url: m[2], caption: m[3] ?? m[1] });
  }
  return out;
}

/** The writing's length, without picture markup. */
export function articleTextLength(markdown: string): number {
  return markdown.replace(IMAGE_MARKUP, '').trim().length;
}

export function cleanArticleCaption(caption: string): string {
  return caption.replace(/[[\]\n\r]+/g, ' ').replace(/\s{2,}/g, ' ').slice(0, ARTICLE_CAPTION_MAX);
}

export function articleImageMarkdown(url: string, caption = ''): string {
  return `![${cleanArticleCaption(caption)}](${url})`;
}

export function setArticleImageCaption(markdown: string, index: number, caption: string): string {
  const img = articleImages(markdown)[index];
  if (!img) return markdown;
  return markdown.slice(0, img.start) + articleImageMarkdown(img.url, caption) + markdown.slice(img.end);
}

export function removeArticleImage(markdown: string, index: number): string {
  const img = articleImages(markdown)[index];
  if (!img) return markdown;
  return (markdown.slice(0, img.start).replace(/\n+$/, '') + '\n\n' + markdown.slice(img.end).replace(/^\n+/, '')).replace(/^\n+/, '');
}

/** Puts a picture on its own lines at `at`. Returns the body and where the cursor goes. */
export function insertArticleImage(markdown: string, at: number, url: string): { body: string; cursor: number } {
  const pos = Math.min(Math.max(0, at), markdown.length);
  const before = markdown.slice(0, pos).replace(/\n*$/, '');
  const after = markdown.slice(pos).replace(/^\n*/, '');
  const block = `${before ? '\n\n' : ''}${articleImageMarkdown(url)}\n\n`;
  return { body: `${before}${block}${after}`, cursor: before.length + block.length };
}

/** Width and height a picture's address carries (`#w=1200&h=800`). */
export function articleImageSize(url: string | undefined): { w: number; h: number } | null {
  const m = /#w=(\d+)&h=(\d+)$/.exec(url ?? '');
  const w = Number(m?.[1]); const h = Number(m?.[2]);
  return w > 0 && h > 0 ? { w, h } : null;
}

export function articlePlainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/[*_~`]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function articleWordCount(markdown: string): number {
  const text = articlePlainText(markdown);
  return text ? text.split(' ').length : 0;
}

export function articleReadingMinutes(markdown: string): number {
  return Math.max(1, Math.round(articleWordCount(markdown) / 230));
}

export function articleSummaryFromBody(markdown: string): string {
  const para = markdown
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .find(p => p && !/^(#{1,6}\s|>|[-*+]\s|\d+\.\s|!\[)/.test(p));
  const text = articlePlainText(para ?? '');
  if (text.length <= ARTICLE_SUMMARY_MAX) return text;
  const cut = text.slice(0, ARTICLE_SUMMARY_MAX - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 200))}…`;
}

export interface ArticleLook {
  accent: string;
  onAccent: string;
  ink: string;
  ink2: string;
  ink3: string;
  line: string;
  wash: string;
  radius: number;
  /** Reading face: a serif, or monospace where the theme reads as a terminal. */
  font: string | undefined;
  mono: boolean;
}

const SERIF = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, serif' });
const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

const ACCENTS: Partial<Record<AppThemeName, [string, string]>> = {
  cosmic: ['#a5b4fc', '#0b0b1a'],
  hazy: ['#d8b4fe', '#1a0b2e'],
  swarms: ['#fcd34d', '#1f1500'],
  lavalamp: ['#fdba74', '#240f02'],
  winter: ['#bae6fd', '#04121c'],
  island: ['#7dd3fc', '#04121c'],
  horror: ['#f87171', '#1c0404'],
  osaka: ['#ff6fb5', '#2a0718'],
  war: ['#4fe3e0', '#031514'],
  jungle: ['#b9d38a', '#1a2410'],
  hacker: ['#39ff88', '#001a0a'],
  minimal: ['#ffffff', '#000000'],
};

/** The article palette for a theme, matching web's [data-article] tokens. */
export function articleLook(theme: AppThemeName): ArticleLook {
  const [accent, onAccent] = ACCENTS[theme] ?? ['#e4e4e7', '#09090b'];
  const ink = theme === 'jungle' ? '#f6f0e3' : theme === 'hacker' ? '#d6ffe4' : '#ffffff';
  const rgb = theme === 'jungle' ? '246,240,227' : theme === 'hacker' ? '214,255,228' : '255,255,255';
  const mono = theme === 'war' || theme === 'hacker';
  return {
    accent,
    onAccent,
    ink,
    ink2: `rgba(${rgb},0.84)`,
    ink3: `rgba(${rgb},0.56)`,
    line: theme === 'hacker' ? 'rgba(57,255,136,0.22)' : `rgba(${rgb},0.14)`,
    wash: `rgba(${rgb},0.06)`,
    radius: theme === 'war' ? 0 : theme === 'minimal' ? 8 : 16,
    font: mono ? MONO : SERIF,
    mono,
  };
}
