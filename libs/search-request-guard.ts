/** Owns search responses across query changes, clears and pagination. */
export function createSearchRequestGuard() {
  let generation = 0;
  let scope = '';
  const pages = new Set<number>();
  return {
    invalidate() { generation++; scope = ''; pages.clear(); },
    begin(nextScope: string, page: number) {
      if (page === 1) { generation++; scope = nextScope; pages.clear(); }
      else if (scope !== nextScope || pages.has(page)) return null;
      const owned = generation;
      pages.add(page);
      return {
        current: () => generation === owned,
        finish: () => { if (generation === owned) pages.delete(page); },
      };
    },
  };
}
