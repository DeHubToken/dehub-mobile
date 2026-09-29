import { collapsedReplyIds } from '../comment-preview';

const CREATOR = '0xCreator';
const FAN = '0xfan';

type Row = { id: number; parentId?: number; address?: string; user?: { address?: string }; root?: number };

const rootOf = (row: Row) => (row.root != null ? String(row.root) : undefined);
const shownFor = (rows: Row[], root: number) =>
  [...(collapsedReplyIds(rows, rootOf, CREATOR, 1).get(String(root)) ?? [])];

describe('collapsed thread preview', () => {
  it('shows the first reply when the creator has not answered', () => {
    const rows: Row[] = [
      { id: 1, address: FAN },
      { id: 2, parentId: 1, address: FAN, root: 1 },
      { id: 3, parentId: 1, address: FAN, root: 1 },
    ];
    expect(shownFor(rows, 1)).toEqual(['2']);
  });

  it("shows the creator's answer instead of the first reply", () => {
    const rows: Row[] = [
      { id: 1, address: FAN },
      { id: 2, parentId: 1, address: FAN, root: 1 },
      { id: 3, parentId: 1, user: { address: '0xcreator' }, root: 1 },
    ];
    expect(shownFor(rows, 1)).toEqual(['3']);
  });

  it('keeps the replies a deep answer hangs from', () => {
    const rows: Row[] = [
      { id: 1, address: FAN },
      { id: 2, parentId: 1, address: FAN, root: 1 },
      { id: 3, parentId: 1, address: FAN, root: 1 },
      { id: 4, parentId: 3, address: CREATOR, root: 1 },
    ];
    expect(shownFor(rows, 1).sort()).toEqual(['3', '4']);
  });
});
