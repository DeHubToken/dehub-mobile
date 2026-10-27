/**
 * Turns what people type in the When sheet ("fri 8pm", "tomorrow noon",
 * "in 2 hours", "30 oct 7:30pm") into a date. English words only; the sheet
 * still has the picks and the day strip for everything else.
 * Kept identical to dehubweb src/lib/schedule/parseWhen.ts.
 */
export interface ParsedWhen {
  at: Date;
  /** False when only a day was typed: the caller keeps its own time. */
  hasTime: boolean;
}

const WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
};
const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5,
  jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};
const PARTS: Record<string, number> = { noon: 12 * 60, midday: 12 * 60, midnight: 0, morning: 9 * 60, afternoon: 15 * 60, evening: 19 * 60, night: 21 * 60 };
const UNITS: Record<string, number> = { m: 1, min: 1, mins: 1, minute: 1, minutes: 1, h: 60, hr: 60, hrs: 60, hour: 60, hours: 60, d: 1440, day: 1440, days: 1440, w: 10080, week: 10080, weeks: 10080 };
const FILLER = new Set(['at', 'on', 'this', 'the', 'of', '@']);

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export function parseWhen(input: string, now: Date = new Date()): ParsedWhen | null {
  const text = input.toLowerCase().replace(/[,.]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return null;

  const rel = text.match(/^in (\d+|an?|half an?) ?([a-z]+)$/);
  if (rel && UNITS[rel[2]]) {
    const n = /^\d+$/.test(rel[1]) ? Number(rel[1]) : rel[1].startsWith('half') ? 0.5 : 1;
    return { at: new Date(now.getTime() + n * UNITS[rel[2]] * 60_000), hasTime: true };
  }

  let rest = ` ${text} `;
  const take = (re: RegExp) => {
    const m = rest.match(re);
    if (m) rest = rest.replace(m[0], ' ');
    return m;
  };

  // Time first, so "8" in "fri 8pm" is never read as a date.
  let minutes: number | null = null;
  let ampm: string | undefined;
  const clock = take(/ (\d{1,2})(?::(\d{2}))? ?(am|pm|a|p)(?= )/) ?? take(/ (\d{1,2}):(\d{2})(?= )/);
  if (clock) {
    let h = Number(clock[1]);
    const m = clock[2] ? Number(clock[2]) : 0;
    ampm = clock[3];
    if (h > 23 || m > 59 || (ampm && (h < 1 || h > 12))) return null;
    if (ampm?.startsWith('p') && h !== 12) h += 12;
    if (ampm?.startsWith('a') && h === 12) h = 0;
    minutes = h * 60 + m;
  }
  let tonight = false;
  for (const [word, value] of Object.entries(PARTS)) {
    if (take(new RegExp(` ${word}(?= )`))) {
      if (minutes === null) minutes = value;
    }
  }

  let day: Date | null = null;
  if (take(/ tonight(?= )/)) { tonight = true; day = startOfDay(now); }
  if (take(/ today(?= )/)) day = startOfDay(now);
  if (take(/ (tomorrow|tmrw|tmr|tmw)(?= )/)) day = addDays(startOfDay(now), 1);
  const wd = take(/ (next )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tues|tue|weds|wed|thurs|thur|thu|fri|sat)(?= )/);
  if (wd) {
    let ahead = (WEEKDAYS[wd[2]] - now.getDay() + 7) % 7;
    if (wd[1] && ahead === 0) ahead = 7;
    day = addDays(startOfDay(now), ahead);
  }
  const monthNames = Object.keys(MONTHS).join('|');
  const dm = take(new RegExp(` (\\d{1,2})(?:st|nd|rd|th)? (${monthNames})(?= )`));
  const md = dm ? null : take(new RegExp(` (${monthNames}) (\\d{1,2})(?:st|nd|rd|th)?(?= )`));
  const slash = dm || md ? null : take(/ (\d{1,2})\/(\d{1,2})(?= )/);
  if (dm || md || slash) {
    const date = dm ? Number(dm[1]) : md ? Number(md[2]) : Number(slash![1]);
    const month = dm ? MONTHS[dm[2]] : md ? MONTHS[md[1]] : Number(slash![2]) - 1;
    if (month < 0 || month > 11 || date < 1 || date > 31) return null;
    let d = new Date(now.getFullYear(), month, date);
    if (d.getMonth() !== month) return null;
    if (d < startOfDay(now)) d = new Date(now.getFullYear() + 1, month, date);
    day = d;
  }

  // A bare hour like "fri 8" once a day is known reads as evening; mornings get typed "9am".
  if (minutes === null && day) {
    const bare = take(/ (\d{1,2})(?= )/);
    if (bare) {
      const h = Number(bare[1]);
      if (h > 23) return null;
      minutes = (h >= 1 && h <= 11 ? h + 12 : h) * 60;
    }
  }

  if (tonight && minutes === null) minutes = 20 * 60;

  const leftover = rest.split(' ').filter(w => w && w !== 'next' && !FILLER.has(w));
  if (leftover.length) return null;
  if (minutes === null && !day) return null;

  if (!day) {
    // Time only: today if it is still ahead, else tomorrow. A bare "8:30"
    // without am/pm takes whichever of the two comes first.
    const today = startOfDay(now);
    let m = minutes as number;
    const at = (x: number) => new Date(today.getTime() + x * 60_000);
    if (!ampm && clock && m < 12 * 60 && at(m) <= now && at(m + 720) > now) m += 720;
    minutes = m;
    day = at(m) <= now ? addDays(today, 1) : today;
  } else if (wd && !wd[1] && minutes !== null && day.getTime() === startOfDay(now).getTime()) {
    // "fri 8pm" said on a Friday after 8pm means next Friday.
    if (new Date(day.getTime() + minutes * 60_000) <= now) day = addDays(day, 7);
  }
  if (tonight && minutes !== null && minutes < 12 * 60) minutes += 720;

  if (minutes === null) return { at: day, hasTime: false };
  const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minutes / 60), minutes % 60);
  return { at, hasTime: true };
}
