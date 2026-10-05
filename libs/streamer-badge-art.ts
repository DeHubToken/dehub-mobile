/** Shared with mobile's libs/streamer-badge-art.ts. Keep geometry and materials identical. */
export const STREAMER_BADGE_IDS = [
  'first-light', 'ignition', 'on-air', 'marathon', 'night-owl',
  'crowd', 'regular', 'storyteller', 'circle', 'enduring',
  'broadcaster', 'arena', 'iron-streak', 'legend', 'headliner',
  'centurion', 'century', 'cornerstone', 'icon', 'veteran',
] as const;
export type StreamerBadgeId = typeof STREAMER_BADGE_IDS[number];

export interface BadgeMaterial {
  highlight: string; metal: string; shade: string; face: string; edge: string;
  panel: string; text: string; muted: string; flat?: boolean;
}

const silver: BadgeMaterial = {
  highlight: '#ffffff', metal: '#bfc3ca', shade: '#41454e', face: '#14161b', edge: '#737985',
  panel: '#15171b', text: '#f4f4f5', muted: '#b1b4bc',
};
/** Materials follow the sculpted theme button artwork, including its glass and metal finishes. */
export const BADGE_MATERIALS: Record<string, BadgeMaterial> = {
  system: silver,
  minimal: { ...silver, highlight: '#ffffff', metal: '#ffffff', shade: '#ffffff', face: '#000000', panel: '#000000', edge: '#777777', flat: true },
  light: { ...silver, highlight: '#ffffff', metal: '#a9afb9', shade: '#505866', face: '#e4e7eb', panel: '#f5f6f8', text: '#181a20', muted: '#545966' },
  cosmic: { ...silver, highlight: '#e6ddff', metal: '#9a91b8', shade: '#393343', face: '#17131f', panel: '#17131f' },
  hazy: { ...silver, highlight: '#c1fbff', metal: '#a391fc', shade: '#30236a', edge: '#8272c0', face: '#181333', panel: '#181333' },
  swarms: { ...silver, highlight: '#d7ffff', metal: '#49dcff', shade: '#613fa9', edge: '#6985da', face: '#101e40', panel: '#101e32' },
  lavalamp: { ...silver, highlight: '#ffd994', metal: '#ed893b', shade: '#852839', edge: '#b84f3a', face: '#351419', panel: '#291418' },
  winter: { ...silver, highlight: '#f2fbff', metal: '#c7dce6', face: '#17232b', panel: '#141e25' },
  war: { highlight: '#b7ffff', metal: '#4fe3e0', shade: '#215d5c', face: '#0e1412', edge: '#3a9392', panel: '#0e1412', text: '#d9f2ee', muted: '#a0bdb7' },
  osaka: { highlight: '#e4fffc', metal: '#a1dfdf', shade: '#7765a7', face: '#142a2e', edge: '#9bbdc6', panel: '#14232b', text: '#efffff', muted: '#b1c9d0' },
  jungle: { highlight: '#fff6e2', metal: '#c29a64', shade: '#523c26', face: '#261c13', edge: '#8ace74', panel: '#261c13', text: '#f4e9d1', muted: '#c9b998' },
  island: { highlight: '#f2fffb', metal: '#9cd8cf', shade: '#315e61', face: '#102d32', edge: '#79ada8', panel: '#10282d', text: '#e6f7f3', muted: '#a5c5c0' },
  hacker: { highlight: '#dcffe4', metal: '#76df95', shade: '#234a30', face: '#07130c', edge: '#498b5f', panel: '#08170e', text: '#d0f5d9', muted: '#8fb69a' },
  horror: { highlight: '#f8e7e3', metal: '#c5a5a0', shade: '#562b30', face: '#1d1014', edge: '#94535a', panel: '#180d11', text: '#f0dfdc', muted: '#baa1a0' },
};
export const badgeMaterial = (theme: string): BadgeMaterial => BADGE_MATERIALS[theme] ?? silver;

