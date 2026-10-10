export function appendStockResults<T extends { id?: string; downloadUrl: string }>(current: T[], incoming: T[]): T[] {
  const urls = new Set<string>();
  const ids = new Set<string>();
  return [...current, ...incoming].filter(item => {
    if (!item.downloadUrl || urls.has(item.downloadUrl) || (item.id && ids.has(item.id))) return false;
    urls.add(item.downloadUrl);
    if (item.id) ids.add(item.id);
    return true;
  });
}

export function createStockSearchSession() {
  let generation = 0;
  let controller: AbortController | null = null;
  function cancel() { generation++; controller?.abort(); controller = null; }
  return {
    cancel,
    begin() {
      cancel();
      const own = generation;
      controller = new AbortController();
      const signal = controller.signal;
      return { signal, current: () => own === generation && !signal.aborted };
    },
  };
}
