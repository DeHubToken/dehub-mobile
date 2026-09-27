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
};
export const badgeMaterial = (theme: string): BadgeMaterial => BADGE_MATERIALS[theme] ?? silver;

// Each collectible has its own engraved emblem, independent of its earned state.
const EMBLEMS: Record<StreamerBadgeId, string> = {
  'first-light': 'M35 69H85M43 62a17 17 0 0 1 34 0M60 35v8M35 44l6 6M85 44l-6 6M29 60h8M83 60h8',
  ignition: 'M65 32L43 62h15l-3 26 24-35H63z',
  'on-air': 'M60 51v34M48 85h24M47 43a19 19 0 0 0 0 27M73 43a19 19 0 0 1 0 27M38 34a32 32 0 0 0 0 45M82 34a32 32 0 0 1 0 45M57 53h6v6h-6z',
  marathon: 'M53 31h14M60 31v9M79 38l6 6M60 46a20 20 0 1 0 0 40 20 20 0 0 0 0-40M60 52v15l10 5',
  'night-owl': 'M40 39l8 8q12-7 24 0l8-8v26q0 18-20 24-20-6-20-24zM46 57h10v10H46zM64 57h10v10H64zM55 73l5 6 5-6',
  crowd: 'M52 42a8 8 0 1 0 16 0 8 8 0 0 0-16 0M39 52a6 6 0 1 0 0 .1M81 52a6 6 0 1 0 0 .1M46 80V69q0-12 14-12t14 12v11M30 80V70q0-10 10-10M90 80V70q0-10-10-10',
  regular: 'M39 42h42v39H39zM48 35v14M72 35v14M39 55h42M49 68l8 7 14-14',
  storyteller: 'M60 48q-13-10-27-5v37q14-5 27 5 13-10 27-5V43q-14-5-27 5v37M40 53l12 3M40 63l12 3M68 56l12-3M68 66l12-3',
  circle: 'M43 45a24 24 0 0 1 38 17M79 76a24 24 0 0 1-38-4M37 47a6 6 0 1 0 0 .1M84 69a6 6 0 1 0 0 .1M54 59a6 6 0 1 0 12 0 6 6 0 0 0-12 0',
  enduring: 'M60 60C42 32 25 43 30 63s19 19 30-3c18-28 35-17 30 3S71 82 60 60M40 84h40',
  broadcaster: 'M51 36a9 9 0 0 1 18 0v26a9 9 0 0 1-18 0zM42 58v4a18 18 0 0 0 36 0v-4M60 80v9M48 89h24M55 42h10M55 50h10',
  arena: 'M30 49q30-21 60 0v27q-30 21-60 0zM30 49q30 21 60 0M30 62q30 21 60 0M42 58v25M60 63v25M78 58v25',
  'iron-streak': 'M63 30q7 20-4 29 3-13-7-17-2 15-12 23-12 25 19 27 30-2 23-25-3-12-12-18 3 12-5 16 7-20-2-35z',
  legend: 'M36 48l13 12 11-26 11 26 13-12-7 32H43zM43 87h34M55 72h10',
  headliner: 'M60 32l8 18 20 2-15 14 4 20-17-10-17 10 4-20-15-14 20-2zM30 30l10 9M90 30l-10 9',
  centurion: 'M60 31l25 10v25q-4 16-25 26-21-10-25-26V41zM69 50q-20-10-20 12t20 12',
  century: 'M43 33h34M43 87h34M47 33v14l13 13-13 13v14M73 33v14L60 60l13 13v14M52 81l8-8 8 8z',
  cornerstone: 'M35 81h50v8H35zM42 49h36v32M37 40h46v9H37zM60 30l-27 10h54zM52 54v21M68 54v21',
  icon: 'M60 29l28 21-10 29-18 14-18-14-10-29zM32 50h56M42 79l18-50 18 50M32 50l28 43 28-43M45 50l15 43 15-43',
  veteran: 'M60 40l14 20-14 20-14-20zM38 39q-22 28 8 48M82 39q22 28-8 48M32 50l10 5M30 63l12 3M34 76l11-1M88 50l-10 5M90 63l-12 3M86 76l-11-1M50 92h20',
};