// Emblems share an optical centre and stroke weight across the collection.
const EMBLEMS: Record<StreamerBadgeId, string> = {
  'first-light': 'M35 69H85M43 62a17 17 0 0 1 34 0M60 35v8M35 44l6 6M85 44l-6 6M29 60h8M83 60h8',
  ignition: 'M65 32L43 62h15l-3 26 24-35H63z',
  'on-air': 'M60 51v34M48 85h24M47 43a19 19 0 0 0 0 27M73 43a19 19 0 0 1 0 27M38 34a32 32 0 0 0 0 45M82 34a32 32 0 0 1 0 45M57 53h6v6h-6z',
  marathon: 'M53 31h14M60 31v9M79 38l6 6M60 46a20 20 0 1 0 0 40 20 20 0 0 0 0-40M60 52v15l10 5',
  'night-owl': 'M40 39l8 8q12-7 24 0l8-8v26q0 18-20 24-20-6-20-24zM46 57h10v10H46zM64 57h10v10H64zM55 73l5 6 5-6',
  crowd: 'M52 42a8 8 0 1 0 16 0 8 8 0 0 0-16 0M32 50a6 6 0 1 0 12 0 6 6 0 0 0-12 0M76 50a6 6 0 1 0 12 0 6 6 0 0 0-12 0M46 80V70a14 14 0 0 1 28 0v10M29 79V70a9 9 0 0 1 9-9M91 79V70a9 9 0 0 0-9-9',
  regular: 'M39 42h42v39H39zM48 35v14M72 35v14M39 55h42M49 68l8 7 14-14',
  storyteller: 'M60 48q-13-10-27-5v37q14-5 27 5 13-10 27-5V43q-14-5-27 5v37M40 53l12 3M40 63l12 3M68 56l12-3M68 66l12-3',
  circle: 'M45 42a24 24 0 0 1 38 18M75 80a24 24 0 0 1-38-18M31 47a6 6 0 1 0 12 0 6 6 0 0 0-12 0M77 73a6 6 0 1 0 12 0 6 6 0 0 0-12 0M54 60a6 6 0 1 0 12 0 6 6 0 0 0-12 0',
  enduring: 'M60 60C48 40 30 40 30 60s18 20 30 0c12-20 30-20 30 0S72 80 60 60M43 85h34',
  broadcaster: 'M51 36a9 9 0 0 1 18 0v26a9 9 0 0 1-18 0zM42 58v4a18 18 0 0 0 36 0v-4M60 80v9M48 89h24M55 42h10M55 50h10',
  arena: 'M30 49q30-21 60 0v27q-30 21-60 0zM30 49q30 21 60 0M30 62q30 21 60 0M42 58v25M60 63v25M78 58v25',
  'iron-streak': 'M61 31c3 17 17 23 18 38a19 19 0 0 1-38 0c0-10 6-17 12-23 0 9 2 13 6 16 7-9 7-20 2-31zM60 65c-5 6-9 10-9 15a9 9 0 0 0 18 0c0-5-4-9-9-15z',
  legend: 'M36 48l13 12 11-26 11 26 13-12-7 32H43zM43 87h34M55 72h10',
  headliner: 'M60 32l8 18 20 2-15 14 4 20-17-10-17 10 4-20-15-14 20-2zM30 30l10 9M90 30l-10 9',
  centurion: 'M60 31l25 10v25q-4 16-25 26-21-10-25-26V41zM69 50q-20-10-20 12t20 12',
  century: 'M43 33h34M43 87h34M47 33v14l13 13-13 13v14M73 33v14L60 60l13 13v14M52 81l8-8 8 8z',
  cornerstone: 'M35 81h50v8H35zM42 49h36v32M37 40h46v9H37zM60 30l-27 10h54zM52 54v21M68 54v21',
  icon: 'M60 29l28 21-10 29-18 14-18-14-10-29zM32 50h56M42 79l18-50 18 50M32 50l28 43 28-43M45 50l15 43 15-43',
  veteran: 'M60 40l14 20-14 20-14-20zM38 39q-22 28 8 48M82 39q22 28-8 48M32 50l10 5M30 63l12 3M34 76l11-1M88 50l-10 5M90 63l-12 3M86 76l-11-1M50 92h20',
};

const FRAMES = [
  'M60 9a51 51 0 1 1 0 102 51 51 0 0 1 0-102Z',
  'M60 8L104 33V87L60 112 16 87V33Z',
  'M60 8L102 24V65Q99 93 60 111 21 93 18 65V24Z',
  'M35 10H85L110 35V85L85 110H35L10 85V35Z',
  'M60 8L90 18 108 43V77L90 102 60 112 30 102 12 77V43L30 18Z',
] as const;
const ANGULAR_FRAME = 'M25 11H95L109 25V95L95 109H25L11 95V25Z';
// Fine interior facets disappear first at name size; retain each badge's silhouette.
const COMPACT_EMBLEMS: Partial<Record<StreamerBadgeId, string>> = {
  'on-air': 'M60 50v35M49 85h22M46 41a24 24 0 0 0 0 31M74 41a24 24 0 0 1 0 31',
  'night-owl': 'M40 39l8 8q12-7 24 0l8-8v26q0 18-20 24-20-6-20-24zM49 60h3M68 60h3M55 73l5 6 5-6',
  storyteller: 'M60 48q-13-10-27-5v37q14-5 27 5 13-10 27-5V43q-14-5-27 5v37',
  arena: 'M30 49q30-21 60 0v27q-30 21-60 0zM30 49q30 21 60 0M60 63v25',
  'iron-streak': 'M61 31c3 17 17 23 18 38a19 19 0 0 1-38 0c0-10 6-17 12-23 0 9 2 13 6 16 7-9 7-20 2-31z',
  headliner: 'M60 32l8 18 20 2-15 14 4 20-17-10-17 10 4-20-15-14 20-2z',
  icon: 'M60 29l28 21-10 29-18 14-18-14-10-29zM32 50h56M45 50l15 43 15-43',
  veteran: 'M60 40l14 20-14 20-14-20zM38 39q-22 28 8 48M82 39q22 28-8 48',
};

