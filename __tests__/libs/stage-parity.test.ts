jest.mock('@react-native-async-storage/async-storage', () => ({
  multiGet: jest.fn(() => Promise.resolve([[null, null], [null, null]])),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../services/supabase', () => ({ supabase: {} }));
jest.mock('react-native', () => ({ Platform: { OS: 'android' }, Linking: {}, Share: {} }));
jest.mock('expo-file-system/legacy', () => ({}));
jest.mock('../../navigation/linking.config', () => ({
  ShareLinks: { stage: (s: any) => `https://dehub.io/stages/${s.short_id}` },
}));

import { foldCaption, foldTranslation, type StageCaptionLine } from '../../hooks/useStageCaptions';
import { stageIcs, googleCalendarUrl } from '../../libs/stage-calendar';

const line = (id: string, text: string, final = false): StageCaptionLine => ({ id, wallet: 'w', name: 'Ana', text, final, at: 0 });

describe('stage captions folding', () => {
  it('replaces an utterance in place and keeps its translations', () => {
    let lines = foldCaption([], line('a', 'hel'));
    lines = foldTranslation(lines, { id: 'a', translations: { tr: 'mer' } });
    lines = foldCaption(lines, line('a', 'hello', true));
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe('hello');
    expect(lines[0].translations).toEqual({ tr: 'mer' });
  });

  it('keeps only the last three lines and ignores translations for gone lines', () => {
    let lines: StageCaptionLine[] = [];
    for (const id of ['a', 'b', 'c', 'd']) lines = foldCaption(lines, line(id, id));
    expect(lines.map((l) => l.id)).toEqual(['b', 'c', 'd']);
    expect(foldTranslation(lines, { id: 'a', translations: { es: 'x' } })).toBe(lines);
  });
});

describe('stage calendar', () => {
  const stage: any = { id: 'u1', short_id: 18, title: 'Town Hall, live', description: 'Q&A', scheduled_at: '2026-10-23T18:00:00.000Z' };

  it('writes a one-hour event with a 10 minute alert and the stage link', () => {
    const ics = stageIcs(stage)!;
    expect(ics).toContain('DTSTART:20261023T180000Z');
    expect(ics).toContain('DTEND:20261023T190000Z');
    expect(ics).toContain('SUMMARY:Town Hall\\, live');
    expect(ics).toContain('URL:https://dehub.io/stages/18');
    expect(ics).toContain('TRIGGER:-PT10M');
  });

  it('builds a Google Calendar link for Android', () => {
    const url = googleCalendarUrl(stage)!;
    expect(url).toContain('action=TEMPLATE');
    expect(url).toContain('dates=20261023T180000Z%2F20261023T190000Z');
  });

  it('does nothing for a stage with no start time', () => {
    expect(stageIcs({ ...stage, scheduled_at: null })).toBeNull();
  });
});