/** Pure SVG, supported by browser SVG and react-native-svg; no image downloads or filters. */
export function streamerBadgeSvg(id: StreamerBadgeId, theme: string, earned: boolean, instance = 'badge'): string {
  const index = STREAMER_BADGE_IDS.indexOf(id);
  if (index < 0) return '';
  const p = badgeMaterial(theme);
  const key = instance.replace(/[^a-zA-Z0-9_-]/g, '') + id;
  const metal = p.flat ? p.metal : `url(#${key}-metal)`;
  const frame = theme === 'minimal' || theme === 'war'
    ? 'M22 12H98L110 24V96L98 108H22L10 96V24Z'
    : [
      'M60 8a52 52 0 1 1 0 104 52 52 0 0 1 0-104Z',
      'M60 6L103 31V87L60 114 17 87V31Z',
      'M60 7L103 23V66Q99 95 60 113 21 95 17 66V23Z',
      'M34 9H86L111 34V86L86 111H34L9 86V34Z',
      'M60 5L76 17 96 19 102 40 115 60 102 80 96 101 76 103 60 115 44 103 24 101 18 80 5 60 18 40 24 19 44 17Z',
    ][index % 5];
  const ticks = Array.from({ length: Math.floor(index / 5) + 1 }, (_, n) =>
    `<path d="M${48 + n * 8} 99h4" stroke="${p.edge}" stroke-width="2"/>`).join('');
  const texture = theme === 'jungle'
    ? Array.from({ length: 7 }, (_, n) => `<path d="M20 ${25+n*11}Q50 ${15+n*11} 100 ${27+n*11}" fill="none" stroke="${p.metal}" stroke-width=".7" opacity=".18"/>`).join('')
    : theme === 'swarms' || theme === 'war'
      ? Array.from({ length: 7 }, (_, n) => `<path d="M${24+n*12} 20v80M20 ${24+n*12}h80" fill="none" stroke="${p.metal}" stroke-width=".5" opacity=".16"/>`).join('')
      : theme === 'winter' || theme === 'osaka' || theme === 'cosmic'
        ? Array.from({ length: 18 }, (_, n) => `<circle cx="${25+(n*23)%70}" cy="${23+(n*37)%74}" r="${n%3===0 ? 1 : .5}" fill="${p.highlight}" opacity=".35"/>`).join('')
        : theme === 'lavalamp' || theme === 'hazy'
          ? `<path d="M25 85Q95 90 55 55T90 25M20 40Q80 20 73 77T35 100" fill="none" stroke="${p.metal}" stroke-width="9" opacity=".09"/>`
          : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
    <defs><linearGradient id="${key}-metal" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0" stop-color="${p.highlight}"/><stop offset=".24" stop-color="${p.metal}"/><stop offset=".47" stop-color="${p.shade}"/><stop offset=".51" stop-color="${p.highlight}"/><stop offset=".73" stop-color="${p.metal}"/><stop offset="1" stop-color="${p.shade}"/></linearGradient><clipPath id="${key}-clip"><path d="${frame}"/></clipPath></defs>
    <g opacity="${earned ? 1 : 0.48}"><path d="${frame}" transform="translate(0 2)" fill="${p.shade}" stroke="${p.shade}" stroke-width="4"/><path d="${frame}" fill="${p.face}" stroke="${metal}" stroke-width="4"/>
    <g clip-path="url(#${key}-clip)">${texture}</g>
    <path d="${frame}" transform="translate(8.4 8.4) scale(.86)" fill="none" stroke="${p.edge}" stroke-width=".8"/>
    ${!p.flat ? `<path d="M30 27Q60 12 90 27" fill="none" stroke="${p.highlight}" stroke-opacity=".35"/>` : ''}
    <path d="${EMBLEMS[id]}" transform="translate(0 2)" fill="none" stroke="${p.shade}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="${EMBLEMS[id]}" fill="none" stroke="${metal}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>
    ${ticks}</g></svg>`;
}
