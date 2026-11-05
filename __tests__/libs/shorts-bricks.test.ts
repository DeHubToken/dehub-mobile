
import { brickShape, packBricks, type BrickShape } from '../../libs/shorts-bricks';

type Item = { id: string; shape: BrickShape };
const make = (pattern: string): Item[] =>
  pattern.split('').map((c, i) => ({ id: String(i), shape: c === 'T' ? 'tall' : 'wide' }));
const pack = (pattern: string, complete = true) =>
  packBricks(make(pattern), (i) => i.shape, (i) => i.id, complete);
const used = (rows: ReturnType<typeof pack>) => rows.flatMap((r) =>
  r.kind === 'pair' ? r.items : r.kind === 'stack' ? [r.tall, ...r.wides] : [r.item]);

describe('brickShape', () => {
  it('treats unknown sizes and portrait as tall, square and landscape as wide', () => {
    expect(brickShape(undefined)).toBe('tall');
    expect(brickShape(9 / 16)).toBe('tall');
    expect(brickShape(1)).toBe('wide');
    expect(brickShape(16 / 9)).toBe('wide');
  });
});

describe('packBricks', () => {
  it('places every item exactly once', () => {
    const rows = pack('TWWWWWTWTWWWWWWTTWWTWWTTWW');
    const ids = used(rows).map((i) => i.id).sort();
    expect(ids).toEqual(make('TWWWWWTWTWWWWWWTTWWTWWTTWW').map((i) => i.id).sort());
  });

  it('follows the stack, hero, pair rhythm when the mix allows', () => {
    expect(pack('TWWWWTT').map((r) => r.kind)).toEqual(['stack', 'hero', 'pair']);
  });

  it('only shorts become pairs and only wide videos become heroes', () => {
    expect(pack('TTTT').map((r) => r.kind)).toEqual(['pair', 'pair']);
    expect(pack('WWW').map((r) => r.kind)).toEqual(['hero', 'hero', 'hero']);
  });

  it('keeps rows already built when the next page arrives', () => {
    const first = pack('TWWWWTTWWWTWTWWW', false);
    const more = pack('TWWWWTTWWWTWTWWWTTWWWWTW', false);
    expect(more.slice(0, first.length)).toEqual(first);
  });

  it('holds a short tail back until the list is complete', () => {
    expect(pack('TWW', false)).toEqual([]);
    expect(pack('TWW', true).map((r) => r.kind)).toEqual(['hero', 'hero', 'single']);
  });
});
