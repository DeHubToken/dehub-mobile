/**
 * Article helpers, the same rules as web's src/lib/article.ts so the writer's
 * numbers match what readers see on both platforms.
 */
import { Platform } from 'react-native';
import type { AppThemeName } from '../theme/colors';

export const ARTICLE_BODY_MAX = 20000;
export const ARTICLE_BODY_MIN = 100;
export const ARTICLE_SUMMARY_MAX = 500;

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