/** High-resolution SVG for native vectors and the showcase's rasterised textures. */
export function streamerBadgeSvg(id: StreamerBadgeId, theme: string, earned: boolean, instance = 'badge', detail: 'full' | 'compact' = 'full'): string {
  const index = STREAMER_BADGE_IDS.indexOf(id);
  if (index < 0) return '';
  const p = badgeMaterial(theme);
  const key = instance.replace(/[^a-zA-Z0-9_-]/g, '') + id;
  const compact = detail === 'compact';
  const glyph = compact ? COMPACT_EMBLEMS[id] ?? EMBLEMS[id] : EMBLEMS[id];
  const metal = p.flat ? p.metal : `url(#${key}-metal)`;
  const face = p.flat ? p.face : `url(#${key}-face)`;
  const emblem = p.flat ? p.metal : `url(#${key}-emblem)`;
  const frame = theme === 'minimal' || theme === 'war' ? ANGULAR_FRAME : FRAMES[index % 5];
  const rank = Math.floor(index / 5) + 1;
  const marks = Array.from({ length: rank }, (_, n) => {
    const x = 60 + (n - (rank - 1) / 2) * 8;
    return `<path d="M${x} 96l2 2-2 2-2-2Z" fill="${p.metal}"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 120 120" preserveAspectRatio="xMidYMid meet" shape-rendering="geometricPrecision">
    <defs>
      <linearGradient id="${key}-metal" x1="12" y1="8" x2="103" y2="114" gradientUnits="userSpaceOnUse"><stop stop-color="${p.highlight}"/><stop offset=".22" stop-color="${p.metal}"/><stop offset=".48" stop-color="${p.shade}"/><stop offset=".68" stop-color="${p.metal}"/><stop offset=".86" stop-color="${p.highlight}"/><stop offset="1" stop-color="${p.shade}"/></linearGradient>
      <radialGradient id="${key}-face" cx=".32" cy=".18" r=".85"><stop stop-color="${p.edge}"/><stop offset=".38" stop-color="${p.face}"/><stop offset="1" stop-color="${p.panel}"/></radialGradient>
      <linearGradient id="${key}-emblem" x1="38" y1="30" x2="76" y2="94" gradientUnits="userSpaceOnUse"><stop stop-color="${p.highlight}"/><stop offset=".55" stop-color="${p.metal}"/><stop offset="1" stop-color="${p.highlight}"/></linearGradient>
    </defs>
    <g opacity="${earned ? 1 : 0.48}" stroke-linejoin="round" stroke-linecap="round">
      <path d="${frame}" transform="translate(0 1.5)" fill="${p.shade}" stroke="${p.shade}" stroke-width="2"/>
      <path d="${frame}" fill="${metal}" stroke="${p.edge}" stroke-width="1"/>
      ${!compact && !p.flat ? `<path d="${frame}" transform="translate(2.4 2.4) scale(.96)" fill="none" stroke="${p.highlight}" stroke-width=".8" opacity=".6"/>` : ''}
      <path d="${frame}" transform="translate(7.2 7.2) scale(.88)" fill="${face}" stroke="${p.shade}" stroke-width="1.2"/>
      ${!compact ? `<path d="${frame}" transform="translate(9.6 9.6) scale(.84)" fill="none" stroke="${p.edge}" stroke-width=".65" opacity=".6"/>` : ''}
      <g transform="${compact ? 'translate(-4.8 -4.8) scale(1.08)' : 'translate(4.8 3.3) scale(.92)'}" fill="none">
        ${!compact && !p.flat ? `<path d="${glyph}" transform="translate(0 1)" stroke="${p.shade}" stroke-width="5.5"/>` : ''}
        <path d="${glyph}" stroke="${emblem}" stroke-width="${compact ? 4.6 : 3.8}"/>
      </g>
      ${!compact ? marks : ''}
    </g></svg>`;
}

/** Visible frame including its bevel and lower shadow. */
export function streamerBadgeBounds(id: StreamerBadgeId, theme: string) {
  if (theme === 'minimal' || theme === 'war') return { left: 10, top: 10, right: 110, bottom: 111.5 };
  const index = STREAMER_BADGE_IDS.indexOf(id);
  const [left, top, right, bottom] = [
    [8, 8, 112, 113.5], [15, 7, 105, 114.5], [17, 7, 103, 113.5],
    [9, 9, 111, 112.5], [11, 7, 109, 114.5],
  ][Math.max(0, index) % 5];
  return { left, top, right, bottom };
}
