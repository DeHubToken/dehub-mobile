/** A tablet card needs room for the portrait player and a readable text column. */
export function isTabletPortraitFeed(width: number, columnWidth: number, hasSidePanels: boolean): boolean {
  return width >= 768 && width <= 1366 && columnWidth >= 680 && !hasSidePanels;
}

/** Short titles earn a headline; long titles settle back to ordinary post type. */
export function tabletPortraitTitleSize(title: string, normalSize = 17): number {
  const text = title.trim().replace(/\s+/g, ' ');
  const length = Array.from(text).length;
  if (!length || /\r|\n/.test(title) || text.split(' ').some(word => Array.from(word).length > 24)) return normalSize;
  return Math.round(Math.max(normalSize, 26 - Math.max(0, length - 32) * (26 - normalSize) / 32) * 10) / 10;
}
