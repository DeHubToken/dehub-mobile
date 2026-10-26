/** Creative direction is prompt guidance, never a guarantee of physical camera control. */
export type CinemaField = 'camera' | 'lens' | 'focalLength' | 'aperture' | 'movement' | 'lighting' | 'tempo' | 'era' | 'genre' | 'performance' | 'palette';
export type CinemaDirection = Partial<Record<CinemaField, string>>;
export interface CinemaDirectionField {
  id: CinemaField;
  label: string;
  videoOnly?: boolean;
  options: readonly string[];
}
export const CINEMA_DIRECTION_FIELDS: readonly CinemaDirectionField[] = [
  { id: 'camera', label: 'Camera look', options: ['Digital cinema', '35mm film', '16mm film', 'Large format', 'Vintage camcorder'] },
  { id: 'lens', label: 'Lens look', options: ['Spherical', 'Anamorphic', 'Vintage soft glass', 'Macro', 'Tilt-shift'] },
  { id: 'focalLength', label: 'Focal length', options: ['18mm wide', '24mm wide', '35mm natural', '50mm standard', '85mm portrait', '135mm telephoto'] },
  { id: 'aperture', label: 'Depth of field', options: ['f/1.4 very shallow', 'f/2.8 shallow', 'f/5.6 moderate', 'f/11 deep focus'] },
  { id: 'movement', label: 'Camera movement', videoOnly: true, options: ['Locked-off tripod', 'Slow dolly in', 'Slow dolly out', 'Lateral tracking', 'Orbit subject', 'Handheld', 'Crane rise', 'Slow pan'] },
  { id: 'lighting', label: 'Lighting', options: ['Soft daylight', 'Golden hour', 'Low-key chiaroscuro', 'High-key studio', 'Neon practicals', 'Silhouette backlight', 'Overcast diffuse'] },
  { id: 'tempo', label: 'Shot tempo', videoOnly: true, options: ['Single continuous shot', 'Calm, unhurried action', 'Dynamic, energetic action', 'Chaotic, frenetic action'] },
  { id: 'era', label: 'Era', options: ['1920s', '1950s', '1960s', '1970s', '1980s', '1990s', 'Present day', 'Near future'] },
  { id: 'genre', label: 'Genre', options: ['Documentary', 'Drama', 'Film noir', 'Science fiction', 'Fantasy', 'Romantic comedy', 'Thriller', 'Western'] },
  { id: 'performance', label: 'Performance', options: ['Joyful', 'Melancholic', 'Anxious', 'Confident', 'Awe-struck', 'Restrained', 'Playful'] },
  { id: 'palette', label: 'Color palette', options: ['Warm amber', 'Cool blue', 'Muted earth tones', 'Pastel', 'High contrast monochrome', 'Saturated primary colors'] },
];

/** Only declared options survive old, malformed or externally supplied drafts. */
export function normalizeCinemaDirection(value: unknown): CinemaDirection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  const result: CinemaDirection = {};
  for (const field of CINEMA_DIRECTION_FIELDS) {
    const option = input[field.id];
    if (typeof option === 'string' && field.options.includes(option)) result[field.id] = option;
  }
  return result;
}

export function appendCinemaDirection(prompt: string, value: unknown, mode: string): string {
  const marker = '\n\nCreative direction (visual guidance):\n';
  const previous = prompt.lastIndexOf(marker);
  if (previous >= 0) {
    const tail = prompt.slice(previous + marker.length).split('\n');
    const knownLines = new Set(CINEMA_DIRECTION_FIELDS.flatMap((field) => field.options.map((option) => `${field.label}: ${option}.`)));
    if (tail.length > 0 && tail.every((line) => knownLines.has(line))) prompt = prompt.slice(0, previous);
  }
  if (mode !== 'image' && mode !== 'video') return prompt;
  const direction = normalizeCinemaDirection(value);
  const lines = CINEMA_DIRECTION_FIELDS
    .filter((field) => (!field.videoOnly || mode === 'video') && direction[field.id])
    .map((field) => `${field.label}: ${direction[field.id]}.`);
  return lines.length ? `${prompt.trim()}${marker}${lines.join('\n')}` : prompt;
}
